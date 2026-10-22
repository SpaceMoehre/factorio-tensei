import { simulate } from './sim.js';
import { expandChain, recipeOptions, useKey, EVERY } from './chain.js';
import { machineEffect, moduleOptions } from './modules.js';
import { encodeBlueprint } from './blueprint.js';
import { clocksOf, clockLabel } from './clocks.js';
import { circuitPairs } from './layout/wires.js';
import { createMap, turnsSideways } from './render.js';
import { decodeBlueprint, readCityBlock, siteOf } from './city.js';
import { planner } from './maximize.js';
import { compactness, rankOf, SQUARE, BEND } from './layout/score.js';
import { readLibrary, writeLibrary, addEntry, editEntry, removeEntry, renameFolder, foldersOf, grouped } from './library.js';

const STORAGE_KEY = 'factory-tensei:v1';
const SELECTS = ['belt', 'pipe', 'pole', 'inserter', 'longInserter', 'fuel', 'liquidFuel'];
// Virtual signals a clock may take: the catalog's (every one the game has), else the letters,
// digits, colours and a few symbols of Factorio 2.0. Without an icon, a letter, digit or colour
// is drawn as a glyph or a swatch.
/** @type {{ type: string, name: string, glyph?: string, swatch?: string }[]} */
const DRAWN = [
  ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].map(c => ({ name: `signal-${c}`, glyph: c })),
  ...Object.entries({ red: '#e53935', green: '#43a047', blue: '#1e88e5', yellow: '#fdd835', pink: '#ec407a', cyan: '#26c6da', white: '#f5f5f5', grey: '#9e9e9e', black: '#212121' })
    .map(([colour, swatch]) => ({ name: `signal-${colour}`, swatch })),
  { name: 'signal-check', glyph: '✓' }, { name: 'signal-info', glyph: 'i' }, { name: 'signal-dot', glyph: '•' },
].map(v => ({ ...v, type: 'virtual' }));
const TRAIN_REASON = { import: 'by train', 'no recipe': 'by train — nothing makes it', cycle: 'by train — a recipe loop that cannot feed itself (a fluid, or one taking more than it makes)', temperature: 'by train — its step makes it at a temperature this step does not take' };
// What a fluid by train must come at (ADR 0067): "at 500° or more", "at 100° or less", "at 250–500°".
const atTemperature = t => (!t ? '' : t.min !== undefined && t.max !== undefined ? `, at ${t.min}–${t.max}°` : t.min !== undefined ? `, at ${t.min}° or more` : `, at ${t.max}° or less`);
const $ = id => /** @type {any} */ (document.getElementById(id));

const raw = await fetch('data/catalog.json').then(r => r.arrayBuffer());
const catalog = JSON.parse(new TextDecoder().decode(raw));
// The catalog's fingerprint in a shared setup: the first 12 hex digits of its SHA-256.
let catalogId = null;
crypto.subtle?.digest('SHA-256', raw).then(d => { catalogId = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12); }, () => {});
// A catalog built before v2 has no inserters, power draw or fuel; the search needs all three.
const outdated = !catalog.inserters || !catalog.fuels;
if (outdated) Object.assign(catalog, { inserters: {}, fuels: {} });
const index = recipeOptions(catalog);
// A pipe-to-ground's plain pipe: the one named like it. Pipes of different materials do not
// connect, so the block takes both of one material (`pipe`, the pipe-to-ground, chosen; its
// `plainPipe` follows).
const plainOf = name => name.replace(/-to-ground$/, '');
const choices = {
  belt: Object.keys(catalog.belts), pole: Object.keys(catalog.poles),
  // Pipe-to-grounds with a plain pipe of their material (every one, in a catalog built before
  // plain pipes were recorded).
  pipe: Object.keys(catalog.pipes).filter(name => !catalog.plainPipes || catalog.plainPipes.includes(plainOf(name))),
  inserter: inserterNames(1), longInserter: inserterNames(2), fuel: Object.keys(catalog.fuels).sort(),
  // Liquid Fuels (a catalog built before them has none).
  liquidFuel: Object.keys(catalog.fluidFuels ?? {}).sort(),
};
const state = load() ?? { goals: [], logistics: {} };
state.logistics = { ...defaultLogistics(), ...state.logistics };
state.logistics.plainPipe = plainOf(state.logistics.pipe);
// What comes by train follows from the Goals' recipes; `made` lists the imports the user chose to
// make in the block instead. (Saves from before listed Train Inputs instead; that list is dropped.)
state.made ??= [];
delete state.inputs;
state.selections ??= {};
// Byproduct Uses: { from (a step's key), item, recipe, building?, modules? } (chain.js).
state.uses ??= [];
// Items made here the user wants leaving by train too, their consumers first; fluids that would
// leave by train destroyed instead (a sinkhole, a gas vent) (ADR 0062).
state.exports ??= [];
state.voids ??= [];
// Inserter Clocks: the signal chosen for each clock (by its key, "items/seconds"), kept from one
// build to the next.
state.clocks ??= {};
// The City Block to build in: its blueprint string (or a size, without one), the Buffer and
// whether to look for the highest rate that fits.
state.city = { on: false, blueprint: '', w: 100, h: 100, buffer: 2, maximize: false, ...state.city };
// Goals used to carry their own recipe and building; they are now the chain's selections.
for (const g of state.goals) {
  if (g.recipe && !state.selections[g.item]) state.selections[g.item] = { recipe: g.recipe, building: g.building };
  delete g.recipe;
  delete g.building;
}
// The Production Chain for the current Goals, made items and selections, or why there is none.
/** @type {any} */
let chain = null;
// The chain's rows by step, with the choices each was drawn for.
const chainRows = new Map();
// Redrawing the chain removes the focused field, whose blur can fire another change mid-redraw;
// that redraw waits for this one to finish.
let drawing = false;
let map = null;
// The searches running: one worker for each strategy (a Maximize: one), each with how many
// layouts it tried and whether it is done.
let workers = [];
// The layout search's strategies, each run in a worker of its own, side by side (ADR 0013).
const STRATEGIES = ['search', 'spread'];
// The best layout the running (or last) search has sent, and how many layouts it had tried.
let best = null;
// The City Block read from its blueprint ({ area, fixtures, unknown, blueprint } or { error }),
// null without one; and what the running (or last) build used: the blueprint its Fixtures came
// from, whether it maximizes, and the try in progress.
let city = null;
// The shown block's Inserter Clocks (clocks.js), the clock whose signal is being picked, and the
// blueprint encoding last started.
let clocks = null;
let picking = null;
let encoding = 0;
let reading = 0;
let cityRead = Promise.resolve();
let built = null;
// Saved blueprints (library.js).
let library = [];
// The user's moves (ADR 0043): the layouts shown before each, the last one last (Undo), and the
// move being laid out ({ worker, step, inst, dx, dy }).
let undo = [];
let moving = null;
const UNDOS = 30;
// Pulling the block together (ADR 0045): { run, before, slid }.
let pulling = null;

// The page's pictures: technologies' (catalog.art) and items' icons.
for (const img of /** @type {any[]} */ (Array.from(document.querySelectorAll('img[data-art], img[data-icon]')))) {
  const path = img.dataset.art ? catalog.art?.[img.dataset.art] : catalog.icons[img.dataset.icon];
  if (path) img.src = `sprites/${path}`;
  else img.hidden = true;
}
for (const span of /** @type {any[]} */ (Array.from(document.querySelectorAll('[data-sprite]')))) span.replaceWith(iconOf(span.dataset.sprite));
for (const key of SELECTS) {
  fillSelect($(key), choices[key], state.logistics[key], key === 'pipe' ? plainOf : undefined);
  $(key).addEventListener('change', () => {
    state.logistics[key] = $(key).value;
    if (key === 'pipe') state.logistics.plainPipe = plainOf($(key).value);
    // (The belt decides which byproducts are fed back.)
    if (key === 'belt') renderChain();
    save();
  });
  const select = $(key);
  const at = select.nextSibling;
  const parent = select.parentNode;
  parent.insertBefore(pictured(select, { title: /** @type {HTMLElement} */ (document.querySelector(`label[for="${key}"]`)).textContent }), at);
}
$('circuit').value = state.logistics.circuit;
$('circuit').addEventListener('change', () => {
  state.logistics.circuit = $('circuit').value;
  save();
  // Only the blueprint and the map change: the block stays as it is.
  if (best) show(best.block, best.tried, best.found, best.score, { view: map?.viewport() });
});
// The Output Side (ADR 0069): the edge the products leave across; the inputs come from the left.
$('output-side').value = state.logistics.output ?? 'right';
$('output-side').addEventListener('change', () => { state.logistics.output = $('output-side').value; save(); });
$('right-angle').checked = state.logistics.rightAngle;
$('right-angle').addEventListener('change', () => { state.logistics.rightAngle = $('right-angle').checked; save(); });
// One Item a Belt (ADR 0066): on unless the user keeps a machine's products on one belt.
$('one-item').checked = state.logistics.mixedOutputs !== true;
$('one-item').addEventListener('change', () => { state.logistics.mixedOutputs = !$('one-item').checked; save(); });
$('handSize').value = String(state.logistics.handSize);
$('handSize').addEventListener('change', () => {
  state.logistics.handSize = Math.min(12, Math.max(1, Math.floor(Number($('handSize').value) || 1)));
  $('handSize').value = String(state.logistics.handSize);
  save();
});
$('budget').value = String(state.logistics.budget);
$('budget').addEventListener('change', () => { state.logistics.budget = Math.max(1, Number($('budget').value) || 10); save(); });
$('add-goal').addEventListener('click', () => chooseGoal('', item => {
  state.goals.push({ item, rate: 60 });
  renderGoals();
  save();
}));
$('city-on').checked = state.city.on;
$('city-on').addEventListener('change', () => { state.city.on = $('city-on').checked; renderCity(); save(); });
$('city-bp').value = state.city.blueprint;
$('city-bp').addEventListener('input', () => { state.city.blueprint = $('city-bp').value.trim(); save(); readCity(); });
$('city-load').addEventListener('click', () => $('city-file').click());
$('city-file').addEventListener('change', async () => {
  const [file] = $('city-file').files;
  if (!file) return;
  state.city.blueprint = $('city-bp').value = (await file.text()).trim();
  $('city-file').value = '';
  save();
  readCity();
});
$('city-clear').addEventListener('click', () => { state.city.blueprint = $('city-bp').value = ''; save(); readCity(); });
for (const [id, field, least] of /** @type {[string, string, number][]} */ ([['city-w', 'w', 8], ['city-h', 'h', 8], ['city-buffer', 'buffer', 0]])) {
  $(id).addEventListener('change', () => {
    state.city[field] = Math.max(least, Math.floor(Number($(id).value) || 0));
    $(id).value = String(state.city[field]);
    renderForetell();
    save();
  });
}
$('city-buffer').value = String(state.city.buffer);
$('maximize').checked = state.city.maximize;
$('maximize').addEventListener('change', () => { state.city.maximize = $('maximize').checked; renderCity(); save(); });
$('apply-rate').addEventListener('click', applyRate);
readCity();
$('calculate').addEventListener('click', () => build());
$('stop').addEventListener('click', () => finish('Stopped'));
$('copy-string').addEventListener('click', () => copy($('bp-string').value, $('copy-string')));
$('copy-json').addEventListener('click', () => copy($('bp-json').value, $('copy-json')));
$('city-save').addEventListener('click', saveCity);
$('bp-save').addEventListener('click', saveBlock);
$('city-pick').addEventListener('click', () => openLibrary('city'));
$('library-open').addEventListener('click', () => openLibrary());
$('library-close').addEventListener('click', () => $('library').close());
$('library').addEventListener('click', e => { if (e.target === $('library')) $('library').close(); });
$('library').addEventListener('close', () => {
  closeShelfMenu();
  shelf.editing = shelf.found = null;
});
$('library-filter').addEventListener('input', drawLibrary);
$('library-list').addEventListener('scroll', () => closeShelfMenu(), { passive: true });
for (const tab of $('library-tabs').children) {
  tab.addEventListener('click', () => {
    shelf.kind = tab.dataset.kind;
    shelf.found = null;
    drawLibrary();
  });
  tab.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const other = /** @type {HTMLElement} */ (tab.nextElementSibling ?? tab.previousElementSibling);
    other.click();
    other.focus();
  });
}
document.addEventListener('pointerdown', e => {
  if ($('library-menu').hidden || $('library-menu').contains(/** @type {Node} */ (e.target))) return;
  // (A press on the ⋯ button that opened it only closes it.)
  shelf.reopen = /** @type {HTMLElement} */ (e.target).closest?.('.more') !== shelf.menuFor;
  closeShelfMenu();
}, true);
$('library-menu').addEventListener('keydown', e => {
  const items = /** @type {HTMLElement[]} */ ([...$('library-menu').querySelectorAll('.menu-item, input')]);
  const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  if (e.key === 'Escape') {
    // (Escape closes the menu, not the dialog under it.)
    e.preventDefault();
    closeShelfMenu(true);
  } else if (e.key === 'Tab') closeShelfMenu();
  else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
    e.preventDefault();
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  }
});
library = readLibrary(storageOf());
tellLibrary();
refreshLibrary();
$('copy-setup').addEventListener('click', () => {
  $('setup').open = true;
  copy($('setup-json').value = setupText(), $('copy-setup'));
});
$('setup').addEventListener('toggle', () => { if ($('setup').open) $('setup-json').value = setupText(); });
$('picker-close').addEventListener('click', () => $('picker').close());
$('picker-none').addEventListener('click', () => choose(null));
$('picker-filter').addEventListener('input', filterPicker);
// A click on the backdrop closes it.
$('picker').addEventListener('click', e => { if (e.target === $('picker')) $('picker').close(); });
$('chooser-close').addEventListener('click', () => $('chooser').close());
$('chooser-filter').addEventListener('input', drawChooser);
$('chooser').addEventListener('click', e => { if (e.target === $('chooser')) $('chooser').close(); });
$('undo').addEventListener('click', undoMove);
$('compact').addEventListener('click', compactBlock);
// A Sub-Block's menu closes on a press elsewhere, Escape or the map moving; its arrows go from item
// to item.
document.addEventListener('pointerdown', e => {
  if (!$('map-menu').hidden && !$('map-menu').contains(/** @type {Node} */ (e.target))) closeMenu();
}, true);
$('map').addEventListener('wheel', closeMenu, { passive: true });
$('map-menu').addEventListener('keydown', e => {
  const items = /** @type {HTMLElement[]} */ ([...$('map-menu').querySelectorAll('.menu-item:not(:disabled)')]);
  const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  if (e.key === 'Escape' || e.key === 'Tab') {
    closeMenu();
    if (e.key === 'Escape') $('map').focus?.();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  }
});
// (Ctrl+Z or ⌘Z undoes a move, but in a field.)
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || !undo.length) return;
  if (/** @type {HTMLElement} */ (e.target).closest?.('input, textarea, select, [contenteditable]')) return;
  e.preventDefault();
  undoMove();
});
$('zoom-in').addEventListener('click', () => map?.zoom(1.4));
$('zoom-out').addEventListener('click', () => map?.zoom(1 / 1.4));
$('fit').addEventListener('click', () => map?.fit());
showEmpty('Your factory block appears here.');
renderGoals();
if (outdated) {
  $('calculate').disabled = true;
  showStatus('error', 'The catalog is missing inserter data — regenerate it (see PRD.md, Catalog).');
}

