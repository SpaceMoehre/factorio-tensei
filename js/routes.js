// Routes between Sub-Blocks, the Side Input and the Side Output, with Belt Merge.

import { taken, joinedInto } from './flows.js';

// Factorio 2.0 fluid segments move up to 6000 units/s.
const PIPE_CAPACITY = 6000 * 60;

// Every route item carries its rate (what the plan moves), supply (what enters the route) and
// capacity (what the route can carry), all per minute. The train keeps Side Input saturated.
// A Supplied Item (flows.joined): the Use's belt of it (`supplies`: { item, into: the producer,
// rate }) joins the producer's (`supplied`: { item, rate }) before its consumers, side-loading
// onto it (compose.js); the Use's pipe of it joins the producer's network (`into`: that route),
// the producer's pipe carrying both.
// apart(i): whether Sub-Block i puts each solid product on a belt of its own (One Item a Belt,
// ADR 0066).
export function buildRoutes(plan, flows, laneCapacity, apart = /** @type {(i: number) => boolean} */ (() => false)) {
  const rank = new Map(flows.order.map((sb, i) => [sb, i]));
  const byOrder = (a, b) => rank.get(a) - rank.get(b);
  // (Those taking it by train: not one taking it from a Sub-Block, as Py's RHEs take the coke oven
  // gas the heat exchangers make, while those take theirs back by train, ADR 0065.)
  const fed = (i, item) => [...flows.internal, ...flows.feedback ?? []].some(e => e.to === i && e.item === item);
  const consumersOf = item => plan.map((_, i) => i).filter(i => plan[i].inputs.some(x => x.name === item) && !fed(i, item)).sort(byOrder);
  const routes = [];
  const add = r => routes[routes.push({ id: routes.length, ...r }) - 1];
  const saturated = (item, rate, capacity) => ({ item, rate, supply: capacity, capacity });

  // A Side Input one belt cannot carry to all its consumers comes as its own route to each, so
  // each consumer can split it into parallel belts of its own.
  const solids = flows.sideInput.filter(i => i.type === 'item').flatMap(input => {
    const consumers = consumersOf(input.item);
    // (Parts of a Sub-Block standing apart, Bands, take theirs each on its own too.) Their belts
    // still share belts from the west edge through splitters (compose.js: a Fan-out across them).
    if (consumers.length < 2 || (input.rate <= 2 * laneCapacity && !consumers.some(c => plan[c].part))) return [{ ...input, consumers }];
    return consumers.map(c => ({ ...input, rate: plan[c].inputs.find(x => x.name === input.item).rate, consumers: [c], perConsumer: true }));
  });
  for (const { consumers, items, perConsumer } of mergeGroups(solids, laneCapacity)) {
    // A merged belt gives each item one lane; a lone item fills both.
    const capacity = items.length === 2 ? laneCapacity : 2 * laneCapacity;
    add({ kind: 'belt', source: 'side-input', sink: null, consumers, items: items.map(i => saturated(i.item, i.rate, capacity)), ...(perConsumer ? { perConsumer } : {}) });
  }
  for (const input of flows.sideInput.filter(i => i.type === 'fluid')) {
    add({
      kind: 'pipe', fluid: input.item, source: 'side-input', sink: null,
      items: [saturated(input.item, input.rate, PIPE_CAPACITY)], consumers: consumersOf(input.item),
    });
  }
  plan.forEach((sb, i) => {
    const internalConsumers = item => flows.internal.filter(e => e.from === i && e.item === item).map(e => e.to).sort(byOrder);
    // (What of it no Sub-Block takes leaves by train.)
    // (An Extension's extra stays on its pipe for an Annex to draw.)
    const leavesBlock = o => o.rate - (o.name === sb.item ? sb.extra ?? 0 : 0) + joinedInto(flows, i, o.name) - taken(plan, flows, i, o.name) > 1e-9 * Math.max(1, o.rate);
    const joins = type => (flows.joined ?? []).filter(j => j.from === i && j.type === type);
    const solidOut = sb.outputs.filter(o => o.type === 'item');
    // One Item a Belt (the user's rule, ADR 0066): a Sub-Block making more than one solid puts
    // each on a belt of its own, its output inserters filtered to it: each belt to those taking
    // that product, or on to the train. A step taking it from several such belts takes its share
    // from each (`portion`), every machine from any.
    if (apart(i) && solidOut.filter(o => o.rate > 1e-9).length > 1) {
      for (const o of [solidOut.find(o => o.name === sb.item), ...solidOut.filter(o => o.name !== sb.item)].filter(o => o && o.rate > 1e-9)) {
        const consumers = internalConsumers(o.name);
        const shared = consumers.length === 1 && flows.internal.filter(e => e.to === consumers[0] && e.item === o.name).length > 1;
        const own = joins('item').filter(j => j.item === o.name);
        add({
          kind: 'belt', source: i, sink: leavesBlock(o) ? 'side-output' : null, product: o.name,
          items: [{ item: o.name, rate: o.rate, supply: o.rate, capacity: laneCapacity, lane: 'far' }],
          consumers, ...(shared ? { portion: true } : {}),
          ...(o.name === sb.item && sb.exports?.includes(sb.item) && consumers.length && !leavesBlock(o) ? { exported: sb.item } : {}),
          ...(own.length ? { supplies: own.map(j => ({ item: j.item, into: j.into, rate: j.rate })) } : {}),
          ...(joinedInto(flows, i, o.name) > 0 ? { supplied: [{ item: o.name, rate: joinedInto(flows, i, o.name) }] } : {}),
        });
      }
    } else if (solidOut.length) {
      // (Those taking a byproduct, Byproduct Uses, as those taking its item.)
      const consumers = [...new Set(solidOut.flatMap(o => internalConsumers(o.name)))].sort(byOrder);
      // A byproduct only the train takes, with more than one belt carries: an Internal Path to its
      // one consumer all the same, each of its belts sorting the byproduct out after the producers
      // (compose.js), so the path may run on parallel belts (Py's ball mills' molybdenite dust
      // with gravel).
      const left = solidOut.filter(leavesBlock);
      const sorted = consumers.length === 1 && left.length === 1 && left[0].name !== sb.item
        && !plan[consumers[0]].inputs.some(x => x.name === left[0].name)
        && solidOut.reduce((sum, o) => sum + o.rate, 0) > 2 * laneCapacity + 1e-6;
      // (One of several producers' belts of its one item into its consumer: its share, ADR 0068.)
      const shared = solidOut.length === 1 && consumers.length === 1 && flows.internal.filter(e => e.to === consumers[0] && e.item === solidOut[0].name).length > 1;
      // Output inserters drop every product onto the far lane, so the products share it.
      add({
        kind: 'belt', source: i, sink: left.length ? 'side-output' : null,
        items: solidOut.map(o => ({ item: o.name, rate: o.rate, supply: o.rate, capacity: laneCapacity, lane: 'far' })),
        consumers, ...(sorted ? { sorted: left[0].name } : {}), ...(shared ? { portion: true } : {}),
        // (Its item the user wants leaving by train too, where its consumers take it all: what
        // they leave off a splitter giving them priority, compact.js exportBelts, ADR 0062.)
        ...(sb.exports?.includes(sb.item) && consumers.length && !left.length && solidOut.some(o => o.name === sb.item) ? { exported: sb.item } : {}),
        ...(joins('item').length ? { supplies: joins('item').map(j => ({ item: j.item, into: j.into, rate: j.rate })) } : {}),
        ...(solidOut.some(o => joinedInto(flows, i, o.name) > 0) ? { supplied: solidOut.filter(o => joinedInto(flows, i, o.name) > 0).map(o => ({ item: o.name, rate: joinedInto(flows, i, o.name) })) } : {}),
      });
    }
    for (const o of sb.outputs.filter(o => o.type === 'fluid')) {
      const more = joinedInto(flows, i, o.name);
      const into = joins('fluid').find(j => j.item === o.name);
      const target = into && routes.find(r => r.kind === 'pipe' && r.source === into.into && r.fluid === o.name);
      // A fluid fed back, or one its consumers take first and the train the rest (ADR 0062): its
      // spare off through an overflow valve on a pipe of its own, to the east edge or destroyed.
      const valved = sb.overflow?.includes(o.name) || sb.exports?.includes(o.name);
      const left = o.rate + more - taken(plan, flows, i, o.name);
      // (A closed loop's: all of it back into its takers, none to the train.)
      const sink = leavesBlock(o) && !sb.closed?.includes(o.name) ? (sb.voids?.includes(o.name) ? 'void' : 'side-output') : null;
      const r = add({
        kind: 'pipe', fluid: o.name, source: i, sink: valved ? null : sink, ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
        items: [{ item: o.name, rate: o.rate + more, supply: o.rate + more, capacity: PIPE_CAPACITY }],
        consumers: internalConsumers(o.name),
        ...(target ? into.valve ? { valve: { mode: 'top-up', on: target.id } } : { into: target.id } : {}),
        // (Back into a step feeding it: no link for placement, ADR 0062.)
        ...((flows.fedBack ?? []).some(e => e.from === i && e.item === o.name) ? { fedBack: true } : {}),
      });
      if (valved) {
        add({
          kind: 'pipe', fluid: o.name, source: 'valve', sink: sb.voids?.includes(o.name) ? 'void' : 'side-output', consumers: [],
          items: [{ item: o.name, rate: Math.max(0, left), supply: Math.max(0, left), capacity: PIPE_CAPACITY }], valve: { mode: 'overflow', on: r.id },
        });
      }
    }
  });
  // (What the train brings to make up a fluid fed back: through a top-up valve into its
  // producer's pipe, ADR 0062.)
  for (const j of (flows.joined ?? []).filter(j => j.valve && j.from === 'side-input')) {
    const on = routes.find(r => r.kind === 'pipe' && r.source === j.into && r.fluid === j.item);
    if (on) add({ kind: 'pipe', fluid: j.item, source: 'side-input', sink: null, consumers: [], items: [saturated(j.item, j.rate, PIPE_CAPACITY)], valve: { mode: 'top-up', on: on.id } });
  }
  // A Recipe Loop's feedback: the producer's item back into the Sub-Block taking it, a belt of its
  // own like a Side Input's (never merged with another), fed from the producer's output through
  // a splitter that gives it priority (compose.js); by train where that finds no room.
  // Each of its belts carries no more than one of the producer's output belts brings (it is fed
  // from one): the producer's output over as few belts as carry it.
  for (const f of flows.feedback ?? []) {
    const made = plan[f.from].outputs.find(o => o.name === f.item).rate;
    const perBelt = made / Math.max(1, Math.ceil(made / (2 * laneCapacity) - 1e-9));
    add({ kind: 'belt', source: 'side-input', loop: { from: f.from, ...(f.tapped ? { tapped: true } : {}) }, sink: null, consumers: [f.to], items: [saturated(f.item, f.rate, Math.min(2 * laneCapacity, perBelt))] });
  }
  return routes;
}

