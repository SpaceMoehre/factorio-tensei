// A Sub-Block's design candidates at n of the first Goal's machines: what each is (a core or
// copies), its size, its Starvation (trouble) and its parts' drops by lane — why a design ranks
// as it does, or why every design of it starves.
//   node designs.mjs <setup.json> <n> <item> [count=12] [spare JSON, e.g. '{"soil":240}']
const { root, catalog, load } = await import('./probe-common.mjs');
const { context, designStep, designOf, random } = await import(`${root}/js/design.js`);
const [file, n, item, count = '12', spare = '{}'] = process.argv.slice(2);
const { site, logistics, entriesFor } = await load(file);
const ctx = context(entriesFor(+n, JSON.parse(spare)), catalog, logistics, site);
ctx.chained = 'all';
const i = ctx.plan.findIndex(sb => sb.item === item);
const sb = ctx.plan[i];
console.log(`${sb.item}: ${sb.count} × ${sb.building}, ${sb.rate.toFixed(1)}/min; routes`, ctx.routes.filter(r => r.source === i || r.consumers?.includes(i)).map(r => `${r.id} ${r.kind} ${r.items.map(x => `${x.item}@${Math.round(x.rate)}`).join('+')} ${r.source}→${r.consumers.join(',')}${r.sink ? ` ${r.sink}` : ''}`).join(' | '));
const t = Date.now();
const list = designStep(ctx, i, random(1), {});
console.log(`${list.length} candidates in ${Date.now() - t} ms`);
const lanes = q => q.drops.length ? ` L${Math.round(q.drops.reduce((s, x) => s + x.left, 0))}/R${Math.round(q.drops.reduce((s, x) => s + x.right, 0))}/E${Math.round(q.drops.reduce((s, x) => s + (x.either ?? 0), 0))}` : '';
for (const c of list.slice(0, +count)) {
  const d = designOf(c);
  const what = c.spec?.copies ? `copies ${JSON.stringify(c.spec.copies)}` : 'core';
  if (!d) { console.log(what, 'FAILED', c.failed?.message); continue; }
  console.log(what, 'trouble', +d.trouble.toFixed(1), d.kinds.map(k => `${k.count}× ${k.module.area.w}×${k.module.area.h}${k.reverse ? ' (alternating reverse)' : ''} parts ${k.module.parts.map(q => `${q.key}:${+q.machines.toFixed(1)}m${lanes(q)}`).join(' ')}`).join(' + '));
}