// Electric inserters (never burner ones) that pick up straight ahead, `reach` tiles out. Py's
// cranes reach diagonally and are not used.
function inserterNames(reach) {
  return Object.values(catalog.inserters)
    .filter(i => i.energy === 'electric' && i.pickup.x === 0 && Math.abs(Math.abs(i.pickup.y) - reach) < 1e-6)
    .map(i => i.name).sort();
}

function defaultLogistics() {
  const poles = Object.values(catalog.poles).sort((a, b) => b.supplyRadius - a.supplyRadius);
  const prefer = (list, name) => (list.includes(name) ? name : list[0]);
  return {
    belt: prefer(choices.belt, 'transport-belt'),
    pipe: prefer(choices.pipe, 'pipe-to-ground'),
    pole: poles[0].name,
    inserter: prefer(choices.inserter, 'fast-inserter'),
    longInserter: prefer(choices.longInserter, 'long-handed-inserter'),
    fuel: prefer(choices.fuel, 'coal'),
    liquidFuel: prefer(choices.liquidFuel, choices.liquidFuel.includes('natural-gas') ? 'natural-gas' : 'petroleum-gas'),
    rightAngle: true,
    handSize: 1,
    budget: 10,
    circuit: 'none',
  };
}

function renderGoals() {
  $('goals').replaceChildren(...(state.goals.length ? state.goals.map((goal, i) => goalRow(goal, i)) : [
    el('div', { className: 'empty-goals' }, ...(catalog.art?.automation ? [el('img', { src: `sprites/${catalog.art.automation}`, alt: '' })] : []),
      el('p', { className: 'hint', textContent: 'No goals yet. Add one: pick an item, and its recipe, machines and belts follow.' })),
  ]));
  $('add-goal').textContent = state.goals.length ? '+ Add another goal' : '+ Add a goal';
  renderChain();
}

// The items a Goal may be: every one a recipe makes, by the game's item groups (its crafting
// menu's tabs).
function goalGroups() {
  const made = name => index.producers.has(name);
  const groups = (catalog.groups ?? []).map(g => ({ name: g.name, icon: g.icon, items: g.items.filter(made) })).filter(g => g.items.length);
  const grouped = new Set(groups.flatMap(g => g.items));
  const rest = [...index.producers.keys()].filter(name => !grouped.has(name)).sort();
  return rest.length ? [...groups, { name: 'other', icon: null, items: rest }] : groups;
}

function chooseGoal(current, pick) {
  openChooser({ title: 'What to make', groups: goalGroups(), current, pick });
}

// A Goal is an item and a rate; how it is made is chosen in the Production Chain. Editing a Goal
// only redraws the chain, so the field being edited keeps its focus.
function goalRow(goal, i) {
  const item = el('button', { type: 'button', className: 'goal-item', title: 'Choose another item', ariaLabel: `Goal item: ${goal.item ? label(goal.item) : 'none'}` },
    iconOf(goal.item), el('span', { className: 'goal-name' }, el('strong', { textContent: goal.item ? label(goal.item) : 'Choose an item…' }), el('small', { textContent: goal.item })));
  item.addEventListener('click', () => chooseGoal(goal.item, name => { goal.item = name; renderGoals(); save(); }));
  const rate = el('input', { type: 'number', min: '0', step: 'any', value: String(goal.rate), title: 'Target rate per minute', ariaLabel: 'Goal rate per minute' });
  const remove = el('button', { type: 'button', className: 'icon', textContent: '×', title: 'Remove goal', ariaLabel: `Remove ${label(goal.item)}` });
  rate.addEventListener('change', () => { goal.rate = Number(rate.value); renderChain(); save(); });
  remove.addEventListener('click', () => { state.goals.splice(i, 1); renderGoals(); save(); });
  return el('div', { className: 'goal' }, item, el('span', { className: 'rate-in' }, rate, el('span', { textContent: '/min' })), remove);
}

// The Production Chain: every step with its rate, machines, recipe and building, and what comes
// by train. Rows are kept while their choices stay the same, so a click on one is never lost to
// a redraw.
function renderChain() {
  if (drawing) return void queueMicrotask(renderChain);
  drawing = true;
  try {
    drawChain();
  } finally {
    drawing = false;
  }
  showFuels();
  renderForetell();
}

// Fuel and Liquid Fuel show only where a machine of the chain burns one: an item (a burner), or a
// fluid of the user's choice (one whose energy source takes any).
function showFuels() {
  const buildings = chain?.entries?.map(({ selection }) => catalog.buildings[selection.building]).filter(Boolean) ?? [];
  const burns = {
    fuel: buildings.some(b => b.energy === 'burner'),
    liquidFuel: buildings.some(b => b.energy === 'fluid' && !b.fuelFilter && !b.heats),
  };
  for (const [id, shown] of Object.entries(burns)) {
    ($(id).closest('.pictured') ?? $(id)).hidden = !shown;
    /** @type {HTMLElement} */ (document.querySelector(`label[for="${id}"]`)).hidden = !shown;
  }
}

function drawChain() {
  const goals = state.goals.filter(g => g.item && g.rate > 0);
  try {
    chain = goals.length ? expandChain(goals, catalog, { made: state.made, selections: state.selections, uses: state.uses, exports: state.exports, voids: state.voids, index, belt: state.logistics.belt, logistics: state.logistics }) : null;
  } catch (e) {
    chain = { error: e.message };
  }
  const list = $('chain');
  if (!chain || chain.error) {
    chainRows.clear();
    list.replaceChildren(el('p', { className: 'hint', textContent: chain?.error ?? 'Add a goal to see how it is made.' }));
    return;
  }
  const rows = [];
  const seen = new Set();
  const row = (id, key, make) => {
    rows.push(reuse(id, key, make));
    seen.add(id);
    return chainRows.get(id).el;
  };
  // Each step, the Byproduct Uses among them; then what comes by train, and the byproducts that
  // leave by train, each with the recipes that could process it.
  const step = entry => {
    const { goal, selection, use } = entry;
    const key = use?.key ?? goal.item;
    const recipes = use ? index.consumers.get(use.item).filter(r => index.buildingsFor.has(r)) : index.producers.get(goal.item);
    const buildings = index.buildingsFor.get(selection.recipe);
    const shown = row(`step:${key}`, JSON.stringify(['step', key, goal.item, recipes, selection, buildings, use?.sources ?? use?.from ?? null, state.exports.includes(goal.item), goal.overflow ?? [], state.voids]), () => (use ? useRow(entry, recipes, buildings) : stepRow(goal.item, recipes, buildings, selection, goal.overflow)));
    const building = catalog.buildings[selection.building];
    const recipe = catalog.recipes[selection.recipe];
    const effect = machineEffect(catalog, selection.recipe, selection.building, selection.modules);
    const perMachine = building.craftingSpeed * effect.speed / recipe.time
      * recipe.products.find(p => p.name === goal.item).amount * (1 + effect.productivity) * 60;
    // The Count, and the machine's speed with its modules (Py farms: their plants and animals).
    shown.querySelector('.rate').textContent = `${fmt(goal.rate)}/min · ${count(Math.ceil(goal.rate / perMachine - 1e-9), 'machine')}`;
    shown.querySelector('.speed').textContent = `${speed(building.craftingSpeed * effect.speed)}`
      + (effect.speed !== 1 ? ` (${speed(building.craftingSpeed)} × ${speed(effect.speed)} with modules)` : '') + ` · ${fmt(perMachine)}/min a machine`;
    // A Recipe Loop: what of this step's item goes back into the loop.
    // And the byproducts it takes from a step making them (Recycled Byproducts), not by train.
    const back = use ? [] : chain.loops.filter(l => l.item === goal.item);
    const takes = (chain.recycled ?? []).filter(r => r.into.includes(key));
    // (Supplied Items: what Byproduct Uses make of this step's item, and what this Use supplies.)
    const joined = use ? [] : (chain.supplies ?? []).filter(s => s.into === key);
    const supplies = (chain.supplies ?? []).filter(s => s.from === key);
    const entryOf = k => chain.entries.find(e => (e.use?.key ?? e.goal.item) === k);
    const nameOf = k => (entryOf(k)?.use ? `${label(entryOf(k).use.item).toLowerCase()} use` : `${label(entryOf(k)?.goal.item ?? k).toLowerCase()} step`);
    const loop = shown.querySelector('.loop');
    loop.textContent = [
      ...back.map(l => `↺ ${fmt(l.rate)}/min back into ${l.into === goal.item ? 'itself' : l.into} (a recipe loop)`),
      ...takes.map(r => `↺ takes ${r.valve ? `${fmt(r.rate)}/min of ` : ''}${label(r.item).toLowerCase()} from the ${nameOf(r.from)}'s ${entryOf(r.from)?.use ? 'products' : 'byproduct'}${r.valve ? ', through valves' : ''}${r.spare > 1e-9 ? ` (${fmt(r.spare)}/min more leaves by train)` : ''}`),
      ...joined.map(s => (s.valve ? `+ ${fmt(s.rate)}/min given back by the ${nameOf(s.from)}, so this step makes only the rest, through a top-up valve`
        : `+ ${fmt(s.rate)}/min more from the ${nameOf(s.from)}, so this step makes that much less`)),
      ...supplies.map(s => (s.valve ? `↺ its ${fmt(s.rate)}/min of ${label(s.item).toLowerCase()} goes back to the steps taking it first, its spare off through an overflow valve`
        : `→ its ${fmt(s.rate)}/min of ${label(s.item).toLowerCase()} joins what the ${label(s.item).toLowerCase()} step makes`)),
    ].join(' · ');
    loop.hidden = !back.length && !takes.length && !joined.length && !supplies.length;
  };
  for (const entry of chain.entries) step(entry);
  if (chain.trainInputs.length) row('train-head', 'train-head', () => el('div', { className: 'train-head', textContent: 'By train' }));
  for (const input of chain.trainInputs) {
    row(`train:${input.item}`, JSON.stringify(['train', input.item, input.reason, input.topUp ?? null, input.temperature ?? null]), () => trainRow(input)).querySelector('.rate').textContent = `${fmt(input.rate)}/min`;
  }
  // (Each byproduct once, whichever steps make it.)
  const byproducts = new Map();
  for (const b of chain.byproducts) {
    const seen = byproducts.get(b.item);
    if (seen) Object.assign(seen, { rate: seen.rate + b.rate, from: [...seen.from, b.from] });
    else byproducts.set(b.item, { item: b.item, type: b.type, rate: b.rate, from: [b.from], recipes: b.recipes });
  }
  if (byproducts.size) row('byproduct-head', 'byproduct-head', () => el('div', { className: 'train-head', textContent: 'Leaves by train' }));
  for (const b of byproducts.values()) {
    const shown = row(`byproduct:${b.item}`, JSON.stringify(['byproduct', b.item, b.recipes, state.voids.includes(b.item)]), () => byproductRow(b));
    shown.querySelector('.rate').textContent = `${fmt(b.rate)}/min`;
    shown.querySelector('.hint').textContent = `from ${stepsNamed(b.from)}`;
  }
  for (const k of [...chainRows.keys()]) if (!seen.has(k)) chainRows.delete(k);
  if (rows.some((row, i) => list.children[i] !== row) || list.children.length !== rows.length) list.replaceChildren(...rows);
}

function reuse(id, key, make) {
  const cached = chainRows.get(id);
  if (cached?.key === key) return cached.el;
  const row = make();
  chainRows.set(id, { key, el: row });
  return row;
}

function stepRow(item, recipes, buildings, selection, overflow = []) {
  const choose = changes => { state.selections[item] = { ...selection, ...changes }; renderChain(); save(); };
  const train = el('button', { type: 'button', className: 'swap', textContent: 'By train', title: `Bring ${item} by train instead` });
  train.addEventListener('click', () => { state.made = state.made.filter(i => i !== item); renderChain(); save(); });
  train.hidden = state.goals.some(g => g.item === item);
  const row = stepBody(item, recipes, buildings, selection, choose, train);
  // Leaving by train too (ADR 0062): what its consumers leave, through a splitter or overflow
  // valve that gives them priority. (A Goal leaves anyway.)
  if (!state.goals.some(g => g.item === item)) row.querySelector('.selection').append(el('span', { textContent: 'Train' }), toggle(state.exports, item, 'Also leaves by train', `What the steps taking ${label(item).toLowerCase()} leave goes on to the train: through a splitter (an overflow valve for a fluid) that gives them priority`));
  // (Its fluids fed back: their spare off the overflow valve destroyed rather than by train.)
  for (const fluid of overflow.filter(f => catalog.voids?.[f])) {
    row.querySelector('.selection').append(el('span', { textContent: 'Spare' }), toggle(state.voids, fluid, `Destroy its spare ${label(fluid).toLowerCase()} in a ${voidName(fluid)}`, `What the overflow valve lets off goes to a ${voidName(fluid)} rather than the train`));
  }
  return row;
}

