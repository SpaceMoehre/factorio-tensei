/** Dynamic 2D packing solver for Factorio factory blocks */
export class Solver {
  constructor(catalog, recipesConfig) {
    this.catalog = catalog;
    this.config = recipesConfig; // array of {recipe, count}
    this.tiles = []; // 2D grid of entities
  }

  // Build compound block: dependency-ordered grid of sub-blocks
  solve() {
    const subBlocks = this.config.map(c => this.buildSubBlock(c));
    // Simple dependency grid layout: left-to-right, top-to-bottom
    const gridW = Math.ceil(Math.sqrt(subBlocks.length));
    const gridH = Math.ceil(subBlocks.length / gridW);
    const cellW = 8; // max sub-block width in tiles
    const cellH = 6; // max sub-block height
    subBlocks.forEach((sb, i) => {
      sb.x = (i % gridW) * (cellW + 2);
      sb.y = Math.floor(i / gridW) * (cellH + 2);
    });
    this.subBlocks = subBlocks;
    this.placePoles();
    this.placePaths();
    return { subBlocks, poles: this.poles, paths: this.paths, width: gridW*(cellW+2), height: gridH*(cellH+2) };
  }

  buildSubBlock({recipe, count}) {
    const rec = this.catalog.recipes[recipe];
    const building = this.catalog.buildings[rec.building];
    const asseW = building.size.w;
    const asseH = building.size.h;
    // Max belt capacity per assembly line: 15 items/sec (full belt)
    const perLineRate = 15 / (rec.time || 1);
    const linesNeeded = Math.ceil((count * rec.time) / (count * 1)); // simplified: 1 line per assembler
    // Dynamic: arrange in rows, belts between/under
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const width = cols * (asseW + 1) + 2;
    const height = rows * (asseH + 1) + 2;
    return {
      recipe, count, x:0, y:0,
      buildings: Array.from({length: count}, (_, i) => ({
        type: rec.building,
        x: 2 + (i % cols) * (asseW + 1),
        y: 2 + Math.floor(i / cols) * (asseH + 1),
        inputs: rec.inputs,
        outputs: rec.outputs,
        fluid: rec.fluid || false
      })),
      beltInputs: [], // filled later
      beltOutputs: []
    };
  }

  placePoles() {
    // Minimal poles: place every 9 tiles, connect all
    const step = 9;
    this.poles = [];
    for (let x = 0; x < 100; x += step) {
      for (let y = 0; y < 100; y += step) {
        this.poles.push({ x, y, connected: true });
      }
    }
    // For huge buildings, reduce if footprint is large (heuristic)
    if (this.subBlocks) {
      const maxX = Math.max(...this.subBlocks.map(s => s.x + 8));
      const maxY = Math.max(...this.subBlocks.map(s => s.y + 6));
      this.poles = this.poles.filter(p => p.x <= maxX && p.y <= maxY);
    }
  }

  // Routes belts/fluids between and around sub-blocks; tunnels when intersection
  placePaths() {
    this.paths = [];
    // Side input: straight belt from left into first sub-block zone
    this.paths.push({ type: 'belt', from: {x:-4,y:3}, to: {x:2,y:3}, items: ['iron-plate','copper-cable'] });
    // Side output: collect final outputs to right exit
    this.paths.push({ type: 'belt', from: {x:96,y:3}, to: {x:100,y:3}, items: ['advanced-circuit'] });
    // Internal intermediate belts (simplified)
    this.subBlocks.forEach((sb, i) => {
      if (i > 0) {
        // Carry intermediates from previous sub-block to this
        this.paths.push({ type: 'belt', from: {x: sb.x-2, y: sb.y+3}, to: {x: sb.x, y: sb.y+3}, items: ['electronic-circuit','gear'] });
      }
    });
    // Pipe paths for fluids
    this.paths.push({ type: 'pipe', from: {x:-4,y:8}, to: {x:2,y:8}, fluid: 'crude-oil' });
  }

  // Belt merging: combine two low-rate items if sum <= 15
  mergeBelts() {
    if (!this.paths) return; // must call after solve
    const belts = this.paths.filter(p => p.type === 'belt');
    // Simple merge heuristic
    const merged = [];
    for (let i = 0; i < belts.length; i++) {
      const a = belts[i];
      for (let j = i + 1; j < belts.length; j++) {
        const b = belts[j];
        if (a.items.length === 1 && b.items.length === 1 && a.items[0] !== b.items[0]) {
          const rateA = 1, rateB = 1; // simplified
          if (rateA + rateB <= 15) {
            merged.push({ ...a, items: [...a.items, ...b.items], merged: true });
            belts.splice(j, 1);
            i = -1; break;
          }
        }
      }
    }
    this.paths = this.paths.filter(p => !(p.type === 'belt' && merged.some(m => m === p)));
    this.paths.push(...merged);
  }
}
