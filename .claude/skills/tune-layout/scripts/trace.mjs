// One Maximize try's layout search at n machines, every candidate's failure counted (with its
// design choice and columns), and each layout found with its Starvation — which cause sinks a try.
//   node trace.mjs <setup.json> <n> [seconds=120] [spare JSON]      PERFECT=0: starving layouts count too; UNSORTED=0: byproducts sorted out (ADR 0052)
// Candidates the search passes over silently (a design or the prepared layout starving) do not
// show: put a temporary `if (process.env.DBG) console.log(...)` at search.js `if (!ready)` and at
// `ready.least`, and take it out again.
const { root, catalog, load } = await import('./probe-common.mjs');
const { search } = await import(`${root}/js/search.js`);
const { simulate } = await import(`${root}/js/sim.js`);
const [file, n, secs = '120', spare = '{}'] = process.argv.slice(2);
const { site, logistics, entriesFor } = await load(file);
const errs = new Map();
const t = Date.now();
const run = search(entriesFor(+n, JSON.parse(spare)), catalog, logistics, {
  seed: 1, site, deadline: Date.now() + +secs * 1000, unsorted: process.env.UNSORTED !== '0', perfect: process.env.PERFECT !== '0',
  designed: d => console.log('designed in', (Date.now() - t) / 1000, 's:', d.map(x => `${x.item}×${x.count}`).join(' ')),
  trace: (c, e) => {
    const m = `${(e?.message ?? String(e)).replace(/-?\d+(\.\d+)?/g, '#')}  choice=${c.choice?.join()} columns=${c.columns?.map(v => v ?? '-').join()}`;
    errs.set(m, (errs.get(m) ?? 0) + 1);
  },
});
let step;
for (step = run.next(); !step.done; step = run.next()) {
  const s = simulate(step.value.block).starvation;
  console.log('layout at', (Date.now() - t) / 1000, 's score', JSON.stringify(step.value.score), 'starving', JSON.stringify(s.slice(0, 3)));
  if (step.value.score.starving === 0) break;
}
console.log('end', step.done ? JSON.stringify({ tried: step.value.tried, failure: step.value.failure?.message, short: step.value.short }) : 'found one');
for (const [m, k] of [...errs].sort((a, b) => b[1] - a[1]).slice(0, +(process.env.TOP ?? 25))) console.log(String(k).padStart(4), m);
