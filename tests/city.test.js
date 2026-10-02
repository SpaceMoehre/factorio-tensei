import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { decodeBlueprint, readCityBlock, siteOf } from '../js/city.js';
import { search } from '../js/search.js';
import { maximize } from '../js/maximize.js';
import { encodeBlueprint } from '../js/blueprint.js';
import { simulate } from '../js/sim.js';
import { catalog as vanilla, logistics } from './fixtures/catalog.js';
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

test('poles of the city block power what they cover: a block under substations needs none of its own', () => {
  const substations = [];
  for (let x = 4; x < 60; x += 16) for (let y = 4; y < 40; y += 16) substations.push({ name: 'substation', kind: 'fixture', number: substations.length + 1, x, y, w: 2, h: 2 });
  const site = siteOf({ area: { x: 0, y: 0, w: 60, h: 40 }, fixtures: substations }, 1);
  const block = inBlock([asm2('iron-gear-wheel', 120)], site);
  assertValid(block, catalog, logistics);
  assertInside(block);
  assert.equal(block.entities.filter(e => e.kind === 'pole').length, 0);
});

test('nothing fits a city block too small for the machines', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 12, h: 8 }, fixtures: [] }, 0);
  assert.equal(inBlock([asm2('electronic-circuit', 300), asm2('copper-cable', 900)], site, 4), null);
});

test('Maximize finds a higher rate that fits, each layout found valid, inside and starving nothing', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 40, h: 30 }, fixtures: [{ name: 'roboport', kind: 'fixture', number: 1, x: 18, y: 13, w: 4, h: 4 }] }, 1);
  const selections = { 'electronic-circuit': { recipe: 'electronic-circuit', building: 'assembling-machine-2' }, 'copper-cable': { recipe: 'copper-cable', building: 'assembling-machine-2' } };
  const run = maximize([{ item: 'electronic-circuit', rate: 60 }], catalog, logistics, { made: ['copper-cable'], selections, site, maxCandidates: 12 });
  const found = [];
  let step = run.next();
  for (; !step.done; step = run.next()) {
    const value = /** @type {any} */ (step.value);
    if (value.type !== 'best') continue;
    const { block, rate, machines } = value;
    assertValid(block, catalog, logistics);
    assertInside(block);
    assert.equal(simulate(block).starvation.length, 0);
    assert.equal(block.subBlocks.find(sb => sb.item === 'electronic-circuit').count, machines);
    found.push(rate);
  }
  // 90/min a machine: every try is whole machines, each fit higher than the last.
  assert.ok(found.length >= 2);
  assert.ok(found.every((r, i) => i === 0 || r > found[i - 1]));
  assert.equal(step.value.rate, found.at(-1));
  assert.ok(step.value.rate > 180, `found ${step.value.rate}/min`);
  assert.equal(step.value.rate % 90, 0);
});
