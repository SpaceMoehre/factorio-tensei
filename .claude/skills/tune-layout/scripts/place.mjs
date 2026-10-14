// Placement alone at n machines: each Sub-Block's chosen design and stack size, then whether
// Placement (one by one, and in Layers) finds room — why a try says "no room for X".
//   node place.mjs <setup.json> <n> [spare JSON] [choice JSON, e.g. [0,0,0,9,0]] [columns JSON, e.g. [null,null,2,null,null]]
const { root, catalog, load } = await import('./probe-common.mjs');
const { context, designStep, designOf, random } = await import(`${root}/js/design.js`);
const { prepare } = await import(`${root}/js/layout/compose.js`);
const { placeBlocks, stackOf } = await import(`${root}/js/layout/place.js`);
const [file, n, spare = '{}', choiceArg = 'null', cols = '[]'] = process.argv.slice(2);
const { site, logistics, entriesFor } = await load(file);
const ctx = context(entriesFor(+n, JSON.parse(spare)), catalog, logistics, site);
ctx.chained = 'all';
const rng = random(1);
const designs = ctx.plan.map((_, i) => designStep(ctx, i, rng, {}));
const choice = JSON.parse(choiceArg) ?? ctx.plan.map(() => 0);
const chosen = choice.map((c, i) => designOf(designs[i][c]));
const prepared = prepare(ctx, chosen, JSON.parse(cols));
console.log('columns', JSON.stringify(prepared.columns));
ctx.plan.forEach((sb, i) => {
  const s = stackOf(prepared, i, {});
  console.log(i, `${sb.item}×${sb.count}`, 'design', chosen[i].kinds.map(k => `${k.count}× ${k.module.area.w}×${k.module.area.h}`).join(' + '), 'stack', `${s.w}×${s.h}`);
});
for (const layers of [false, true]) {
  try {
    placeBlocks(ctx, prepared, { corridor: 2, gap: 1, weight: 4, layers });
    console.log(layers ? 'Layers' : 'one by one', 'PLACED');
  } catch (e) {
    console.log(layers ? 'Layers' : 'one by one', e.message);
  }
}
