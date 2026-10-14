// Usage: node ascii.mjs <best.json> x0 y0 x1 y1: the tiles as text (belts > v < ^, S splitter, U/u tunnel in/out, i inserter, P pole, = pipe, T pipe-to-ground, # machine, F Fixture).
import fs from 'node:fs';
const L = JSON.parse(fs.readFileSync(process.argv[2]));
const [x0, y0, x1, y1] = process.argv.slice(3).map(Number);
const g = {};
for (const e of L.entities) for (let i = 0; i < (e.w || 1); i++) for (let j = 0; j < (e.h || 1); j++) {
  const ch = e.kind === 'splitter' ? 'S' : e.kind === 'belt' ? ['^', '>', 'v', '<'][e.travel / 4] : e.kind === 'underground-belt' ? (e.underground === 'input' ? 'U' : 'u') : e.kind === 'inserter' ? 'i' : e.kind === 'pole' ? 'P' : e.kind === 'pipe' ? '=' : e.kind === 'pipe-to-ground' ? 'T' : '#';
  g[`${e.x + i},${e.y + j}`] = ch;
}
for (const f of L.site?.fixtures ?? []) for (let i = 0; i < f.w; i++) for (let j = 0; j < f.h; j++) g[`${f.x + i},${f.y + j}`] ??= 'F';
for (let y = y0; y < y1; y++) { let s = String(y).padStart(4) + ' '; for (let x = x0; x < x1; x++) s += g[`${x},${y}`] ?? '.'; console.log(s); }
