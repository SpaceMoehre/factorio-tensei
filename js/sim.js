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
        const demand = block.subBlocks[sb].inputs.find(x => x.name === item)?.rate ?? 0;
        take(sb, demand);
        consumed += demand;
      }
      if (route.sink === 'side-output') take(null, Math.max(0, rate - consumed));
    });
  }
  return { ok: starvation.length === 0, starvation };
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