// The building destroying a fluid, in words: "sinkhole", "gas vent" (Py's, its prefix dropped).
// (Declared, not a const: the chain renders before this line runs where the saved state has fluids fed back.)
function voidName(fluid) {
  return label(catalog.voids[fluid]).toLowerCase().replace(/^py /, '');
}

// A checkbox putting `item` in the state's `list` or taking it out.
function toggle(list, item, text, title) {
  const box = el('input', { type: 'checkbox', checked: list.includes(item) });
  box.addEventListener('change', () => {
    const at = list.indexOf(item);
    if (box.checked && at < 0) list.push(item);
    if (!box.checked && at >= 0) list.splice(at, 1);
    renderChain();
    save();
  });
  return el('label', { className: 'hint', title }, box, ` ${text}`);
}

// A Byproduct Use: a step taking all of a byproduct, of a recipe that takes it — every step's
// making it (a General Use: `uses` without `from`), or one step's. Removing it removes the Uses of
// what it makes too.
function useRow({ goal, selection, use }, recipes, buildings) {
  const general = !!use.sources;
  const wanted = () => state.uses.find(u => (general ? (u.from == null || u.from === EVERY) && u.item === use.item
    : u.from != null && u.from !== EVERY && useKey(u.from, u.item) === use.key));
  const choose = changes => { Object.assign(wanted(), selection, changes); renderChain(); save(); };
  const under = u => u.from != null && (u.from === use.key || u.from.startsWith(`${use.key} > `));
  const remove = el('button', { type: 'button', className: 'swap', textContent: 'By train', title: `Send ${use.item} away by train instead` });
  remove.addEventListener('click', () => {
    state.uses = state.uses.filter(u => u !== wanted() && !under(u));
    renderChain();
    save();
  });
  const row = stepBody(goal.item, recipes, buildings, selection, choose, remove, `takes all the ${label(use.item).toLowerCase()} ${stepsNamed(use.sources ?? [use.from])} make${(use.sources ?? [use.from]).length > 1 ? '' : 's'}`);
  return row;
}

// The steps by their keys, as words: "the grade 3 ti and ti enriched dust steps" (a Use: "the ti
// rejects use").
function stepsNamed(keys) {
  const names = keys.map(k => {
    const entry = chain.entries.find(e => (e.use?.key ?? e.goal.item) === k);
    return entry?.use ? `${label(entry.use.item).toLowerCase()} use` : label(entry?.goal.item ?? k).toLowerCase();
  });
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return keys.every(k => !k.includes(' > ')) ? `the ${list} step${names.length > 1 ? 's' : ''}` : `the ${list}`;
}

// A byproduct leaving by train, whichever steps make it, with the recipes that could process it
// instead: a step of one takes all of it (a General Use).
function byproductRow({ item, type, recipes }) {
  const add = el('select', { ariaLabel: `Process ${item}` });
  // (Filling barrels and voiding last.)
  const aside = r => /barrel|void/.test(r);
  add.append(new Option('', ''), ...[...recipes].sort((a, b) => Number(aside(a)) - Number(aside(b))).map(r => new Option(r, r)));
  add.addEventListener('change', () => {
    if (!add.value) return;
    state.uses.push({ item, recipe: add.value });
    renderChain();
    save();
  });
  return el('div', { className: 'step byproduct' },
    el('div', { className: 'step-head' }, iconOf(item), el('span', { className: 'name', textContent: label(item), title: item }), el('span', { className: 'rate' })),
    el('div', { className: 'hint' }),
    el('div', { className: 'selection' }, el('span', { textContent: 'Process' }),
      pictured(add, { kind: 'recipes', title: `Process ${label(item)} in a recipe`, placeholder: recipes.length ? 'Add a step processing it…' : 'No recipe takes it' }),
      // (A fluid destroyed rather than leaving by train, ADR 0062: in the building the game has
      // for it.)
      ...(type === 'fluid' && catalog.voids?.[item] ? [el('span', { textContent: 'Destroy' }),
        toggle(state.voids, item, `In a ${voidName(item)}`, `Destroy ${label(item).toLowerCase()} in a ${voidName(item)} rather than sending it away by train`)] : [])));
}

function stepBody(item, recipes, buildings, selection, choose, button, hint = '') {
  const recipe = el('select', { ariaLabel: `Recipe for ${item}` });
  fillSelect(recipe, recipes, selection.recipe);
  const building = el('select', { ariaLabel: `Building for ${item}` });
  fillSelect(building, buildings, selection.building);
  // A new recipe or building starts from its own default modules.
  recipe.addEventListener('change', () => choose({ recipe: recipe.value, building: '', modules: undefined }));
  building.addEventListener('change', () => choose({ building: building.value, modules: undefined }));
  return el('div', { className: 'step' },
    el('div', { className: 'step-head' }, iconOf(item), el('span', { className: 'name', textContent: label(item), title: item }), el('span', { className: 'rate' }), button),
    el('div', { className: 'hint', textContent: hint, hidden: !hint }),
    el('div', { className: 'hint loop', hidden: true }),
    el('div', { className: 'selection' }, el('span', { textContent: 'Recipe' }), pictured(recipe, { kind: 'recipes', title: `Recipe for ${label(item)}` }),
      el('span', { textContent: 'Building' }), pictured(building, { title: `Building for ${label(item)}` }),
      ...(selection.modules ? [el('span', { textContent: 'Modules' }), modulesEditor(item, selection, choose)] : []),
      el('span', { textContent: 'Speed' }), el('span', { className: 'speed hint' })));
}

// A step's modules: a row per module type with its count, and a button to add another type while
// slots are free. Farms start full of their first plant (js/modules.js).
function modulesEditor(item, selection, choose) {
  const slots = catalog.buildings[selection.building].moduleSlots;
  const options = moduleOptions(catalog, selection.recipe, selection.building);
  const modules = selection.modules;
  const used = modules.reduce((sum, m) => sum + m.count, 0);
  const set = list => choose({ modules: list.filter(m => m.count > 0) });
  const rows = modules.map((m, i) => {
    const name = el('select', { ariaLabel: `Module for ${item}` });
    fillSelect(name, options, m.name);
    name.addEventListener('change', () => set(modules.map((x, j) => (j === i ? { ...x, name: name.value } : x))));
    const count = el('input', { type: 'number', min: '0', max: String(slots - used + m.count), step: '1', value: String(m.count), ariaLabel: `${m.name} modules for ${item}` });
    count.addEventListener('change', () => {
      const n = Math.max(0, Math.min(slots - used + m.count, Math.floor(Number(count.value) || 0)));
      set(modules.map((x, j) => (j === i ? { ...x, count: n } : x)));
    });
    const remove = el('button', { type: 'button', className: 'icon', textContent: '×', title: `Remove ${m.name}` });
    remove.addEventListener('click', () => set(modules.filter((_, j) => j !== i)));
    return el('div', { className: 'module' }, pictured(name, { title: `Module for ${label(item)}` }), count, remove);
  });
  const add = el('button', { type: 'button', className: 'swap', textContent: '+ Module' });
  add.addEventListener('click', () => set([...modules, { name: options[0], count: slots - used }]));
  add.hidden = used >= slots || !options.length;
  return el('div', { className: 'modules' }, ...rows,
    el('div', { className: 'module' }, el('span', { className: 'hint', textContent: `${used} of ${slots} slots` }), add));
}

function trainRow(input) {
  const make = el('button', { type: 'button', className: 'swap', textContent: 'Make here', title: `Make ${input.item} in the block` });
  make.addEventListener('click', () => { state.made.push(input.item); renderChain(); save(); });
  make.hidden = input.reason !== 'import';
  return el('div', { className: 'step train' },
    el('div', { className: 'step-head' }, iconOf(input.item), el('span', { className: 'name', textContent: label(input.item), title: input.item }), el('span', { className: 'rate' }), make),
    el('div', { className: 'hint', textContent: (input.topUp ? `makes up what the ${label(input.topUp).toLowerCase()} step gives back, through a top-up valve` : TRAIN_REASON[input.reason] ?? 'by train') + atTemperature(input.temperature) }));
}

// An item's icon from sprites/ (only its first mipmap is shown), or an empty square.
function iconOf(item) {
  const icon = el('span', { className: catalog.icons[item] ? 'sprite' : 'sprite none', title: item ? label(item) : '' });
  if (catalog.icons[item]) icon.style.backgroundImage = `url("sprites/${catalog.icons[item]}")`;
  // A leveled item's level, marked in Py's colours (red, blue, purple) where it is easy to see.
  const tier = catalog.tiers?.[item];
  if (tier) {
    icon.dataset.tier = String(tier);
    icon.title += ` · level ${tier}`;
  }
  return icon;
}

// A name as people read it: "iron-pulp-01" is "Iron pulp 01".
function label(name) {
  const words = String(name ?? '').replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// An icon with its amount in the corner, as the game shows a recipe's.
function amountIcon(name, amount) {
  const qty = amount >= 1000 ? `${Number((amount / 1000).toPrecision(2))}k` : String(Number(amount.toPrecision(3)));
  return el('span', { className: 'amount', title: `${qty} × ${label(name)}` }, iconOf(name), el('span', { className: 'qty', textContent: qty }));
}

// A recipe as pictures: its ingredients, an arrow, its products, and how long a craft takes.
function recipeFace(name) {
  const recipe = catalog.recipes[name];
  if (!recipe) return el('span', { className: 'recipe-face', textContent: label(name) });
  const side = list => el('span', { className: 'stack' }, ...list.map(x => amountIcon(x.name, x.amount)));
  return el('span', { className: 'recipe-face', title: label(name) }, side(recipe.ingredients), el('span', { className: 'arrow', textContent: '→' }), side(recipe.products),
    el('span', { className: 'time', textContent: `${speed(recipe.time)} s` }));
}

// A select shown as pictures (it stays the one the page reads and listens to): a few options with
// icons as toggle buttons, more (or `kind` 'recipes') as a button opening the chooser. Returns the
// element holding both, to stand where the select did.
function pictured(select, { kind = 'auto', title = '', placeholder = '' } = {}) {
  const values = [...select.options].map(o => o.value);
  const choices = values.filter(Boolean);
  const wrap = el('div', { className: 'pictured' }, select);
  const set = v => {
    select.value = v;
    select.dispatchEvent(new Event('change'));
  };
  let draw;
  if (kind === 'auto' && choices.length <= 8 && choices.every(v => catalog.icons[v])) {
    const buttons = choices.map(v => {
      const b = el('button', { type: 'button', className: 'toggle', title: label(v), ariaLabel: `${title}: ${label(v)}` }, iconOf(v));
      b.addEventListener('click', () => set(v));
      return b;
    });
    const name = el('span', { className: 'pick-name' });
    wrap.append(el('div', { className: 'toggles', role: 'group', ariaLabel: title }, ...buttons), name);
    draw = () => {
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(choices[i] === select.value)));
      name.textContent = label(select.value);
    };
  } else {
    const button = el('button', { type: 'button', className: 'pick', title, ariaLabel: title });
    button.addEventListener('click', () => openChooser({ title, groups: [{ name: '', icon: null, items: choices }], kind: kind === 'recipes' ? 'recipes' : 'grid', current: select.value, pick: set }));
    wrap.append(button);
    draw = () => {
      const face = !select.value ? [el('span', { className: 'pick-name placeholder', textContent: placeholder })]
        : kind === 'recipes' ? [recipeFace(select.value)] : [iconOf(select.value), el('span', { className: 'pick-name', textContent: label(select.value) })];
      button.replaceChildren(...face, el('span', { className: 'chev', textContent: '▾' }));
      // (Nothing to choose from: the button only shows the one there is.)
      button.disabled = !choices.length || (choices.length === 1 && choices[0] === select.value);
    };
  }
  select.addEventListener('change', draw);
  draw();
  return wrap;
}

// The chooser: a dialog of icons (or recipes) to pick one from, by tabs (the game's item groups)
// and a search over every tab.
let choosing = null;
function openChooser({ title, groups, kind = 'grid', current, pick }) {
  const tab = Math.max(0, groups.findIndex(g => g.items.includes(current)));
  choosing = { groups, kind, current, pick, tab };
  $('chooser-title').textContent = title;
  $('chooser-filter').value = '';
  $('chooser-tabs').hidden = groups.length < 2;
  $('chooser-tabs').replaceChildren(...groups.map((g, i) => {
    const b = el('button', { type: 'button', className: 'tab', role: 'tab', title: label(g.name), ariaLabel: label(g.name) },
      g.icon ? el('img', { src: `sprites/${g.icon}`, alt: '' }) : el('span', { textContent: label(g.name) }));
    b.addEventListener('click', () => {
      choosing.tab = i;
      $('chooser-filter').value = '';
      drawChooser();
    });
    return b;
  }));
  drawChooser();
  $('chooser').showModal();
  $('chooser-filter').focus();
}

const SHOWN = 800;
function drawChooser() {
  const { groups, kind, current, tab } = choosing;
  const words = $('chooser-filter').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  [...$('chooser-tabs').children].forEach((b, i) => b.setAttribute('aria-selected', String(!words.length && i === tab)));
  const names = words.length
    ? [...new Set(groups.flatMap(g => g.items))].filter(n => words.every(w => n.toLowerCase().includes(w) || label(n).toLowerCase().includes(w)))
    : groups[tab].items;
  const foot = $('chooser-foot');
  const tell = name => { foot.textContent = name ? `${label(name)} · ${name}` : ''; };
  const option = name => {
    const b = el('button', { type: 'button', className: kind === 'recipes' ? 'choice recipe' : 'choice', title: label(name), ariaLabel: label(name) },
      ...(kind === 'recipes' ? [el('span', { className: 'choice-name', textContent: label(name) }), recipeFace(name)] : [iconOf(name)]));
    b.setAttribute('aria-pressed', String(name === current));
    b.addEventListener('mouseenter', () => tell(name));
    b.addEventListener('focus', () => tell(name));
    b.addEventListener('click', () => {
      $('chooser').close();
      choosing.pick(name);
    });
    return b;
  };
  const shown = names.slice(0, SHOWN);
  $('chooser-list').replaceChildren(
    shown.length ? el('div', { className: kind === 'recipes' ? 'choices recipes' : 'choices' }, ...shown.map(option)) : el('p', { className: 'hint', textContent: 'Nothing matches.' }),
    ...(names.length > shown.length ? [el('p', { className: 'hint', textContent: `${names.length - shown.length} more: narrow the search.` })] : []));
  tell(current && names.includes(current) ? current : '');
}

