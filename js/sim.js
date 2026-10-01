const EPSILON = 1e-9;

// Starvation (ADR 0001): per route and item, walk consumers in belt order, each taking its
// demand from what is left; a consumer starves when less reaches it than it needs. The Side
// Output (subBlock: null) is the last consumer on a route that leaves the block, expecting
// whatever the Sub-Blocks along the way do not take.
export function simulate(block) {
  const starvation = [];
  for (const route of block.routes) {
    const available = laneShares(route.items);
    route.items.forEach(({ item, rate }, i) => {
      let left = available[i];
      const take = (subBlock, demand) => {
        if (demand > left + EPSILON) starvation.push({ route: route.id, subBlock, item, demand, available: left });
        left = Math.max(0, left - demand);
      };
      let consumed = 0;
      for (const sb of route.consumers) {
        // A route split into parallel belts carries its part's share of each consumer's demand.
        const demand = (block.subBlocks[sb].inputs.find(x => x.name === item)?.rate ?? 0) * (route.share?.[sb] ?? 1);
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
  for (const { route, role = 'input', items, perMachine } of sb.inserters ?? []) {
    const flows = role === 'input' ? sb.inputs : sb.outputs;
    const share = flows.filter(f => items.includes(f.name)).reduce((sum, f) => sum + f.rate, 0) / sb.count;
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
