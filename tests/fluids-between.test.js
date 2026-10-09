import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solve } from '../js/solve.js';
import { context } from '../js/design.js';
import { coreLinks } from '../js/routes.js';
import { buildCore } from '../js/layout/core.js';
import { logistics as base } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';
import { planner, attempt } from '../js/maximize.js';
import { siteOf } from '../js/city.js';
import { annexSite, annexed } from '../js/annex.js';
import { simulate } from '../js/sim.js';

const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const logistics = { ...base, pipe: 'niobium-pipe-to-ground', plainPipe: 'niobium-pipe', handSize: 1 };
const moss = rate => [{ goal: { item: 'moss', rate }, selection: { recipe: 'Moss-1', building: 'moss-farm-mk01', modules: [{ name: 'moss', count: 15 }] } }];

// Py's moss farms take muddy sludge and carbon dioxide through two connections on one face.
// Two rows of four face each other across a band holding both fluids' pipe rows, the lower row
// the upper one's mirror image so each fluid's connections meet column for column, and the
// moss belt between the pipe rows: 24 x 15, no tile beside the machines' own 24 columns.
test('Fluids Between: moss farms in two rows facing their pipes and belt, 24 x 15', () => {
  const block = solve(moss(35), shipped, logistics);
  const machines = block.entities.filter(e => e.kind === 'building');
  assert.equal(machines.length, 8);
  assert.ok(block.bounds.w * block.bounds.h <= 24 * 15, `${block.bounds.w} x ${block.bounds.h}`);
  const rows = [...new Set(machines.map(m => m.y))].sort((a, b) => a - b);
  assert.equal(rows.length, 2);
  const [upper, lower] = rows.map(y => machines.filter(m => m.y === y));
  assert.ok(upper.every(m => m.direction === 8 && !m.mirror) && lower.every(m => !m.direction && m.mirror));
  // Each fluid's pipe joins an upper and a lower connection in one column, across the band.
  for (const fluid of ['muddy-sludge', 'carbon-dioxide']) {
    const pipe = block.routes.find(r => r.kind === 'pipe' && r.fluid === fluid);
    const at = (x, y) => pipe.pieces.some(p => p.x === x && p.y === y);
    for (const m of upper) {
      const xs = [...Array(6).keys()].map(k => m.x + k);
      assert.ok(xs.some(x => [...Array(rows[1] - m.y - 6).keys()].every(k => at(x, m.y + 6 + k))), `${fluid} at ${m.x}`);
    }
  }
  assertValid(block, shipped, logistics);
});

// With the belts outside the pair, the band holds only the pipe rows, side by side: each fluid
// dives under the other's connections and surfaces on its own.
test('Fluids Between, outside: pipe rows of two fluids side by side route, the belts above and below', () => {
  const ctx = context(moss(35), shipped, logistics);
  const sb = ctx.plan[0];
  const links = coreLinks(sb, 0, ctx.routes);
  const [a, b] = links.fluids.map(f => f.routeId);
  const variant = {
    rotation: 8, flip: true, reflect: true, interleave: true, rowLength: 4, middle: 2, gap: 0, shift: 0, columns: 'center',
    belts: [{ routeIds: [links.output], part: 0, band: 0, row: 1, serves: [0] }, { routeIds: [links.output], part: 1, band: 2, row: 1, serves: [1] }],
    pipes: [{ routeId: a, band: 1, row: 1 }, { routeId: b, band: 1, row: 2 }],
  };
  const core = buildCore(sb, shipped.buildings[sb.building], links, variant, ctx.env);
  assert.deepEqual([core.w, core.h], [24, 16]);
  // Column for column: each fluid's two rows of connections in one column per machine.
  for (const port of core.ports) {
    const xs = [...new Set(port.tiles.map(([x]) => x))];
    assert.equal(xs.length, 4);
    assert.equal(port.tiles.length, 8);
  }
  assert.throws(() => buildCore(sb, shipped.buildings[sb.building], links, { ...variant, interleave: false }, ctx.env), /touch/);
});

