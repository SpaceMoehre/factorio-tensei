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

// A 90° fast inserter south of nothing, west of its belt: it picks from the tile to its west and
// drops 1.2 tiles south into the machine. Factorio 2.0 blueprints carry both as vectors relative
// to the inserter (BlueprintEntity pickup_position / drop_position).
test('custom pickup and drop vectors appear only on 90° inserters', async () => {
  const { json } = await encodeBlueprint({
    subBlocks: [{ item: 'iron-gear-wheel' }],
    entities: [
      { name: 'fast-inserter', kind: 'inserter', x: 4, y: 2, w: 1, h: 1, direction: 0 },
      {
        name: 'fast-inserter', kind: 'inserter', x: 5, y: 2, w: 1, h: 1, direction: 0,
        vectors: { pickup: { x: -1, y: 0 }, drop: { x: 0, y: 1.2 } },
      },
    ],
  }, catalog);
  const [straight, rightAngle] = JSON.parse(json).blueprint.entities;
  assert.deepEqual(straight, { entity_number: 1, name: 'fast-inserter', position: { x: 4.5, y: 2.5 } });
  assert.deepEqual(rightAngle, {
    entity_number: 2, name: 'fast-inserter', position: { x: 5.5, y: 2.5 },
    pickup_position: { x: -1, y: 0 }, drop_position: { x: 0, y: 1.2 },
  });
});

// Where each train route enters and leaves: a display panel with the item's icon and name just
// outside the block, west of a Side Input's first tile and east of a Side Output's last one.
test('display panels mark which item every Side Input and Side Output carries', async () => {
  const belt = (route, x, y) => ({ name: 'transport-belt', kind: 'belt', route, x, y, w: 1, h: 1, direction: 4 });
  const pipe = (route, x, y) => ({ name: 'pipe', kind: 'pipe', route, x, y, w: 1, h: 1, direction: 0 });
  const routes = [
    { id: 0, kind: 'belt', source: 'side-input', sink: null, items: [{ item: 'moss', rate: 800 }], pieces: [belt(0, 0, 2), belt(0, 1, 2)] },
    { id: 1, kind: 'belt', source: 'side-input', sink: null, items: [{ item: 'casein', rate: 360 }, { item: 'plastic-bar', rate: 432 }], pieces: [belt(1, 0, 4)] },
    { id: 2, kind: 'pipe', source: 'side-input', sink: null, fluid: 'water', items: [{ item: 'water', rate: 1200.4 }], pieces: [pipe(2, 3, 6), pipe(2, 0, 7), pipe(2, 1, 7)] },
    { id: 3, kind: 'belt', source: 0, sink: 'side-output', items: [{ item: 'py-science-pack-2', rate: 450 }], pieces: [belt(3, 5, 9), belt(3, 6, 9)] },
    { id: 4, kind: 'belt', source: 'side-input', sink: null, items: [{ item: 'iron-plate', rate: 30 }], pieces: [belt(4, 2, 0)], consumers: [0] },
  ];
  const { json } = await encodeBlueprint({ subBlocks: [{ item: 'py-science-pack-2' }], entities: routes.flatMap(r => r.pieces), routes }, catalog);
  const panels = JSON.parse(json).blueprint.entities.filter(e => e.name === 'display-panel')
    .map(({ position, icon, text, always_show, show_in_chart }) => ({ position, icon, text, always_show, show_in_chart }));
  const at = (x, y) => ({ x: x + 0.5, y: y + 0.5 });
  assert.deepEqual(panels, [
    { position: at(-1, 2), icon: { type: 'item', name: 'moss' }, text: 'moss 800/min', always_show: true, show_in_chart: true },
    { position: at(-1, 4), icon: { type: 'item', name: 'casein' }, text: 'casein 360/min + plastic-bar 432/min', always_show: true, show_in_chart: true },
    { position: at(-1, 7), icon: { type: 'fluid', name: 'water' }, text: 'water 1200/min', always_show: true, show_in_chart: true },
    { position: at(7, 9), icon: { type: 'item', name: 'py-science-pack-2' }, text: 'py-science-pack-2 450/min', always_show: true, show_in_chart: true },
    { position: at(1, 0), icon: { type: 'item', name: 'iron-plate' }, text: 'iron-plate 30/min', always_show: true, show_in_chart: true },
  ]);
});

// Module requests fill the machine's module inventory (4 in Factorio 2.0), one slot each, so
// construction robots bring the plants along with the farm.
test("every building requests its Sub-Block's modules, slot by slot", async () => {
  const { json } = await encodeBlueprint({
    subBlocks: [{ item: 'moss', modules: [{ name: 'moss-mk02', count: 2 }, { name: 'moss', count: 1 }] }, { item: 'iron-gear-wheel', modules: [] }],
    entities: [
      { name: 'moss-farm-mk01', kind: 'building', recipe: 'Moss-1', subBlock: 0, x: 0, y: 0, w: 6, h: 6, direction: 0 },
      { name: 'assembling-machine-2', kind: 'building', recipe: 'iron-gear-wheel', subBlock: 1, x: 8, y: 0, w: 3, h: 3, direction: 0 },
    ],
  }, catalog);
  const [farm, assembler] = JSON.parse(json).blueprint.entities;
  assert.deepEqual(farm.items, [
    { id: { name: 'moss-mk02' }, items: { in_inventory: [{ inventory: 4, stack: 0 }, { inventory: 4, stack: 1 }] } },
    { id: { name: 'moss' }, items: { in_inventory: [{ inventory: 4, stack: 2 }] } },
  ]);
  assert.equal(assembler.items, undefined);
});
