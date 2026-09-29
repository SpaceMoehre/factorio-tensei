const EPSILON = 1e-9;

// Starvation (ADR 0001): per route and item, walk consumers in belt order, each taking its
// demand from what is left; a Sub-Block starves when less reaches it than it needs.
export function simulate(block) {
  const starvation = [];
  for (const route of block.routes) {
    for (const { item, supply, capacity } of route.items) {
      let available = Math.min(supply, capacity);
      for (const sb of route.consumers) {
        const demand = block.subBlocks[sb].inputs.find(i => i.name === item)?.rate ?? 0;
        if (demand > available + EPSILON) starvation.push({ route: route.id, subBlock: sb, item, demand, available });
        available = Math.max(0, available - demand);
      }
    }
  }
  return { ok: starvation.length === 0, starvation };
}
