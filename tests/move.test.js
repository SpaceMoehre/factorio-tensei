import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../js/search.js';
import { context, designStep, designOf, random, breakoutDesign } from '../js/design.js';
import { prepare, compose } from '../js/layout/compose.js';
import { placeBlocks } from '../js/layout/place.js';
import { finishBlock } from '../js/layout/compact.js';
import { moveCopies, standing, editOf, reshapeCopies, shapesToward, turnCopies, compactCopies } from '../js/layout/edit.js';
import { turnModule } from '../js/layout/turn.js';
import { compactness } from '../js/layout/score.js';
import { scoreOf } from '../js/layout/score.js';
import { siteOf } from '../js/city.js';
import { annexed } from '../js/annex.js';
import { simulate } from '../js/sim.js';
import { catalog as vanilla, logistics } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

const catalog = { ...vanilla, poles: { ...vanilla.poles, substation: { name: 'substation', size: { w: 2, h: 2 }, supplyRadius: 9, wireReach: 18 } } };
const asm2 = (item, rate) => ({ goal: { item, rate }, selection: { recipe: item, building: 'assembling-machine-2' } });
const entries = [asm2('electronic-circuit', 300), asm2('copper-cable', 900)];
const starving = block => simulate(block).starvation.reduce((sum, s) => sum + s.demand - s.available, 0);

function best(site = null) {
  let found = null;
  const run = search(entries, catalog, logistics, { seed: 1, maxCandidates: 8, site });
  for (let step = run.next(); !step.done; step = run.next()) found = step.value.block;
  assert.ok(found, 'a layout');
  return found;
}

/** @returns {any} */
function moved(block, move, options = {}) {
  const ctx = context(entries, catalog, logistics, block.site ?? null);
  const run = /** @type {any} */ (moveCopies(ctx, block.edit, move, { score: scoreOf(block), ...options }));
  let step = run.next();
  for (; !step.done; step = run.next()) assert.equal(step.value.type, 'trying');
  return step.value;
}

// Where each machine of a Sub-Block stands, by machine number.
const machines = (block, step) => new Map(block.entities.filter(e => e.kind === 'building' && e.subBlock === step).map(e => [`${e.copy}:${e.machine}`, [e.x, e.y]]));
const tiles = (block, filter) => new Set(block.entities.filter(filter).flatMap(e => [...Array(e.w * e.h).keys()].map(i => `${e.x + (i % e.w)},${e.y + Math.floor(i / e.w)}`)));

test("the search's layouts carry what it takes to move their Sub-Blocks; copies stand where the block shows them", () => {
  const block = best();
  assert.ok(block.edit && block.edit.instances.length >= 2);
  // Squeezed or not, every copy's machines stand where the block shows them.
  const { positions } = standing(block.edit);
  for (const e of block.entities.filter(m => m.kind === 'building')) {
    const inst = block.edit.instances[e.copy];
    const at = positions[e.copy];
    assert.ok(inst.module.entities.some(m => m.kind === 'building' && m.x - inst.module.area.x + at.x === e.x && m.y - inst.module.area.y + at.y === e.y), `machine at ${e.x},${e.y}`);
  }
});

test('a Sub-Block moved stands where it was put, its links routed again, every other Sub-Block where it stood', () => {
  const block = best();
  const cable = block.subBlocks.findIndex(sb => sb.item === 'copper-cable');
  const out = moved(block, { step: cable, dx: 0, dy: 6 });
  assert.ok(out.block, out.failure?.message);
  assertValid(out.block, catalog, logistics);
  assert.deepEqual(out.at, { dx: 0, dy: 6 });
  assert.deepEqual(out.pushed, []);
  assert.equal(starving(out.block), 0);
  const before = machines(block, cable), after = machines(out.block, cable);
  for (const [k, [x, y]] of before) assert.deepEqual(after.get(k), [x, y + 6]);
  const other = 1 - cable;
  if (!out.back) assert.deepEqual(machines(out.block, other), machines(block, other));
  // Laid out again as it stands: no squeeze moves what the user put down.
  assert.deepEqual(out.block.edit.squeeze, []);
});

test('put down on another Sub-Block, it goes to the nearest room where its links find a way', () => {
  const block = best();
  const [a, b] = block.subBlocks;
  // (Its west column on the other's east one.)
  const dx = b.x + b.w - 1 - a.x;
  const out = moved(block, { step: 0, dx, dy: 0 });
  assert.ok(out.block, out.failure?.message);
  assertValid(out.block, catalog, logistics);
  assert.notDeepEqual(out.at, { dx, dy: 0 });
  assert.deepEqual(out.pushed, []);
  assert.ok(Math.hypot(out.at.dx - dx, out.at.dy) <= 6);
  assert.equal(starving(out.block), 0);
});

