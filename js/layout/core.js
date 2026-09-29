import { N, E, S, W, VEC } from './grid.js';

const INSERTER = { 1: 'fast-inserter', 2: 'long-handed-inserter' };
const ROTATIONS = [0, 4, 8, 12];
const SIDE = { [N]: 'top', [S]: 'bottom', [W]: 'left', [E]: 'right' };

// Lays out one Sub-Block in local coordinates: a row of machines with belt rows on one side
// and, if the recipe uses fluids, the machines' fluid connections on the other.
//   far belt   (long-handed inserters)
//   near belt  (fast inserters)
//   inserter row — inserters sit directly against the machines
//   machines   (fluid connections facing east/west sit in gap columns between machines)
//   inserter / fluid-connection row
//   near belt, far belt
// fluids: [{ routeId, fluid, role: 'input' | 'output', index }] (index among that role's fluids)
export function buildCore(sb, building, { inputs, output, fluids }) {
  const { rotation, connections } = chooseRotation(sb, building, fluids);
  const { w: Wm, h: Hm } = rotatedSize(building.size, rotation);
  const used = connections.filter(c => c.routeId !== undefined);
  const count = side => used.filter(c => c.side === side).length;
  const portSide = count('top') > count('bottom') ? 'top' : 'bottom';
  const beltSide = portSide === 'top' ? 'bottom' : 'top';

  const portColumns = { top: new Set(), bottom: new Set() };
  for (const c of used) if (c.side === 'top' || c.side === 'bottom') portColumns[c.side].add(c.column);
  const slots = assignSlots(sb, inputs, output, fluids.length > 0, beltSide, portSide, portColumns);

  // Rows on each side, from the machines outward: depth 0 is the inserter / connection row.
  // A depth left without a belt (a service row) stays free for pipes.
  const depthOf = side => Math.max(0, ...slots.filter(s => s.side === side).map(s => s.depth));
  const sideUsed = side => depthOf(side) > 0 || portColumns[side].size > 0;
  let y = 0;
  const rowY = {};
  for (let d = depthOf('top'); d >= 1; d--) rowY[`top${d}`] = y++;
  if (sideUsed('top')) rowY.top0 = y++;
  const machineY = y;
  y += Hm;
  if (sideUsed('bottom')) rowY.bottom0 = y++;
  for (let d = 1; d <= depthOf('bottom'); d++) rowY[`bottom${d}`] = y++;

  // Side connections sit in the gap: one column per machine side, so one machine's connection
  // tile never coincides with its neighbour's.
  const leftPad = count('left') ? 1 : 0;
  const rightPad = count('right') ? 1 : 0;
  const gap = leftPad || rightPad ? 2 : seamClash(used, Wm) ? 1 : 0;
  const pitch = Wm + gap;
  const machineX = i => leftPad + i * pitch;
  const width = machineX(sb.count - 1) + Wm + rightPad;

  const entities = [];
  for (let i = 0; i < sb.count; i++) {
    entities.push({ name: sb.building, kind: 'building', recipe: sb.recipe, x: machineX(i), y: machineY, w: Wm, h: Hm, direction: rotation });
  }

  // Inserters stay off connection columns, and off their neighbours where the machine is wide
  // enough, so pipes can leave a connection sideways.
  const columnsFree = side => {
    const ports = [...portColumns[side]];
    const clear = inserterColumns(Wm).filter(c => ports.every(p => Math.abs(c - p) >= 2));
    const notOn = inserterColumns(Wm).filter(c => !ports.includes(c) && !clear.includes(c));
    return [...clear, ...notOn];
  };
  const nextColumn = { top: 0, bottom: 0 };
  const rows = [];
  for (const slot of slots) {
    const column = columnsFree(slot.side)[nextColumn[slot.side]++];
    if (column === undefined) throw new Error(`${sb.building} is too narrow for its inserters and fluid connections`);
    const insY = rowY[`${slot.side}0`];
    const beltY = rowY[`${slot.side}${slot.depth}`];
    const towardBelt = slot.side === 'top' ? N : S;
    const towardMachine = slot.side === 'top' ? S : N;
    const waypoints = [];
    for (let i = 0; i < sb.count; i++) {
      const x = machineX(i) + column;
      // An inserter's direction is the side it picks up from.
      entities.push({ name: INSERTER[slot.depth], kind: 'inserter', x, y: insY, w: 1, h: 1, direction: slot.isOutput ? towardMachine : towardBelt });
      waypoints.push([x, beltY]);
    }
    rows.push({ routeId: slot.routeId, y: beltY, waypoints });
  }

  const ports = [];
  const pipeBlocked = [];
  for (let i = 0; i < sb.count; i++) {
    for (const c of connections) {
      const tile = [machineX(i) + c.tileX, machineY + c.tileY];
      if (c.routeId === undefined) pipeBlocked.push(tile);
      else {
        let port = ports.find(p => p.routeId === c.routeId);
        if (!port) ports.push(port = { routeId: c.routeId, fluid: c.fluid, tiles: [] });
        port.tiles.push([...tile, c.dir]);
      }
    }
  }
  return { w: width, h: y, entities, rows, ports, pipeBlocked };
}

