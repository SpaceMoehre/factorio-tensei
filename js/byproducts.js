// Byproducts Processed into the Goal (ADR 0126): the recipes, and how much of each, that turn the
// byproducts of the chain into more of its first Goal, as much as they can (Py's plutonium: the
// separation's pu-239 to pu-242 shuffled into pu-238, 0.3 → 13.9 a craft). A linear program over
// the recipes taking a byproduct (and what they make, three deep): each byproduct taken no faster
// than it is made, the Goal made by them the most. Written as Byproduct Uses the chain lays out:
// each recipe a Use of the byproduct it alone of them takes (its `share` of what is made), the
// byproducts several take coming to them as Recycled Byproducts.
import { expandChain, recipeOptions } from './chain.js';

// How deep from the chain's byproducts recipes are looked for, and how many at most (before
// those that cannot lead to the Goal are dropped).
const DEPTH = 3;
const MOST = 3000;

/**
 * The Uses that process the chain's byproducts into its first Goal: { uses (the user's, those
 * of the Goal's byproducts replaced), added (the new ones), before, after (the Goal's own step's
 * rate without and with them), left (byproducts still leaving by train, item → a minute) }, or
 * null where no recipe makes more of the Goal from them.
 * @param {{ item: string, rate: number }[]} goals
 * @param {any} catalog
 * @param {any} choices Chain Choices (setup.js)
 * @param {any} logistics
 */
export function processByproducts(goals, catalog, choices, logistics) {
  const goal = goals[0]?.item;
  if (!goal) return null;
  const index = recipeOptions(catalog, choices.sciencePacks ?? null, choices.turds ?? null);
  const chainOf = uses => expandChain(goals, catalog, { ...choices, uses, index, logistics });
  // The user's Uses of the Goal's byproducts (and of what those make) give way: this decides them.
  const own = chainOf([]).entries.find(e => !('use' in e) && e.goal.item === goal);
  const mine = new Set(catalog.recipes[own.selection.recipe].products.map(p => p.name).filter(n => n !== goal));
  for (let more = true; more;) {
    more = false;
    for (const u of choices.uses ?? []) {
      if (!mine.has(u.item)) continue;
      for (const p of catalog.recipes[u.recipe]?.products ?? []) {
        if (p.name !== goal && !mine.has(p.name)) {
          mine.add(p.name);
          more = true;
        }
      }
    }
  }
  const kept = (choices.uses ?? []).filter(u => !mine.has(u.item));
  const base = chainOf(kept);
  const stepRate = chain => chain.entries.find(e => !('use' in e) && e.goal.item === goal)?.goal.rate ?? 0;

  // What the chain has to spare of each byproduct, a minute. (Its steps' items it makes as it
  // needs: the recipes take them freely, as they take what comes by train.)
  const steps = new Set(base.entries.filter(e => !('use' in e)).map(e => e.goal.item));
  const avail = new Map();
  for (const b of base.byproducts) avail.set(b.item, (avail.get(b.item) ?? 0) + b.rate);
  // The recipes taking them (not the Goal), and those taking what they make.
  const amounts = list => {
    const m = new Map();
    for (const x of list) m.set(x.name, (m.get(x.name) ?? 0) + (x.amount ?? 0));
    return m;
  };
  const recipes = [];
  const seen = new Set();
  // (The Goal's own byproducts first.)
  let frontier = [...avail.keys()].sort((a, b) => Number(mine.has(b)) - Number(mine.has(a)));
  for (let depth = 0; depth < DEPTH && frontier.length && recipes.length < MOST; depth++) {
    const next = [];
    for (const item of frontier) {
      for (const name of index.consumers.get(item) ?? []) {
        if (seen.has(name) || !index.buildingsFor.has(name) || recipes.length >= MOST) continue;
        seen.add(name);
        const r = catalog.recipes[name];
        if (!r.products.length || r.ingredients.some(i => i.name === goal)) continue;
        const takes = amounts(r.ingredients);
        const makes = amounts(r.products);
        recipes.push({ name, takes, makes, time: r.time ?? 1 });
        for (const p of makes.keys()) if (!avail.has(p) && p !== goal && !steps.has(p)) { avail.set(p, 0); next.push(p); }
      }
    }
    frontier = next;
  }
  // Only those leading to the Goal: making it, or what one leading to it takes.
  const leads = new Set();
  for (let more = true; more;) {
    more = false;
    for (const r of recipes) {
      if (leads.has(r.name) || !(r.makes.has(goal) || recipes.some(o => leads.has(o.name) && [...r.makes.keys()].some(item => o.takes.has(item))))) continue;
      leads.add(r.name);
      more = true;
    }
  }
  recipes.splice(0, recipes.length, ...recipes.filter(r => leads.has(r.name)));
  if (!recipes.length) return null;

  // The pool: every byproduct and what the recipes make; each taken no faster than made.
  const pool = [...avail.keys()];
  let chosen = recipes;
  for (let round = 0; round < recipes.length; round++) {
    const x = optimum(chosen, pool, avail, goal);
    if (!x) return null;
    const used = chosen.map((r, k) => ({ ...r, rate: x[k] })).filter(r => r.rate > 1e-9);
    const gain = used.reduce((sum, r) => sum + r.rate * ((r.makes.get(goal) ?? 0) - (r.takes.get(goal) ?? 0)), 0);
    if (!(gain > 1e-9)) return null;
    // Each recipe a Use of a byproduct of its own (a matching: no two pin one), its share of what
    // is made; what the Uses leave of them the others take recycled.
    const made = item => (avail.get(item) ?? 0) + used.reduce((sum, r) => sum + r.rate * (r.makes.get(item) ?? 0), 0);
    const options = used.map(r => [...r.takes.keys()].filter(item => pool.includes(item) && made(item) > 1e-12));
    const pinOf = new Map();
    const tryPin = (k, seen) => options[k].some(item => {
      if (seen.has(item)) return false;
      seen.add(item);
      const other = pinOf.get(item);
      if (other === undefined || tryPin(other, seen)) { pinOf.set(item, k); return true; }
      return false;
    });
    const pins = used.map(() => null);
    used.forEach((_, k) => tryPin(k, new Set()));
    for (const [item, k] of pinOf) pins[k] = { item, recipe: used[k].name, share: Math.min(1, used[k].rate * used[k].takes.get(item) / made(item)) };
    const unpinned = used.filter((r, k) => !pins[k]);
    if (unpinned.length) {
      chosen = chosen.filter(r => !unpinned.some(u => u.name === r.name));
      continue;
    }
    const added = pins.map(p => (p.share > 1 - 1e-6 ? { item: p.item, recipe: p.recipe } : p));
    const uses = [...kept, ...added];
    const after = chainOf(uses);
    const left = {};
    for (const b of after.byproducts) if (mine.has(b.item) || pool.includes(b.item)) left[b.item] = (left[b.item] ?? 0) + b.rate;
    return { uses, added, before: stepRate(base), after: stepRate(after), left };
  }
  return null;
}

