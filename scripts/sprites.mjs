// Extracts the icon files the catalog names (sprites/<mod>/<path>) from the game's data folder
// (base, core, and other built-in mods) and from mod zips, taking the newest version of each mod.
import { openSync, readSync, closeSync, fstatSync, existsSync, readdirSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { inflateRawSync } from 'node:zlib';

// icons: { name: '<mod>/<path>' }; game: the Factorio install (holding data/); mods: the mods
// folder; out: where sprites go. Returns how many files were written and which were not found.
export function buildSprites(icons, { game, mods, out }) {
  const files = [...new Set(Object.values(icons))];
  const byMod = new Map();
  for (const file of files) {
    const [mod, ...rest] = file.split('/');
    if (!byMod.has(mod)) byMod.set(mod, []);
    byMod.get(mod).push(rest.join('/'));
  }
  let written = 0;
  const missing = [];
  for (const [mod, paths] of byMod) {
    const found = modSource(mod, { game, mods });
    for (const path of paths) {
      const target = join(out, mod, path);
      mkdirSync(dirname(target), { recursive: true });
      if (found?.folder && existsSync(join(found.folder, path))) {
        copyFileSync(join(found.folder, path), target);
        written++;
      } else if (found?.zip && found.zip.has(path)) {
        writeFileSync(target, found.zip.read(path));
        written++;
      } else {
        missing.push(`${mod}/${path}`);
      }
    }
    found?.zip?.close();
  }
  return { written, missing };
}

// Icons from an icon dump instead (`factorio --dump-icon-sprites`: script-output/<type>/<name>.png,
// each prototype drawn once, no game install needed): every icon of the catalog that sprites/
// lacks, written where the catalog names it — an item's picture first, then a fluid's, a virtual
// signal's, any other's. Returns how many were written and the names the dump has no icon for.
export function dumpedSprites(icons, { dump, out }) {
  const first = ['item', 'fluid', 'virtual-signal'];
  const folders = readdirSync(dump, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
    .sort((a, b) => (first.indexOf(a) + 1 || first.length + 1) - (first.indexOf(b) + 1 || first.length + 1) || a.localeCompare(b));
  let written = 0;
  const missing = [];
  for (const [name, path] of Object.entries(icons)) {
    const target = join(out, path);
    if (existsSync(target)) continue;
    const source = folders.map(f => join(dump, f, `${name}.png`)).find(f => existsSync(f));
    if (!source) {
      missing.push(name);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    written++;
  }
  return { written, missing };
}

// For a catalog without icon paths: each name's icon, found as graphics/icons/**/<name>.png in
// the newest version of each mod in mods/ (zips or folders). Where several mods draw one, the
// first by mod name wins, and within a mod the shallowest path. Returns { name: '<mod>/<path>' }
// for the names found.
export function findIcons(names, mods) {
  const wanted = new Set(names);
  const found = {};
  const newest = new Map();
  for (const name of existsSync(mods) ? readdirSync(mods) : []) {
    const match = /^(.+)_(\d+)\.(\d+)\.(\d+)(\.zip)?$/.exec(name);
    if (match && (!newest.has(match[1]) || compareVersions(match.slice(1), newest.get(match[1]).match.slice(1)) > 0)) {
      newest.set(match[1], { name, match });
    }
  }
  for (const mod of [...newest.keys()].sort()) {
    const { name, match } = newest.get(mod);
    const zip = match[5] ? openZip(join(mods, name)) : null;
    const paths = zip ? zip.paths() : filesUnder(join(mods, name), 'graphics/icons');
    zip?.close();
    const icons = paths.filter(p => p.startsWith('graphics/icons/') && p.endsWith('.png'))
      .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
    for (const path of icons) {
      const item = path.slice(path.lastIndexOf('/') + 1, -4);
      if (wanted.has(item) && !found[item]) found[item] = `${mod}/${path}`;
    }
  }
  return found;
}

function filesUnder(root, dir) {
  if (!existsSync(join(root, dir))) return [];
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? filesUnder(root, `${dir}/${e.name}`) : [`${dir}/${e.name}`]));
}

// A built-in mod's folder under data/, else the newest <mod>_<version> zip or folder in mods/.
function modSource(mod, { game, mods }) {
  const builtIn = join(game, 'data', mod);
  if (existsSync(builtIn)) return { folder: builtIn };
  const versions = (existsSync(mods) ? readdirSync(mods) : [])
    .map(name => ({ name, match: new RegExp(`^${escape(mod)}_(\\d+)\\.(\\d+)\\.(\\d+)(\\.zip)?$`).exec(name) }))
    .filter(v => v.match)
    .sort((a, b) => compareVersions(b.match, a.match));
  const newest = versions[0];
  if (!newest) return existsSync(join(mods, mod)) ? { folder: join(mods, mod) } : null;
  return newest.match[4] ? { zip: openZip(join(mods, newest.name)) } : { folder: join(mods, newest.name) };
}

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compareVersions = (a, b) => (+a[1] - +b[1]) || (+a[2] - +b[2]) || (+a[3] - +b[3]);

// Just enough of the zip format to read mod archives: the central directory (zip64 included),
// stored and deflated entries. Paths drop the archive's top folder (<mod>_<version>/).
function openZip(file) {
  const fd = openSync(file, 'r');
  const read = (position, length) => {
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, position);
    return buffer;
  };
  const size = fstatSync(fd).size;
  const tail = read(Math.max(0, size - 65557), Math.min(size, 65557));
  const endAt = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error(`${file} is not a zip archive`);
  let count = tail.readUInt16LE(endAt + 10);
  let offset = tail.readUInt32LE(endAt + 16);
  let length = tail.readUInt32LE(endAt + 12);
  if (offset === 0xffffffff || count === 0xffff) {
    const locator = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
    const end64 = read(Number(tail.readBigUInt64LE(locator + 8)), 56);
    count = Number(end64.readBigUInt64LE(32));
    length = Number(end64.readBigUInt64LE(40));
    offset = Number(end64.readBigUInt64LE(48));
  }
  const directory = read(offset, length);
  const entries = new Map();
  for (let at = 0, n = 0; n < count; n++) {
    const method = directory.readUInt16LE(at + 10);
    let compressed = directory.readUInt32LE(at + 20);
    const nameLength = directory.readUInt16LE(at + 28), extraLength = directory.readUInt16LE(at + 30);
    const commentLength = directory.readUInt16LE(at + 32);
    let local = directory.readUInt32LE(at + 42);
    const name = directory.toString('utf8', at + 46, at + 46 + nameLength);
    if (compressed === 0xffffffff || local === 0xffffffff) {
      // Zip64 extra field: the 64-bit sizes and offset, in that order, for each that overflowed.
      let extra = at + 46 + nameLength;
      const extraEnd = extra + extraLength;
      while (extra < extraEnd && directory.readUInt16LE(extra) !== 0x0001) extra += 4 + directory.readUInt16LE(extra + 2);
      let field = extra + 4;
      if (directory.readUInt32LE(at + 24) === 0xffffffff) field += 8;
      if (compressed === 0xffffffff) { compressed = Number(directory.readBigUInt64LE(field)); field += 8; }
      if (local === 0xffffffff) local = Number(directory.readBigUInt64LE(field));
    }
    entries.set(name.slice(name.indexOf('/') + 1), { method, compressed, local });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return {
    has: path => entries.has(path),
    paths: () => [...entries.keys()],
    read(path) {
      const { method, compressed, local } = entries.get(path);
      const header = read(local, 30);
      const data = read(local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28), compressed);
      return method === 0 ? data : inflateRawSync(data);
    },
    close: () => closeSync(fd),
  };
}
