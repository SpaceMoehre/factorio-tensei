const EPSILON = 1e-9;

// Starvation (ADR 0001): per route and item, walk consumers in belt order, each taking its
// demand from what is left; a consumer starves when less reaches it than it needs. The Side
// Output (subBlock: null) is the last consumer on a route that leaves the block, expecting
// whatever the Sub-Blocks along the way do not take. A Recipe Loop's feedback belts tapped off a
// route (route.taps) take theirs first: what they carry on to their own consumers is theirs.
export function simulate(block) {
  const starvation = [];
  const demandOf = (route, sb, item) => (block.subBlocks[sb].inputs.find(x => x.name === item)?.rate ?? 0) * (route.share?.[sb] ?? 1);
  for (const route of block.routes) {
    // (A Supplied Item's belt side-loads what it brings onto it, a lane with room for it.)
    const available = laneShares(route.items).map((a, i) => a + (route.items[i].joined ?? 0));
    route.items.forEach(({ item, rate }, i) => {
      let left = available[i];
      const take = (subBlock, demand) => {
        // (Rates rounded to 1e-9 a minute along a chain of Byproduct Uses: relative.)
        if (demand > left + EPSILON * Math.max(1, demand)) starvation.push({ route: route.id, subBlock, item, demand, available: left });
        left = Math.max(0, left - demand);
      };
      const fed = (route.taps ?? []).map(id => block.routes[id]).reduce((sum, r) => sum + r.consumers.reduce((t, sb) => t + demandOf(r, sb, item), 0), 0);
      left = Math.max(0, left - fed);
      let consumed = fed;
      for (const sb of route.consumers) {
        // A route split into parallel belts carries its part's share of each consumer's demand.
        const demand = demandOf(route, sb, item);
        take(sb, demand);
        consumed += demand;
      }
      if (route.sink === 'side-output') take(null, Math.max(0, rate - consumed));
    });
  }
  block.subBlocks.forEach((sb, i) => starvation.push(...inserterStarvation(sb, i)));
  return { ok: starvation.length === 0, starvation };
}

// A machine gets no more than its inserters for a route can move, however full the belt. Each
// of the Count machines needs an equal share; items merged on one belt share its inserters. Each
// set of inserters answers for the machines it serves (a Sub-Block's copies may take items merged
// where its leftover module takes them apart).
function inserterStarvation(sb, index) {
  const found = [];
  for (const { route, role = 'input', items, perMachine, portion = 1 } of sb.inserters ?? []) {
    const flows = role === 'input' ? sb.inputs : sb.outputs;
    // (A belt tapped off one of several producers of an item: its share, ADR 0064.)
    const share = flows.filter(f => items.includes(f.name)).reduce((sum, f) => sum + f.rate, 0) / sb.count * portion;
    const demand = share * perMachine.length;
    const available = perMachine.reduce((sum, rate) => sum + Math.min(rate, share), 0);
    if (demand > available + EPSILON) found.push({ route, subBlock: index, item: items.join(' + '), demand, available, cause: 'inserters' });
  }
  return found;
}

// Items on the same lane share its capacity in proportion to what they supply.
function laneShares(items) {
  const lanes = new Map();
  items.forEach((it, i) => {
    const lane = it.lane ?? i;
    if (!lanes.has(lane)) lanes.set(lane, { capacity: it.capacity, supply: 0 });
    lanes.get(lane).supply += it.supply;
  });
  return items.map((it, i) => {
    const lane = lanes.get(it.lane ?? i);
    return it.supply * Math.min(1, lane.capacity / lane.supply);
  });
}

// How much more a Sub-Block with spare machines (`extra`) makes than its belts carry.
const spareOf = sb => sb.rate / Math.max(1e-9, sb.rate - sb.extra);

