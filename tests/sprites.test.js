import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { buildSprites, findIcons, dumpedSprites } from '../scripts/sprites.mjs';

// A minimal zip archive (deflated entries), laid out the way Factorio mod zips are.
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = deflateRawSync(content), path = Buffer.from(name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc32(content), 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(path.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(content), 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(path.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(header, path, data);
    centrals.push(central, path);
    offset += header.length + path.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test('icons come from the game data folder and from the newest version of each mod zip', () => {
  const root = mkdtempSync(join(tmpdir(), 'sprites-'));
  const game = join(root, 'Factorio'), mods = join(root, 'mods'), out = join(root, 'sprites');
  mkdirSync(join(game, 'data/base/graphics/icons'), { recursive: true });
  writeFileSync(join(game, 'data/base/graphics/icons/iron-plate.png'), 'IRON');
  mkdirSync(mods);
  writeFileSync(join(mods, 'pyhightechgraphics_0.9.0.zip'), zip({ 'pyhightechgraphics_0.9.0/graphics/icons/pcb1.png': Buffer.from('OLD') }));
  writeFileSync(join(mods, 'pyhightechgraphics_0.10.2.zip'), zip({
    'pyhightechgraphics_0.10.2/info.json': Buffer.from('{}'),
    'pyhightechgraphics_0.10.2/graphics/icons/pcb1.png': Buffer.from('PCB'),
  }));
  const report = buildSprites({
    'iron-plate': 'base/graphics/icons/iron-plate.png', pcb1: 'pyhightechgraphics/graphics/icons/pcb1.png', lost: 'nomod/x.png',
  }, { game, mods, out });
  assert.equal(readFileSync(join(out, 'base/graphics/icons/iron-plate.png'), 'utf8'), 'IRON');
  assert.equal(readFileSync(join(out, 'pyhightechgraphics/graphics/icons/pcb1.png'), 'utf8'), 'PCB');
  assert.equal(existsSync(join(out, 'nomod/x.png')), false);
  assert.deepEqual(report, { written: 2, missing: ['nomod/x.png'] });
});

// A catalog without icon paths: each item's icon is found by its file name among the mods'
// icons, newest mod version first; an item no mod draws has none.
test('icons without a path are found by name in the mod zips', () => {
  const root = mkdtempSync(join(tmpdir(), 'sprites-'));
  const mods = join(root, 'mods');
  mkdirSync(mods);
  writeFileSync(join(mods, 'pyalienlifegraphics_3.0.0.zip'), zip({ 'pyalienlifegraphics_3.0.0/graphics/icons/moss.png': Buffer.from('OLD') }));
  writeFileSync(join(mods, 'pyalienlifegraphics_3.1.0.zip'), zip({
    'pyalienlifegraphics_3.1.0/graphics/icons/moss.png': Buffer.from('MOSS'),
    'pyalienlifegraphics_3.1.0/graphics/icons/casein.png': Buffer.from('CASEIN'),
    'pyalienlifegraphics_3.1.0/graphics/entity/moss.png': Buffer.from('NOT AN ICON'),
  }));
  writeFileSync(join(mods, 'pyrawores_3.1.0.zip'), zip({ 'pyrawores_3.1.0/graphics/icons/mip/iron-plate.png': Buffer.from('PLATE') }));
  assert.deepEqual(findIcons(['moss', 'casein', 'iron-plate', 'unknown'], mods), {
    moss: 'pyalienlifegraphics/graphics/icons/moss.png',
    casein: 'pyalienlifegraphics/graphics/icons/casein.png',
    'iron-plate': 'pyrawores/graphics/icons/mip/iron-plate.png',
  });
  const out = join(root, 'sprites');
  buildSprites(findIcons(['moss'], mods), { game: join(root, 'no-game'), mods, out });
  assert.equal(readFileSync(join(out, 'pyalienlifegraphics/graphics/icons/moss.png'), 'utf8'), 'MOSS');
});

// Without the game: factorio --dump-icon-sprites draws every prototype into script-output/<type>/.
// Only the icons sprites/ lacks are written, where the catalog names them; an item's picture wins
// over an entity's of the same name.
test('icons sprites/ lacks come from an icon dump, where the catalog names them', () => {
  const root = mkdtempSync(join(tmpdir(), 'sprites-'));
  const dump = join(root, 'script-output'), out = join(root, 'sprites');
  for (const [folder, name, content] of [['item', 'casting-unit-mk01', 'ITEM'], ['entity', 'casting-unit-mk01', 'ENTITY'], ['virtual-signal', 'signal-A', 'A'], ['fluid', 'water', 'WATER']]) {
    mkdirSync(join(dump, folder), { recursive: true });
    writeFileSync(join(dump, folder, `${name}.png`), content);
  }
  mkdirSync(join(out, 'base/graphics/icons/fluid'), { recursive: true });
  writeFileSync(join(out, 'base/graphics/icons/fluid/water.png'), 'MOD');
  const icons = {
    'casting-unit-mk01': 'pyraworesgraphics/graphics/icons/casting-unit-mk01.png', 'signal-A': 'base/graphics/icons/signal/signal_A.png',
    water: 'base/graphics/icons/fluid/water.png', 'signal-heart': 'base/graphics/icons/signal/signal_heart.png',
  };
  assert.deepEqual(dumpedSprites(icons, { dump, out }), { written: 2, missing: ['signal-heart'] });
  assert.equal(readFileSync(join(out, 'pyraworesgraphics/graphics/icons/casting-unit-mk01.png'), 'utf8'), 'ITEM');
  assert.equal(readFileSync(join(out, 'base/graphics/icons/signal/signal_A.png'), 'utf8'), 'A');
  assert.equal(readFileSync(join(out, 'base/graphics/icons/fluid/water.png'), 'utf8'), 'MOD');
  assert.ok(!existsSync(join(out, 'base/graphics/icons/signal/signal_heart.png')));
});
