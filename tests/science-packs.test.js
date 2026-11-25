import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandChain, recipeOptions } from '../js/chain.js';
import { setupOf } from '../js/setup.js';
import { machineEffect } from '../js/modules.js';
import { planSubBlocks } from '../js/plan.js';
import { catalog as base, logistics } from './fixtures/catalog.js';


// Science Packs (ADR 0121): the user's packs decide which recipes and buildings the chain is
// offered. A recipe or building's `unlock`: the sets of packs (indices into sciencePacks)
// researching it; none, on at start.
const make = (name, item, unlock) => ({
  name, category: 'crafting', time: 1, ingredients: [{ type: 'item', name: 'plate', amount: 1 }],
  products: [{ type: 'item', name: item, amount: 1 }], ...(unlock ? { unlock } : {}),
});
const machine = (name, craftingSpeed, unlock) => ({
  name, size: { w: 3, h: 3 }, craftingSpeed, categories: ['crafting'], energy: 'electric', fluidBoxes: [], ...(unlock ? { unlock } : {}),
});
const catalog = {
  ...base,
  sciencePacks: ['red', 'green', 'blue'],
  recipes: {
    'circuit-fast': make('circuit-fast', 'circuit', [[0, 1]]),
    'circuit-slow': make('circuit-slow', 'circuit'),
    gear: make('gear', 'gear', [[2], [0, 1]]),
    // Unlocked by no research (a mod's script: Py's TURD upgrades).
    chip: make('chip', 'chip', []),
    'asm-2-item': make('asm-2-item', 'asm-2', [[1]]),
    widget: { ...make('widget', 'widget'), ingredients: [{ type: 'item', name: 'gear', amount: 1 }] },
  },
  buildings: { 'asm-1': machine('asm-1', 0.5), 'asm-2': { ...machine('asm-2', 0.75), madeBy: ['asm-2-item'] } },
};

test('every recipe and building is offered with no packs given', () => {
  const index = recipeOptions(catalog);
  assert.deepEqual(index.producers.get('circuit').sort(), ['circuit-fast', 'circuit-slow']);
  assert.deepEqual(index.buildingsFor.get('gear'), ['asm-1', 'asm-2']);
  assert.ok(index.producers.has('chip'));
});

test('with packs given, only what they research is offered', () => {
  const red = recipeOptions(catalog, ['red']);
  assert.deepEqual(red.producers.get('circuit'), ['circuit-slow']);
  assert.ok(!red.producers.has('gear'));
  assert.deepEqual(red.buildingsFor.get('circuit-slow'), ['asm-1']);
  assert.deepEqual(red.consumers.get('plate'), ['circuit-slow']);
  assert.ok(recipeOptions(catalog, ['green']).buildingsFor.get('circuit-slow').includes('asm-2'));
  // Either way to the gear: blue alone, or red and green.
  assert.ok(recipeOptions(catalog, ['blue']).producers.has('gear'));
  const redGreen = recipeOptions(catalog, ['red', 'green']);
  assert.ok(redGreen.producers.has('gear'));
  assert.deepEqual(redGreen.buildingsFor.get('gear'), ['asm-1', 'asm-2']);
  // One no research unlocks, never.
  assert.ok(!recipeOptions(catalog, ['red', 'green', 'blue']).producers.has('chip'));
});

test('a recipe the packs do not unlock gives way to one they do; an item nothing unlocked makes comes by train', () => {
  const selections = { circuit: { recipe: 'circuit-fast', building: 'asm-2' } };
  const { entries } = expandChain([{ item: 'circuit', rate: 60 }], catalog, { selections, sciencePacks: ['red'] });
  assert.deepEqual(entries.map(e => [e.selection.recipe, e.selection.building]), [['circuit-slow', 'asm-1']]);
  const all = expandChain([{ item: 'circuit', rate: 60 }], catalog, { selections });
  assert.deepEqual(all.entries.map(e => [e.selection.recipe, e.selection.building]), [['circuit-fast', 'asm-2']]);
  const widget = expandChain([{ item: 'widget', rate: 60 }], catalog, { made: ['gear'], sciencePacks: ['red'] });
  assert.deepEqual(widget.trainInputs.map(t => [t.item, t.reason]), [['gear', 'no recipe']]);
});

