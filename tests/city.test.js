import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { decodeBlueprint, readCityBlock, siteOf } from '../js/city.js';
import { search } from '../js/search.js';
import { maximize, planner, attempt } from '../js/maximize.js';
import { gapsOf } from '../js/bands.js';
import { expandChain, recipeOptions } from '../js/chain.js';
import { encodeBlueprint } from '../js/blueprint.js';
import { simulate } from '../js/sim.js';
import { context, designStep, designOf, random } from '../js/design.js';
import { prepare, compose, RoutingError } from '../js/layout/compose.js';
import { placeBlocks } from '../js/layout/place.js';
import { finishBlock } from '../js/layout/compact.js';
import { catalog as vanilla, logistics, pyCatalog } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

const catalog = { ...vanilla, poles: { ...vanilla.poles, substation: { name: 'substation', size: { w: 2, h: 2 }, supplyRadius: 9, wireReach: 18 } } };
const asm2 = (item, rate) => ({ goal: { item, rate }, selection: { recipe: item, building: 'assembling-machine-2' } });
const encode = json => '0' + deflateSync(Buffer.from(JSON.stringify(json))).toString('base64');
const decode = s => JSON.parse(inflateSync(Buffer.from(s.slice(1), 'base64')).toString());
const VERSION = 562949953421312;

// A 60 × 40 city block on a snap grid: a roboport in the middle, a radar in a corner, a
// substation in two others (joined by a wire) and a lamp turned east.
const cityBlueprint = {
  item: 'blueprint', label: 'City block', version: VERSION,
  'snap-to-grid': { x: 60, y: 40 }, 'absolute-snapping': true,
  entities: [
    { entity_number: 1, name: 'roboport', position: { x: 30, y: 20 } },
    { entity_number: 2, name: 'radar', position: { x: 1.5, y: 38.5 } },
    { entity_number: 3, name: 'substation', position: { x: 1, y: 1 } },
    { entity_number: 4, name: 'substation', position: { x: 59, y: 39 } },
    { entity_number: 5, name: 'small-lamp', position: { x: 20.5, y: 0.5 }, direction: 4 },
  ],
  wires: [[3, 5, 4, 5]],
  tiles: [{ name: 'refined-concrete', position: { x: 0, y: 0 } }],
};

// Every belt, pipe, machine and pole of the block lies inside the Buffer, none on a Fixture.
const assertInside = block => {
  const { inner, fixtures } = block.site;
  const taken = new Set(fixtures.flatMap(f => [...Array(f.w * f.h).keys()].map(i => `${f.x + (i % f.w)},${f.y + Math.floor(i / f.w)}`)));
  for (const e of block.entities) {
    assert.ok(e.x >= inner.x && e.y >= inner.y && e.x + e.w <= inner.x + inner.w && e.y + e.h <= inner.y + inner.h, `${e.name} at ${e.x},${e.y} outside`);
    for (let dx = 0; dx < e.w; dx++) for (let dy = 0; dy < e.h; dy++) assert.ok(!taken.has(`${e.x + dx},${e.y + dy}`), `${e.name} on a fixture`);
  }
};

const inBlock = (entries, site, candidates = 12) => {
  let best = null;
  const run = search(entries, catalog, logistics, { seed: 1, maxCandidates: candidates, site });
  for (let step = run.next(); !step.done; step = run.next()) best = step.value.block;
  return best;
};

test('a city block blueprint string is read as its snap grid and the tiles its entities cover', async () => {
  const blueprint = await decodeBlueprint(encode({ blueprint: cityBlueprint }));
  const city = readCityBlock(blueprint, catalog);
  assert.deepEqual(city.area, { x: 0, y: 0, w: 60, h: 40 });
  assert.deepEqual(city.fixtures.map(f => [f.name, f.x, f.y, f.w, f.h]), [
    ['roboport', 28, 18, 4, 4], ['radar', 0, 37, 3, 3], ['substation', 0, 0, 2, 2], ['substation', 58, 38, 2, 2], ['small-lamp', 20, 0, 1, 1],
  ]);
  assert.deepEqual(city.unknown, []);
  // Inside a Buffer of 2.
  assert.deepEqual(siteOf(city, 2).inner, { x: 2, y: 2, w: 56, h: 36 });
});