// Belt Merge: Side Input items share a belt (one per lane) only when they travel the same
// route — the same consumers in the same order — and each fits within a single lane.
function mergeGroups(inputs, laneCapacity) {
  const byConsumers = new Map();
  for (const input of inputs) {
    const { consumers } = input;
    const k = consumers.join(',');
    if (!byConsumers.has(k)) byConsumers.set(k, { consumers, items: [] });
    byConsumers.get(k).items.push({ item: input.item, rate: input.rate, perConsumer: !!input.perConsumer });
  }
  const groups = [];
  const group = (consumers, items) => ({ consumers, items, perConsumer: items.some(i => i.perConsumer) });
  for (const { consumers, items } of byConsumers.values()) {
    const fits = items.filter(i => i.rate <= laneCapacity);
    for (const i of items) if (i.rate > laneCapacity) groups.push(group(consumers, [i]));
    for (let i = 0; i < fits.length; i += 2) groups.push(group(consumers, fits.slice(i, i + 2)));
  }
  return groups;
}

export function coreLinks(sb, i, routes) {
  const fluids = [];
  for (const r of routes.filter(r => r.kind === 'pipe')) {
    if (r.consumers.includes(i)) fluids.push({ routeId: r.id, fluid: r.fluid, role: 'input', boxes: sb.boxes.inputs[r.fluid] });
    if (r.source === i) fluids.push({ routeId: r.id, fluid: r.fluid, role: 'output', boxes: sb.boxes.outputs[r.fluid] });
  }
  return {
    inputs: routes.filter(r => r.kind === 'belt' && r.consumers.includes(i)).map(r => r.id),
    output: routes.find(r => r.kind === 'belt' && r.source === i)?.id ?? null,
    // (Its other products' belts, One Item a Belt, ADR 0066.)
    apart: routes.filter(r => r.kind === 'belt' && r.source === i).slice(1).map(r => r.id),
    fluids,
  };
}

