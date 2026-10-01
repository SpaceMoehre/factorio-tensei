import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleOptions, defaultModules, machineEffect } from '../js/modules.js';
import { planSubBlocks } from '../js/plan.js';
import { pyCatalog, catalog } from './fixtures/catalog.js';

const moss = modules => [{ goal: { item: 'moss', rate: 48 }, selection: { recipe: 'Moss-1', building: 'moss-farm-mk01', modules } }];

test('a building takes the modules its categories, effects and recipe allow', () => {
  assert.deepEqual(moduleOptions(pyCatalog, 'Moss-1', 'moss-farm-mk01'), ['moss', 'moss-mk02']);
  // assembling-machine-2 has no module slots.
  assert.deepEqual(moduleOptions(catalog, 'iron-gear-wheel', 'assembling-machine-2'), []);
});

test('a farm that cannot run without modules starts full of its first plant; other buildings start empty', () => {
  assert.deepEqual(defaultModules(pyCatalog, 'Moss-1', 'moss-farm-mk01'), [{ name: 'moss', count: 16 }]);
  assert.deepEqual(defaultModules(catalog, 'iron-gear-wheel', 'assembling-machine-2'), []);
});

// Speed = 1/16 × (1 − 100% base + 16 × 100%) = 1: 8 moss per 100 s is 4.8/min a farm, so
// 48/min needs 10 farms. With moss-mk02 (+200% each) the speed is 1/16 × 32 = 2: 5 farms.
test('modules set the machine speed and so the Count: moss farms on moss and moss-mk02', () => {
  assert.deepEqual(machineEffect(pyCatalog, 'Moss-1', 'moss-farm-mk01', [{ name: 'moss', count: 16 }]), { speed: 16, productivity: 0, consumption: 1 });
  assert.equal(planSubBlocks(moss([{ name: 'moss', count: 16 }]), pyCatalog)[0].count, 10);
  assert.equal(planSubBlocks(moss([{ name: 'moss-mk02', count: 16 }]), pyCatalog)[0].count, 5);
  // Eight plants in sixteen slots: speed 1/16 × 8 = 0.5, twice the farms.
  assert.equal(planSubBlocks(moss([{ name: 'moss', count: 8 }]), pyCatalog)[0].count, 20);
});

// A selection that names no modules plans with the step's default ones, as the app starts it:
// without moss a moss farm would hardly run (speed limit -99.99%) and need thousands.
test('a selection naming no modules plans with the default ones', () => {
  const [sb] = planSubBlocks(moss(undefined), pyCatalog);
  assert.deepEqual(sb.modules, [{ name: 'moss', count: 16 }]);
  assert.equal(sb.count, 10);
  assert.deepEqual(planSubBlocks(moss([]), pyCatalog)[0].modules, []);
});

test('a Sub-Block carries its modules for the blueprint', () => {
  assert.deepEqual(planSubBlocks(moss([{ name: 'moss', count: 16 }]), pyCatalog)[0].modules, [{ name: 'moss', count: 16 }]);
});

test('modules the building does not take, or more than its slots, are refused', () => {
  assert.throws(() => planSubBlocks(moss([{ name: 'speed-module', count: 1 }]), pyCatalog), /moss-farm-mk01 cannot take speed-module/);
  assert.throws(() => planSubBlocks(moss([{ name: 'moss', count: 17 }]), pyCatalog), /16 module slots/);
});

// Gears (0.5 s, 2 iron plates → 1 gear) in assembling-machine-3 (speed 1.25, 4 slots) with four
// productivity modules: +16% productivity, -20% speed, +160% power. A machine makes
// 1.25 × 0.8 / 0.5 × 1.16 × 60 = 139.2 gears/min, so 278.4/min takes 2; that is 240 crafts, 480 plates.
test('productivity adds output per craft where the recipe allows it, and costs speed and power', () => {
  const am3 = {
    ...catalog,
    modules: { 'productivity-module': pyCatalog.modules['productivity-module'] },
    recipes: { ...catalog.recipes, 'iron-gear-wheel': { ...catalog.recipes['iron-gear-wheel'], allowProductivity: true } },
    buildings: {
      ...catalog.buildings,
      'assembling-machine-3': { ...catalog.buildings['assembling-machine-2'], name: 'assembling-machine-3', craftingSpeed: 1.25, moduleSlots: 4 },
    },
  };
  const modules = [{ name: 'productivity-module', count: 4 }];
  const effect = machineEffect(am3, 'iron-gear-wheel', 'assembling-machine-3', modules);
  assert.deepEqual(Object.values(effect).map(v => Math.round(v * 1000) / 1000), [0.8, 0.16, 2.6]);
  const [sb] = planSubBlocks([{ goal: { item: 'iron-gear-wheel', rate: 278.4 }, selection: { recipe: 'iron-gear-wheel', building: 'assembling-machine-3', modules } }], am3);
  assert.equal(sb.count, 2);
  assert.ok(Math.abs(sb.inputs.find(i => i.name === 'iron-plate').rate - 480) < 1e-9);
  // Without the recipe's permission, productivity modules do not fit.
  assert.deepEqual(moduleOptions({ ...am3, recipes: catalog.recipes }, 'iron-gear-wheel', 'assembling-machine-3'), []);
});