// Poles shared with the neighbouring city blocks stand on the grid's border, half outside it.
test("a city block's snap grid holds it though poles shared with its neighbours straddle its border; a grid far smaller only aligns it", async () => {
  const shared = { entity_number: 6, name: 'substation', position: { x: 60, y: 20 } }, top = { entity_number: 7, name: 'substation', position: { x: 30, y: 0 } };
  const straddling = { ...cityBlueprint, entities: [...cityBlueprint.entities, shared, top] };
  assert.deepEqual(readCityBlock(await decodeBlueprint(encode({ blueprint: straddling })), catalog).area, { x: 0, y: 0, w: 60, h: 40 });
  // A 2 × 2 grid (rails): the extent of what it holds.
  const railGrid = { ...straddling, 'snap-to-grid': { x: 2, y: 2 } };
  assert.deepEqual(readCityBlock(await decodeBlueprint(encode({ blueprint: railGrid })), catalog).area, { x: 0, y: -1, w: 61, h: 41 });
});

test('a blueprint book gives the blueprint it shows; entities turned east swap their sides; unknown ones count as one tile', async () => {
  const machine = { entity_number: 1, name: 'decider-combinator', position: { x: 5, y: 3.5 }, direction: 4 };
  const odd = { entity_number: 2, name: 'mystery-box', position: { x: 0.5, y: 0.5 } };
  const book = { blueprint_book: { active_index: 1, blueprints: [
    { index: 0, blueprint: { ...cityBlueprint, label: 'other' } },
    { index: 1, blueprint: { item: 'blueprint', version: VERSION, entities: [machine, odd] } },
  ] } };
  const city = readCityBlock(await decodeBlueprint(encode(book)), catalog);
  assert.deepEqual(city.fixtures.map(f => [f.name, f.x, f.y, f.w, f.h]), [['decider-combinator', 4, 3, 2, 1], ['mystery-box', 0, 0, 1, 1]]);
  assert.deepEqual(city.unknown, ['mystery-box']);
  // Without a snap grid: the extent of what it holds.
  assert.deepEqual(city.area, { x: 0, y: 0, w: 6, h: 4 });
  await assert.rejects(decodeBlueprint('0garbage'), /not a blueprint string/);
  assert.throws(() => readCityBlock({ ...cityBlueprint, version: 281479278886912 }), /Factorio 1\.x/);
});

test('a block built in a city block stands inside its buffer, off its entities, its poles joining the city block\'s', async () => {
  const blueprint = await decodeBlueprint(encode({ blueprint: cityBlueprint }));
  const site = siteOf(readCityBlock(blueprint, catalog), 2);
  const block = inBlock([asm2('electronic-circuit', 300), asm2('copper-cable', 900)], site);
  assert.ok(block, 'a layout');
  assertValid(block, catalog, logistics);
  assertInside(block);
  assert.equal(simulate(block).starvation.length, 0);
  // The train's belts enter on the buffer's west edge and leave on its east edge.
  for (const route of block.routes.filter(r => r.kind === 'belt')) {
    if (route.source === 'side-input') assert.equal(route.pieces[0].x, site.inner.x);
    if (route.sink === 'side-output') assert.equal(route.pieces.at(-1).x, site.inner.x + site.inner.w - 1);
  }
  // One network with the city block's substations: some wire reaches one of them.
  const fixtures = block.entities.length;
  assert.ok(block.wires.some(([a, b]) => a >= fixtures || b >= fixtures), 'a wire to a substation');

  // The blueprint is the city block's with the block added: its entities, wires and grid as they
  // were, numbered first.
  const { string } = await encodeBlueprint(block, catalog, blueprint);
  const out = decode(string).blueprint;
  assert.deepEqual(out['snap-to-grid'], { x: 60, y: 40 });
  assert.deepEqual(out.tiles, cityBlueprint.tiles);
  assert.deepEqual(out.entities.slice(0, 5), cityBlueprint.entities);
  assert.equal(out.entities.length, 5 + block.entities.length + out.entities.filter(e => e.name === 'display-panel').length);
  assert.deepEqual(out.wires[0], [3, 5, 4, 5]);
  const poles = new Set(out.entities.filter(e => e.name === 'medium-electric-pole').map(e => e.entity_number));
  assert.ok(out.wires.some(([a, , b]) => (a === 3 || a === 4 || b === 3 || b === 4) && (poles.has(a) || poles.has(b))), 'a wire from a pole to a substation');
});

