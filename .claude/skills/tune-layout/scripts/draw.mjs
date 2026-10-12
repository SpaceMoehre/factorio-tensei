// Draws a layout (best.json from run.mjs) as a PNG, to look at where room stays empty.
//
//   node draw.mjs <best.json> <out.png> [scale=4]
//
// Dark: room inside the Buffer nothing stands on. Grey: Fixtures. Each Sub-Block's machines in a
// colour of their own (its index and item at its first machine), belts yellow, pipes blue,
// inserters orange, poles white, splitters red. Red outline: the Buffer.
// Needs the cached Playwright and headless shell (PLAYWRIGHT_DIR, CHROME to override).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [input, output, scale = '4'] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node draw.mjs <best.json> <out.png> [scale]');
  process.exit(2);
}
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR ?? '/home/simon/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright');
const block = JSON.parse(readFileSync(input, 'utf8'));
const browser = await chromium.launch({
  args: ['--no-sandbox'],
  executablePath: process.env.CHROME ?? '/home/simon/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',
});
const page = await browser.newPage();
await page.setContent('<body style="margin:0;background:#000"><canvas id=c></canvas></body>');
await page.evaluate(([b, S]) => {
  const a = b.site?.area ?? { x: b.bounds.x - 2, y: b.bounds.y - 2, w: b.bounds.w + 4, h: b.bounds.h + 4 };
  const c = document.getElementById('c');
  c.width = a.w * S;
  c.height = a.h * S;
  const g = c.getContext('2d');
  g.fillStyle = '#161616';
  g.fillRect(0, 0, c.width, c.height);
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect((x - a.x) * S, (y - a.y) * S, w * S, h * S);
  };
  const pal = ['#3c9a6a', '#b0703c', '#4a74b8', '#a44ca4', '#a8a83c', '#3ca8a8', '#c45c5c', '#6cc46c', '#8c6cd4', '#d49c6c'];
  for (const f of b.site?.fixtures ?? []) R(f.x, f.y, f.w ?? 1, f.h ?? 1, '#777');
  for (const r of b.routes) for (const p of r.pieces) R(p.x, p.y, 1, 1, r.kind === 'belt' ? (p.underground ? '#8a7a20' : '#d8c830') : (p.underground ? '#1c4c80' : '#3a8cf0'));
  const labelled = new Set();
  for (const e of b.entities) {
    const col = { building: pal[(e.subBlock ?? 0) % pal.length], pole: '#eee', inserter: '#f08020', belt: '#d8c830', 'underground-belt': '#8a7a20', splitter: '#ff4040', pipe: '#3a8cf0', 'pipe-to-ground': '#1c4c80' }[e.kind] ?? '#aaa';
    R(e.x, e.y, e.w ?? 1, e.h ?? 1, col);
    if (e.kind === 'building') {
      g.strokeStyle = '#000';
      g.strokeRect((e.x - a.x) * S + 0.5, (e.y - a.y) * S + 0.5, e.w * S - 1, e.h * S - 1);
    }
  }
  g.font = `${Math.max(10, S * 3)}px sans-serif`;
  for (const e of b.entities) {
    if (e.kind !== 'building' || labelled.has(e.subBlock)) continue;
    labelled.add(e.subBlock);
    const sb = b.subBlocks[e.subBlock];
    g.fillStyle = '#fff';
    g.fillText(`${e.subBlock} ${sb?.item ?? ''} ×${sb?.count ?? ''}`, (e.x - a.x) * S + 2, (e.y - a.y) * S + S * 3);
  }
  if (b.site?.inner) {
    const i = b.site.inner;
    g.strokeStyle = '#e33';
    g.strokeRect((i.x - a.x) * S, (i.y - a.y) * S, i.w * S, i.h * S);
  }
}, [block, Number(scale)]);
await page.locator('#c').screenshot({ path: output });
await browser.close();
console.log(output);
