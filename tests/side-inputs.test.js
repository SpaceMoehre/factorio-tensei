import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoutes } from '../js/routes.js';

// Four Sub-Blocks, each Side Input taken by two of them (Py advanced circuits: 13 of 30 Side
// Inputs chained across Sub-Blocks standing far apart, ADR 0112).
const chain = items => {
  const takes = { a: [0, 1], b: [1, 2], c: [2, 3], d: [0, 3] };
  const plan = [0, 1, 2, 3].map(i => ({
    item: `x${i}`, count: 1,
    inputs: items.filter(it => takes[it].includes(i)).map(name => ({ name, type: 'item', rate: 30 })),
    outputs: [{ name: `x${i}`, type: 'item', rate: 30 }],
  }));
  const flows = { order: [0, 1, 2, 3], internal: [], feedback: [], joined: [], sideInput: items.map(item => ({ item, type: 'item', rate: 60 })) };
  return { plan, flows };
};
const sideInputs = (items, city) => {
  const { plan, flows } = chain(items);
  return buildRoutes(plan, flows, 450, () => false, { city }).filter(r => r.source === 'side-input').map(r => `${r.items.map(i => i.item).join('+')}:${r.consumers.join()}`);
};

test('in a City Block, three Side Inputs or more chained across Sub-Blocks come to each on its own', () => {
  assert.deepEqual(sideInputs(['a', 'b', 'c'], false).sort(), ['a:0,1', 'b:1,2', 'c:2,3']);
  // (Two bound for one Sub-Block share a belt, a lane each: Belt Merge.)
  assert.deepEqual(sideInputs(['a', 'b', 'c'], true).sort(), ['a+b:1', 'a:0', 'b+c:2', 'c:3']);
  // (Two chained stay chained: a line and splitters cost more than they save, Py perylene's Annexes.)
  assert.deepEqual(sideInputs(['a', 'b'], true).sort(), ['a:0,1', 'b:1,2']);
});