test('put down on another Sub-Block with no room close by, what stands in its way moves off', () => {
  const block = best();
  const [a, b] = block.subBlocks;
  const out = moved(block, { step: 0, dx: b.x - a.x, dy: b.y - a.y }, { reach: 0 });
  assert.ok(out.block, out.failure?.message);
  assertValid(out.block, catalog, logistics);
  assert.deepEqual(out.at, { dx: b.x - a.x, dy: b.y - a.y });
  assert.deepEqual(out.pushed.map(p => p.step), [1]);
  const mine = tiles(out.block, e => e.kind === 'building' && e.subBlock === 0);
  assert.ok(![...tiles(out.block, e => e.kind === 'building' && e.subBlock === 1)].some(t => mine.has(t)));
});

test('in a City Block a Sub-Block moves inside its Buffer and off its Fixtures, and a move out of it does not happen', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 60, h: 40 }, fixtures: [{ name: 'substation', kind: 'fixture', number: 1, x: 30, y: 20, w: 2, h: 2 }] }, 2);
  const block = best(site);
  assert.ok(block.edit);
  const cable = block.subBlocks.findIndex(sb => sb.item === 'copper-cable');
  const out = moved(block, { step: cable, dx: 0, dy: 3 });
  assert.ok(out.block, out.failure?.message);
  assertValid(out.block, catalog, logistics);
  const { inner, fixtures } = site;
  const taken = new Set(fixtures.flatMap(f => [...Array(f.w * f.h).keys()].map(i => `${f.x + (i % f.w)},${f.y + Math.floor(i / f.w)}`)));
  for (const e of out.block.entities) {
    assert.ok(e.x >= inner.x && e.y >= inner.y && e.x + e.w <= inner.x + inner.w && e.y + e.h <= inner.y + inner.h, `${e.name} at ${e.x},${e.y} outside`);
    for (let dx = 0; dx < e.w; dx++) for (let dy = 0; dy < e.h; dy++) assert.ok(!taken.has(`${e.x + dx},${e.y + dy}`), `${e.name} on a fixture`);
  }
  const away = moved(block, { step: cable, dx: -200, dy: 0 }, { reach: 2 });
  assert.ok(away.failure, 'no room out of the city block');
});

test('a machine a Breakout stood apart moves on its own, the stack where it stood', () => {
  const ctx = context(entries, catalog, logistics);
  const rng = random(1);
  const designs = ctx.plan.map((sb, i) => designOf(designStep(ctx, i, rng)[0]));
  const circuits = ctx.plan.findIndex(sb => sb.recipe === 'electronic-circuit');
  const broken = breakoutDesign(designStep(ctx, circuits, rng, { machines: ctx.plan[circuits].count - 1 }), designStep(ctx, circuits, rng, { machines: 1 }), 1);
  const ready = prepare(ctx, designs.map((d, i) => (i === circuits ? broken : d)));
  const positions = placeBlocks(ctx, ready, {});
  const layout = { margin: { w: 0, e: 0, n: 1, s: 1 } };
  const block = finishBlock(compose(ctx, ready, positions, layout), catalog, logistics);
  block.edit = editOf(ready, positions, { layout, squeeze: block.squeeze, entries });
  const [apart] = block.subBlocks[circuits].apart;
  assert.ok(apart.inst !== undefined);
  const out = moved(block, { step: circuits, inst: apart.inst, dx: 0, dy: 4 });
  assert.ok(out.block, out.failure?.message);
  assertValid(out.block, catalog, logistics);
  assert.deepEqual(out.at, { dx: 0, dy: 4 });
  // Each copy where it stood (as laid out again: a squeeze too tight for its links undone, every
  // line back), but the one moved.
  const frame = standing(block.edit, { whole: out.back === block.edit.squeeze.length && out.back > 0 }).positions;
  for (const e of out.block.entities.filter(m => m.kind === 'building')) {
    const inst = block.edit.instances[e.copy], off = e.copy === apart.inst ? out.at : { dx: 0, dy: 0 };
    const at = { x: frame[e.copy].x + off.dx - inst.module.area.x, y: frame[e.copy].y + off.dy - inst.module.area.y };
    assert.ok(inst.module.entities.some(m => m.kind === 'building' && m.x + at.x === e.x && m.y + at.y === e.y), `machine at ${e.x},${e.y}`);
  }
});