test('the packs chosen are a Chain Choice; none chosen, every one', () => {
  assert.deepEqual(setupOf({ goals: [], logistics: {}, sciencePacks: ['red', 'purple'] }, catalog).choices.sciencePacks, ['red']);
  assert.ok(!('sciencePacks' in setupOf({ goals: [], logistics: {} }, catalog).choices));
  // Every pack saved, or none the catalog knows: every one.
  assert.ok(!('sciencePacks' in setupOf({ goals: [], logistics: {}, sciencePacks: ['red', 'green', 'blue'] }, catalog).choices));
  assert.ok(!('sciencePacks' in setupOf({ goals: [], logistics: {}, sciencePacks: ['purple'] }, catalog).choices));
  // None researched: only what is on at start.
  assert.deepEqual(setupOf({ goals: [], logistics: {}, sciencePacks: [] }, catalog).choices.sciencePacks, []);
  assert.deepEqual(recipeOptions(catalog, []).producers.get('circuit'), ['circuit-slow']);
  // (A catalog built before Science Packs: every recipe.)
  assert.ok(!('sciencePacks' in setupOf({ goals: [], logistics: {}, sciencePacks: ['red'] }, base).choices));
});

// Py's TURD upgrades (ADR 0122): a choice's recipes offered only where it is chosen and its
// upgrade researched with the packs; the recipes it replaces no longer.
const turdCatalog = {
  ...catalog,
  recipes: {
    ...catalog.recipes,
    'circuit-dry': make('circuit-dry', 'circuit', []),
    bedding: make('bedding', 'bedding', []),
    'asm-3-item': make('asm-3-item', 'asm-3', []),
  },
  buildings: { ...catalog.buildings, 'asm-3': { ...machine('asm-3', 1), madeBy: ['asm-3-item'] } },
  turds: [{ name: 'circuit-upgrade', unlock: [[0, 1]], choices: [
    { name: 'wire-netting', unlock: ['bedding', 'asm-3-item'], replace: { 'circuit-slow': 'circuit-dry' } },
    { name: 'extra-water', unlock: [], replace: {} },
  ] }],
};

test('TURD: none chosen, every TURD recipe as the packs offer it', () => {
  assert.ok(recipeOptions(turdCatalog).producers.get('circuit').includes('circuit-dry'));
  assert.ok(!recipeOptions(turdCatalog, ['red']).producers.has('bedding'));
});

test('TURD: a choice\'s recipes and buildings only where chosen; the recipe it replaces gone', () => {
  const none = recipeOptions(turdCatalog, null, {});
  assert.deepEqual(none.producers.get('circuit').sort(), ['circuit-fast', 'circuit-slow']);
  assert.ok(!none.producers.has('bedding'));
  assert.ok(!none.buildingsFor.get('circuit-slow').includes('asm-3'));
  const wire = recipeOptions(turdCatalog, null, { 'circuit-upgrade': 'wire-netting' });
  assert.deepEqual(wire.producers.get('circuit').sort(), ['circuit-dry', 'circuit-fast']);
  assert.ok(wire.producers.has('bedding'));
  assert.ok(wire.buildingsFor.get('circuit-dry').includes('asm-3'));
  // Another choice brings none of them.
  assert.ok(!recipeOptions(turdCatalog, null, { 'circuit-upgrade': 'extra-water' }).producers.has('bedding'));
  // The upgrade not researched with the packs: its choice counts for nothing.
  const red = recipeOptions(turdCatalog, ['red'], { 'circuit-upgrade': 'wire-netting' });
  assert.deepEqual(red.producers.get('circuit'), ['circuit-slow']);
  assert.ok(recipeOptions(turdCatalog, ['red', 'green'], { 'circuit-upgrade': 'wire-netting' }).producers.has('bedding'));
});

test('TURD: the choices are a Chain Choice, those the catalog knows; a Goal nothing chosen makes is told so', () => {
  const choices = setupOf({ goals: [], logistics: {}, turds: { 'circuit-upgrade': 'wire-netting', 'x-upgrade': 'y', 'circuit-upgrade-2': 'z' } }, turdCatalog).choices;
  assert.deepEqual(choices.turds, { 'circuit-upgrade': 'wire-netting' });
  assert.ok(!('turds' in setupOf({ goals: [], logistics: {} }, turdCatalog).choices));
  assert.throws(() => expandChain([{ item: 'bedding', rate: 60 }], turdCatalog, { turds: {} }), /nothing the science packs and TURD upgrades chosen unlock makes/);
});

