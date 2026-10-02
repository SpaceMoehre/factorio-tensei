import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../js/solve.js';
import { context, designStep, designOf, random, shapeOf, stackVariant, moduleOptions } from '../js/design.js';
import { coreLinks } from '../js/routes.js';
import { buildCore } from '../js/layout/core.js';
import { routeModule } from '../js/layout/module.js';
import { prepare, compose, RoutingError } from '../js/layout/compose.js';
import { placeBlocks } from '../js/layout/place.js';
import { finishBlock } from '../js/layout/compact.js';
import { simulate } from '../js/sim.js';
import { expandChain } from '../js/chain.js';
import { catalog, pyCatalog, logistics } from './fixtures/catalog.js';
import { assertValid, assertNoCustomVectors, assertFeedsEveryMachine } from './support/invariants.js';

const asm2 = (item, rate) => ({ goal: { item, rate }, selection: { recipe: item, building: 'assembling-machine-2' } });
const machinesOf = (block, recipe) => block.entities.filter(e => e.kind === 'building' && e.recipe === recipe);
const beltRoutes = (block, sb) => block.routes.filter(r => r.kind === 'belt' && (r.source === sb || r.consumers.includes(sb)));

// Py electronic-circuit: 7 solid ingredients. At 180/min (4 chipshooters) every ingredient fits a
// lane, so Belt Merge pairs them onto 4 belts; with the output that is 5 belts, beyond v1's 4.
test('a recipe needing 5 belts solves: Py electronic-circuit with 7 solid ingredients', () => {
  const entries = [{ goal: { item: 'electronic-circuit', rate: 180 }, selection: { recipe: 'electronic-circuit', building: 'chipshooter-mk01' } }];
  const block = solve(entries, pyCatalog, logistics);
  assert.equal(machinesOf(block, 'electronic-circuit').length, 4);
  assert.ok(beltRoutes(block, 0).length >= 5, `${beltRoutes(block, 0).length} belts`);
  assertValid(block, pyCatalog, logistics);
});

// 2100/min at 600/min per wet scrubber: 4 machines, three input fluids side by side.
test('Py nitrogen-mustard at 4 machines routes', () => {
  const block = solve([{
    goal: { item: 'nitrogen-mustard', rate: 2100 }, selection: { recipe: 'nitrogen-mustard', building: 'wet-scrubber-mk01' },
  }], catalog, logistics);
  assert.equal(machinesOf(block, 'nitrogen-mustard').length, 4);
  assertValid(block, catalog, logistics);
});

test('with 90° inserters switched off, no inserter uses custom vectors', () => {
  const off = { ...logistics, rightAngle: false };
  const block = solve([asm2('electronic-circuit', 300), asm2('copper-cable', 900)], catalog, off);
  assertNoCustomVectors(block);
  assertValid(block, catalog, off);
});

// Straight swings only: a fast inserter moves 2.4 items/s, a long-handed one 1.2 (one swing there
// and back per item: 0.04 and 0.02 revolutions per tick). 180 gears/min on two machines at
// 1.5 crafts/s each need 3 iron/s per machine — more than any one inserter moves.
test('inserter count scales with throughput', () => {
  const off = { ...logistics, rightAngle: false };
  const block = solve([asm2('iron-gear-wheel', 180)], catalog, off);
  const iron = block.routes.find(r => r.items.some(i => i.item === 'iron-plate'));
  const ironTiles = new Set(iron.pieces.map(p => `${p.x},${p.y}`));
  const moves = { 'fast-inserter': 2.4, 'long-handed-inserter': 1.2 };
  // Straight inserters pick up `reach` tiles toward their direction and drop as far the other way.
  const tiles = i => {
    const reach = i.name === 'fast-inserter' ? 1 : 2;
    const [dx, dy] = { 0: [0, -1], 4: [1, 0], 8: [0, 1], 12: [-1, 0] }[i.direction];
    return { pickup: `${i.x + dx * reach},${i.y + dy * reach}`, drop: { x: i.x - dx * reach, y: i.y - dy * reach } };
  };
  const inside = ({ x, y }, m) => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h;
  for (const m of machinesOf(block, 'iron-gear-wheel')) {
    const feeding = block.entities.filter(e => e.kind === 'inserter' && ironTiles.has(tiles(e).pickup) && inside(tiles(e).drop, m));
    assert.ok(feeding.length >= 2, `${feeding.length} inserters feed iron into the machine at ${m.x},${m.y}`);
    assert.ok(feeding.reduce((sum, i) => sum + moves[i.name], 0) >= 3, 'the iron inserters move at least 3/s');
  }
  assert.deepEqual(simulate(block).starvation.filter(s => s.cause === 'inserters'), []);
  assertValid(block, catalog, off);
});