// Throughput (ADR 0057): what a layout that starves makes. A Sub-Block short of an input runs as
// much slower as it is short (`factor`, 0 to 1, by Sub-Block), so it takes that much less of its
// other inputs and makes that much less for those it feeds, and so on down the chain, until no
// Sub-Block is shorter than it runs, nor makes more of an item than can leave it. `delivered(item)`: what leaves of an item, made less what its
// Sub-Blocks take back, less what its belts to the train cannot carry.
export function throughput(block) {
  const factor = block.subBlocks.map(() => 1);
  // The Sub-Block whose machines a route's items come from (a feedback's or gatherer's: the
  // belt it is tapped off), else null (the train).
  const from = route => {
    if (typeof route.source === 'number') return route.source;
    // (A spare let off through an overflow valve: the pipe's it comes off, ADR 0062.)
    if (route.source === 'valve') return from(block.routes[route.valve.on]);
    const fed = route.fedBy ?? route.fedFrom;
    return fed !== undefined ? from(block.routes[fed]) : null;
  };
  const joining = new Map();
  for (const g of block.routes) {
    if (g.joins === undefined || from(g) === null) continue;
    const k = `${g.joins}:${g.items[0].item}`;
    joining.set(k, [...joining.get(k) ?? [], g]);
  }
  let starvation = [];
  for (let round = 0; round < 4 * block.subBlocks.length + 4; round++) {
    const scaled = {
      subBlocks: block.subBlocks.map((sb, i) => ({
        ...sb, inputs: sb.inputs.map(x => ({ ...x, rate: x.rate * factor[i] })), outputs: sb.outputs.map(x => ({ ...x, rate: x.rate * factor[i] })),
      })),
      routes: block.routes.map(r => {
        const s = from(r);
        // (A byproduct tapped off to its Use whose splitter found no room: the train brings none.)
        const f = r.loop?.tapped && r.fedBy === undefined ? 0 : s === null ? 1 : factor[s];
        return {
          ...r,
          items: r.items.map(it => {
            // (Spare machines, `extra`: their belts carry what is taken, which the Sub-Block still
            // makes a little slower, ADR 0071.)
            const i = s !== null && it.item === block.subBlocks[s].item && block.subBlocks[s].extra > 0 && f > 0
              ? { ...it, rate: it.rate * Math.min(1 / f, spareOf(block.subBlocks[s])), supply: it.supply * Math.min(1 / f, spareOf(block.subBlocks[s])) } : it;
            const joined = joining.get(`${r.id}:${i.item}`);
            const share = joined ? joined.reduce((sum, g) => sum + g.items[0].rate * factor[from(g)], 0) / Math.max(1e-9, joined.reduce((sum, g) => sum + g.items[0].rate, 0)) : 1;
            // (From the train: as much as the belt carries, however fast its consumers run.)
            return s === null && f > 0 ? { ...i, ...(i.joined ? { joined: i.joined * share } : {}) }
              : { ...i, rate: i.rate * f, supply: i.supply * f, ...(i.joined ? { joined: i.joined * share } : {}) };
          }),
        };
      }),
    };
    starvation = simulate(scaled).starvation;
    let changed = false;
    const slow = (i, ratio) => {
      const next = factor[i] * Math.max(0, Math.min(1, ratio));
      if (next < factor[i] - 1e-9) {
        factor[i] = next;
        changed = true;
      }
    };
    for (const s of starvation) if (s.subBlock !== null && s.demand > EPSILON) slow(s.subBlock, s.available / s.demand);
    // (Backed up: a Sub-Block makes no more of an item than those it feeds take, where none of it
    // goes on to the train or joins another's belt — a byproduct whose Use runs slower stops its
    // producer, and with it all the producer makes.)
    block.subBlocks.forEach((sb, i) => {
      for (const out of sb.outputs) {
        const made = out.rate * factor[i];
        // (A pipe takes what every pipe of its network's consumers take.)
        const own = block.routes.filter(r => from(r) === i && r.items.some(x => x.item === out.name));
        const networks = new Set(own.map(r => r.network).filter(k => k !== undefined));
        const carrying = [...own, ...block.routes.filter(r => !own.includes(r) && r.network !== undefined && networks.has(r.network))];
        if (made <= EPSILON || !own.length || carrying.some(r => r.sink === 'side-output' || r.sink === 'void' || r.joins !== undefined || r.into !== undefined)) continue;
        const takers = new Set(carrying.flatMap(r => r.consumers));
        const taken = [...takers].reduce((sum, c) => sum + (block.subBlocks[c].inputs.find(x => x.name === out.name)?.rate ?? 0) * factor[c], 0);
        if (taken < made - 1e-6 * Math.max(1, made)) slow(i, taken / made);
      }
    });
    if (!changed) break;
  }
  const delivered = item => {
    const made = block.subBlocks.reduce((sum, sb, i) => sum + (sb.outputs.find(o => o.name === item)?.rate ?? 0) * factor[i], 0);
    const taken = block.subBlocks.reduce((sum, sb, i) => sum + (sb.inputs.find(x => x.name === item)?.rate ?? 0) * factor[i], 0);
    const lost = starvation.filter(s => s.subBlock === null && s.item === item).reduce((sum, s) => sum + s.demand - s.available, 0);
    return Math.max(0, made - taken - lost);
  };
  return { factor, delivered };
}
