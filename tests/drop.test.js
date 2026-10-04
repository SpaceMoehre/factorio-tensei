import { test } from 'node:test';
import assert from 'node:assert/strict';
import { context, shapeOf, stackVariant, random, moduleOptions } from '../js/design.js';
import { coreLinks } from '../js/routes.js';
import { buildCore, dropOf } from '../js/layout/core.js';
import { routeModule } from '../js/layout/module.js';
import { maxFlow } from '../js/layout/compose.js';
import { squeezeEntities } from '../js/layout/compact.js';
import { dropsOnItsOwnBelt, drainsEveryMachine, supporting } from '../js/layout/validity.js';
import { solve } from '../js/solve.js';
import { clocksOf } from '../js/clocks.js';
import { key } from '../js/layout/grid.js';
import { pyCatalog, logistics } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

// Output Drop (CONTEXT.md): Py's soil extractor makes 120 soil a minute and puts it on the tile
// south of it itself; a casting unit makes 900 iron plates a minute, more than a yellow belt's
// lane (450) takes, and puts them on the tile west of its second row.
const setup = (item, recipe, building, rate, settings = logistics) => {
  const ctx = context([{ goal: { item, rate }, selection: { recipe, building } }], pyCatalog, settings);
  const sb = ctx.plan[0];
  const links = coreLinks(sb, 0, ctx.routes);
  return { ctx, sb, links, shape: shapeOf(ctx, sb, 0, links), building: pyCatalog.buildings[sb.building] };
};
const soil = rate => setup('soil', 'soil', 'soil-extractor-mk01', rate);
const plates = (settings = logistics) => setup('iron-plate', 'iron-plate-1', 'casting-unit-mk01', 900, settings);
const dropTile = m => key(Math.floor(m.x + m.drop.x), Math.floor(m.y + m.drop.y));
const outputs = core => core.entities.filter(e => e.role === 'output');

test('a drop point turns with its machine: south of the middle facing north, west facing east', () => {
  const extractor = pyCatalog.buildings['soil-extractor-mk01'];
  assert.deepEqual([0, 4, 8, 12].map(r => dropOf(extractor, r)).map(({ side, depth, tileX, tileY }) => [side, depth, tileX, tileY]),
    [['bottom', 1, 3, 7], ['left', 1, -1, 3], ['top', 1, 3, -1], ['right', 1, 7, 3]]);
  assert.deepEqual(dropOf(pyCatalog.buildings['casting-unit-mk01'], 12), { side: 'bottom', depth: 1, tileX: 1, tileY: 7, point: { x: 1.5, y: 7.01 } });
  assert.equal(dropOf(pyCatalog.buildings['automated-factory-mk01'], 0), null);
});

// Three extractors (360/min) fit one lane: their belt runs past their drop tiles below them and
// takes all they make, on the lane nearer them, without an inserter.
test('machines drop onto the belt past their drop tiles: no output inserter, the lane nearer them', () => {
  const { ctx, sb, links, shape, building } = soil(360);
  assert.equal(shape.belts.find(b => b.isOutput).dropLane, 3);
  const variant = stackVariant(shape, { rotation: 0, rowLength: 3, flip: true, plain: true, middle: 4, drop: true, gap: 1 }, random(1));
  assert.deepEqual(variant.belts.map(b => [b.band, b.row, b.serves]), [[1, 1, [0]]]);
  const core = buildCore(sb, building, links, variant, ctx.env);
  assert.deepEqual(core.entities.filter(e => e.kind === 'inserter'), []);
  assert.deepEqual([core.shortfall, core.overload, core.supporting], [0, 0, 0]);
  const machines = core.entities.filter(e => e.kind === 'building');
  assert.deepEqual(core.rows[0].waypoints.map(([x, y]) => key(x, y)), machines.map(dropTile));
  assert.equal(core.parts[0].lanes, 1);
  const module = routeModule(core, moduleOptions(ctx, links, { w: 1, e: 1, n: 1, s: 1 }, sb));
  const part = module.parts.find(p => p.routeIds.includes(links.output));
  // The belt runs east below them: their lane is its left one.
  assert.deepEqual(part.drops.map(d => [d.left, d.right]), [[450, 0], [450, 0], [450, 0]]);
  assert.equal(maxFlow(part.drops, 120, ctx.env.laneCapacity), 360);
  const at = new Map(part.pieces.map(p => [key(p.x, p.y), p]));
  for (const m of module.entities.filter(e => e.kind === 'building')) assert.equal(at.get(dropTile(m))?.travel, 4, `a straight belt on ${dropTile(m)}`);
});

