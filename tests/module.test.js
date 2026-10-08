import { test } from 'node:test';
import assert from 'node:assert/strict';
import { context, moduleOptions } from '../js/design.js';
import { buildCore } from '../js/layout/core.js';
import { routeModule, trim, laneOf, lanePoint } from '../js/layout/module.js';
import { maxFlow } from '../js/layout/compose.js';
import { coreLinks } from '../js/routes.js';
import { expandChain } from '../js/chain.js';
import { routeChain } from '../js/layout/validity.js';
import { pyCatalog, logistics } from './fixtures/catalog.js';

// Py small parts at 600/min: one automated factory taking 900 bolts, 900 cable and 300 gears a
// minute and making 600 small parts — more than its top and bottom faces' inserters move.
const items = ['small-parts-01', 'bolts', 'iron-stick', 'copper-cable', 'iron-gear-wheel'];
const smallParts = (settings, rate = 600) => {
  const selections = Object.fromEntries(items.map(i => [i, { recipe: i, building: 'automated-factory-mk01' }]));
  const { entries } = expandChain([{ item: 'small-parts-01', rate }], pyCatalog, { made: items.slice(1), selections });
  const ctx = context(entries, pyCatalog, settings);
  const sb = ctx.plan[0];
  const links = coreLinks(sb, 0, ctx.routes);
  const route = name => ctx.routes.find(r => r.kind === 'belt' && r.consumers.includes(0) && r.items.some(i => i.item === name)).id;
  return { ctx, sb, links, bolts: route('bolts'), cable: route('copper-cable'), gears: route('iron-gear-wheel') };
};

// Bolts above, cable below, gears on a Side Belt west of the machine, the output on a Head-on
// Belt leaving east: every input arrives in full and the output fills both lanes.
const allSides = ({ bolts, cable, gears, links }) => ({
  rotation: 0, rowLength: 1, flip: false, middle: 0, gap: 0, columns: 'center', shift: 0, poleSlot: null, pipes: [],
  belts: [{ routeIds: [bolts], part: 0, band: 0, row: 2, serves: [0] }, { routeIds: [cable], part: 0, band: 1, row: 2, serves: [0] }],
  sides: [{ routeIds: [gears], part: 0, face: 'W', slot: 1, serves: [0] }],
  heads: [{ routeIds: [links.output], part: 0, face: 'E', at: 3, serves: [0] }],
});

test('a machine takes belts on all four sides: Side Belt west, Head-on Belt east', () => {
  const setup = smallParts({ ...logistics, handSize: 1 });
  const { ctx, sb, links } = setup;
  const core = buildCore(sb, pyCatalog.buildings[sb.building], links, allSides(setup), ctx.env);
  assert.equal(core.shortfall, 0);
  assert.equal(core.overload, 0);
  const head = core.parts.find(p => p.kind === 'head');
  assert.deepEqual([head.lanes, head.canEnter, head.canExit], [2, false, true]);
  const side = core.parts.find(p => p.kind === 'side');
  assert.deepEqual([side.face, side.canEnter, side.canExit], ['W', true, true]);
  // The head-on belt's inserters work at 90°: custom vectors, picking from the machine.
  const machine = core.entities.find(e => e.kind === 'building');
  const headInserters = core.entities.filter(e => e.vectors && e.x >= machine.x + machine.w);
  assert.ok(headInserters.length >= 2);
  assert.ok(headInserters.some(e => e.name === 'long-handed-inserter'), 'a long-handed inserter reaches the machine two tiles away');
});

// With hand size 3 one fast 90° inserter could move all 600/min — onto one lane, which holds 450.
// The head-on belt gets inserters on both sides, so both lanes carry it.
test('a head-on output fills both lanes even when one inserter could move it all', () => {
  const setup = smallParts({ ...logistics, handSize: 3 });
  const { ctx, sb, links } = setup;
  const core = buildCore(sb, pyCatalog.buildings[sb.building], links, allSides(setup), ctx.env);
  const module = routeModule(core, moduleOptions(ctx, links, { w: 1, e: 1, n: 0, s: 0 }));
  const head = module.parts.find(p => p.kind === 'head');
  const [machine] = head.drops;
  assert.ok(machine.left > 0 && machine.right > 0, JSON.stringify(machine));
  assert.ok(maxFlow(head.drops, 600, ctx.env.laneCapacity) >= 600 - 1e-9);
});

