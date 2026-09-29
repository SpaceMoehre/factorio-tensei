/** Numeric item-flow simulation to detect starvation */
export class Simulator {
  constructor(solverResult, catalog) {
    this.sb = solverResult.subBlocks;
    this.catalog = catalog;
  }

  run() {
    // Build flow graph from paths + sub-block inputs/outputs
    const nodes = {}; // node -> rate
    // Infinity sources / sinks
    nodes['source_side'] = Infinity;
    nodes['sink_train'] = Infinity;
    // Sub-block consumption per item
    const demands = {};
    this.sb.forEach(sb => {
      sb.buildings.forEach(b => {
        const rec = this.catalog.recipes[sb.recipe];
        if (rec && rec.inputs) {
          for (const [k, v] of Object.entries(rec.inputs)) {
            demands[k] = (demands[k] || 0) + (v * sb.count / (rec.time || 1));
          }
        }
      });
    });
    // Check if any path can satisfy demand (simplified)
    const starvation = [];
    for (const [item, need] of Object.entries(demands)) {
      const supply = 15; // one full belt for simplicity
      if (supply < need) starvation.push({ item, need, supply, reason: 'belt capacity insufficient' });
      else if (need > 0 && !this.hasPath(item)) starvation.push({ item, need, reason: 'no path to building' });
    }
    return { ok: starvation.length === 0, starvation, demands };
  }

  hasPath(item) {
    // Check paths contain item
    return true; // simplified for prototype
  }
}