test('poles of a long reach bridge to a far-off pole of the city block', () => {
  // One substation in the far corner; the block's own poles are substations too.
  const far = { name: 'substation', kind: 'fixture', number: 1, x: 96, y: 56, w: 2, h: 2 };
  const site = siteOf({ area: { x: 0, y: 0, w: 100, h: 60 }, fixtures: [far] }, 1);
  let block = null;
  const run = search([asm2('iron-gear-wheel', 120)], catalog, { ...logistics, pole: 'substation' }, { seed: 1, maxCandidates: 4, site });
  for (let step = run.next(); !step.done; step = run.next()) block = step.value.block;
  assertValid(block, catalog, { ...logistics, pole: 'substation' });
  assertInside(block);
  const fixtures = block.entities.length;
  assert.ok(block.wires.some(([a, b]) => a >= fixtures || b >= fixtures), 'a wire to the far substation');
});

test('poles of the city block power what they cover: a block under substations needs none of its own', () => {
  const substations = [];
  for (let x = 4; x < 60; x += 16) for (let y = 4; y < 40; y += 16) substations.push({ name: 'substation', kind: 'fixture', number: substations.length + 1, x, y, w: 2, h: 2 });
  const site = siteOf({ area: { x: 0, y: 0, w: 60, h: 40 }, fixtures: substations }, 1);
  const block = inBlock([asm2('iron-gear-wheel', 120)], site);
  assertValid(block, catalog, logistics);
  assertInside(block);
  assert.equal(block.entities.filter(e => e.kind === 'pole').length, 0);
});

// Eleven assembling machines 2 of gears: a row of five repeated twice, the one left over a module
// of its own below them, so the stack's box leaves a Nook beside it. Copper cable's two machines
// stand in that Nook: the two fit a City Block too narrow for them side by side and too low for
// one below the other, placed one by one or in columns. With the gears' copies in two columns, the
// Nook above the shorter one takes them.
test("in a City Block a Sub-Block stands in another's Nook: beside a narrower copy, above a shorter column", () => {
  const entries = [asm2('iron-gear-wheel', 960), asm2('copper-cable', 300)];
  const narrow = siteOf({ area: { x: 0, y: 0, w: 30, h: 24 }, fixtures: [] }, 1);
  const wide = siteOf({ area: { x: 0, y: 0, w: 60, h: 60 }, fixtures: [] }, 1);
  for (const { site, params, columns } of [{ site: narrow, params: {}, columns: [] }, { site: narrow, params: { layers: 2 }, columns: [] }, { site: wide, params: {}, columns: [2] }]) {
    const ctx = context(entries, catalog, logistics, site);
    const designs = ctx.plan.map((sb, i) => {
      const list = designStep(ctx, i, random(1), { draws: 0 });
      return designOf(sb.item === 'iron-gear-wheel' ? list.find(c => c.spec?.copies?.rest === 1) : list[0]);
    });
    const ready = prepare(ctx, designs, columns);
    const positions = placeBlocks(ctx, ready, params);
    const [gears, cable] = ['iron-gear-wheel', 'copper-cable'].map(item => positions.boxes[ctx.plan.findIndex(sb => sb.item === item)]);
    assert.ok(cable.x < gears.x + gears.w && gears.x < cable.x + cable.w && cable.y < gears.y + gears.h && gears.y < cable.y + cable.h,
      `cable ${JSON.stringify(cable)} in the gears' box ${JSON.stringify(gears)}`);
    const block = finishBlock(compose(ctx, ready, positions, { margin: { w: 0, e: 0, n: 1, s: 1 } }), catalog, logistics);
    assertValid(block, catalog, logistics);
    assertInside(block);
    assert.equal(simulate(block).starvation.length, 0);
  }
});