// 37.5 iron plates/min keep 2 stone furnaces busy; each burns 90kW / 4MJ = 0.0225 coal/s.
test('a burner machine gets a Fuel input at its power draw: 2 stone furnaces, 2.7 coal/min', () => {
  const block = solve([{ goal: { item: 'iron-plate', rate: 37.5 }, selection: { recipe: 'iron-plate', building: 'stone-furnace' } }], catalog, logistics);
  const coal = block.routes.find(r => r.items.some(i => i.item === 'coal'));
  assert.equal(coal.source, 'side-input');
  assert.ok(Math.abs(coal.items.find(i => i.item === 'coal').rate - 2.7) < 1e-9);
  assertFeedsEveryMachine(block, coal, machinesOf(block, 'iron-plate'), catalog);
  assertValid(block, catalog, logistics);
});

// Py science pack 2: 18 packs per 180 s craft; research-center-mk01 runs at speed 1, so each
// makes 6/min and 450/min needs 75. That is 25 crafts/min, 400 moss each: 10,000 moss/min, or
// 133⅓ per machine. A saturated yellow belt carries 900/min, enough for 6 machines, so moss
// arrives on at least ceil(10000 / 900) = 12 parallel belts.
test('Py science pack 2 at 450/min: 75 research centres, moss on parallel belts, nothing starves', () => {
  const entries = [{ goal: { item: 'py-science-pack-2', rate: 450 }, selection: { recipe: 'py-science-pack-2', building: 'research-center-mk01' } }];
  const block = solve(entries, pyCatalog, logistics, { maxCandidates: 16 });
  assert.equal(machinesOf(block, 'py-science-pack-2').length, 75);
  const moss = block.routes.filter(r => r.items.some(i => i.item === 'moss'));
  assert.ok(moss.length >= 12, `${moss.length} moss belts`);
  assert.ok(moss.every(r => r.items[0].rate <= 900 + 1e-9));
  assert.deepEqual(simulate(block).starvation, []);
  assertValid(block, pyCatalog, logistics);
});

// Py small parts at 600/min in automated factories: 900 bolts, 900 iron sticks and 900 cable a
// minute between them, twice what one lane of a yellow belt carries (450/min). Output inserters
// fill both lanes where machine rows face the belt from both sides, or the path runs on parallel
// belts, so every Internal Path carries its whole rate. (Hand size 3: inserter capacity research.)
test('Internal Paths beyond one lane arrive whole: Py small parts at 600/min', () => {
  const items = ['small-parts-01', 'bolts', 'iron-stick', 'copper-cable', 'iron-gear-wheel'];
  const selections = Object.fromEntries(items.map(i => [i, { recipe: i, building: 'automated-factory-mk01' }]));
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 600 }], pyCatalog, { made: items.slice(1), selections });
  const settings = { ...logistics, handSize: 3 };
  const block = solve(entries, pyCatalog, settings, { maxCandidates: 12 });
  const internal = block.routes.filter(r => typeof r.source === 'number' && r.consumers.length);
  for (const item of ['bolts', 'iron-stick', 'copper-cable']) {
    const rate = internal.filter(r => r.items[0].item === item).reduce((sum, r) => sum + r.items[0].rate, 0);
    assert.ok(Math.abs(rate - 900) < 1e-6, `${item} ${rate}`);
  }
  assert.deepEqual(simulate(block).starvation.filter(s => s.subBlock !== null), []);
  assertValid(block, pyCatalog, settings);
});

// Areas v1's template reached on the same scenarios (bounds including its routing margin).
const V1_AREA = {
  gears: 210, circuits: 621, three: 1444, oil: 1085, concrete: 990, distil: 540, mustard: 1344, compost: 943,
};
const SCENARIOS = {
  gears: [asm2('iron-gear-wheel', 180)],
  circuits: [asm2('electronic-circuit', 300), asm2('copper-cable', 900)],
  three: [asm2('electronic-circuit', 300), asm2('copper-cable', 900), asm2('iron-gear-wheel', 900)],
  oil: [{ goal: { item: 'petroleum-gas', rate: 1320 }, selection: { recipe: 'advanced-oil-processing', building: 'oil-refinery' } }],
  concrete: [asm2('concrete', 600)],
  distil: [{ goal: { item: 'aromatics', rate: 4800 }, selection: { recipe: 'tar-distilation', building: 'distilator' } }],
  mustard: [{ goal: { item: 'nitrogen-mustard', rate: 1500 }, selection: { recipe: 'nitrogen-mustard', building: 'wet-scrubber-mk01' } }],
  compost: [{ goal: { item: 'biomass', rate: 150 }, selection: { recipe: 'biomass', building: 'compost-plant-mk01' } }],
};