test("an Annex's layout, two layouts as one, is not moved", () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 60, h: 40 }, fixtures: [] }, 2);
  const block = best(site);
  const both = annexed(block, { ...block, routes: [], subBlocks: [], entities: [] }, site, catalog, logistics);
  assert.equal(both.edit, undefined);
});

// Circuits, cable and gears, the gears' 10 machines in copies of a module.
function withCopies() {
  const three = [...entries, asm2('iron-gear-wheel', 900)];
  const ctx = context(three, catalog, logistics);
  const lists = ctx.plan.map((_, i) => designStep(ctx, i, random(1 + i)));
  const gear = ctx.plan.findIndex(sb => sb.item === 'iron-gear-wheel');
  const pick = lists[gear].findIndex(c => c.copies && designOf(c) && designOf(c).trouble <= 1e-6);
  assert.ok(pick >= 0, 'a design of copies');
  const ready = prepare(ctx, lists.map((list, i) => designOf(i === gear ? list[pick] : list[0])), []);
  const positions = placeBlocks(ctx, ready, {});
  const layout = { margin: { w: 0, e: 0, n: 1, s: 1 } };
  const block = finishBlock(compose(ctx, ready, positions, layout), catalog, logistics);
  block.edit = editOf(ready, positions, { layout, squeeze: block.squeeze, entries: three });
  return { ctx, block, gear, list: lists[gear] };
}

/** @returns {any} */
function reshaped(ctx, block, step, way, list) {
  const run = /** @type {any} */ (reshapeCopies(ctx, block.edit, { step, way }, { score: scoreOf(block), list }));
  let next = run.next();
  for (; !next.done; next = run.next()) assert.equal(next.value.type, 'trying');
  return next.value;
}

const ratio = b => Math.max(b.w, b.h) / Math.min(b.w, b.h);

test('a Sub-Block made squarer, or longer, takes another shape where it stood, every machine fed, every other Sub-Block where it stood', () => {
  const { ctx, block, gear, list } = withCopies();
  assertValid(block, catalog, logistics);
  const was = block.subBlocks[gear];
  for (const way of ['squarer', 'longer']) {
    const out = reshaped(ctx, block, gear, way, list);
    assert.ok(out.block, `${way}: ${out.failure?.message}`);
    assertValid(out.block, catalog, logistics);
    assert.equal(starving(out.block), 0);
    const now = out.block.subBlocks[gear];
    assert.equal(out.block.entities.filter(e => e.kind === 'building' && e.subBlock === gear).length, was.count);
    if (way === 'squarer') assert.ok(ratio(now) * 1.15 <= ratio(was), `${way}: ${now.w} x ${now.h} from ${was.w} x ${was.h}`);
    else assert.ok(ratio(now) >= ratio(was) * 1.15 && (now.h > now.w) === (was.h > was.w), `${way}: ${now.w} x ${now.h} from ${was.w} x ${was.h}`);
    assert.deepEqual([out.shape.w, out.shape.h], [now.w, now.h]);
    if (!out.back && !out.pushed.length) for (const i of [0, 1]) assert.deepEqual(machines(out.block, i), machines(block, i));
    // (It carries its new design: shaped again from there.)
    assert.notEqual(out.block.edit.designs[gear], block.edit.designs[gear]);
  }
});

test('a reshape takes its own stack a column at a time first, longer along the side it lies along', () => {
  const tall = { w: 10, h: 30 };
  const options = [{ columns: 2, steps: 1, w: 26, h: 15 }, { columns: 3, steps: 2, w: 40, h: 10 }, { rowLength: 1, w: 9, h: 48 }, { rowLength: 4, w: 18, h: 18 }];
  assert.deepEqual(shapesToward({ now: tall, options }, 'squarer').map(o => o.columns ?? `rows ${o.rowLength}`), [2, 'rows 4']);
  assert.deepEqual(shapesToward({ now: tall, options }, 'longer').map(o => o.columns ?? `rows ${o.rowLength}`), ['rows 1', 3]);
  // About square already: none squarer.
  assert.deepEqual(shapesToward({ now: { w: 20, h: 21 }, options: [{ rowLength: 3, w: 19, h: 20 }] }, 'squarer'), []);
  // No other design more than twice its box.
  assert.deepEqual(shapesToward({ now: tall, options: [{ rowLength: 2, w: 40, h: 30 }] }, 'squarer'), []);
});