// Making Way: eleven assembling machines 2 of gears stand as two copies of a row of five and the
// one left over, the only design low enough for a City Block 19 tiles high inside its Buffer. A
// substation stands in the copies' row of machines wherever the stack goes: the machine it stands
// on is left out and built apart beside the stack, so all eleven still run.
test('in a City Block a Fixture standing where a machine would leaves that machine out; it is built apart', () => {
  const substation = { name: 'substation', kind: 'fixture', number: 1, x: 14, y: 3, w: 2, h: 2 };
  const site = siteOf({ area: { x: 0, y: 0, w: 37, h: 21 }, fixtures: [substation] }, 1);
  const block = inBlock([asm2('iron-gear-wheel', 960)], site, 1);
  assert.ok(block, 'a layout');
  assertValid(block, catalog, logistics);
  assertInside(block);
  assert.equal(simulate(block).starvation.length, 0);
  assert.equal(block.entities.filter(e => e.kind === 'building').length, 11);
  const [gears] = block.subBlocks;
  assert.equal(gears.apart?.length, 1);
  // The substation stands among the stack's machines.
  assert.ok(substation.x >= gears.x && substation.x + substation.w <= gears.x + gears.w && substation.y >= gears.y && substation.y + substation.h <= gears.y + gears.h,
    `${JSON.stringify(gears)}`);
});

// Backtracking: ten assembling machines 2 of circuits and the fifteen of copper cable feeding them
// in a 44 × 44 City Block, two substations across it. Standing at the top between the
// substations, the circuits leave the cable no room; placed one by one, they try another spot.
test('in a City Block, where a Sub-Block finds no room, the ones placed before it try other spots', () => {
  const substations = [11, 33].map((x, n) => ({ name: 'substation', kind: 'fixture', number: n + 1, x, y: 10, w: 2, h: 2 }));
  const site = siteOf({ area: { x: 0, y: 0, w: 44, h: 44 }, fixtures: substations }, 1);
  const selections = Object.fromEntries(['electronic-circuit', 'copper-cable'].map(item => [item, { recipe: item, building: 'assembling-machine-2' }]));
  const { entries } = expandChain([{ item: 'electronic-circuit', rate: 900 }], catalog, { made: ['copper-cable'], selections });
  const ctx = context(entries, catalog, logistics, site);
  const ready = prepare(ctx, ctx.plan.map((_, i) => designOf(designStep(ctx, i, random(1), { draws: 0 })[0])));
  const [circuits, cable] = ['electronic-circuit', 'copper-cable'].map(item => ctx.plan.findIndex(sb => sb.item === item));
  assert.throws(() => placeBlocks(ctx, ready, { at: { [circuits]: { x: 16, y: 1 } } }), RoutingError);
  const { boxes } = placeBlocks(ctx, ready, {});
  // The cable west of the circuits it feeds.
  assert.ok(boxes[cable].x + boxes[cable].w <= boxes[circuits].x, JSON.stringify(boxes));
});

test('nothing fits a city block too small for the machines', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 12, h: 8 }, fixtures: [] }, 0);
  assert.equal(inBlock([asm2('electronic-circuit', 300), asm2('copper-cable', 900)], site, 4), null);
});

test('Maximize finds a higher rate that fits, each layout found valid, inside and starving nothing', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 40, h: 30 }, fixtures: [{ name: 'roboport', kind: 'fixture', number: 1, x: 18, y: 13, w: 4, h: 4 }] }, 1);
  const selections = { 'electronic-circuit': { recipe: 'electronic-circuit', building: 'assembling-machine-2' }, 'copper-cable': { recipe: 'copper-cable', building: 'assembling-machine-2' } };
  const run = maximize([{ item: 'electronic-circuit', rate: 60 }], catalog, logistics, { made: ['copper-cable'], selections, site, maxCandidates: 12, budgetMs: 120000 });
  const found = [];
  const events = [];
  let step = run.next();
  for (; !step.done; step = run.next()) {
    const value = /** @type {any} */ (step.value);
    events.push(value);
    if (value.type !== 'best') continue;
    const { block, rate, machines } = value;
    assertValid(block, catalog, logistics);
    assertInside(block);
    assert.equal(simulate(block).starvation.length, 0);
    assert.equal(block.subBlocks.find(sb => sb.item === 'electronic-circuit').count, machines);
    found.push(rate);
  }
  // 90/min a machine: whole machines, then a few rates between (the last machine slower), each
  // fit higher than the last.
  assert.ok(found.length >= 2);
  assert.ok(found.every((r, i) => i === 0 || r > found[i - 1]));
  assert.equal(step.value.rate, found.at(-1));
  assert.ok(step.value.rate > 180, `found ${step.value.rate}/min`);
  assert.equal(found[0] % 90, 0);
  // The Foretelling comes first, and the first try is the most machines it foretells to fit.
  assert.equal(events[0].type, 'foretell');
  assert.equal(events[1].type, 'try');
  assert.equal(events[1].machines, Math.max(1, events[0].machines));
});

