/** Minimal Factorio blueprint string encoder (0-indexed entities) */
export class BlueprintEncoder {
  encode({ subBlocks, poles, paths }) {
    const entities = [];
    // Sub-block buildings
    subBlocks.forEach(sb => sb.buildings.forEach(b => {
      entities.push({ name: b.type, position: {x:b.x, y:b.y}, direction: 0 });
    }));
    // Poles
    poles.forEach(p => {
      entities.push({ name: 'small-electric-pole', position: {x:p.x, y:p.y}, direction: 0 });
    });
    // Belt paths as transport belts (simplified: one per path segment)
    paths.forEach(path => {
      if (path.type === 'belt') {
        entities.push({ name: 'transport-belt', position: {x:path.from.x+1, y:path.from.y}, direction: 0, items: path.items });
      } else if (path.type === 'pipe') {
        entities.push({ name: 'pipe', position: {x:path.from.x+1, y:path.from.y}, direction: 0, fluid: path.fluid });
      }
    });
    // Underground tunnels for crossings (simplified: placed at intersections)
    // Inserters (simplified: from belt to building)
    subBlocks.forEach(sb => {
      sb.buildings.forEach(b => {
        entities.push({ name: 'fast-inserter', position: {x:b.x+1, y:b.y+2}, direction: 2 });
      });
    });
    // Compress to blueprint format: version + entities
    const bp = {
      version: 281474976710656,
      blueprint: {
        icons: [{signal:{type:'item',name:'advanced-circuit'},index:1}],
        entities: entities,
        item_labels: {}, entity_labels: {}, tiles: []
      }
    };
    // Return as JSON (user can convert to Factorio string via external tool or we provide basic 0-encoded)
    return JSON.stringify(bp);
  }
}
