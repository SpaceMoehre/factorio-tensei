import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { encodeBlueprint } from '../js/blueprint.js';

const catalog = { poles: { 'medium-electric-pole': { wireReach: 9 } } };
const decode = s => JSON.parse(inflateSync(Buffer.from(s.slice(1), 'base64')).toString());

const block = {
  subBlocks: [{ item: 'iron-gear-wheel' }],
  entities: [
    { name: 'assembling-machine-2', kind: 'building', recipe: 'iron-gear-wheel', x: 0, y: 0, w: 3, h: 3, direction: 0 },
    { name: 'transport-belt', kind: 'belt', x: 2, y: 5, w: 1, h: 1, direction: 4 },
    { name: 'underground-belt', kind: 'underground-belt', underground: 'input', x: 3, y: 5, w: 1, h: 1, direction: 4 },
    { name: 'medium-electric-pole', kind: 'pole', x: 0, y: 4, w: 1, h: 1, direction: 0 },
    { name: 'medium-electric-pole', kind: 'pole', x: 5, y: 4, w: 1, h: 1, direction: 0 },
    { name: 'medium-electric-pole', kind: 'pole', x: 10, y: 4, w: 1, h: 1, direction: 0 },
  ],
};

test('the blueprint string is "0" + base64(zlib(JSON)) of the returned JSON', async () => {
  const { string, json } = await encodeBlueprint(block, catalog);
  assert.equal(string[0], '0');
  assert.deepEqual(decode(string), JSON.parse(json));
});

test('entities sit at tile centers with their recipe, direction and underground type', async () => {
  const { json } = await encodeBlueprint(block, catalog);
  const [machine, belt, underground] = JSON.parse(json).blueprint.entities;
  assert.deepEqual(machine, { entity_number: 1, name: 'assembling-machine-2', position: { x: 1.5, y: 1.5 }, recipe: 'iron-gear-wheel' });
  assert.deepEqual(belt, { entity_number: 2, name: 'transport-belt', position: { x: 2.5, y: 5.5 }, direction: 4 });
  assert.deepEqual(underground, { entity_number: 3, name: 'underground-belt', position: { x: 3.5, y: 5.5 }, direction: 4, type: 'input' });
});

test('poles are joined by copper wires into one network', async () => {
  const { json } = await encodeBlueprint(block, catalog);
  const { wires } = JSON.parse(json).blueprint;
  assert.deepEqual(wires, [[4, 5, 5, 5], [5, 5, 6, 5]]);
});