// TURD choices' effects (ADR 0123): the buildings a chosen choice affects take its effect, those it
// replaces give way to their TURD buildings.
const effectCatalog = {
  ...catalog,
  buildings: {
    ...catalog.buildings,
    'asm-1-turd': { ...machine('asm-1-turd', 0.5), allowedEffects: ['speed'] },
  },
  turds: [{ name: 'asm-upgrade', unlock: [[0]], choices: [
    { name: 'faster', unlock: [], replace: {}, effects: { 'asm-1': { speed: 1, consumption: 2 }, 'asm-1-turd': { speed: 1, productivity: 0.5 } } },
    { name: 'humus', unlock: [], replace: {}, machines: { 'asm-1': 'asm-1-turd' } },
  ] }],
};

test('TURD: a chosen choice\'s effect rides on the selection and speeds its machines', () => {
  const goal = [{ item: 'circuit', rate: 60 }];
  // (In asm-1, the building the choices affect, ADR 0129.)
  const selections = { circuit: { recipe: 'circuit-slow', building: 'asm-1' } };
  const none = expandChain(goal, effectCatalog, { selections, turds: {} }).entries[0];
  assert.deepEqual([none.selection.building, none.selection.bonus], ['asm-1', undefined]);
  const faster = expandChain(goal, effectCatalog, { selections, turds: { 'asm-upgrade': 'faster' } }).entries[0];
  assert.deepEqual(faster.selection.bonus, { speed: 1, consumption: 2 });
  assert.deepEqual(machineEffect(effectCatalog, faster.selection.recipe, 'asm-1', [], faster.selection.bonus), { speed: 2, productivity: 0, consumption: 3 });
  // Half the machines at twice the speed (60/min: 1 a second, a machine 0.5 a second, then 1).
  const [slow] = planSubBlocks([none], effectCatalog, logistics);
  const [fast] = planSubBlocks([faster], effectCatalog, logistics);
  assert.deepEqual([slow.count, fast.count, fast.bonus], [2, 1, { speed: 1, consumption: 2 }]);
  // Only the effects the building allows (no productivity in asm-1-turd).
  assert.deepEqual(machineEffect({ ...effectCatalog, recipes: { ...effectCatalog.recipes, 'circuit-slow': { ...effectCatalog.recipes['circuit-slow'], allowProductivity: true } } }, 'circuit-slow', 'asm-1-turd', [], { speed: 1, productivity: 0.5 }).productivity, 0);
});

test('TURD: a choice replacing a building offers its TURD building instead; none chosen, the plain one', () => {
  assert.deepEqual(recipeOptions(effectCatalog).buildingsFor.get('circuit-slow'), ['asm-1', 'asm-1-turd', 'asm-2']);
  assert.deepEqual(recipeOptions(effectCatalog, null, {}).buildingsFor.get('circuit-slow'), ['asm-1', 'asm-2']);
  assert.deepEqual(recipeOptions(effectCatalog, null, { 'asm-upgrade': 'humus' }).buildingsFor.get('circuit-slow'), ['asm-1-turd', 'asm-2']);
  const selections = { circuit: { recipe: 'circuit-slow', building: 'asm-1' } };
  const entry = expandChain([{ item: 'circuit', rate: 60 }], effectCatalog, { selections, turds: { 'asm-upgrade': 'humus' } }).entries[0];
  assert.equal(entry.selection.building, 'asm-1-turd');
});

// A machine heated by its fluid (Py's compost plant TURD, ADR 0123): each unit gives its heat above
// the fluid's default temperature, up to the machine's heatMax, and comes that hot.
test('a machine heated by its fluid takes it at its heatMax, the heat above the default its energy', () => {
  const heated = {
    ...catalog,
    temperatures: { syrup: 0 }, fluidFuels: {},
    recipes: { 'circuit-slow': { ...catalog.recipes['circuit-slow'], time: 60 } },
    buildings: {
      composter: {
        ...machine('composter', 1), energy: 'fluid', energyUsage: 1e6, effectivity: 1000, heats: true, heatMax: 10, fuelFilter: 'syrup',
        fluidBoxes: [{ production: 'fuel', connections: [{ x: 0, y: -1, direction: 0 }] }],
      },
    },
  };
  const { entries, trainInputs } = expandChain([{ item: 'circuit', rate: 1 }], heated, { logistics });
  // 1 MW over 10 kJ a degree for 10° times 1000: 0.1 a second, 6 a minute busy.
  assert.deepEqual(trainInputs.find(t => t.item === 'syrup'), { item: 'syrup', rate: 6, reason: 'no recipe', temperature: { min: 10 } });
  const [sb] = planSubBlocks(entries, heated, logistics);
  assert.equal(sb.inputs.find(i => i.name === 'syrup').rate, 6);
});
