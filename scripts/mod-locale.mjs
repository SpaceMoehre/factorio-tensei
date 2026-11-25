// The names the game shows, made from the mods' English locale files where the game's own locale
// dump (`factorio --dump-prototype-locale`) is not at hand (ADR 0125): each prototype's name as
// the game makes it (its `localised_name`, else its section's key: an item's `item-name`, else
// the name of what it places; a recipe's `recipe-name`, else its one product's), references
// (`__ITEM__x__`, `__1__`) resolved. Written as prototype-locale.json, which build-catalog reads.
//   node scripts/mod-locale.mjs <data-raw-dump.json> <mod folder>… [--out prototype-locale.json]
// Mods' locale loads in their load order (dependencies first, then by name): a key a later mod
// gives again is the later one's. Base's locale is not in wube's factorio-data: base prototypes
// with no key keep names made of their prototype names.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { localeKeys, modLocale } from '../js/mod-locale.js';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
const [dumpPath, ...folders] = args;
if (!dumpPath || !folders.length) {
  console.error('usage: node scripts/mod-locale.mjs <data-raw-dump.json> <mod folder>… [--out prototype-locale.json]');
  process.exit(1);
}
const raw = JSON.parse(readFileSync(dumpPath, 'utf8'));

// The mods in load order: a mod after those it depends on (optional ones too), then by name.
const mods = folders.map(dir => {
  const info = existsSync(join(dir, 'info.json')) ? JSON.parse(readFileSync(join(dir, 'info.json'), 'utf8')) : {};
  const deps = (info.dependencies ?? []).map(d => d.trim()).filter(d => !d.startsWith('!')).map(d => d.replace(/^(?:\(\?\)|[?~])\s*/, '').split(/\s/)[0]);
  return { dir, name: info.name ?? basename(dir), deps };
});
const ordered = [];
const left = new Set(mods.map(m => m.name));
while (left.size) {
  const ready = mods.filter(m => left.has(m.name) && m.deps.every(d => !left.has(d))).sort((a, b) => a.name.localeCompare(b.name));
  const next = ready[0] ?? mods.find(m => left.has(m.name));
  ordered.push(next);
  left.delete(next.name);
}

// Every key, `section.key`, the last mod's winning.
const files = ordered.flatMap(mod => {
  const dir = join(mod.dir, 'locale', 'en');
  return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.cfg')).sort().map(f => readFileSync(join(dir, f), 'utf8')) : [];
});
const keys = localeKeys(files);
const locale = modLocale(raw, keys);
const path = out ?? join(dirname(dumpPath), 'prototype-locale.json');
writeFileSync(path, `${JSON.stringify(locale)}\n`);
console.log(`${path}: ${Object.entries(locale).map(([k, v]) => `${Object.keys(v.names).length} ${k}`).join(', ')} (${keys.size} keys from ${ordered.filter(m => existsSync(join(m.dir, 'locale', 'en'))).length} mods)`);