for (const [name, entries] of Object.entries(SCENARIOS)) {
  test(`Compactness: the search is never worse than v1's template (${name})`, () => {
    const block = solve(entries, catalog, logistics);
    assert.ok(block.bounds.w * block.bounds.h <= V1_AREA[name], `${block.bounds.w}×${block.bounds.h} > v1's ${V1_AREA[name]}`);
    assertValid(block, catalog, logistics);
  });
}

test('the search is deterministic under a seed', () => {
  const run = () => solve(SCENARIOS.circuits, catalog, logistics, { seed: 7 });
  assert.deepEqual(run(), run());
});

// The Py small parts chain at 600/min with hand size 1 (one item per swing): the small parts
// factory takes 900 bolts and 900 cable a minute, more than its top and bottom faces' inserters
// move, and makes 600/min, more than one lane holds. Belts on its sides and a head-on output
// that fills both lanes feed it in full.
test('Py small parts at 600/min, hand size 1: every machine fed, both output lanes filled', () => {
  const items = ['small-parts-01', 'bolts', 'iron-stick', 'copper-cable', 'iron-gear-wheel'];
  const selections = Object.fromEntries(items.map(i => [i, { recipe: i, building: 'automated-factory-mk01' }]));
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 600 }], pyCatalog, { made: items.slice(1), selections });
  const block = solve(entries, pyCatalog, logistics, { maxCandidates: 8 });
  assert.equal(block.entities.filter(e => e.kind === 'building').length, 14);
  assert.deepEqual(simulate(block).starvation, []);
  assertValid(block, pyCatalog, logistics);
});

// Py small parts at 900/min: three bolt factories make 1350 a minute for two small parts
// factories, more than one belt carries. With a Two-Way Output the middle factory drops onto both
// belts, each bringing its consumer 675; output inserters pick their lane (custom vectors), so one
// row of machines fills both lanes.
test('Py small parts at 900/min: three bolt factories fill two belts, nothing starves', () => {
  const items = ['small-parts-01', 'bolts', 'iron-stick', 'copper-cable', 'iron-gear-wheel'];
  const selections = Object.fromEntries(items.map(i => [i, { recipe: i, building: 'automated-factory-mk01' }]));
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 900 }], pyCatalog, { made: items.slice(1), selections });
  const block = solve(entries, pyCatalog, logistics, { maxCandidates: 40 });
  assert.deepEqual(simulate(block).starvation, []);
  assertValid(block, pyCatalog, logistics);
});