test('a routed module runs every belt from its west edge to its east edge, and a copy trims what it needs not', () => {
  const setup = smallParts({ ...logistics, handSize: 1 });
  const { ctx, sb, links } = setup;
  const core = buildCore(sb, pyCatalog.buildings[sb.building], links, allSides(setup), ctx.env);
  const module = routeModule(core, moduleOptions(ctx, links, { w: 1, e: 1, n: 0, s: 0 }));
  const { area } = module;
  for (const part of module.parts) {
    const route = { id: part.key, kind: 'belt', pieces: part.pieces };
    assert.deepEqual(routeChain(route, pyCatalog, logistics, part.pieces), [], part.key);
    if (part.canEnter) assert.equal(part.pieces[0].x, area.x, `${part.key} enters on the west edge`);
    if (part.canExit) assert.equal(part.pieces.at(-1).x, area.x + area.w - 1, `${part.key} leaves on the east edge`);
    // Trimmed at both ends it still runs piece to piece, and starts and ends on its own tiles.
    const trimmed = trim(part, { head: true, tail: true }, 'transport-belt');
    assert.deepEqual(routeChain({ ...route, pieces: trimmed }, pyCatalog, logistics, trimmed), [], `${part.key} trimmed`);
    assert.ok(trimmed.length <= part.pieces.length);
    assert.ok(trimmed.at(-1).underground !== 'input', 'a trimmed belt never ends diving');
  }
});

// Two lanes of 450/min. Three machines making 180/min each drop on one lane, two on the other:
// the first lane holds 450, so 810 of 900 arrive. Two and two fit.
test('a belt takes what fits each lane: whole machines fill one lane each', () => {
  const left = { left: 288, right: 0, either: 0 }, right = { left: 0, right: 288, either: 0 };
  assert.equal(maxFlow([left, left, left, right, right], 180, 450), 810);
  assert.equal(maxFlow([left, left, right, right], 180, 450), 720);
  // A drop along the belt may land on either lane: counted on the worse one.
  assert.equal(maxFlow([{ left: 0, right: 0, either: 288 }, { left: 0, right: 0, either: 288 }, { left: 0, right: 0, either: 288 }], 180, 450), 450);
});

// Two factories (1200/min) stacked one per row: gears come down one Side Belt along both of
// their west sides — one part, one belt, entering on the module's west edge and leaving east.
test('a Side Belt runs down several machines as one part', () => {
  const setup = smallParts({ ...logistics, handSize: 3 }, 1200);
  const { ctx, sb, links, bolts, cable, gears } = setup;
  assert.equal(sb.count, 2);
  const variant = {
    rotation: 0, rowLength: 1, flip: false, middle: 4, gap: 0, columns: 'center', shift: 0, poleSlot: null, pipes: [],
    belts: [
      { routeIds: [bolts], part: 0, band: 1, row: 2, serves: [0, 1] },
      { routeIds: [cable], part: 0, band: 0, row: 2, serves: [0] }, { routeIds: [cable], part: 1, band: 2, row: 2, serves: [1] },
    ],
    sides: [{ routeIds: [gears], part: 0, face: 'W', slot: 1, serves: [0, 1] }],
    heads: [0, 1].map(r => ({ routeIds: [links.output], part: r, face: 'E', at: 3, serves: [r] })),
  };
  const core = buildCore(sb, pyCatalog.buildings[sb.building], links, variant, ctx.env);
  const side = core.parts.filter(p => p.kind === 'side');
  assert.deepEqual(side.map(p => [p.rows, p.machines]), [[[0, 1], 2]]);
  const module = routeModule(core, moduleOptions(ctx, links, { w: 2, e: 2, n: 2, s: 2 }));
  const part = module.parts.find(p => p.kind === 'side');
  const route = { id: part.key, kind: 'belt', pieces: part.pieces };
  assert.deepEqual(routeChain(route, pyCatalog, logistics, part.pieces), []);
  assert.equal(part.pieces[0].x, module.area.x);
  assert.equal(part.pieces.at(-1).x, module.area.x + module.area.w - 1);
});

// A tile per machine kept free for a pole in each band asked for (poleSlots): here the bands above
// and below two rows of factories, where the belts running round them leave no tile for a pole.
test('pole slots keep a tile per machine free in several bands', () => {
  const setup = smallParts({ ...logistics, handSize: 3 }, 1200);
  const { ctx, sb, links, bolts, cable, gears } = setup;
  const variant = {
    rotation: 0, rowLength: 1, flip: false, middle: 4, gap: 0, columns: 'center', shift: 0, poleSlot: null, pipes: [],
    poleSlots: [{ band: 0, row: 1 }, { band: 2, row: 1 }],
    belts: [
      { routeIds: [bolts], part: 0, band: 1, row: 2, serves: [0, 1] },
      { routeIds: [cable], part: 0, band: 0, row: 2, serves: [0] }, { routeIds: [cable], part: 1, band: 2, row: 2, serves: [1] },
    ],
    sides: [{ routeIds: [gears], part: 0, face: 'W', slot: 1, serves: [0, 1] }],
    heads: [0, 1].map(r => ({ routeIds: [links.output], part: r, face: 'E', at: 3, serves: [r] })),
  };
  const core = buildCore(sb, pyCatalog.buildings[sb.building], links, variant, ctx.env);
  const machines = core.entities.filter(e => e.kind === 'building');
  const top = Math.min(...machines.map(m => m.y)), bottom = Math.max(...machines.map(m => m.y + m.h - 1));
  assert.ok(core.poleSlots.some(([, y]) => y < top), 'a slot above the rows');
  assert.ok(core.poleSlots.some(([, y]) => y > bottom), 'a slot below them');
  assert.throws(() => buildCore(sb, pyCatalog.buildings[sb.building], links, { ...variant, poleSlots: [{ band: 3, row: 1 }] }, ctx.env), /pole slot outside its band/);
});

