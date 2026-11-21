import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandChain } from '../js/chain.js';
import { context, designStep, designOf, random } from '../js/design.js';
import { prepare } from '../js/layout/compose.js';
import { logistics as base } from './fixtures/catalog.js';

const pyCatalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const logistics = { ...base, belt: 'transport-belt', inserter: 'fast-inserter', longInserter: 'long-handed-inserter', pole: 'medium-electric-pole', handSize: 2 };

// Py advanced circuits (ADR 0113): a chipshooter takes eleven belts, more than two of them in a
// row or a column share, so no whole module of two routes.
const made = ['mosfet', 'resistor2', 'capacitor2', 'diode', 'inductor2', 'microchip', 'transistor', 'pcb2'];

test('machines no whole module of routes repeat a module of one, the copies abreast', () => {
  for (const [rate, count] of [[120, 2], [240, 4]]) {
    const chain = expandChain([{ item: 'advanced-circuit', rate }], pyCatalog, { made });
    const ctx = context(chain.entries, pyCatalog, logistics);
    const i = ctx.plan.findIndex(sb => sb.item === 'advanced-circuit');
    assert.equal(ctx.plan[i].count, count);
    const design = designOf(designStep(ctx, i, random(1), {})[0]);
    assert.equal(design.abreast, true);
    assert.deepEqual(design.kinds.map(k => [k.count, k.module.parts.filter(p => p.machines).length > 0]), [[count, true]]);
    // Its belts run through each copy into the next: one belt a route feeds them all.
    assert.ok(design.trouble <= 1e-6);
    assert.ok(design.kinds[0].module.parts.every(p => p.canEnter && p.canExit && p.kind !== 'head'));
    // A column each, none reversed.
    const chosen = ctx.plan.map((_, j) => (j === i ? design : designOf(designStep(ctx, j, random(1), {})[0])));
    const copies = prepare(ctx, chosen, []).instances.filter(inst => inst.step === i);
    assert.deepEqual(copies.map(c => [c.column, c.pos]), Array.from({ length: count }, (_, k) => [k, 0]));
    assert.ok(copies.every(c => c.module === design.kinds[0].module));
  }
});