const pyItems = ['small-parts-01', 'bolts', 'iron-stick', 'copper-cable', 'iron-gear-wheel'];
const pySelections = Object.fromEntries(pyItems.map(i => [i, { recipe: i, building: 'automated-factory-mk01' }]));

test("the Foretelling: the first try is the most machines it foretells to fit; layouts found and tries that did not fit correct it; Filling tries more than it foretells", () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 116, h: 116 }, fixtures: [] }, 2);
  const options = { made: pyItems.slice(1), selections: pySelections, site };
  const plan = planner([{ item: 'small-parts-01', rate: 600 }], pyCatalog, logistics, options);
  const first = plan.next();
  assert.equal(first, plan.foretold().machines);
  assert.ok(first > 1, `foretold ${first}`);
  assert.equal(plan.goalsFor(first)[0].rate, 600 * first);
  // More machines take more room: what 600/min takes is far less than all of it.
  assert.equal(plan.asked, 1);
  assert.ok(plan.span(1) < plan.span(first) && plan.span(first) < plan.room);

  // A layout that fits, its Sub-Blocks spanning all but a twentieth of the room: the Foretelling
  // says one machine more would span more than all of it, so it tries no more whole numbers.
  // Filling does: ten machines more, again while they fit, half as many after each that does
  // not, down to a quarter machine (the last machine slower). Here up to 6¼ more fit.
  const fit = n => plan.record(n, { block: {}, placed: Math.round(0.95 * plan.room), designed: null, tried: 1 });
  fit(first);
  assert.equal(plan.lo, first);
  assert.ok(plan.span(first + 1) > 1.05 * plan.room);
  assert.ok(plan.hi > first + 10);
  const more = [];
  for (let n = plan.next(); n !== null; n = plan.next()) {
    more.push(n - first);
    if (n - first <= 6.25) fit(n);
    else plan.record(n, { block: null, starves: false, designed: null, tried: 12 });
  }
  assert.deepEqual(more, [10, 5, 7.5, 6.25, 6.875, 6.5625]);
  assert.equal(plan.lo, first + 6.25);

  // A try that did not fit (for want of room): the Foretelling no longer says it fits, and the
  // next try is no more than halfway down.
  const again = planner([{ item: 'small-parts-01', rate: 600 }], pyCatalog, logistics, options);
  const n = again.next();
  again.record(n, { block: null, starves: false, designed: null, tried: 12 });
  assert.equal(again.hi, n);
  assert.ok(again.foretold().machines < n);
  assert.ok(again.next() <= Math.ceil(n / 2));

  // Substations every 18 tiles break up the room: less is foretold to fit than in the empty block.
  const grid = [];
  for (let x = 7; x < 112; x += 18) for (let y = 7; y < 112; y += 18) grid.push({ name: 'substation', kind: 'fixture', number: grid.length + 1, x, y, w: 2, h: 2 });
  const broken = planner([{ item: 'small-parts-01', rate: 600 }], pyCatalog, logistics, { ...options, site: siteOf({ area: { x: 0, y: 0, w: 116, h: 116 }, fixtures: grid }, 2) });
  assert.ok(broken.foretold().machines < first, `${broken.foretold().machines} of ${first}`);
});