// Maximized in a 116 x 116 City Block: copies of two rows of 16 farms facing their pipes (96 wide,
// as many as fit beside one snaking belt and the fluids' trunks), seven of them and a row of 16
// with its pipe rows either side of its belt below it (9 high): 240 farms in 114 x 114.
test('Fluids Between in a City Block: 240 moss farms fill 116 x 116, the last row with its pipes either side of its belt', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 116, h: 116 }, fixtures: [] }, 1);
  const selections = { moss: moss(0)[0].selection };
  const plan = planner([{ item: 'moss', rate: 900 }], shipped, logistics, { selections, site });
  const { block } = attempt(plan, 240, { site, budgetMs: 60000 });
  assert.ok(block, 'no layout');
  assert.equal(block.entities.filter(e => e.kind === 'building').length, 240);
  assert.ok(block.bounds.w <= 114 && block.bounds.h <= 114);
  assertValid(block, shipped, logistics);
});

// In an Annex's City Block (ADR 0032), a fluid made here that a pipe built before it has to spare
// comes from there while it has enough: 18 farms take 1080/min of carbon dioxide, of 1200 to
// spare (no greenhouse), 25 take 1500 (their own greenhouse).
test('An Annex draws a fluid it has enough of from a built pipe, and makes it where it has not', () => {
  const draws = { 'carbon-dioxide': { route: 'built2', spare: 1200, starts: [] } };
  const site = { ...siteOf({ area: { x: 0, y: 0, w: 116, h: 116 }, fixtures: [] }, 1), annex: true, draws };
  const options = {
    made: ['muddy-sludge', 'carbon-dioxide', 'soil'],
    selections: { moss: moss(0)[0].selection, 'carbon-dioxide': { recipe: 'moondrop-co2', building: 'moondrop-greenhouse-mk01', modules: [{ name: 'moondrop-mk02', count: 16 }] } },
  };
  const plan = planner([{ item: 'moss', rate: 750 }], shipped, logistics, { ...options, site });
  const chain = n => plan.chainOf(plan.goalsFor(n));
  assert.deepEqual(chain(18).entries.map(e => e.goal.item), ['moss', 'muddy-sludge', 'soil']);
  assert.equal(chain(18).trainInputs.find(t => t.item === 'carbon-dioxide').rate, 1080);
  assert.ok(chain(25).entries.some(e => e.goal.item === 'carbon-dioxide'));
});

// With its carbon dioxide, muddy sludge and soil made here, the moss stops at 135 farms in 116 x
// 116 (its stack 84 x 75, the rest below it), a strip of 80 x 30 left empty: an Annex of 18 farms
// and their own muddy sludge and soil stands in it, routed round the first layout, its carbon
// dioxide drawn from the first greenhouses' pipe (they make 1200/min more than its farms take)
// and its water from the first water pipe (ADR 0032), its moss to the east edge.
test('Annex: the moss chain again in the room its layout leaves, 135 farms and 18, drawing carbon dioxide and water', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 116, h: 116 }, fixtures: [] }, 1);
  const options = {
    made: ['muddy-sludge', 'carbon-dioxide', 'soil'],
    selections: { moss: moss(0)[0].selection, 'carbon-dioxide': { recipe: 'moondrop-co2', building: 'moondrop-greenhouse-mk01', modules: [{ name: 'moondrop-mk02', count: 16 }] } },
  };
  const goals = [{ item: 'moss', rate: 750 }];
  const first = attempt(planner(goals, shipped, logistics, { ...options, site }), 135, { site, budgetMs: 60000 });
  assert.ok(first.block, 'no layout');
  const room = annexSite(site, first.block, shipped, options.made);
  const annex = attempt(planner(goals, shipped, logistics, { ...options, site: room }), 18, { site: room, budgetMs: 60000 });
  assert.ok(annex.block, 'no annex');
  const block = annexed(first.block, annex.block, site, shipped, logistics);
  assert.equal(block.subBlocks.filter(sb => sb.item === 'moss').length, 2);
  assert.equal(block.subBlocks.filter(sb => sb.item === 'carbon-dioxide').length, 1);
  assert.ok(block.entities.filter(e => e.kind === 'building' && e.name === 'moss-farm-mk01').length >= 153);
  for (const fluid of ['carbon-dioxide', 'water']) assert.equal(block.routes.filter(r => r.fluid === fluid).length, 1, fluid);
  assert.deepEqual(simulate(block).starvation, []);
  assertValid(block, shipped, logistics);
});
