import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solve } from '../js/solve.js';
import { context } from '../js/design.js';
import { coreLinks } from '../js/routes.js';
import { buildCore } from '../js/layout/core.js';
import { logistics as base } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

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