// Six extractors in two rows of three facing each other: one belt between them, a row's drops on
// each of its lanes.
test('two rows drop onto one belt between them, a lane each', () => {
  const { ctx, sb, links, shape, building } = soil(720);
  const variant = stackVariant(shape, { rotation: 0, rowLength: 3, flip: true, plain: true, middle: 1, drop: true, gap: 1 }, random(1));
  assert.deepEqual(variant.belts.map(b => [b.band, b.row, b.serves]), [[1, 1, [0, 1]]]);
  const core = buildCore(sb, building, links, variant, ctx.env);
  assert.deepEqual(core.entities.filter(e => e.kind === 'inserter'), []);
  assert.deepEqual(core.parts.map(p => [p.lanes, p.machines]), [[2, 6]]);
  const module = routeModule(core, moduleOptions(ctx, links, { w: 2, e: 2, n: 1, s: 1 }, sb));
  const part = module.parts.find(p => p.routeIds.includes(links.output));
  assert.equal(maxFlow(part.drops, 120, ctx.env.laneCapacity), 720);
});

// 900/min on a 450 lane: the drop fills it, two 90° fast inserters (288/min each) put the rest on
// the other lane. Without 90° inserters nothing can reach a belt against the machine: half
// starves.
test('a machine making more than its lane takes gets 90° inserters for the rest, onto the other lane', () => {
  const { ctx, sb, links, shape, building } = plates();
  assert.equal(shape.belts.find(b => b.isOutput).dropLane, 0);
  const variant = stackVariant(shape, { rotation: 12, rowLength: 1, flip: true, plain: true, middle: 4, drop: true }, random(1));
  const core = buildCore(sb, building, links, variant, ctx.env);
  assert.equal(outputs(core).length, 2);
  assert.ok(outputs(core).every(e => e.vectors), '90° inserters');
  assert.deepEqual([core.shortfall, core.overload], [0, 0]);
  const module = routeModule(core, moduleOptions(ctx, links, { w: 2, e: 2, n: 1, s: 1 }, sb));
  const [drops] = module.parts.find(p => p.routeIds.includes(links.output)).drops;
  assert.deepEqual([drops.left, drops.right], [450, 576]);
  assert.equal(maxFlow([drops], 900, ctx.env.laneCapacity), 900);

  const straight = plates({ ...logistics, rightAngle: false });
  const alone = buildCore(straight.sb, building, straight.links, stackVariant(straight.shape, { rotation: 12, rowLength: 1, flip: true, plain: true, middle: 5, drop: true }, random(1)), straight.ctx.env);
  assert.deepEqual([outputs(alone).length, alone.overload], [0, 450]);
});

// Four extractors (480/min) in a row on one lane of 450: the last one the belt passes finds 90
// of room, whichever it is, so each gets an inserter for the rest of its 120.
test('a row whose drops may fill their lane before a machine\'s turn gets inserters for what is left', () => {
  const { ctx, sb, links, shape, building } = soil(480);
  const core = buildCore(sb, building, links, stackVariant(shape, { rotation: 0, rowLength: 4, flip: true, plain: true, middle: 4, drop: true, gap: 1 }, random(1)), ctx.env);
  assert.deepEqual(core.entities.filter(e => e.kind === 'building').map(m => outputs(core).filter(e => e.machine === m.machine).length), [1, 1, 1, 1]);
  assert.equal(core.overload, 0);
});

