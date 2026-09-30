// Routes between Sub-Blocks, the Side Input and the Side Output, with Belt Merge.

// Factorio 2.0 fluid segments move up to 6000 units/s.
const PIPE_CAPACITY = 6000 * 60;

// Every route item carries its rate (what the plan moves), supply (what enters the route) and
// capacity (what the route can carry), all per minute. The train keeps Side Input saturated.
export function buildRoutes(plan, flows, laneCapacity) {
  const rank = new Map(flows.order.map((sb, i) => [sb, i]));
  const byOrder = (a, b) => rank.get(a) - rank.get(b);
  const consumersOf = item => plan.map((_, i) => i).filter(i => plan[i].inputs.some(x => x.name === item)).sort(byOrder);
  const routes = [];
  const add = r => routes.push({ id: routes.length, ...r });
  const saturated = (item, rate, capacity) => ({ item, rate, supply: capacity, capacity });

  // A Side Input one belt cannot carry to all its consumers comes as its own route to each, so
  // each consumer can split it into parallel belts of its own.
  const solids = flows.sideInput.filter(i => i.type === 'item').flatMap(input => {
    const consumers = consumersOf(input.item);
    if (consumers.length < 2 || input.rate <= 2 * laneCapacity) return [{ ...input, consumers }];
    return consumers.map(c => ({ ...input, rate: plan[c].inputs.find(x => x.name === input.item).rate, consumers: [c] }));
  });
  for (const { consumers, items } of mergeGroups(solids, laneCapacity)) {
    // A merged belt gives each item one lane; a lone item fills both.
    const capacity = items.length === 2 ? laneCapacity : 2 * laneCapacity;
    add({ kind: 'belt', source: 'side-input', sink: null, consumers, items: items.map(i => saturated(i.item, i.rate, capacity)) });
  }
  for (const input of flows.sideInput.filter(i => i.type === 'fluid')) {
    add({
      kind: 'pipe', fluid: input.item, source: 'side-input', sink: null,
      items: [saturated(input.item, input.rate, PIPE_CAPACITY)], consumers: consumersOf(input.item),
    });
  }
  plan.forEach((sb, i) => {
    const internalConsumers = item => flows.internal.filter(e => e.from === i && e.item === item).map(e => e.to).sort(byOrder);
    const leavesBlock = item => flows.sideOutput.some(o => o.item === item);
    const solidOut = sb.outputs.filter(o => o.type === 'item');
    if (solidOut.length) {
      // Output inserters drop every product onto the far lane, so the products share it.
      add({
        kind: 'belt', source: i, sink: solidOut.some(o => leavesBlock(o.name)) ? 'side-output' : null,
        items: solidOut.map(o => ({ item: o.name, rate: o.rate, supply: o.rate, capacity: laneCapacity, lane: 'far' })),
        consumers: internalConsumers(sb.item),
      });
    }
    for (const o of sb.outputs.filter(o => o.type === 'fluid')) {
      add({
        kind: 'pipe', fluid: o.name, source: i, sink: leavesBlock(o.name) ? 'side-output' : null,
        items: [{ item: o.name, rate: o.rate, supply: o.rate, capacity: PIPE_CAPACITY }],
        consumers: o.name === sb.item ? internalConsumers(o.name) : [],
      });
    }
  });
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
    byConsumers.get(k).items.push({ item: input.item, rate: input.rate });
  }
  const groups = [];
  for (const { consumers, items } of byConsumers.values()) {
    const fits = items.filter(i => i.rate <= laneCapacity);
    for (const i of items) if (i.rate > laneCapacity) groups.push({ consumers, items: [i] });
    for (let i = 0; i < fits.length; i += 2) groups.push({ consumers, items: fits.slice(i, i + 2) });
  }
  return groups;
}

export function coreLinks(sb, i, routes) {
  const fluidIndex = (list, name) => list.filter(x => x.type === 'fluid').findIndex(x => x.name === name);
  const fluids = [];
  for (const r of routes.filter(r => r.kind === 'pipe')) {
    if (r.consumers.includes(i)) fluids.push({ routeId: r.id, fluid: r.fluid, role: 'input', index: fluidIndex(sb.inputs, r.fluid) });
    if (r.source === i) fluids.push({ routeId: r.id, fluid: r.fluid, role: 'output', index: fluidIndex(sb.outputs, r.fluid) });
  }
  return {
    inputs: routes.filter(r => r.kind === 'belt' && r.consumers.includes(i)).map(r => r.id),
    output: routes.find(r => r.kind === 'belt' && r.source === i)?.id ?? null,
    fluids,
  };
}