// The map's empty state: what to do, or what the build is doing (`busy`).
function showEmpty(text, busy = false) {
  $('empty').hidden = false;
  $('empty').classList.toggle('busy', busy);
  $('empty-text').textContent = text;
}

// The City Block from its blueprint string (none without one), shown in its section. A build
// waits for the last read.
function readCity() {
  const text = state.city.blueprint;
  const mine = ++reading;
  cityRead = (async () => {
    let read = null;
    if (text) {
      try {
        const blueprint = await decodeBlueprint(text);
        read = { ...readCityBlock(blueprint, catalog), blueprint };
      } catch (e) {
        read = { error: e.message };
      }
    }
    if (mine !== reading) return;
    city = read;
    renderCity();
  })();
  return cityRead;
}

function renderCity() {
  $('city').hidden = !state.city.on;
  const fromBlueprint = Boolean(city && !city.error);
  $('city-w').disabled = $('city-h').disabled = fromBlueprint;
  $('city-w').value = String(fromBlueprint ? city.area.w : state.city.w);
  $('city-h').value = String(fromBlueprint ? city.area.h : state.city.h);
  let info = 'No blueprint: an empty block of this size.';
  if (city?.error) info = `Not read: ${city.error}.`;
  else if (city) {
    const counts = new Map();
    for (const f of city.fixtures) counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
    const most = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const list = most.slice(0, 6).map(([name, n]) => `${n} ${name}`).join(', ') + (most.length > 6 ? ', …' : '');
    info = `${city.area.w} × ${city.area.h} tiles; ${city.fixtures.length} entities stay${city.fixtures.length ? ` (${list})` : ''}.`
      + (city.unknown.length ? ` Size unknown, taken as one tile: ${city.unknown.join(', ')}.` : '');
  }
  $('city-info').textContent = info;
  $('calculate').textContent = state.city.on && state.city.maximize ? 'Find the highest rate' : 'Build factory block';
  renderForetell();
  refreshLibrary();
}

// The City Block's Site (from its blueprint, else its size), or why there is none.
function citySite() {
  try {
    return siteOf(city && !city.error ? city : { area: { x: 0, y: 0, w: state.city.w, h: state.city.h }, fixtures: [] }, state.city.buffer);
  } catch (e) {
    return { error: e.message };
  }
}

// The Foretelling (maximize.js planner), before any layout is searched: about how high a rate of
// the first Goal fits the City Block, and how much of its room the Goals' own rates take.
function renderForetell() {
  const text = state.city.on ? foretellLine() : null;
  $('city-foretell').hidden = !text;
  $('city-foretell').textContent = text ?? '';
}

// Whether the Goals' own rates are foretold not to fit the City Block.
function foretoldShort() {
  const goals = state.goals.filter(g => g.item && g.rate > 0);
  try {
    const plan = planner(goals, catalog, logisticsOf(), { made: state.made, selections: state.selections, uses: state.uses, exports: state.exports, voids: state.voids, index, site: citySite() });
    return plan.foretold().machines < plan.wanted;
  } catch {
    return false;
  }
}

function foretellLine() {
  const goals = state.goals.filter(g => g.item && g.rate > 0);
  const site = goals.length && chain && !chain.error && !city?.error ? citySite() : null;
  if (!site || site.error) return null;
  let plan;
  try {
    plan = planner(goals, catalog, logisticsOf(), { made: state.made, selections: state.selections, uses: state.uses, exports: state.exports, voids: state.voids, index, site });
  } catch {
    return null;
  }
  const { machines, rate } = plan.foretold();
  const item = goals[0].item;
  const fits = machines ? `about ${fmt(rate)}/min of ${item} fits (${count(machines, 'machine')})` : `not one machine of ${item} fits`;
  // The Goals' own rates: the tiles their Sub-Blocks span, and the square block (with its
  // Buffer) whose room that fills as full as a layout fills it.
  const need = plan.span(plan.asked);
  const side = Math.ceil(Math.sqrt(need / 0.85)) + 2 * state.city.buffer;
  return `Foretelling: ${fits}. ${fmt(goals[0].rate)}/min needs about ${need.toLocaleString('en')} tiles of its ${plan.room.toLocaleString('en')}`
    + ` (a block of about ${side} × ${side})${need > plan.room ? ' — more than it has' : ''}.`;
}

// The logistics settings the search takes (all but the search time).
function logisticsOf() {
  const { budget, ...logistics } = state.logistics;
  return logistics;
}

function count(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

// Starts the layout search in a worker. Every better layout it finds replaces the map and the
// blueprint; Stop, or the end of the budget, keeps the best one found. In a City Block it builds
// inside it, or (Maximize) looks for the highest rate that fits. Goals a City Block is foretold
// not to fit, or that a build fits nowhere in it, fill it up to their rates instead (`upTo`: a
// Maximize no higher than them, Annexes in the room it leaves).
async function build(upTo = false) {
  if (!chain) return showStatus('error', 'Add at least one goal.');
  if (chain.error) return showStatus('error', chain.error);
  let site = null;
  if (state.city.on) {
    await cityRead;
    if (city?.error) return showStatus('error', `The city block's blueprint was not read: ${city.error}.`);
    site = citySite();
    if (site.error) return showStatus('error', site.error);
  }
  for (const w of workers) w.worker.terminate();
  workers = [];
  best = null;
  stopMoving();
  undo = [];
  $('undo').hidden = true;
  $('compact').hidden = true;
  upTo = Boolean(site && !state.city.maximize && (upTo || foretoldShort()));
  built = { site, blueprint: site && city ? city.blueprint : null, maximize: Boolean(site && (state.city.maximize || upTo)), upTo, trying: null, foretold: null, job: null, designs: null };
  map?.destroy();
  map = null;
  clocks = null;
  $('area').hidden = true;
  $('results').hidden = true;
  $('apply-row').hidden = true;
  $('bp-string').value = $('bp-json').value = '';
  showEmpty('Searching for a layout…', true);
  showStatus('', 'Searching…');
  $('stop').hidden = false;
  const goals = state.goals.filter(g => g.item && g.rate > 0);
  const started = Date.now();
  const job = { entries: chain.entries, logistics: logisticsOf(), seed: 1, site };
  // (The user's moves lay the block out again for the chain it was built for.)
  built.job = job;
  // A build first designs each Sub-Block on its own, every one in a worker of its own at once;
  // the strategies then start from those designs.
  let designs = null;
  if (!built.maximize) {
    const ticket = built;
    showEmpty(`Designing ${count(chain.entries.length, 'Sub-Block')}…`, true);
    try {
      designs = await designEach(job, ticket);
    } catch (e) {
      if (built !== ticket) return;
      return finish('Stopped', 0, e.message);
    }
    if (built !== ticket || !designs) return;
    // (A reshape tries a Sub-Block's other designs.)
    built.designs = designs;
    showEmpty('Searching for a layout…', true);
  }
  // A Maximize tries one rate after another in one worker; a build runs every strategy at once,
  // the best layout any of them finds shown (the others go on until the budget is spent).
  for (const strategy of built.maximize ? ['search'] : STRATEGIES) {
    const run = { worker: new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), tried: 0, done: false };
    workers.push(run);
    const tried = () => workers.reduce((sum, w) => sum + w.tried, 0);
    const over = (failure, above) => {
      run.done = true;
      run.worker.terminate();
      if (workers.every(w => w.done)) finish('Done', tried(), failure, above);
    };
    run.worker.onmessage = ({ data }) => {
      if (data.type === 'foretell') built.foretold = data;
      else if (data.type === 'try') trying(data);
      else if (data.type === 'best') {
        run.tried = data.tried;
        // A Maximize's every fit is a higher rate than the last: shown whatever its score.
        if (data.goals || !best || better(data.score, best.score)) show(data.block, tried(), data.goals ? { rate: data.rate, machines: data.machines, goals: data.goals, delivered: data.delivered } : null, data.score);
      } else if (data.type === 'done') {
        run.tried = data.tried;
        over(data.failure, data.above);
      } else over(data.message);
    };
    run.worker.onerror = e => over(e.message);
    run.worker.postMessage({
      ...job, strategy, designs,
      // The search time counts from the start, designing included (each strategy tries a layout
      // however little is left).
      budgetMs: Math.max(1, state.logistics.budget * 1000 - (Date.now() - started)),
      ...(built.maximize ? { maximize: { goals, made: state.made, selections: state.selections, uses: state.uses, exports: state.exports, voids: state.voids, upTo } } : {}),
    });
  }
}

// Each Sub-Block designed in a worker of its own, all at once: their candidates, by Sub-Block.
// Null once the build was stopped or started again (`ticket` no longer the build running).
function designEach(job, ticket) {
  return new Promise((resolve, reject) => {
    const lists = [];
    let left = job.entries.length;
    job.entries.forEach((_, index) => {
      const run = { worker: new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), tried: 0, done: false };
      workers.push(run);
      const end = () => {
        run.done = true;
        run.worker.terminate();
        workers = workers.filter(w => w !== run);
      };
      run.worker.onmessage = ({ data }) => {
        end();
        if (built !== ticket) return resolve(null);
        if (data.type !== 'designed') return reject(new Error(data.message));
        lists[data.index] = data.list;
        if (--left === 0) resolve(lists);
      };
      run.worker.onerror = e => {
        end();
        reject(new Error(e.message));
      };
      run.worker.postMessage({ ...job, design: index });
    });
  });
}