// The drop tile of a machine holds only its own output's belt; on it, the machine needs no
// inserter.
test('a machine drops only onto a belt of its own output, and that drains it', () => {
  const machine = { name: 'soil-extractor-mk01', kind: 'building', recipe: 'soil', x: 0, y: 0, w: 7, h: 7, direction: 0, drop: { x: 3.5, y: 7.01 }, subBlock: 0 };
  const belt = route => ({ name: 'transport-belt', kind: 'belt', route, x: 3, y: 7, w: 1, h: 1, direction: 4, travel: 4 });
  const routes = [{ id: 0, kind: 'belt', source: 0, consumers: [] }, { id: 1, kind: 'belt', source: 'side-input', consumers: [1] }];
  const ownBelt = belt(0);
  const own = { entities: [machine, ownBelt], routes: [{ ...routes[0], pieces: [ownBelt] }, { ...routes[1], pieces: [] }] };
  assert.deepEqual(dropsOnItsOwnBelt(own), []);
  assert.deepEqual(drainsEveryMachine(own, own.routes[0], [machine], pyCatalog), []);
  const other = { entities: [machine, belt(1)], routes };
  assert.deepEqual(dropsOnItsOwnBelt(other), ['soil-extractor-mk01 at 0,0 drops its products on route 1']);
});

// Squeezing takes out rows of straight belts and empty tiles — never the drop row: the belt below
// it would move onto the drop tile.
test('squeezing keeps a drop tile beside its machine, and nothing moves onto it', () => {
  const machine = { name: 'soil-extractor-mk01', kind: 'building', x: 0, y: 0, w: 7, h: 7, direction: 0, drop: { x: 3.5, y: 7.01 } };
  const belts = [...Array(9).keys()].map(x => ({ name: 'transport-belt', kind: 'belt', route: 1, x: x - 1, y: 9, w: 1, h: 1, direction: 4, travel: 4, out: key(x, 9) }));
  const { entities } = squeezeEntities([machine, ...belts]);
  // The empty row 8 comes out, row 7 (the drop row) stays: the belt ends up one row below it.
  assert.deepEqual([...new Set(entities.filter(e => e.kind === 'belt').map(e => e.y))], [8]);
});

// The layout search builds soil extractors that drop all they make: no inserter at all, every
// drop tile on its own belt. A casting unit's two supporting inserters clock what its drop leaves
// them: 15 plates a second, the lane takes 7.5, 3.75 each (15 in 4 s).
test('search: extractors drop all their soil without inserters; a casting unit\'s inserters clock the rest', () => {
  const extractors = solve([{ goal: { item: 'soil', rate: 360 }, selection: { recipe: 'soil', building: 'soil-extractor-mk01' } }], pyCatalog, logistics);
  assertValid(extractors, pyCatalog, logistics);
  assert.deepEqual(extractors.entities.filter(e => e.kind === 'inserter'), []);
  const onOwnBelt = block => {
    const at = new Map(block.entities.filter(e => e.kind === 'belt' || e.kind === 'underground-belt').map(e => [key(e.x, e.y), e]));
    return block.entities.filter(e => e.kind === 'building').every(m => block.routes[at.get(dropTile(m))?.route]?.source === m.subBlock);
  };
  assert.ok(onOwnBelt(extractors));

  const casting = solve([{ goal: { item: 'iron-plate', rate: 900 }, selection: { recipe: 'iron-plate-1', building: 'casting-unit-mk01' } }], pyCatalog, logistics);
  assertValid(casting, pyCatalog, logistics);
  assert.ok(onOwnBelt(casting));
  assert.equal(supporting(casting), 2);
  const { of } = clocksOf(casting, pyCatalog);
  assert.deepEqual(casting.entities.filter(e => e.role === 'output').map(e => of.get(e)), ['15/4', '15/4']);
});