test('Maximize passes a number whose designs starve: Starvation comes and goes with the Count', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 116, h: 116 }, fixtures: [] }, 2);
  const options = { made: pyItems.slice(1), selections: pySelections, site };
  const plan = planner([{ item: 'small-parts-01', rate: 600 }], pyCatalog, logistics, options);
  const starve = n => plan.record(n, { block: null, starves: true, designed: null, tried: 0 });
  const fit = n => plan.record(n, { block: {}, placed: Math.round(plan.room / 2), designed: null, tried: 1 });
  const first = plan.next();
  assert.ok(first > 3, `foretold ${first}`);
  // The first try starves: the next is the number just below it, not halfway down.
  starve(first);
  assert.equal(plan.hi, first);
  assert.equal(plan.next(), first - 1);
  // That one fits: the number above the one that starved is tried next, once.
  fit(first - 1);
  assert.equal(plan.next(), first + 1);
  // It starves too: Filling, below the lowest that starved.
  starve(first + 1);
  const n = plan.next();
  assert.ok(n > first - 1 && n < first, `${n}`);

  // Two in a row that starve: then halfway down.
  const again = planner([{ item: 'small-parts-01', rate: 600 }], pyCatalog, logistics, options);
  const a = again.next();
  again.record(a, { block: null, starves: true, designed: null, tried: 0 });
  const b = again.next();
  assert.equal(b, a - 1);
  again.record(b, { block: null, starves: true, designed: null, tried: 0 });
  assert.ok(again.next() <= Math.ceil(b / 2));
});

test('Maximize fills a 116 × 116 City Block with Py small parts: 3000/min and more, its Sub-Blocks in columns', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 116, h: 116 }, fixtures: [] }, 2);
  // (Each try's time generous: tests run side by side.)
  const run = maximize([{ item: 'small-parts-01', rate: 600 }], pyCatalog, logistics, { made: pyItems.slice(1), selections: pySelections, site, budgetMs: 120000 });
  let step = run.next(), block = null;
  for (; !step.done; step = run.next()) if (/** @type {any} */ (step.value).type === 'best') block = /** @type {any} */ (step.value).block;
  // Placed one by one, from the Goals west, the iron sticks found no room at 3000/min (5 small
  // parts factories, 64 machines): it stopped at 2400/min.
  assert.ok(step.value.rate >= 3000, `${step.value.rate}/min`);
  assertValid(block, pyCatalog, logistics);
  assertInside(block);
  assert.equal(simulate(block).starvation.length, 0);
});

// Py vrauks (the shipped catalog) in a 236 × 236 City Block with roboports and big poles in a
// grid, water barrels, cocoons and saps made here: 50 paddocks (35.79/min) fit, the Sub-Blocks'
// narrowest designs side by side in columns (paddocks, incubators and sap extractors in stacks of
// copies as tall as most of the room), the stacks parted round the Fixtures that would stand on
// their belts, the paddocks' copies snaking their Internal Paths. Before, Maximize stopped at 31
// paddocks: above them the paddocks stood in copies that each wanted a belt of water barrels, more
// than one barrel machine's belt splits into, and the squarer designs were too wide side by side.
test('a City Block of roboports: 50 vrauks paddocks fit, in narrow stacks side by side, parted round the Fixtures', async () => {
  const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const blueprint = await decodeBlueprint(readFileSync(new URL('./fixtures/roboport-city-block.txt', import.meta.url), 'utf8'));
  const site = siteOf(readCityBlock(blueprint, shipped), 4);
  const settings = { ...logistics, pipe: 'niobium-pipe-to-ground', plainPipe: 'niobium-pipe', handSize: 1 };
  const selections = {
    vrauks: { recipe: 'vrauks-1', building: 'vrauks-paddock-mk01', modules: [{ name: 'vrauks-mk02', count: 10 }] },
    cocoon: { recipe: 'vrauks-cocoon-1-no-water', building: 'rc-mk01', modules: [{ name: 'vrauks-mk02', count: 2 }] },
    saps: { recipe: 'sap-01', building: 'sap-extractor-mk01', modules: [{ name: 'sap-tree-mk02', count: 2 }] },
  };
  const plan = planner([{ item: 'vrauks', rate: 450 }], shipped, settings, { made: ['water-barrel', 'cocoon', 'saps'], selections, site });
  const { block, failure } = attempt(plan, 50, { site, budgetMs: 120000 });
  assert.ok(block, failure?.message);
  assert.equal(block.subBlocks.find(sb => sb.item === 'vrauks').count, 50);
  assertValid(block, shipped, settings);
  assertInside(block);
  assert.equal(simulate(block).starvation.length, 0);
});