// Belt rows are assigned outward from the machines: inputs then output on the belt side,
// overflowing onto the fluid side. Without fluids, inputs go on top and the output below.
// A side with fluid connections and a single belt puts it at depth 2 behind a free service row
// (long-handed inserters reach over it); with two belts there it stays dense.
function assignSlots(sb, inputs, output, hasFluids, beltSide, portSide, portColumns) {
  const total = inputs.length + (output !== null ? 1 : 0);
  if (total > 4) throw new Error(`${sb.recipe} needs ${total} belts; a Sub-Block supports at most 4`);
  const at = (side, depth) => ({ side, depth });
  const wanted = inputs.map(routeId => ({ routeId, isOutput: false }));
  if (output !== null) wanted.push({ routeId: output, isOutput: true });
  if (!hasFluids) {
    if (output === null) return wanted.map((w, i) => ({ ...w, ...[at('top', 1), at('top', 2), at('bottom', 1), at('bottom', 2)][i] }));
    // Inputs above the machines, output directly below.
    const order = [at('top', 1), at('top', 2), at('bottom', 2)];
    return [
      ...inputs.map((routeId, i) => ({ routeId, isOutput: false, ...order[i] })),
      { routeId: output, isOutput: true, ...at('bottom', 1) },
    ];
  }
  const slots = [];
  let rest = wanted;
  for (const side of [beltSide, portSide]) {
    const here = rest.slice(0, 2);
    rest = rest.slice(2);
    const serviceRow = here.length === 1 && portColumns[side].size > 0;
    here.forEach((w, i) => slots.push({ ...w, ...at(side, serviceRow ? 2 : i + 1) }));
  }
  return slots;
}

// Machines sit edge to edge unless that would put connections for different fluids on
// neighbouring tiles across the seam.
function seamClash(used, Wm) {
  const vertical = used.filter(c => c.side === 'top' || c.side === 'bottom');
  return vertical.some(a => vertical.some(b => a.side === b.side && a.fluid !== b.fluid && a.column === Wm - 1 && b.column === 0));
}

// Picks the rotation and one connection per used fluid box that keeps connections on the top
// and bottom where possible (fewest on the sides), ideally all on a single side.
function chooseRotation(sb, building, fluids) {
  if (!fluids.length) return { rotation: 0, connections: unusedConnections(building, 0, new Set()) };
  const boxesFor = role => building.fluidBoxes.filter(b => (role === 'input' ? b.production !== 'output' : b.production !== 'input'));
  const usedBoxes = fluids.map(f => {
    const box = boxesFor(f.role)[f.index];
    if (!box) throw new Error(`${sb.building} has no ${f.role} fluid box for ${f.fluid}`);
    return box;
  });
  const vertical = c => c.side === 'top' || c.side === 'bottom';
  let best = null;
  for (const rotation of ROTATIONS) {
    const picks = usedBoxes.map(box => {
      const options = box.connections.map(c => placeConnection(c, rotation, building));
      return options.find(vertical) ?? options[0];
    });
    const sideCount = picks.filter(c => !vertical(c)).length;
    const split = new Set(picks.filter(vertical).map(c => c.side)).size > 1 ? 1 : 0;
    const score = sideCount * 2 + split;
    if (!best || score < best.score) best = { rotation, picks, score };
  }
  const connections = best.picks.map((c, i) => ({ ...c, routeId: fluids[i].routeId, fluid: fluids[i].fluid }));
  const taken = new Set(connections.map(c => `${c.tileX},${c.tileY}`));
  return { rotation: best.rotation, connections: [...connections, ...unusedConnections(building, best.rotation, taken)] };
}

function unusedConnections(building, rotation, taken) {
  return building.fluidBoxes.flatMap(b => b.connections.map(c => placeConnection(c, rotation, building)))
    .filter(c => !taken.has(`${c.tileX},${c.tileY}`));
}

function rotatedSize({ w, h }, rotation) {
  return rotation === 4 || rotation === 12 ? { w: h, h: w } : { w, h };
}

// Where a connection's pipe tile lies relative to the machine's top-left corner once rotated.
// Rotating clockwise by a quarter turn maps (x, y) to (-y, x).
function placeConnection(c, rotation, building) {
  let [x, y] = [c.x, c.y];
  for (let r = 0; r < rotation; r += 4) [x, y] = [-y, x];
  const dir = (c.direction + rotation) % 16;
  const size = rotatedSize(building.size, rotation);
  const [dx, dy] = VEC[dir];
  const tileX = Math.floor(size.w / 2 + x + dx);
  const tileY = Math.floor(size.h / 2 + y + dy);
  return { side: SIDE[dir], dir, tileX, tileY, column: tileX };
}

function inserterColumns(Wm) {
  const center = Math.floor(Wm / 2);
  const order = [center];
  for (let d = 1; order.length < Wm; d++) {
    if (center - d >= 0) order.push(center - d);
    if (center + d < Wm) order.push(center + d);
  }
  return order;
}