// Scores compare part by part (Starvation first): whether a beats b.
function better(a, b) {
  if (!b) return true;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

// Maximize: the rate being tried, after the highest that fits so far (Filling: how many machines
// more than that; Giving Way: how many machines before the Fixtures take some).
function trying({ rate, machines, more, giving, starving, others = [] }) {
  const item = state.goals.find(g => g.item && g.rate > 0)?.item;
  const filling = more ? `, ${fmt(more)} more than fit` : '';
  // (Tries at once, ADR 0060: the machines of the others under way.)
  const also = others.length ? `; also ${others.join(', ')} at once` : '';
  built.trying = giving ? `Giving way: trying ${count(machines, 'machine')} of ${item} closer together, those the Fixtures stand on given up…`
    : starving ? `Trying ${fmt(rate)}/min of ${item} (${count(machines, 'machine')}), some starving, for more out…`
      : `${more ? 'Filling up: trying' : 'Trying'} ${fmt(rate)}/min of ${item} (${count(machines, 'machine')}${filling}${also})…`;
  if (best) report(best.block, simulate(best.block).starvation, progress());
  else showStatus('', progress());
}

// What the status line says while searching.
function progress() {
  if (!built?.maximize) return 'Searching…';
  const told = built.foretold ? ` Foretold: about ${fmt(built.foretold.rate)}/min.` : '';
  const fits = best?.found ? ` Fits so far: ${outOf(best.found)}.` : '';
  return `${built.trying ?? 'Searching…'}${told}${fits}`;
}

// view: where the map stands (as it did: the same block, or one the user moved a Sub-Block of),
// else it fits the block; selected: what it selects.
async function show(block, tried, found = null, rank = null, { view = null, selected = null } = {}) {
  const { starvation } = simulate(block);
  best = { block, tried, found, score: rank, starvation };
  inspect(null, block);
  const starving = new Set(starvation.map(s => s.subBlock).filter(sb => sb !== null));
  map?.destroy();
  closeMenu();
  $('empty').hidden = true;
  const circuit = state.logistics.circuit;
  map = createMap($('map'), block, {
    starving, onHover: describe, onSelect: inspect, icon: name => (catalog.icons[name] ? `sprites/${catalog.icons[name]}` : null),
    circuit: circuit === 'none' ? null : { colors: circuit === 'both' ? ['red', 'green'] : [circuit], pairs: circuitPairs(block.entities, catalog, block.site?.fixtures ?? []) },
    onMove: block.edit ? moveSubBlock : null, onContext: block.edit ? openMenu : null, view,
  });
  if (selected) {
    map.select(selected);
    inspect(selected, block);
  }
  $('compact').hidden = !block.edit;
  const { bounds, site } = block;
  // Compactness, as the search scores it: its parts, and the score.
  const score = compactness(block);
  const parts = `${site ? '' : `${score.square.toLocaleString('en')} off square · `}${score.empty.toLocaleString('en')} empty · ${count(score.bends, 'bend')} · score ${score.value.toLocaleString('en')}`;
  $('area').textContent = site
    ? `City block ${site.area.w} × ${site.area.h} · buffer ${site.buffer} · factory ${bounds.w} × ${bounds.h}${found ? ` · ${outOf(found)}` : ''} · ${parts}`
    : `${bounds.w} × ${bounds.h} = ${(bounds.w * bounds.h).toLocaleString('en')} tiles · ${parts}`;
  $('area').title = `Compactness, lower is better: ${SQUARE === 1 ? '' : `${SQUARE} × `}the strip beyond a square, plus the tiles no machine, inserter or pole stands on, plus ${BEND} for every bend of a belt or pipe`;
  $('area').hidden = false;
  report(block, starvation, workers.some(w => !w.done) ? progress() : null);
  // A Recipe Loop's feedback fed in the block is no Side Input.
  fillFlows($('side-input'), block.routes.filter(r => r.source === 'side-input' && !(r.loop && r.fedBy !== undefined)));
  fillFlows($('side-output'), block.routes.filter(r => r.sink === 'side-output'), block);
  clocks = clocksOf(block, catalog);
  renderClocks();
  await writeBlueprint(block);
  if (best?.block !== block) return;
  $('results').hidden = false;
}

// The user's move (ADR 0043): the shown block laid out again with a Sub-Block (its stack, or a
// machine stood apart: `inst`) `dx`, `dy` tiles off, everything else where it stands; where its
// links find no way, it goes a little further, else what stands in its way moves off.
function moveSubBlock(unit, dx, dy, turns = 0) {
  const sb = best?.block.subBlocks[unit.step];
  if (!sb) return map?.settle();
  if (turns) return turnSubBlock(unit.step, turns, dx, dy);
  const name = `${label(sb.item)}${unit.inst !== undefined ? ' (a machine apart)' : ''}`;
  relayout({ move: { ...unit, dx, dy } }, unit.step, {
    busy: `Moving ${name} ${where(dx, dy)}: laying its belts, pipes and poles again…`,
    trying: data => `Moving ${name}: its links find no way there yet; ${data.pushed.length ? 'moving what stands in its way' : 'trying close by'} (${count(data.tried, 'layout')} tried)…`,
    stuck: message => `${name} stays where it was: ${message}.`,
    done: data => {
      const further = data.at.dx !== dx || data.at.dy !== dy ? ` (${where(data.at.dx - dx, data.at.dy - dy)} past where it was put, to give its links room)` : '';
      return `Moved ${name} ${where(data.at.dx, data.at.dy)}${further}.`;
    },
  });
}

// The user's reshape (ADR 0044): the shown block laid out again with a Sub-Block squarer or longer
// (`way`), standing where it stood, everything else where it stands: its stack in other columns,
// or its machines in rows of other lengths, or another of its designs.
function reshapeSubBlock(step, way) {
  const sb = best?.block.subBlocks[step];
  if (!sb || moving) return;
  const name = label(sb.item);
  map?.place({ step }, 0, 0);
  relayout({ reshape: { step, way, list: built?.designs?.[step] ?? null } }, step, {
    busy: `Making ${name} ${way}: designing it again and laying its belts, pipes and poles…`,
    trying: data => `Making ${name} ${way}: trying its shapes and room for its links (${count(data.tried, 'layout')} tried)…`,
    stuck: message => `${name} keeps its shape: ${message}.`,
    done: data => {
      const moved = data.at.dx || data.at.dy ? ` It moved ${where(data.at.dx, data.at.dy)} to give its links room.` : '';
      const columns = data.shape.columns > 1 ? ` in ${data.shape.columns} columns` : '';
      return `${name} stands ${way} now: ${data.shape.w} × ${data.shape.h} tiles${columns} (was ${data.was.w} × ${data.was.h}).${moved}`;
    },
  });
}

// The user's turn (ADR 0045): the shown block laid out again with a Sub-Block's stack turned
// `turns` quarter turns clockwise (and `dx`, `dy` tiles off: turned while dragged), standing where
// it stood, everything else where it stands.
function turnSubBlock(step, turns, dx = 0, dy = 0) {
  const sb = best?.block.subBlocks[step];
  if (!sb) return map?.settle();
  const name = label(sb.item);
  const how = `${turns === 3 ? 'a quarter anticlockwise' : turns === 2 ? 'half round' : 'a quarter clockwise'}${dx || dy ? ` and ${where(dx, dy)}` : ''}`;
  if (!dx && !dy) map?.place({ step }, 0, 0, turns);
  relayout({ turn: { step, turns, dx, dy } }, step, {
    busy: `Turning ${name} ${how}: laying its belts, pipes and poles again…`,
    trying: data => `Turning ${name}: its links find no way there yet; ${data.pushed.length ? 'moving what stands in its way' : 'trying close by'} (${count(data.tried, 'layout')} tried)…`,
    stuck: message => `${name} stays as it was: ${message}.`,
    done: data => {
      const off = where(data.at.dx - dx, data.at.dy - dy);
      const moved = data.at.dx !== dx || data.at.dy !== dy ? ` (${dx || dy ? `${off} past where it was put` : `moved ${off}`}, to give its links room)` : '';
      return `Turned ${name} ${how}${moved}.`;
    },
  });
}

// Pulling the shown block together (ADR 0045): every Sub-Block as it is, slid toward the block's
// middle as far as its links still find their way and the block gets no worse; each slide kept
// shown as it comes. Again (the button reads Stop) stops it, keeping what it pulled so far.
function compactBlock() {
  if (pulling) {
    stopMoving();
    return;
  }
  const before = best;
  if (!before?.block.edit || !built?.job) return;
  if (workers.length) finish('Stopped');
  stopMoving();
  const run = { worker: new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }) };
  moving = run;
  pulling = { run, before, slid: 0 };
  $('compact').textContent = 'Stop pulling';
  const was = before.block.bounds;
  showStatus('', 'Pulling the Sub-Blocks together…');
  const over = () => {
    run.worker.terminate();
    if (moving === run) moving = null;
    if (pulling?.run === run) pulling = null;
    $('compact').textContent = 'Pull together';
  };
  run.worker.onmessage = async ({ data }) => {
    if (moving !== run) return;
    if (data.type === 'trying') {
      if (data.tried > 1) showStatus('', `Pulling the Sub-Blocks together: ${count(pulling.slid, 'slide')} kept (${count(data.tried, 'layout')} tried)…`);
      return;
    }
    if (data.type === 'better') {
      // (The first kept: Undo goes back to the block before.)
      if (!pulling.slid) {
        undo = [...undo, before].slice(-UNDOS);
        $('undo').hidden = false;
      }
      pulling.slid = data.slid;
      await show(data.block, before.tried, before.found, data.score, { view: map?.viewport() });
      if (moving === run) showStatus('', `Pulling the Sub-Blocks together: ${count(data.slid, 'slide')} kept…`);
      return;
    }
    const slid = pulling.slid;
    over();
    if (data.type !== 'moved') return showStatus('error', `The Sub-Blocks stay where they are: ${(data.message ?? 'no way found to route their links').replace(/\.$/, '')}.`);
    if (!slid) return report(best.block, best.starvation, 'Already as close together as their links allow.');
    const { w, h } = best.block.bounds;
    report(best.block, best.starvation, `Pulled together: ${count(slid, 'slide')}, ${was.w} × ${was.h} → ${w} × ${h} tiles.${data.back ? ` (It opened up by ${count(data.back, 'tile')} first, to lay its belts again.)` : ''}`);
  };
  run.worker.onerror = e => {
    over();
    showStatus('error', `The Sub-Blocks stay where they are: ${e.message}.`);
  };
  const { logistics, site } = built.job;
  run.worker.postMessage({
    entries: before.block.edit.entries ?? built.job.entries, logistics, site, seed: 1, budgetMs: Math.max(10, state.logistics.budget) * 1000,
    compact: { edit: before.block.edit, score: rankOf(before.block) },
  });
}

// A move or reshape laid out in a worker of its own (`request`: what the worker is asked, besides
// the shown block's edit and rank); `step` is selected once done. A search still running stops:
// its layouts would replace this one. texts: what the status says while busy, while trying
// again (data: the worker's 'trying'), where none is found (the reason), and once done (data:
// its 'moved'), what was pushed and how far the block opened up after.
function relayout(request, step, texts) {
  const before = best;
  if (!before?.block.edit || !built?.job) return map?.settle();
  if (workers.length) finish('Stopped');
  stopMoving();
  const run = { worker: new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }) };
  moving = run;
  showStatus('', texts.busy);
  const over = () => {
    run.worker.terminate();
    if (moving === run) moving = null;
  };
  const stuck = message => {
    over();
    map?.settle();
    showStatus('error', texts.stuck(message.replace(/\.$/, '')));
  };
  run.worker.onmessage = async ({ data }) => {
    if (moving !== run) return;
    if (data.type === 'trying') {
      if (data.tried) showStatus('', texts.trying(data));
      return;
    }
    if (data.type !== 'moved') return stuck(data.message ?? 'no way found to route its links there');
    over();
    // (The last UNDOS layouts: each holds its modules.)
    undo = [...undo, before].slice(-UNDOS);
    $('undo').hidden = false;
    await show(data.block, before.tried, before.found, data.score, { view: map?.viewport(), selected: { subBlock: step } });
    const pushed = data.pushed.map(p => `${label(best.block.subBlocks[p.step].item)}${p.inst !== undefined ? ' (a machine apart)' : ''} ${where(p.dx, p.dy)}`);
    const others = pushed.length ? ` To make room, moved ${pushed.join(', ')}.` : '';
    const opened = data.back ? ` The block opened up by ${count(data.back, 'tile')} to lay its belts again.` : '';
    // (Kept though it starves more: no layout there that does not; Undo takes it back.)
    const worse = data.score[0] > rankOf(before.block)[0] + 1e-6 ? ' It starves more than before (no layout there starves less): Undo takes it back.' : '';
    // (Kept though a byproduct rides on through its consumers now: no splitter sorting it out
    // finds a way there.)
    const sorted = b => new Set(b.routes.filter(r => r.filter).map(r => r.filter));
    const left = sorted(best.block), rode = [...sorted(before.block)].filter(item => !left.has(item)).map(item => label(item));
    const riding = data.score[2] > rankOf(before.block)[2] ? ` ${rode.length ? rode.join(', ') : 'A byproduct'} ${rode.length > 1 ? 'ride' : 'rides'} on through ${rode.length > 1 ? 'their' : 'its'} consumers now: no splitter sorting ${rode.length > 1 ? 'them' : 'it'} out finds a way there. Undo takes it back.` : '';
    report(best.block, best.starvation, `${texts.done(data)}${others}${opened}${worse}${riding}`);
  };
  run.worker.onerror = e => stuck(e.message);
  const { logistics, site } = built.job;
  const [kind] = Object.keys(request);
  // (A move looks a few seconds at least; a turn or reshape, which may design and try more, ten.)
  run.worker.postMessage({
    entries: before.block.edit.entries ?? built.job.entries, logistics, site, seed: 1, budgetMs: Math.max(kind === 'move' ? 5 : 10, state.logistics.budget) * 1000,
    [kind]: { ...request[kind], edit: before.block.edit, score: rankOf(before.block) },
  });
}

// The layout before the last move, shown again (where the map stands).
function undoMove() {
  const prev = undo.pop();
  if (!prev) return;
  stopMoving();
  $('undo').hidden = !undo.length;
  show(prev.block, prev.tried, prev.found, prev.score, { view: map?.viewport() });
  report(prev.block, prev.starvation, 'Move undone.');
}

function stopMoving() {
  if (!moving) return;
  moving.worker.terminate();
  moving = null;
  map?.settle();
  if (pulling) {
    // (Pulling stopped: what it pulled so far stays.)
    const { slid } = pulling;
    pulling = null;
    $('compact').textContent = 'Pull together';
    if (best) report(best.block, best.starvation, slid ? `Pulled together: ${count(slid, 'slide')}, stopped.` : 'Pulling together stopped.');
  }
}

// How far a move goes: "3 tiles east, 2 south".
function where(dx, dy) {
  const parts = [];
  if (dx) parts.push(`${Math.abs(dx)} ${dx > 0 ? 'east' : 'west'}`);
  if (dy) parts.push(`${Math.abs(dy)} ${dy > 0 ? 'south' : 'north'}`);
  if (!parts.length) return 'where it was';
  parts[0] = parts[0].replace(/^(\d+) /, (_, n) => `${n} ${n === '1' ? 'tile' : 'tiles'} `);
  return parts.join(', ');
}

// The shown block's blueprint, with its Circuit Wires and the signals its inserters' clocks take.
async function writeBlueprint(block) {
  const mine = ++encoding;
  const { string, json } = await encodeBlueprint(block, catalog, built?.blueprint ?? null, { circuit: state.logistics.circuit, signals: state.clocks });
  if (mine !== encoding || best?.block !== block) return;
  $('bp-string').value = string;
  $('bp-json').value = JSON.stringify(JSON.parse(json), null, 2);
  refreshLibrary();
}

// Every clock of the shown block (fastest first): its signal (a button opening the picker), what
// it moves, the items its inserters move and how many run on it.
function renderClocks() {
  const ratios = clocks?.ratios ?? [];
  $('clocks-box').hidden = !ratios.length;
  $('clocks').replaceChildren(...ratios.map(r => {
    const signal = state.clocks[r.key];
    const label = clockLabel(r.key);
    const pick = el('button', {
      type: 'button', className: signal ? 'signal' : 'signal unset', title: signal ? `${signal.name} > 0` : 'Pick a signal',
      ariaLabel: `Signal for ${label}: ${signal?.name ?? 'none'}`,
    }, signal ? signalFace(signal) : el('span', { className: 'glyph', textContent: '+' }));
    pick.addEventListener('click', () => openPicker(r.key));
    return el('li', { title: `${fmt(r.items / r.seconds * 60)}/min each: ${r.names.join(', ')}` },
      pick, el('span', { className: 'label', textContent: label }), el('span', { className: 'what' }, ...r.names.map(iconOf)),
      el('span', { className: 'count', textContent: count(r.inserters, 'inserter') }));
  }));
  // Without Circuit Wires the signals reach no inserter until it is wired.
  $('clocks-wires').hidden = state.logistics.circuit !== 'none' || !ratios.some(r => state.clocks[r.key]);
}

// The signal picker: a modal of signal icons, virtual signals first, then the block's items and
// fluids, then every item and fluid the catalog's recipes name.
let blockSignals = null;
function openPicker(key) {
  picking = key;
  if (!blockSignals) {
    blockSignals = el('div', { className: 'signals' });
    const named = new Map();
    for (const r of Object.values(catalog.recipes)) for (const x of [...r.ingredients, ...r.products]) if (!named.has(x.name)) named.set(x.name, x.type);
    const all = [...named].sort((a, b) => a[0].localeCompare(b[0])).map(([name, type]) => ({ type, name }));
    $('picker-list').replaceChildren(
      el('h4', { textContent: 'Virtual signals' }), el('div', { className: 'signals' }, ...virtualSignals().map(signalTile)),
      el('h4', { textContent: 'In this block' }), blockSignals,
      el('h4', { textContent: 'All items and fluids' }), el('div', { className: 'signals' }, ...all.map(signalTile)));
  }
  // Each name once, where it first comes (a Map keeps its first key's place).
  const mine = new Map((best?.block.subBlocks ?? []).flatMap(sb => [...sb.outputs, ...sb.inputs])
    .map(f => [f.name, { type: f.type === 'fluid' ? 'fluid' : 'item', name: f.name }]));
  blockSignals.replaceChildren(...[...mine.values()].map(signalTile));
  const chosen = state.clocks[key];
  for (const tile of $('picker-list').querySelectorAll('button.signal')) {
    tile.setAttribute('aria-pressed', String(Boolean(chosen && tile.dataset.type === chosen.type && tile.dataset.name === chosen.name)));
  }
  $('picker-title').textContent = `Signal for ${clockLabel(key)}`;
  $('picker-none').disabled = !chosen;
  $('picker-filter').value = '';
  filterPicker();
  $('picker').showModal();
}