// Bands: the roboport City Block's west half (the Fixture column down its middle left east of
// it) has rows free of Fixtures in six runs between its Fixtures' rows: four of 22 to 25 (a row
// of paddocks each) and two of 56 (two rows of incubators each).
test('Bands: the rows free of Fixtures between them, in a column range of a City Block', async () => {
  const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const blueprint = await decodeBlueprint(readFileSync(new URL('./fixtures/roboport-city-block.txt', import.meta.url), 'utf8'));
  const site = siteOf(readCityBlock(blueprint, shipped), 4);
  assert.deepEqual(gapsOf(site, 8, 100), [{ y: 4, h: 22 }, { y: 31, h: 56 }, { y: 92, h: 22 }, { y: 119, h: 25 }, { y: 149, h: 56 }, { y: 210, h: 22 }]);
});

// Maximize in the roboport City Block starts from Bands: 69 paddocks (49.39/min) in parts, each a
// row or two in a gap between the Fixtures' rows (incubators in parts of eight in three of the
// tall gaps, sap extractors in two rows in a short one), where the search alone found 50.
test('Maximize in a City Block whose Fixtures stand in rows starts from Bands: 69 vrauks paddocks', async () => {
  const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const blueprint = await decodeBlueprint(readFileSync(new URL('./fixtures/roboport-city-block.txt', import.meta.url), 'utf8'));
  const site = siteOf(readCityBlock(blueprint, shipped), 4);
  const settings = { ...logistics, pipe: 'niobium-pipe-to-ground', plainPipe: 'niobium-pipe', handSize: 1 };
  const selections = {
    vrauks: { recipe: 'vrauks-1', building: 'vrauks-paddock-mk01', modules: [{ name: 'vrauks-mk02', count: 10 }] },
    cocoon: { recipe: 'vrauks-cocoon-1-no-water', building: 'rc-mk01', modules: [{ name: 'vrauks-mk02', count: 2 }] },
    saps: { recipe: 'sap-01', building: 'sap-extractor-mk01', modules: [{ name: 'sap-tree-mk02', count: 2 }] },
  };
  const run = maximize([{ item: 'vrauks', rate: 450 }], shipped, settings, { made: ['water-barrel', 'cocoon', 'saps'], selections, site, budgetMs: 120000 });
  /** @type {any} */
  let found = null;
  for (let step = run.next(); !step.done && !found; step = run.next()) if (/** @type {any} */ (step.value).type === 'best') found = step.value;
  assert.ok(found);
  assert.equal(found.machines, 69);
  const { block } = found;
  assert.equal(block.entities.filter(e => e.kind === 'building' && e.recipe === 'vrauks-1').length, 69);
  assertValid(block, shipped, settings);
  assertInside(block);
  assert.equal(simulate(block).starvation.length, 0);
});

test('a search for a layout without Starvation ends as soon as a Sub-Block cannot be designed without', () => {
  // Inserters an eighth as fast: no small-parts factory gets its 900 bolts a minute.
  const slow = { ...pyCatalog, inserters: Object.fromEntries(Object.entries(pyCatalog.inserters).map(([k, v]) => [k, { ...v, rotationSpeed: v.rotationSpeed / 8 }])) };
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 600 }], slow, { made: pyItems.slice(1), selections: pySelections });
  const site = siteOf({ area: { x: 0, y: 0, w: 80, h: 80 }, fixtures: [] }, 2);
  let designed = false;
  for (const precheck of [false, true]) {
    const step = search(entries, slow, logistics, { site, perfect: true, precheck, designed: () => { designed = true; } }).next();
    assert.equal(step.done, true);
    const value = /** @type {any} */ (step.value);
    assert.equal(value.starves, true);
    assert.equal(value.tried, 0);
    assert.match(value.failure.message, /every design starves/);
  }
  assert.equal(designed, false);
  // Without `perfect`, the search builds what it can.
  assert.equal(search(entries, slow, logistics, { site, maxCandidates: 1 }).next().done, false);
});

test('the recipe index is built once per catalog', () => {
  assert.equal(recipeOptions(pyCatalog), recipeOptions(pyCatalog));
});
