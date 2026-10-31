import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSession } from '../js/session.js';
import { inlineRunner, webRunner } from '../js/runners.js';
import { search } from '../js/search.js';
import { setupOf } from '../js/setup.js';
import { siteOf } from '../js/city.js';
import { better } from '../js/layout/score.js';
import { catalog, logistics } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

const selections = { 'electronic-circuit': { recipe: 'electronic-circuit', building: 'assembling-machine-2' }, 'copper-cable': { recipe: 'copper-cable', building: 'assembling-machine-2' } };
const setup = (city = {}) => setupOf({ goals: [{ item: 'electronic-circuit', rate: 60 }], made: ['copper-cable'], selections, logistics: { ...logistics, budget: 60 }, city }, catalog);
const site = () => siteOf({ area: { x: 0, y: 0, w: 40, h: 30 }, fixtures: [{ name: 'roboport', kind: 'fixture', number: 1, x: 18, y: 13, w: 4, h: 4 }] }, 1);

async function eventsOf(session) {
  const out = [];
  for await (const event of session.events) out.push(event);
  return out;
}

test('a build: each Sub-Block designed, then every strategy from those designs; each layout shown beats the last, valid', async () => {
  const events = await eventsOf(buildSession(setup(), null, catalog, inlineRunner(catalog), { maxCandidates: 6 }));
  const types = events.map(e => e.type);
  assert.deepEqual(types.slice(0, 4), ['start', 'designing', 'designed', 'searching']);
  assert.equal(types.at(-1), 'done');
  const start = events[0];
  assert.equal(start.maximize, false);
  assert.equal(events[1].count, start.job.entries.length);
  assert.equal(events[2].designs.length, start.job.entries.length);
  const best = events.filter(e => e.type === 'best');
  assert.ok(best.length >= 1);
  for (let k = 1; k < best.length; k++) assert.ok(better(best[k].score, best[k - 1].score), 'each beats the last');
  for (const b of best) assertValid(b.block, catalog, logistics);
  assert.equal(events.at(-1).how, 'Done');
  // (Both strategies' candidates counted: more than one search's.)
  assert.ok(events.at(-1).tried > 6);
});

test('a build is laid out the same every time with a candidate count; the best is at least as good as one search alone', async () => {
  const last = async () => (await eventsOf(buildSession(setup(), null, catalog, inlineRunner(catalog), { maxCandidates: 6 }))).filter(e => e.type === 'best').at(-1);
  const [a, b] = [await last(), await last()];
  assert.deepEqual(a.block.entities, b.block.entities);
  const { entries } = (await eventsOf(buildSession(setup(), null, catalog, inlineRunner(catalog), { maxCandidates: 1 })))[0].job;
  let alone = null;
  for (const step of search(entries, catalog, setup().logistics, { seed: 1, maxCandidates: 6 })) alone = step;
  assert.ok(!better(alone.score, a.score), 'no worse than the search strategy alone');
});

// The suite lays out with other seeds to tell what a change does from what its seed does (ADR 0087).
test('a build laid out with another seed hands it to every job; with none, seed 1', async () => {
  const [plain, other] = await Promise.all([{}, { seed: 7 }].map(o => eventsOf(buildSession(setup(), null, catalog, inlineRunner(catalog), { maxCandidates: 2, ...o }))));
  assert.equal(plain[0].job.seed, 1);
  assert.equal(other[0].job.seed, 7);
});

test('in a City Block with Maximize on: no designing first; every fit shown with its rate, the highest told at the end', async () => {
  const events = await eventsOf(buildSession(setup({ on: true, maximize: true }), site(), catalog, inlineRunner(catalog), { maxCandidates: 4, maximize: { most: 2, annexes: false } }));
  assert.equal(events[0].type, 'start');
  assert.equal(events[0].maximize, true);
  assert.ok(!events.some(e => e.type === 'designing'));
  const fits = events.filter(e => e.type === 'best');
  assert.ok(fits.length >= 1);
  assert.ok(fits.every(e => e.found && e.found.rate > 0));
  const done = events.at(-1);
  assert.equal(done.type, 'done');
  assert.equal(done.found.rate, fits.at(-1).found.rate);
});

test('Goals a City Block is foretold not to fit fill it up to their rates instead (Maximize no higher than them)', async () => {
  const big = setupOf({ goals: [{ item: 'electronic-circuit', rate: 6000 }], made: ['copper-cable'], selections, logistics: { ...logistics, budget: 60 }, city: { on: true } }, catalog);
  const session = buildSession(big, site(), catalog, inlineRunner(catalog), { maxCandidates: 2, maximize: { most: 1, annexes: false } });
  const { value: start } = await session.events.next();
  session.stop();
  assert.equal(start.type, 'start');
  assert.equal(start.maximize, true);
  assert.equal(start.upTo, true);
});

test('stopped, a build tells nothing more', async () => {
  const session = buildSession(setup(), null, catalog, inlineRunner(catalog), { maxCandidates: 6 });
  const seen = [];
  for await (const event of session.events) {
    seen.push(event.type);
    if (event.type === 'designed') session.stop();
  }
  assert.equal(seen.at(-1), 'designed');
});

test('a web worker\'s events as they come, until it ends; one that fails tells why and ends', async () => {
  const fake = script => () => {
    const worker = {
      onmessage: null, onerror: null, terminated: false,
      postMessage: job => queueMicrotask(() => script(job, worker)),
      terminate: () => { worker.terminated = true; },
    };
    return worker;
  };
  const say = (worker, data) => worker.onmessage({ data });
  const runner = webRunner(fake((job, worker) => {
    say(worker, { type: 'best', n: job.n });
    say(worker, { type: 'done' });
    say(worker, { type: 'end' });
  }));
  const w = runner.worker();
  const got = [];
  for await (const e of w.run({ n: 3 })) got.push(e);
  assert.deepEqual(got, [{ type: 'best', n: 3 }, { type: 'done' }]);
  // (The worker runs the next job.)
  const again = [];
  for await (const e of w.run({ n: 4 })) again.push(e.n);
  assert.deepEqual(again, [4, undefined]);
  const failing = webRunner(fake((_, worker) => worker.onerror({ message: 'out of memory' }))).worker();
  const told = [];
  for await (const e of failing.run({})) told.push(e);
  assert.deepEqual(told, [{ type: 'error', message: 'out of memory' }]);
  // (A worker that failed, or was stopped, runs nothing more: a job sent it says so at once.)
  const after = [];
  for await (const e of failing.run({})) after.push(e.type);
  assert.deepEqual(after, ['error']);
  const stopped = runner.worker();
  stopped.stop();
  const none = [];
  for await (const e of stopped.run({ n: 5 })) none.push(e);
  assert.deepEqual(none, [{ type: 'error', message: 'the worker was stopped' }]);
});