function signalTile(signal) {
  const tile = el('button', { type: 'button', className: 'signal', title: signal.name, ariaLabel: signal.name }, signalFace(signal));
  Object.assign(tile.dataset, { type: signal.type, name: signal.name });
  tile.addEventListener('click', () => choose(signal));
  return tile;
}

// A signal's icon: the catalog's, else a drawn glyph or swatch, else its name.
function signalFace(signal) {
  if (catalog.icons[signal.name]) return el('img', { src: `sprites/${catalog.icons[signal.name]}`, alt: '', loading: 'lazy' });
  const drawn = DRAWN.find(v => v.name === signal.name);
  if (drawn?.swatch) {
    const swatch = el('span', { className: 'swatch' });
    swatch.style.background = drawn.swatch;
    return swatch;
  }
  return el('span', drawn ? { className: 'glyph', textContent: drawn.glyph } : { className: 'glyph named', textContent: signal.name.replace(/^signal-/, '') });
}

// The virtual signals the picker offers: every one the catalog lists, else the drawn ones.
function virtualSignals() {
  return catalog.signals?.length ? catalog.signals.map(name => ({ type: 'virtual', name })) : DRAWN;
}

// Signals whose name holds the filter's words; a section with none left is hidden.
function filterPicker() {
  const words = $('picker-filter').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  for (const grid of $('picker-list').querySelectorAll('.signals')) {
    let shown = 0;
    for (const tile of grid.children) {
      tile.hidden = !words.every(w => tile.dataset.name.toLowerCase().includes(w));
      if (!tile.hidden) shown++;
    }
    grid.hidden = grid.previousElementSibling.hidden = !shown;
  }
}

// The picked clock takes this signal (null: none, its inserters run freely).
function choose(signal) {
  if (signal) state.clocks[picking] = { type: signal.type, name: signal.name };
  else delete state.clocks[picking];
  save();
  $('picker').close();
  renderClocks();
  if (best) writeBlueprint(best.block);
}

function finish(how, tried = workers.reduce((sum, w) => sum + w.tried, 0) || (best?.tried ?? 0), error = null, above = null) {
  for (const w of workers) w.worker.terminate();
  workers = [];
  $('stop').hidden = true;
  if (built?.maximize) {
    $('apply-row').hidden = !best?.found;
    if (!best?.found) {
      $('results').hidden = true;
      showEmpty('Nothing fits yet.');
      return showStatus('error', `Nothing fits the city block${error ? `: ${error}` : ''}. Give each try more time, or a bigger block.`);
    }
    const { rate, machines } = best.found;
    // Why the next rate up does not fit: the lowest that did not.
    const next = above?.reason ? ` ${fmt(above.rate)}/min does not fit: ${above.reason.replace(/\.$/, '')}.` : '';
    const asked = state.goals.find(g => g.item && g.rate > 0)?.rate;
    if (built.upTo) {
      // (Rates rounded down to 1/100 a minute, each Annex's too.)
      const short = rate + 0.05 < asked;
      $('apply-row').hidden = !short;
      const rest = short ? ` of the ${fmt(asked)}/min asked.${next}` : '.';
      return report(best.block, simulate(best.block).starvation, `${how} after ${tried} layouts. Filled up to ${fmt(rate)}/min (${count(machines, 'machine')})${rest}`);
    }
    if (best.found.delivered !== undefined) return report(best.block, simulate(best.block).starvation, `${how} after ${tried} layouts. Highest output: ${outOf(best.found)} (${count(machines, 'machine')}; some starve, each as much slower).${next}`);
    return report(best.block, simulate(best.block).starvation, `${how} after ${tried} layouts. Highest rate that fits: ${fmt(rate)}/min (${count(machines, 'machine')}).${next}`);
  }
  if (!best) {
    $('results').hidden = true;
    showEmpty('No layout yet.');
    // (Nothing fits at the Goals' own rates: filled up to them instead.)
    if (built?.site && how === 'Done') return build(true);
    if (built?.site) {
      showEmpty('Nothing fits yet.');
      return showStatus('error', `Nothing fits the city block${error ? `: ${error}` : ''}. ${foretellLine() ?? ''} Maximize finds the highest rate that fits.`);
    }
    return showStatus('error', error ?? 'No layout found. Give the search more time.');
  }
  report(best.block, simulate(best.block).starvation, `${how} after ${tried} layouts.`);
}

// What a Maximize's layout makes of the first Goal: where it starves, what it delivers of what it
// was laid out for (ADR 0057).
function outOf({ rate, delivered }) {
  return delivered === undefined ? `${fmt(rate)}/min` : `${fmt(delivered)}/min (laid out for ${fmt(rate)}/min)`;
}

// Maximize: the Goals take the rates of the highest that fit.
function applyRate() {
  const goals = best?.found?.goals;
  if (!goals) return;
  for (const g of state.goals) g.rate = goals.find(x => x.item === g.item)?.rate ?? g.rate;
  $('apply-row').hidden = true;
  renderGoals();
  save();
}

function report(block, starvation, prefix) {
  const machines = block.entities.filter(e => e.kind === 'building').length;
  const size = `${machines} machines, ${block.bounds.w}×${block.bounds.h} tiles.`;
  const head = prefix ? `${prefix} Best: ${size}` : size;
  if (starvation.length) {
    const who = s => (s.subBlock === null ? 'Side Output' : block.subBlocks[s.subBlock].item);
    const why = s => (s.cause === 'inserters' ? ' (inserters too slow)' : '');
    const lines = starvation.map(s => `${who(s)} gets ${fmt(s.available)} of ${fmt(s.demand)} ${s.item}/min${why(s)}`);
    showStatus('warn', `${head}\nStarvation:\n• ${lines.join('\n• ')}`);
  } else {
    showStatus('ok', `${head} No starvation.`);
  }
  $('status').style.whiteSpace = 'pre-line';
}

// One line per item and kind, with how many parallel belts carry it when a route was split.
function fillFlows(list, routes, block) {
  const lines = new Map();
  const takes = (r, item) => r.consumers.reduce((sum, c) => sum + (block.subBlocks[c].inputs.find(x => x.name === item)?.rate ?? 0) * (r.share?.[c] ?? 1), 0);
  for (const r of routes) {
    for (const i of r.items) {
      // Leftover on an output route is what the consumers along it do not take (their share of
      // it, when the route is one of several parallel belts), and what a Recipe Loop's feedback
      // tapped off it takes back.
      const taken = block ? takes(r, i.item) + (r.taps ?? []).reduce((sum, id) => sum + takes(block.routes[id], i.item), 0) : 0;
      const k = `${i.item} (${r.kind})`;
      const line = lines.get(k) ?? { item: i.item, kind: r.kind, rate: 0, belts: 0 };
      line.rate += block ? Math.max(0, i.rate - taken) : i.rate;
      // A Fan-out's belts count once: the belt from the west edge.
      if (r.fedBy === undefined) line.belts++;
      lines.set(k, line);
    }
  }
  // An item nothing of leaves (a product all taken along the way) is no line.
  list.replaceChildren(...[...lines.values()].filter(({ rate }) => !block || rate >= 0.05).map(({ item, kind, rate, belts }) => el('li', {},
    iconOf(item), el('span', { className: 'what', title: item }, label(item), el('span', { className: 'kind', textContent: belts > 1 ? `${kind} ×${belts}` : kind })),
    el('span', { className: 'per', textContent: `${fmt(rate)}/min` }))));
}

function describe(entity, block) {
  const tip = $('tooltip');
  if (!entity) return (tip.textContent = '');
  const parts = [entity.name];
  if (entity.recipe) parts.push(`recipe: ${entity.recipe}`);
  if (entity.fluid) parts.push(`fluid: ${entity.fluid}`);
  if (entity.route !== undefined && !entity.fluid) {
    parts.push(`carries: ${block.routes[entity.route].items.map(i => i.item).join(' + ')}`);
  }
  if (entity.underground) parts.push(`tunnel ${entity.underground === 'input' ? 'entrance' : 'exit'}`);
  if (entity.vectors) parts.push(turnsSideways(entity) ? '90° (Inserter_Config)' : 'drop offset (Inserter_Config)');
  // Output Drop: the machine puts its products on the belt beside it, its inserters (if any)
  // take what that lane cannot.
  if (entity.drop) {
    const tile = `${Math.floor(entity.x + entity.drop.x)},${Math.floor(entity.y + entity.drop.y)}`;
    const belt = block.entities.some(e => (e.kind === 'belt' || e.kind === 'underground-belt') && `${e.x},${e.y}` === tile);
    parts.push(belt ? 'drops its products onto the belt beside it' : 'no belt at its drop: inserters take its products');
  }
  if (entity.dropping !== undefined) parts.push('supports its machine\'s drop');
  if (entity.kind === 'fixture') parts.push('city block (stays)');
  const clock = clocks?.of.get(entity);
  if (clock) parts.push(`clock: ${clockLabel(clock)}${state.clocks[clock] ? ` while ${state.clocks[clock].name} > 0` : ''}`);
  tip.textContent = parts.join(' · ');
}

// The Inspector: what a tap or click on the map selected, in detail — a machine's recipe and what
// it takes and makes, a belt's or pipe's items with how full they run and where they come from and
// go, an inserter's load, a Sub-Block's totals. Names of Sub-Blocks in it select them.
function inspect(hit, block) {
  const panel = $('inspector');
  if (!hit) {
    panel.hidden = true;
    return;
  }
  const { starvation } = best?.block === block && best.starvation ? best : { starvation: [] };
  const body = [];
  let head;
  const rate = n => `${fmtRate(n)}/min`;
  // A Sub-Block's name, which selects it.
  const sbLink = i => {
    const sb = block.subBlocks[i];
    if (!sb) return el('span', { textContent: `Sub-Block ${i}` });
    return el('button', {
      type: 'button', className: 'link', title: 'Show this Sub-Block',
      onclick: () => {
        map?.select({ subBlock: i });
        map?.show(sb);
        inspect({ subBlock: i }, block);
      },
    }, iconOf(sb.item), el('span', { textContent: `${label(sb.item)} ×${sb.count}` }));
  };
  const end = (at, west) => (typeof at === 'number' ? sbLink(at)
    : el('span', { className: 'train' }, iconOf('locomotive'), el('span', { textContent: `Train (${west ? 'west' : { up: 'north', down: 'south' }[state.logistics.output] ?? 'east'} edge)` })));
  const facts = rows => el('dl', { className: 'facts' }, ...rows.filter(Boolean).flatMap(([k, ...v]) => [el('dt', { textContent: k }), el('dd', {}, ...v)]));
  // A flow: its icon and name, its rate, and how full it runs of `capacity` (a bar).
  const flow = (name, n, capacity = null, note = '') => {
    const share = capacity ? Math.min(1, n / capacity) : null;
    return el('li', { className: 'flow' }, iconOf(name), el('span', { className: 'name', textContent: label(name) }),
      el('span', { className: 'num', textContent: `${rate(n)}${note}` }),
      ...(share === null ? [] : [el('span', { className: `bar${share > 0.98 ? ' full' : ''}`, title: `${Math.round(share * 100)}% of ${rate(capacity)}` }, el('i', { style: `width:${(share * 100).toFixed(1)}%` }))]));
  };
  const flows = (title, list) => (list.length ? [el('h4', { textContent: title }), el('ul', { className: 'flows' }, ...list)] : []);
  const short = i => starvation.filter(s => s.subBlock === i);
  const warn = list => (list.length ? [el('p', { className: 'warn' }, `Short: ${list.map(s => `${label(s.item)} ${fmtRate(s.available)} of ${rate(s.demand)}`).join(', ')}`)] : []);
  const sbBody = (sb, i, per = 1) => [
    ...(catalog.recipes[sb.recipe] ? [el('div', { className: 'recipe-line' }, recipeFace(sb.recipe))] : []),
    ...flows(per === 1 ? 'Takes' : 'Each machine takes', sb.inputs.map(x => flow(x.name, x.rate / per, null, x.fuel ? ' (fuel)' : ''))),
    ...flows(per === 1 ? 'Makes' : 'Each machine makes', sb.outputs.map(x => flow(x.name, x.rate / per))),
    ...(sb.modules?.length ? [el('h4', { textContent: 'Modules' }), el('div', { className: 'modules' }, ...sb.modules.map(m => amountIcon(m.name, m.count)))] : []),
    ...warn(short(i)),
  ];

  if (hit.subBlock !== undefined) {
    const i = hit.subBlock, sb = block.subBlocks[i];
    head = [sb.item, `${label(sb.item)} ×${sb.count}`, `Sub-Block · ${label(sb.building)}`];
    body.push(facts([
      ['Makes', rate(sb.rate)],
      ['Machines', `${sb.count}${sb.copies > 1 ? ` in ${sb.copies} copies` : ''}`],
      ['Runs at', `${Math.round(100 / (sb.headroom ?? 1))}% of full speed`],
      ['Takes up', `${sb.w} × ${sb.h} tiles`],
    ]), ...(block.edit ? [moveHint(i)] : []), ...sbBody(sb, i));
  } else {
    const e = hit.entity;
    const route = hit.route !== null && hit.route !== undefined ? block.routes[hit.route] : null;
    const sb = block.subBlocks[e.subBlock];
    switch (e.kind) {
      case 'building':
        head = [sb?.item ?? e.recipe, label(sb?.item ?? e.recipe), `${label(e.name)}${sb ? ` · machine ${e.machine + 1} of ${sb.count}` : ''}`];
        body.push(facts([sb && ['Sub-Block', sbLink(e.subBlock)], e.drop && ['Output', 'drops onto the belt beside it']]));
        if (sb) body.push(...sbBody(sb, e.subBlock, sb.count));
        break;
      case 'inserter': {
        const clock = clocks?.of.get(e);
        head = [e.name, label(e.name), e.role === 'output' ? 'Takes products out' : e.role === 'input' ? 'Puts ingredients in' : 'Inserter'];
        body.push(facts([
          sb && ['Machine', sbLink(e.subBlock)],
          e.flow !== undefined && ['Load', `${rate(e.flow)} of ${rate(e.rate)}`],
          e.vectors && ['Inserter_Config', turnsSideways(e) ? 'turns 90°' : 'drop offset'],
          clock && ['Clock', `${clockLabel(clock)}${state.clocks[clock] ? ` while ${state.clocks[clock].name} > 0` : ''}`],
        ]));
        if (e.moves?.length) body.push(el('h4', { textContent: 'Moves' }), el('div', { className: 'modules' }, ...e.moves.map(m => iconOf(m))));
        if (e.flow !== undefined && e.rate) body.push(el('span', { className: 'bar wide', title: `${Math.round(100 * e.flow / e.rate)}% busy` }, el('i', { style: `width:${Math.min(100, 100 * e.flow / e.rate).toFixed(1)}%` })));
        break;
      }
      case 'pipe':
      case 'pipe-to-ground':
        head = [e.fluid, label(e.fluid), `${label(e.name)}${e.underground ? ` · tunnel ${e.underground === 'input' ? 'entrance' : 'exit'}` : ''}`];
        if (route) {
          body.push(...flows('Carries', route.items.map(i => flow(i.item, i.rate))));
          body.push(facts([
            ['From', end(route.source, true)],
            ...route.consumers.map((c, k) => [k ? '' : 'To', sbLink(c)]),
            route.sink === 'side-output' && [route.consumers.length ? '' : 'To', end('side-output', false)],
          ]));
        }
        break;
      default:
        if (route && (e.kind === 'belt' || e.kind === 'underground-belt' || e.kind === 'splitter')) {
          head = [route.items[0]?.item ?? e.name, route.items.map(i => label(i.item)).join(' + '),
            `${label(e.name)}${e.underground ? ` · tunnel ${e.underground === 'input' ? 'entrance' : 'exit'}` : ''}`];
          // (A Supplied Item's belt side-loading onto it: what it brings, joined.)
          body.push(...flows('Carries', route.items.map(i => flow(i.item, i.rate, i.capacity, i.joined ? ` (${fmtRate(i.joined)} joins)` : ''))));
          const joined = route.joins !== undefined ? block.routes[route.joins] : null;
          body.push(facts([
            e.filter && ['Filter', iconOf(e.filter), el('span', { textContent: ` ${label(e.filter)} only` })],
            e.priority && ['Priority', `${e.priority} side`],
            route.loop && ['Feeds back', 'a byproduct to the step taking it'],
            ['From', route.fedBy !== undefined ? el('span', { textContent: 'a splitter on a belt of ' }, end(block.routes[route.fedBy]?.source, true)) : end(route.source, true)],
            ...route.consumers.map((c, k) => [k ? '' : 'To', sbLink(c)]),
            route.sink === 'side-output' && [route.consumers.length ? '' : 'To', end('side-output', false)],
            joined && !route.sink && ['Joins', el('span', { textContent: 'the belt of ' }, end(joined.source, true), ...(joined.consumers.length ? [el('span', { textContent: ' into ' }), sbLink(joined.consumers[0])] : []))],
          ]));
          break;
        }
        head = [e.name, label(e.name), e.kind === 'pole' ? 'Electric pole' : e.kind === 'fixture' ? 'Part of the city block: it stays' : label(e.kind)];
    }
  }
  const [icon, title, subtitle] = head;
  const art = iconOf(icon);
  art.classList.add('big');
  panel.replaceChildren(
    el('header', { className: 'inspector-head' }, art,
      el('div', { className: 'titles' }, el('h3', { textContent: title }), el('p', { textContent: subtitle })),
      el('button', { type: 'button', className: 'icon close', ariaLabel: 'Close', textContent: '×', onclick: () => { map?.select(null); inspect(null, block); } })),
    el('div', { className: 'inspector-body' }, ...body));
  panel.hidden = false;
  panel.scrollTop = 0;
  // (On a phone the panel is a sheet over the map's bottom: what it shows stays in sight above it.)
  const box = hit.entity ?? block.subBlocks[hit.subBlock];
  if (box && matchMedia('(max-width: 860px)').matches) map?.reveal(box, panel.getBoundingClientRect().height + 8);
}

