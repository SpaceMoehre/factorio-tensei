import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { buildSprites } from '../scripts/sprites.mjs';

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