// The same with every bolt factory dropping on one belt: two belts bring 900 and 600, and a
// splitter between them evens them out (Path Flow through it brings more than either alone).
// Inserters moving three items a swing, so rows of one factory get all the inserters they need.
test('Py small parts at 900/min, bolts on one belt each: a splitter joins the two belts', () => {
  const items = ['small-parts-01', 'bolts', 'iron-stick', 'copper-cable', 'iron-gear-wheel'];
  const selections = Object.fromEntries(items.map(i => [i, { recipe: i, building: 'automated-factory-mk01' }]));
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 900 }], pyCatalog, { made: items.slice(1), selections });
  const hands = { ...logistics, handSize: 3 };
  const ctx = context(entries, pyCatalog, hands);
  const rng = random(1);
  const candidates = [];
  for (const i of ctx.flows.order) candidates[i] = designStep(ctx, i, rng);
  // The bolt factories in rows of one, each dropping on the belt below it only.
  const bolts = ctx.plan.findIndex(sb => sb.recipe === 'bolts');
  const sb = ctx.plan[bolts], links = coreLinks(sb, bolts, ctx.routes);
  const variant = stackVariant(shapeOf(ctx, sb, bolts, links), { rotation: 0, rowLength: 1, flip: true, plain: true, middle: 4 }, random(1));
  const core = buildCore(sb, pyCatalog.buildings[sb.building], links, variant, ctx.env);
  const oneWay = { kinds: [{ module: routeModule(core, moduleOptions(ctx, links, { w: 2, e: 2, n: 1, s: 1 }, sb)), count: 1 }] };
  // Beside the first small parts design that lays out with them (the search tries others too).
  const small = ctx.plan.findIndex(x => x.recipe === 'small-parts-01');
  let block = null;
  for (const design of candidates[small].map(designOf).filter(Boolean)) {
    const ready = prepare(ctx, candidates.map((list, i) => (i === bolts ? oneWay : i === small ? design : designOf(list[0]))));
    const pair = ready.routes.filter(r => r.splitter);
    assert.equal(pair.length, 2);
    const carried = r => r.items[0].capacity, joined = r => r.splitter.items[0].capacity;
    assert.ok(joined(pair[0]) + joined(pair[1]) > carried(pair[0]) + carried(pair[1]));
    try {
      block = finishBlock(compose(ctx, ready, placeBlocks(ctx, ready, {}), { margin: { w: 0, e: 0, n: 1, s: 1 } }), pyCatalog, hands);
      break;
    } catch (e) {
      if (!(e instanceof RoutingError)) throw e;
    }
  }
  assert.ok(block, 'a small parts design lays out');
  assert.equal(block.entities.filter(e => e.kind === 'splitter').length, 1);
  assertValid(block, pyCatalog, hands);
});

// Py small parts at 3600/min with fast inserters moving one item a swing: 76 automated factories,
// every belt full or nearly. Small parts factories take 2100 items a minute through belts on all
// four sides; bolts, sticks and cable cannot be cut into belts by whole machines, so their rows
// drop on both bands (Two-Way Output) and the belts' Path Flow brings each consumer all it takes.
test('Py small parts at 3600/min: nothing starves', () => {
  const items = ['small-parts-01', 'bolts', 'iron-stick', 'copper-cable', 'iron-gear-wheel'];
  const selections = Object.fromEntries(items.map(i => [i, { recipe: i, building: 'automated-factory-mk01' }]));
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 3600 }], pyCatalog, { made: items.slice(1), selections });
  const block = solve(entries, pyCatalog, logistics, { maxCandidates: 30 });
  assert.equal(block.entities.filter(e => e.kind === 'building').length, 76);
  assert.deepEqual(simulate(block).starvation, []);
  assertValid(block, pyCatalog, logistics);
});

// Py small parts at 1200/min: 26 automated factories. Each Internal Path runs on as many belts as
// both ends split into (iron sticks from copies of a module snaking through them, bolts and
// cable part to part), so every belt links a run of producers to a run of consumers.
test('Py small parts at 1200/min: the chain\'s belts pair producers with consumers and lay out', () => {
  const items = ['small-parts-01', 'bolts', 'iron-stick', 'copper-cable', 'iron-gear-wheel'];
  const selections = Object.fromEntries(items.map(i => [i, { recipe: i, building: 'automated-factory-mk01' }]));
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 1200 }], pyCatalog, { made: items.slice(1), selections });
  const block = solve(entries, pyCatalog, { ...logistics, handSize: 3 }, { maxCandidates: 6 });
  assert.equal(block.entities.filter(e => e.kind === 'building').length, 26);
  assertValid(block, pyCatalog, logistics);
});

// 2400 moss/min: 500 moss farms (4.8/min each on sixteen moss). The Sub-Block repeats one module
// (pairs of farm rows facing their moss belt) rather than routing all 500, and the stack of copies
// comes out about square.
test('a huge Sub-Block repeats one module: 500 moss farms, about square, nothing starves', () => {
  const { entries } = expandChain([{ item: 'moss', rate: 2400 }], pyCatalog, { selections: { moss: { recipe: 'Moss-1', building: 'moss-farm-mk01' } } });
  const started = Date.now();
  const block = solve(entries, pyCatalog, logistics, { maxCandidates: 1 });
  assert.ok(Date.now() - started < 60000, `${Date.now() - started} ms`);
  assert.equal(machinesOf(block, 'Moss-1').length, 500);
  assert.ok(block.subBlocks[0].copies >= 2, `${block.subBlocks[0].copies} copies`);
  const { w, h } = block.bounds;
  assert.ok(Math.max(w / h, h / w) <= 2, `${w}×${h}`);
  assert.deepEqual(simulate(block).starvation, []);
  assertValid(block, pyCatalog, logistics);
});