/** @returns {any} */
function drive(run) {
  let next = run.next();
  for (; !next.done; next = run.next()) assert.ok(['trying', 'better'].includes(next.value.type));
  return next.value;
}

test('a module turned a quarter four times is the module again; its machines, inserters, belts and drops turn with it', () => {
  const ctx = context(entries, catalog, logistics);
  const module = designOf(designStep(ctx, 0, random(1))[0]).kinds[0].module;
  const once = turnModule(module, 1);
  assert.equal(once.turns, 1);
  assert.deepEqual([once.area.w, once.area.h], [module.area.h, module.area.w]);
  const machine = module.entities.find(e => e.kind === 'building'), turned = once.entities[module.entities.indexOf(machine)];
  assert.deepEqual([turned.x, turned.y, turned.direction], [-(machine.y + machine.h), machine.x, (machine.direction + 4) % 16]);
  assert.equal(once.parts[0].dir, ((module.parts[0].dir ?? 4) + 4) % 16);
  const round = turnModule(turnModule(turnModule(once, 1), 1), 1);
  assert.deepEqual(round.entities.map(e => [e.x, e.y, e.w, e.h, e.direction]), module.entities.map(e => [e.x, e.y, e.w, e.h, e.direction]));
  assert.deepEqual(round.parts.map(p => p.pieces.map(q => [q.x, q.y, q.direction, q.out])), module.parts.map(p => p.pieces.map(q => [q.x, q.y, q.direction, q.out])));
  // (Kept: the same module turned as far is the same object.)
  assert.equal(turnModule(module, 1), once);
});

test('a Sub-Block turned stands turned where it stood, every link routed again, every other Sub-Block where it stood', () => {
  const block = best();
  const ctx = context(entries, catalog, logistics);
  const cable = block.subBlocks.findIndex(sb => sb.item === 'copper-cable');
  // (Its box half round, as laid out again: a squeezed block's copies whole again.)
  let half = null;
  for (const turns of [2, 1, 3]) {
    const out = drive(turnCopies(ctx, block.edit, { step: cable, turns }, { score: scoreOf(block) }));
    assert.ok(out.block, `${turns}: ${out.failure?.message}`);
    assertValid(out.block, catalog, logistics);
    assert.equal(starving(out.block), 0);
    assert.equal(out.block.edit.turns[cable], turns);
    const now = out.block.subBlocks[cable];
    half ??= now;
    assert.deepEqual([now.w, now.h], turns % 2 ? [half.h, half.w] : [half.w, half.h]);
    // Its machines turned with it.
    const directions = b => b.entities.filter(e => e.kind === 'building' && e.subBlock === cable).map(e => e.direction ?? 0).sort();
    assert.deepEqual(directions(out.block), directions(block).map(d => (d + 4 * turns) % 16).sort());
    if (!out.back && !out.pushed.length) assert.deepEqual(machines(out.block, 1 - cable), machines(block, 1 - cable));
    // (Turned once more from there, it keeps its turn.)
    if (turns === 1) {
      const again = drive(turnCopies(ctx, out.block.edit, { step: cable, turns: 1 }, { score: scoreOf(out.block) }));
      assert.ok(again.block, again.failure?.message);
      assert.equal(again.block.edit.turns[cable], 2);
    }
  }
});

test('pulled together, a block spread out comes back closer, every Sub-Block as it was, every machine fed', () => {
  let block = best();
  const ctx = context(entries, catalog, logistics);
  for (const [step, dx, dy] of [[0, 12, 0], [1, 0, 10]]) {
    const out = drive(moveCopies(ctx, block.edit, { step, dx, dy }, { score: scoreOf(block) }));
    assert.ok(out.block, out.failure?.message);
    block = out.block;
  }
  const spread = compactness(block).value;
  const out = drive(compactCopies(ctx, block.edit, { score: scoreOf(block) }));
  assert.ok(out.block && out.slid > 0, 'pulled together');
  assertValid(out.block, catalog, logistics);
  assert.equal(starving(out.block), 0);
  assert.ok(compactness(out.block).value < spread, `${compactness(out.block).value} < ${spread}`);
  assert.ok(out.block.bounds.w * out.block.bounds.h < block.bounds.w * block.bounds.h);
  // (Nothing changes its design: the same machines in each, as many.)
  for (let i = 0; i < 2; i++) assert.equal(machines(out.block, i).size, machines(block, i).size);
  // Pulled together again: nothing closer.
  const again = drive(compactCopies(ctx, out.block.edit, { score: scoreOf(out.block) }));
  assert.ok(!again.block || compactness(again.block).value < compactness(out.block).value);
});