// 90° output inserters stand in the belt's row and drop along it: each drop point moves to the
// side of the lane with less on it, so one row of machines fills both lanes of its belt.
test('90° output inserters choose their lane: one row of machines fills both lanes', () => {
  const setup = smallParts({ ...logistics, handSize: 3 }, 1200);
  const { ctx, sb, links, bolts, cable, gears } = setup;
  const variant = {
    rotation: 0, rowLength: 2, flip: false, middle: 0, gap: 0, columns: 'center', shift: 0, poleSlot: null, pipes: [],
    belts: [
      { routeIds: [bolts], part: 0, band: 0, row: 2, serves: [0] }, { routeIds: [cable], part: 0, band: 0, row: 3, serves: [0] },
      { routeIds: [gears], part: 0, band: 1, row: 2, serves: [0] }, { routeIds: [links.output], part: 0, band: 1, row: 1, serves: [0] },
    ],
  };
  const core = buildCore(sb, pyCatalog.buildings[sb.building], links, variant, ctx.env);
  const module = routeModule(core, moduleOptions(ctx, links, { w: 2, e: 2, n: 1, s: 1 }));
  const output = module.parts.find(p => p.routeIds.includes(links.output));
  const lanes = output.drops.reduce((sum, d) => ({ left: sum.left + d.left, right: sum.right + d.right, either: sum.either + d.either }), { left: 0, right: 0, either: 0 });
  assert.ok(lanes.left > 0 && lanes.right > 0 && lanes.either === 0, JSON.stringify(lanes));
  assert.ok(maxFlow(output.drops, 600, ctx.env.laneCapacity) > ctx.env.laneCapacity);
});

// Drop Offset: Inserter_Config sets where in its tile an inserter drops. A quarter tile toward a
// curve's inner corner lands on the inner lane, toward its outer corner on the outer lane, however
// the game measures it; the middle of a curve stays undecided.
test('a drop toward a curve\'s inner or outer corner lands on a decided lane', () => {
  const E = 4, S = 8, N = 0;
  for (const [turn, inner] of [[S, 'right'], [N, 'left']]) {
    const pieces = [{ kind: 'belt', x: 0, y: 1, travel: E }, { kind: 'belt', x: 1, y: 1, travel: turn }, { kind: 'belt', x: 1, y: turn === S ? 2 : 0, travel: turn }];
    for (const side of ['left', 'right']) {
      const at = lanePoint(pieces, 1, side);
      assert.equal(laneOf(pieces, 1, at).lane, side);
      assert.ok(at.x > 1 && at.x < 2 && at.y > 1 && at.y < 2, 'within the curve\'s tile');
      // The inner lane's point lies toward the inner corner (south-west of a right turn).
      const toInner = side === inner;
      assert.equal(at.x < 1.5, toInner);
      assert.equal(turn === S ? at.y > 1.5 : at.y < 1.5, toInner);
      assert.equal(laneOf(pieces, 2, lanePoint(pieces, 2, side)).lane, side);
    }
    assert.equal(laneOf(pieces, 1, { x: 1.5, y: 1.5 }).lane, 'either');
  }
});

// With custom vectors a Side Belt's straight output inserters drop left and right in turn, so the
// one machine beside it fills both lanes; without them they all drop on the far lane.
test('a Side Belt output fills both lanes with Drop Offsets, one lane without', () => {
  for (const rightAngle of [true, false]) {
    const setup = smallParts({ ...logistics, handSize: 1, rightAngle });
    const { ctx, sb, links, gears } = setup;
    const variant = {
      ...allSides(setup), heads: [],
      sides: [{ routeIds: [gears], part: 0, face: 'W', slot: 1, serves: [0] }, { routeIds: [links.output], part: 0, face: 'E', slot: 1, serves: [0] }],
    };
    const core = buildCore(sb, pyCatalog.buildings[sb.building], links, variant, ctx.env);
    const module = routeModule(core, moduleOptions(ctx, links, { w: 2, e: 2, n: 1, s: 1 }, sb));
    const output = module.parts.find(p => p.routeIds.includes(links.output));
    const [machine] = output.drops;
    if (rightAngle) {
      assert.equal(core.parts.find(p => p.routeIds.includes(links.output)).lanes, 2);
      assert.ok(machine.left > 0 && machine.right > 0 && machine.either === 0, JSON.stringify(machine));
      assert.ok(maxFlow(output.drops, 600, ctx.env.laneCapacity) >= 600 - 1e-9, JSON.stringify(machine));
    } else {
      assert.ok(machine.left === 0 || machine.right === 0, JSON.stringify(machine));
    }
  }
});
