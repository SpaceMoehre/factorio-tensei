import { test } from 'node:test';
import assert from 'node:assert/strict';
import { context, designStep, designOf, random } from '../js/design.js';
import { expandChain } from '../js/chain.js';
import { pyCatalog, logistics } from './fixtures/catalog.js';

// Py small parts at 3600/min with fast inserters moving one item a swing. A small parts factory
// takes 900 bolts, 900 cable and 300 gears a minute and puts out 600; a bolt factory takes 600
// sticks and puts out 600, half on each band (Two-Way Output). One face of a 7×7 factory fits
// four 90° inserters (1152/min) or seven straight ones (1008/min): the busiest belts take the
// bands, one face each, and the others move to the factory's sides (a Side Belt for the gears,
// Head-on Belts for small parts out and for sticks in).
test('3600 small parts/min: small parts and bolt factories get every inserter they need', () => {
  const items = ['small-parts-01', 'bolts', 'iron-stick', 'copper-cable', 'iron-gear-wheel'];
  const selections = Object.fromEntries(items.map(i => [i, { recipe: i, building: 'automated-factory-mk01' }]));
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 3600 }], pyCatalog, { made: items.slice(1), selections });
  const ctx = context(entries, pyCatalog, logistics);
  for (const recipe of ['small-parts-01', 'bolts']) {
    const index = ctx.plan.findIndex(sb => sb.recipe === recipe);
    const design = designOf(designStep(ctx, index, random(1))[0]);
    assert.ok(design, recipe);
    for (const { module } of design.kinds) assert.equal(module.core.shortfall, 0, `${recipe}: ${module.core.shortfall} items/min short`);
  }
});