// The rates (a minute) of the recipes making the most of the Goal, each pool item taken no faster
// than the chain spares it plus what they make; the fewest crafts among equals.
function optimum(recipes, pool, avail, goal) {
  const rows = pool.map(item => ({ coeffs: recipes.map(r => (r.takes.get(item) ?? 0) - (r.makes.get(item) ?? 0)), bound: avail.get(item) ?? 0 }));
  // (Bounded: none faster than the pool all told could feed.)
  const cap = Math.max(1, 1000 * pool.reduce((sum, item) => sum + (avail.get(item) ?? 0), 0));
  recipes.forEach((_, k) => rows.push({ coeffs: recipes.map((__, j) => (j === k ? 1 : 0)), bound: cap }));
  const value = recipes.map(r => (r.makes.get(goal) ?? 0) - (r.takes.get(goal) ?? 0));
  const scale = Math.max(1e-9, ...value.map(Math.abs));
  const c = value.map(v => v - 1e-6 * scale);
  return simplex(c, rows.map(r => r.coeffs), rows.map(r => r.bound));
}

/**
 * Maximise c·x with A x ≤ b, x ≥ 0 (b ≥ 0): the tableau method, Bland's rule. null where
 * unbounded.
 * @param {number[]} c
 * @param {number[][]} A
 * @param {number[]} b
 * @returns {number[] | null}
 */
export function simplex(c, A, b) {
  const m = A.length;
  const n = c.length;
  // Rows: [A | I | b]; the objective last: [-c | 0 | 0].
  const t = A.map((row, i) => [...row, ...Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)), b[i]]);
  t.push([...c.map(v => -v), ...new Array(m).fill(0), 0]);
  const basis = Array.from({ length: m }, (_, i) => n + i);
  const width = n + m;
  for (let step = 0; step < 50 * (n + m); step++) {
    let enter = -1;
    for (let j = 0; j < width; j++) if (t[m][j] < -1e-12) { enter = j; break; }
    if (enter < 0) break;
    let leave = -1;
    let best = Infinity;
    for (let i = 0; i < m; i++) {
      if (t[i][enter] <= 1e-12) continue;
      const ratio = t[i][width] / t[i][enter];
      if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[leave])) { best = ratio; leave = i; }
    }
    if (leave < 0) return null;
    const pivot = t[leave][enter];
    for (let j = 0; j <= width; j++) t[leave][j] /= pivot;
    for (let i = 0; i <= m; i++) {
      if (i === leave || Math.abs(t[i][enter]) < 1e-15) continue;
      const f = t[i][enter];
      for (let j = 0; j <= width; j++) t[i][j] -= f * t[leave][j];
    }
    basis[leave] = enter;
  }
  const x = new Array(n).fill(0);
  basis.forEach((v, i) => { if (v < n) x[v] = Math.max(0, t[i][width]); });
  return x;
}