// How a Sub-Block is moved (ADR 0043): dragged on the map, or a tile at a time; and made squarer
// or longer (ADR 0044).
function moveHint(step) {
  const nudge = (dx, dy) => {
    if (moving) return;
    map?.place({ step }, dx, dy);
    moveSubBlock({ step }, dx, dy);
  };
  const arrow = (text, name, dx, dy) => el('button', { type: 'button', className: 'icon nudge', textContent: text, ariaLabel: `Move it one tile ${name}`, title: `One tile ${name}`, onclick: () => nudge(dx, dy) });
  const sb = best?.block.subBlocks[step];
  const one = (sb?.count ?? 0) < 2;
  return el('div', { className: 'move-hint' },
    el('p', { className: 'hint' }, el('strong', { textContent: 'Drag it on the map to move it.' }),
      ' Its belts, pipes and poles are laid again; where they find no way, it goes a little further.'),
    el('div', { className: 'nudges', role: 'group', ariaLabel: 'Move it a tile' },
      el('span', { className: 'hint', textContent: 'A tile at a time' }),
      arrow('←', 'west', -1, 0), arrow('↑', 'north', 0, -1), arrow('↓', 'south', 0, 1), arrow('→', 'east', 1, 0)),
    el('div', { className: 'nudges', role: 'group', ariaLabel: 'Turn it' },
      el('span', { className: 'hint', textContent: 'Turn it (R while dragging)' }),
      el('button', { type: 'button', className: 'icon nudge', textContent: '↺', ariaLabel: 'Turn it a quarter anticlockwise', title: 'A quarter anticlockwise', onclick: () => turnSubBlock(step, 3) }),
      el('button', { type: 'button', className: 'icon nudge', textContent: '↻', ariaLabel: 'Turn it a quarter clockwise', title: 'A quarter clockwise', onclick: () => turnSubBlock(step, 1) })),
    el('div', { className: 'nudges', role: 'group', ariaLabel: 'Its shape' },
      el('span', { className: 'hint', textContent: one ? 'One machine: one shape' : 'Its shape' }),
      ...SHAPES.map(([way, text, title]) => el('button', { type: 'button', className: 'shape-button', disabled: one || (way === 'squarer' && square(sb)), title, onclick: () => reshapeSubBlock(step, way) },
        el('span', { className: `glyph ${way}`, ariaHidden: 'true' }), el('span', { textContent: text })))));
}

// Whether a Sub-Block's box is about square already (as squarer as a reshape makes it: edit.js).
const square = sb => Math.max(sb.w, sb.h) / Math.min(sb.w, sb.h) < 1.15;

// The ways a Sub-Block's shape changes (ADR 0044): its name, what it does.
const SHAPES = [
  ['squarer', 'Squarer', 'Its sides closer in length: its stack in more columns, or its machines in more, shorter rows'],
  ['longer', 'Longer', 'Stretched along its longer side: its stack in fewer columns, or its machines in fewer, longer rows'],
];

// A Sub-Block's menu on the map (a right click on it, at `at` on the page): squarer or longer.
function openMenu(unit, at) {
  const menu = $('map-menu');
  const sb = best?.block.subBlocks[unit.step];
  if (!sb) return;
  const one = sb.count < 2;
  menu.replaceChildren(
    el('div', { className: 'menu-head' }, iconOf(sb.item),
      el('div', { className: 'titles' }, el('strong', { textContent: `${label(sb.item)} ×${sb.count}` }), el('span', { textContent: `${sb.w} × ${sb.h} tiles` }))),
    ...SHAPES.map(([way, text, title]) => el('button', {
      type: 'button', role: 'menuitem', className: 'menu-item', disabled: one || !!moving || (way === 'squarer' && square(sb)), title,
      onclick: () => {
        closeMenu();
        reshapeSubBlock(unit.step, way);
      },
    }, el('span', { className: `glyph ${way}`, ariaHidden: 'true' }), el('span', { className: 'menu-text' }, el('strong', { textContent: text }), el('span', { textContent: title.split(':')[0] })))),
    ...(unit.inst === undefined ? [[1, '↻', 'Turn clockwise', 'a quarter turn, as R does while dragging'], [3, '↺', 'Turn anticlockwise', 'a quarter turn the other way']].map(([turns, glyph, text, hint]) => el('button', {
      type: 'button', role: 'menuitem', className: 'menu-item', disabled: !!moving,
      onclick: () => {
        closeMenu();
        turnSubBlock(unit.step, turns);
      },
    }, el('span', { className: 'glyph turn', ariaHidden: 'true', textContent: glyph }), el('span', { className: 'menu-text' }, el('strong', { textContent: text }), el('span', { textContent: hint })))) : []),
    el('p', { className: 'menu-note', textContent: one ? 'One machine: it has one shape. Drag it to move it.' : square(sb) ? 'About square already. Drag it to move it.' : 'Drag it to move it.' }));
  menu.hidden = false;
  // (Inside the map: flipped to the pointer's other side near its edges.)
  const room = /** @type {HTMLElement} */ (menu.parentElement).getBoundingClientRect();
  const { width, height } = menu.getBoundingClientRect();
  const x = at.x - room.left, y = at.y - room.top;
  menu.style.left = `${Math.max(8, x + width + 8 > room.width ? x - width : x)}px`;
  menu.style.top = `${Math.max(8, y + height + 8 > room.height ? y - height : y)}px`;
  /** @type {HTMLElement | null} */ (menu.querySelector('.menu-item:not(:disabled)'))?.focus();
}

function closeMenu() {
  $('map-menu').hidden = true;
}

function fmtRate(n) {
  return n >= 100 ? Math.round(n).toLocaleString('en') : String(Number(n.toPrecision(3)));
}

function showStatus(kind, text) {
  const status = $('status');
  status.className = kind ? `status ${kind}` : 'status';
  status.textContent = text;
}

// The setup to share when describing a problem (Copy setup): the page's saved state (Goals, the
// items made here, Recipe Selections, logistics, City Block), the Production Chain it gives, the
// catalog's fingerprint and what the last build said.
function setupText() {
  const round = n => Math.round(n * 100) / 100;
  const steps = chain?.entries?.map(({ goal, selection, use }) => ({ item: goal.item, rate: round(goal.rate), ...selection, ...(use ? { uses: use.key } : {}) }));
  const result = $('status').textContent ? {
    status: $('status').textContent,
    ...($('area').hidden ? {} : { map: $('area').textContent }),
    ...(best ? { subBlocks: best.block.subBlocks.map(sb => ({ item: sb.item, machines: sb.count, copies: sb.copies, box: `${sb.x},${sb.y} ${sb.w}×${sb.h}` })) } : {}),
  } : null;
  return JSON.stringify({
    catalog: catalogId, ...state,
    chain: chain?.error ? { error: chain.error } : chain && { steps, train: chain.trainInputs.map(t => ({ ...t, rate: round(t.rate) })), loops: chain.loops.map(l => ({ ...l, rate: round(l.rate) })) },
    ...(state.city.on && !$('city-foretell').hidden ? { foretold: $('city-foretell').textContent } : {}),
    result,
  }, null, 2);
}

// The Clipboard API is missing over plain http (a phone opening the page by the computer's address)
// and can be refused on iOS; the older copy of a selected text area works there.
async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    flash(button, 'Copied');
  } catch {
    flash(button, copySelected(text) ? 'Copied' : 'Copy failed — select the text instead');
  }
}

function copySelected(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.contentEditable = 'true';
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
  document.body.append(area);
  const range = document.createRange();
  range.selectNodeContents(area);
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  area.setSelectionRange(0, text.length);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* not supported */ }
  area.remove();
  selection?.removeAllRanges();
  return copied;
}

// Saved blueprints (library.js): kept in this browser, apart from the setup. The dialog shows one
// kind at a time, by folder (those `closed` folded), with what is being renamed (`editing`: an
// entry's name, or a folder) and the entry it was opened at (`found`).
const shelf = { kind: 'city', closed: new Set(), editing: null, found: null, menuFor: null, reopen: true };
// Each entry's picture, read once.
const thumbs = new Map();

function storageOf() {
  try { return localStorage; } catch { return null; }
}

// Keeps `entries` as the library; where storage refuses, the library stays as it was.
function keep(entries) {
  if (!writeLibrary(storageOf(), entries)) {
    tellLibrary('Not saved: this browser\'s storage is full or unavailable. Delete saved blueprints to make room.', true);
    return false;
  }
  library = entries;
  tellLibrary();
  refreshLibrary();
  return true;
}

function tellLibrary(text = '', error = false) {
  $('library-foot').textContent = text || 'Kept in this browser only. Copy a blueprint to keep it anywhere else.';
  $('library-foot').classList.toggle('error', error);
}

// Everything showing the library: its count, the Save buttons and their notes, the open dialog.
function refreshLibrary() {
  $('library-count').textContent = library.length ? String(library.length) : '';
  savedState('city', state.city.blueprint, $('city-save'), $('city-saved'));
  savedState('block', $('bp-string').value, $('bp-save'), $('bp-saved'));
  if ($('library').open) drawLibrary();
}

function savedEntry(kind, string) {
  const text = string.trim();
  return text ? library.find(e => e.kind === kind && e.string === text) ?? null : null;
}

// A Save button and its note: once saved, "✓ Saved" (showing it in the library) and the name.
function savedState(kind, string, button, note) {
  const entry = savedEntry(kind, string);
  button.disabled = !string.trim();
  button.classList.toggle('is-saved', Boolean(entry));
  button.textContent = entry ? '✓ Saved' : 'Save';
  button.title = entry ? `Saved as “${entry.name}”: show it in Saved blueprints` : `Keep this ${kind === 'city' ? 'city block' : 'factory block'} in Saved blueprints`;
  note.classList.remove('error');
  note.hidden = !entry;
  if (!entry) return;
  const rename = el('button', { type: 'button', className: 'link', textContent: 'Rename' });
  rename.addEventListener('click', () => openLibrary(kind, entry.id, true));
  note.replaceChildren('Saved as ', el('strong', { textContent: entry.name }), entry.folder ? ` in ${entry.folder}` : '', ' · ', rename);
}

// Saves `fields`, or shows where they are saved already.
function saveEntry(fields, note) {
  const kept = savedEntry(fields.kind, fields.string);
  if (kept) return openLibrary(fields.kind, kept.id);
  if (keep(addEntry(library, fields).entries)) return;
  note.hidden = false;
  note.classList.add('error');
  note.textContent = 'Not saved: this browser\'s storage is full or unavailable. Delete saved blueprints to make room.';
}

function saveCity() {
  const read = city && !city.error ? city : null;
  const size = read ? `${read.area.w} × ${read.area.h}` : '';
  saveEntry({
    kind: 'city', string: state.city.blueprint,
    name: read?.blueprint?.label || `City block${size ? ` ${size}` : ''}`,
    note: read ? `${size} tiles · ${read.fixtures.length} ${read.fixtures.length === 1 ? 'entity' : 'entities'}` : '',
  }, $('city-saved'));
}

function saveBlock() {
  const goals = state.goals.filter(g => g.item && g.rate > 0);
  const made = (best?.found?.goals ?? goals).map(g => `${label(g.item)} ${fmt(g.rate)}/min`).join(', ');
  const block = best?.block;
  const size = !block ? '' : block.site ? `${block.site.area.w} × ${block.site.area.h} city block` : `${block.bounds.w} × ${block.bounds.h} tiles`;
  const note = block ? [size, `${block.entities.length} entities`].join(' · ') : '';
  saveEntry({ kind: 'block', string: $('bp-string').value, name: made || 'Factory block', note }, $('bp-saved'));
}

// The library at `kind`, at entry `id` (its name being renamed, with `rename`).
function openLibrary(kind = shelf.kind, id = null, rename = false) {
  shelf.kind = kind;
  shelf.found = id;
  shelf.editing = id && rename ? { id } : null;
  const entry = library.find(e => e.id === id);
  if (entry) shelf.closed.delete(entry.folder);
  $('library-filter').value = '';
  tellLibrary();
  drawLibrary();
  if (!$('library').open) $('library').showModal();
  const row = id && $('library-list').querySelector(`[data-entry="${id}"]`);
  if (!row) return $('library-filter').focus();
  row.scrollIntoView({ block: 'nearest' });
  const field = row.querySelector('input');
  if (field) field.select();
  else row.querySelector('.kept-actions button')?.focus();
}

function drawLibrary() {
  closeShelfMenu();
  for (const tab of $('library-tabs').children) {
    const n = library.filter(e => e.kind === tab.dataset.kind).length;
    tab.setAttribute('aria-selected', String(tab.dataset.kind === shelf.kind));
    tab.querySelector('.badge').textContent = n ? String(n) : '';
  }
  const mine = library.filter(e => e.kind === shelf.kind);
  const query = $('library-filter').value;
  const groups = grouped(mine, query);
  if (!groups.length) return $('library-list').replaceChildren(emptyShelf(mine.length > 0));
  const foldered = groups.some(g => g.folder);
  $('library-list').replaceChildren(...groups.flatMap(({ folder, entries }) => {
    const list = el('ul', { className: 'kept' }, ...entries.map(shelfRow));
    if (!foldered) return [list];
    // (A search shows every folder open.)
    list.hidden = !query && shelf.closed.has(folder);
    return [folderHead(folder, entries.length, list), list];
  }));
}

function emptyShelf(searched) {
  const cities = shelf.kind === 'city';
  return el('div', { className: 'lib-empty' }, el('div', { className: 'thumb' }),
    el('strong', { textContent: searched ? 'Nothing matches' : cities ? 'No city blocks saved yet' : 'No factory blocks saved yet' }),
    el('p', { className: 'hint', textContent: searched ? 'Try another name or folder.' : cities ? 'Paste a city block’s blueprint under City block and press Save beside it.' : 'Build a factory block and press Save beside its blueprint.' }));
}

function folderHead(folder, n, list) {
  const head = el('div', { className: 'folder-head' });
  if (folder && shelf.editing?.folder === folder) {
    const field = el('input', { type: 'text', value: folder, ariaLabel: 'Folder name', title: 'A name another folder has puts the two together' });
    inlineEdit(field, value => keep(renameFolder(library, folder, value.trim() || folder)));
    head.append(field);
    return head;
  }
  const toggle = el('button', { type: 'button', className: 'folder-toggle' },
    el('span', { className: 'chev', textContent: '▸', ariaHidden: 'true' }), el('span', { className: 'folder-name', textContent: folder || 'No folder' }), el('span', { className: 'badge', textContent: String(n) }));
  toggle.setAttribute('aria-expanded', String(!list.hidden));
  toggle.addEventListener('click', () => {
    list.hidden = !list.hidden;
    toggle.setAttribute('aria-expanded', String(!list.hidden));
    if (list.hidden) shelf.closed.add(folder);
    else shelf.closed.delete(folder);
  });
  head.append(toggle);
  if (folder) {
    const rename = el('button', { type: 'button', className: 'icon', textContent: '✎', ariaLabel: `Rename folder ${folder}`, title: 'Rename the folder' });
    rename.addEventListener('click', () => {
      shelf.editing = { folder };
      drawLibrary();
      $('library-list').querySelector('.folder-head input')?.select();
    });
    head.append(rename);
  }
  return head;
}

// An inline field: Enter or leaving it keeps what it holds, Escape leaves things as they were.
function inlineEdit(field, done) {
  let over = false;
  const end = kept => {
    if (over) return;
    over = true;
    const was = shelf.editing;
    shelf.editing = null;
    if (!kept || !done(field.value)) drawLibrary();
    // (The focus goes back where the rename started.)
    const back = was?.id ? `[data-entry="${was.id}"] .more` : '.folder-toggle';
    /** @type {HTMLElement | null} */ ($('library-list').querySelector(back))?.focus();
  };
  field.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      end(true);
    } else if (e.key === 'Escape') {
      // (Escape leaves the field, not the dialog.)
      e.preventDefault();
      end(false);
    }
  });
  field.addEventListener('blur', () => end(true));
}

function shelfRow(entry) {
  const row = el('li', {});
  row.dataset.entry = entry.id;
  if (entry.id === shelf.found) row.classList.add('found');
  const thumb = el('canvas', { className: 'thumb', width: 128, height: 128 });
  thumb.setAttribute('aria-hidden', 'true');
  drawThumb(thumb, entry);
  let name;
  if (shelf.editing?.id === entry.id) {
    name = el('input', { type: 'text', value: entry.name, ariaLabel: 'Name' });
    inlineEdit(name, value => keep(editEntry(library, entry.id, { name: value })));
  } else {
    name = el('span', { className: 'kept-name', textContent: entry.name, title: `${entry.name} (double-click to rename)` });
    name.addEventListener('dblclick', () => renameEntry(entry));
  }
  const when = entry.saved ? new Date(entry.saved).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const meta = [entry.note, when].filter(Boolean).join(' · ');
  let main;
  if (entry.kind === 'city') {
    const using = state.city.on && state.city.blueprint === entry.string;
    main = el('button', { type: 'button', textContent: using ? 'In use' : 'Use', disabled: using, title: using ? 'The factory is built in this city block' : 'Build in this city block' });
    main.addEventListener('click', () => useCity(entry));
  } else {
    main = el('button', { type: 'button', textContent: 'Copy', title: 'Copy the blueprint string, to import it in the game' });
    main.addEventListener('click', () => copy(entry.string, main));
  }
  const more = el('button', { type: 'button', className: 'icon more', textContent: '⋯', ariaLabel: `More for ${entry.name}`, title: 'Rename, move to a folder, delete' });
  more.setAttribute('aria-haspopup', 'menu');
  more.addEventListener('click', () => {
    if (shelf.reopen) openShelfMenu(entry, more);
    shelf.reopen = true;
  });
  row.append(thumb, el('div', { className: 'kept-text' }, name, el('span', { className: 'kept-meta', textContent: meta, title: meta })), el('div', { className: 'kept-actions' }, main, more));
  return row;
}

function renameEntry(entry) {
  shelf.editing = { id: entry.id };
  drawLibrary();
  $('library-list').querySelector(`[data-entry="${entry.id}"] input`)?.select();
}

function useCity(entry) {
  $('library').close();
  state.city.on = $('city-on').checked = true;
  state.city.blueprint = $('city-bp').value = entry.string;
  save();
  readCity();
  $('city-title').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// An entry's menu, under its ⋯ button: rename, copy, move to a folder (`naming`: a new one), delete.
function openShelfMenu(entry, anchor, naming = false) {
  const menu = $('library-menu');
  const item = (text, act, className = '') => el('button', { type: 'button', role: 'menuitem', className: `menu-item ${className}`, onclick: act }, el('span', { className: 'menu-text' }, el('strong', { textContent: text })));
  const move = folder => {
    shelf.found = entry.id;
    shelf.closed.delete(folder);
    keep(editEntry(library, entry.id, { folder }));
    $('library-list').querySelector(`[data-entry="${entry.id}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  let items;
  if (naming) {
    const field = el('input', { type: 'text', placeholder: 'Folder name', ariaLabel: 'New folder name' });
    const go = el('button', { type: 'button', className: 'menu-go', textContent: 'Move' });
    const submit = () => { if (field.value.trim()) move(field.value.trim()); };
    go.addEventListener('click', submit);
    field.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    items = [el('p', { className: 'menu-label', textContent: `Move “${entry.name}” to a new folder` }), el('div', { className: 'menu-form' }, field, go)];
  } else {
    const remove = item('Delete', () => {
      if (!remove.classList.contains('sure')) {
        remove.classList.add('sure');
        /** @type {HTMLElement} */ (remove.querySelector('strong')).textContent = 'Delete — click again';
        return;
      }
      closeShelfMenu();
      keep(removeEntry(library, entry.id));
      $('library-filter').focus();
    }, 'danger');
    items = [
      item('Rename', () => renameEntry(entry)),
      ...(entry.kind === 'city' ? [item('Copy blueprint string', () => { closeShelfMenu(true); copy(entry.string, anchor); })] : []),
      el('div', { className: 'menu-sep' }),
      el('p', { className: 'menu-label', textContent: entry.folder ? `In ${entry.folder} · move to` : 'Move to folder' }),
      ...foldersOf(library).filter(f => f !== entry.folder).map(f => item(f, () => move(f))),
      ...(entry.folder ? [item('No folder', () => move(''))] : []),
      item('New folder…', () => openShelfMenu(entry, anchor, true)),
      el('div', { className: 'menu-sep' }),
      remove,
    ];
  }
  menu.replaceChildren(...items);
  menu.hidden = false;
  shelf.menuFor = anchor;
  // (Under the button, its right edge on the button's; above it where there is no room below.)
  const room = /** @type {HTMLElement} */ (menu.parentElement).getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const { width, height } = menu.getBoundingClientRect();
  const below = at.bottom - room.top + 4;
  menu.style.left = `${Math.max(8, at.right - room.left - width)}px`;
  menu.style.top = `${below + height > room.height - 8 ? Math.max(8, at.top - room.top - height - 4) : below}px`;
  /** @type {HTMLElement | null} */ (menu.querySelector('input, .menu-item'))?.focus();
}

// (`back`: the focus goes back to the ⋯ button.)
function closeShelfMenu(back = false) {
  if ($('library-menu').hidden) return;
  $('library-menu').hidden = true;
  if (back && shelf.menuFor?.isConnected) shelf.menuFor.focus();
}

// A blueprint's picture: what stands in it, coloured as on the map, fitted in the square.
const THUMB = { belt: '#a88b3c', pipe: '#4f7fa8', inserter: '#6f87a8', pole: '#c9a227' };
function drawThumb(canvas, entry) {
  if (!thumbs.has(entry.id)) thumbs.set(entry.id, decodeBlueprint(entry.string).then(bp => readCityBlock(bp, catalog)).catch(() => null));
  thumbs.get(entry.id).then(read => {
    if (!read) return;
    const ctx = canvas.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const color = name => css.getPropertyValue(name).trim();
    const size = canvas.width, pad = 8;
    const { area, fixtures } = read;
    const s = (size - pad * 2) / Math.max(area.w, area.h, 1);
    const ox = (size - area.w * s) / 2 - area.x * s, oy = (size - area.h * s) / 2 - area.y * s;
    ctx.fillStyle = color('--map-bg');
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = color('--border');
    ctx.strokeRect(ox + area.x * s + 0.5, oy + area.y * s + 0.5, area.w * s - 1, area.h * s - 1);
    for (const f of fixtures) {
      const x = ox + f.x * s, y = oy + f.y * s, w = f.w * s, h = f.h * s;
      const kind = /belt|splitter|loader/.test(f.name) ? 'belt' : /pipe/.test(f.name) ? 'pipe' : /inserter/.test(f.name) ? 'inserter'
        : catalog.poles?.[f.name] || /pole|substation/.test(f.name) ? 'pole' : null;
      // (Two pixels at least: a city block's poles show.)
      if (kind) {
        ctx.fillStyle = THUMB[kind];
        ctx.fillRect(x + w * 0.15, y + h * 0.15, Math.max(2, w * 0.7), Math.max(2, h * 0.7));
        continue;
      }
      ctx.fillStyle = color(Math.min(w, h) < 4 ? '--map-machine-edge' : '--map-machine');
      ctx.fillRect(x, y, Math.max(2, w), Math.max(2, h));
      if (Math.min(w, h) < 4) continue;
      ctx.strokeStyle = color('--map-machine-edge');
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  });
}

function flash(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = original; }, 1500);
}

function fillSelect(select, values, selected, label = v => v) {
  select.replaceChildren(...values.map(v => new Option(label(v), v, false, v === selected)));
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  if (props.ariaLabel) node.setAttribute('aria-label', props.ariaLabel);
  node.append(...children);
  return node;
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function speed(n) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(3)));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved?.goals || !saved?.logistics) return null;
    // Settings the catalog no longer offers fall back to their defaults.
    for (const key of SELECTS) if (!choices[key].includes(saved.logistics[key])) delete saved.logistics[key];
    return saved;
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private mode); the page works without it.
  }
}
