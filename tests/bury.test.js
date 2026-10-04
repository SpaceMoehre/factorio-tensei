import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buryPipes } from '../js/layout/compact.js';
import { pipeNetwork, separateNetworks } from '../js/layout/validity.js';

const N = 0, E = 4, S = 8, W = 12;
const logistics = { pipe: 'pipe-to-ground', plainPipe: 'pipe' };
const catalogOf = reach => ({
  pipes: { 'pipe-to-ground': { name: 'pipe-to-ground', maxDistance: reach } },
  // A 1 × 1 machine whose one fluid connection points north.
  buildings: { tank: { name: 'tank', size: { w: 1, h: 1 }, fluidBoxes: [{ production: 'input', connections: [{ x: 0, y: 0, direction: N }] }] } },
});
const pipe = (route, x, y) => ({ name: 'pipe', kind: 'pipe', route, fluid: route ? 'steam' : 'water', x, y, w: 1, h: 1, direction: 0 });
const tunnel = (route, x, y, direction) => ({ name: 'pipe-to-ground', kind: 'pipe-to-ground', route, fluid: route ? 'steam' : 'water', x, y, w: 1, h: 1, direction });
const blockOf = (pieces, ...more) => {
  const ids = [...new Set(pieces.map(p => p.route))];
  return {
    subBlocks: [], entities: [...pieces, ...more], bounds: { x: 0, y: 0, w: 20, h: 20 },
    routes: ids.map(id => ({ id, kind: 'pipe', fluid: id ? 'steam' : 'water', source: null, sink: null, consumers: [], pieces: pieces.filter(p => p.route === id) })),
  };
};
const shape = block => block.entities.filter(e => e.route !== undefined).map(e => `${e.kind === 'pipe' ? 'pipe' : `ptg${'NESW'[e.direction / 4]}`} ${e.x},${e.y}`);

// From the west edge east for six tiles, then down: the five pipes between the first and the
// corner, and the three below the corner before the last, go underground.
test('three plain pipes or more in a straight line become a pipe-to-ground at each end', () => {
  const pieces = [...[0, 1, 2, 3, 4, 5, 6].map(x => pipe(0, x, 0)), ...[1, 2, 3, 4].map(y => pipe(0, 6, y))];
  const block = buryPipes(blockOf(pieces), catalogOf(10), logistics);
  assert.deepEqual(shape(block), ['pipe 0,0', 'ptgW 1,0', 'ptgE 5,0', 'pipe 6,0', 'ptgN 6,1', 'ptgS 6,3', 'pipe 6,4']);
  assert.deepEqual(block.routes[0].pieces, block.entities);
  assert.deepEqual(pipeNetwork(block, block.routes[0], catalogOf(10), logistics, []), []);
});

// Two pipes stay; so does a run whose middle pipe a machine's connection meets.
test('two pipes, or pipes a machine connects to, stay above ground', () => {
  const two = buryPipes(blockOf([0, 1, 2, 3].map(x => pipe(0, x, 0))), catalogOf(10), logistics);
  assert.deepEqual(shape(two), ['pipe 0,0', 'pipe 1,0', 'pipe 2,0', 'pipe 3,0']);
  const tank = { name: 'tank', kind: 'building', recipe: 'x', x: 2, y: 1, w: 1, h: 1, direction: 0 };
  const fed = buryPipes(blockOf([0, 1, 2, 3, 4].map(x => pipe(0, x, 0)), tank), catalogOf(10), logistics);
  assert.deepEqual(shape(fed), ['pipe 0,0', 'pipe 1,0', 'pipe 2,0', 'pipe 3,0', 'pipe 4,0']);
});

// Twelve pipes in a line, a pipe-to-ground reaching 4 tiles: three tunnels of four tiles each.
test('a run longer than the reach takes as many tunnels as it needs, of even lengths', () => {
  const pieces = [...Array(14).keys()].map(x => pipe(0, x, 0));
  const block = buryPipes(blockOf(pieces), catalogOf(4), logistics);
  assert.deepEqual(shape(block), ['pipe 0,0', 'ptgW 1,0', 'ptgE 4,0', 'ptgW 5,0', 'ptgE 8,0', 'ptgW 9,0', 'ptgE 12,0', 'pipe 13,0']);
  assert.deepEqual(pipeNetwork(block, block.routes[0], catalogOf(4), logistics, []), []);
});

// Steam tunnels under the whole row: water's pipes on it would take the steam's tunnel for theirs.
test('a run that another network\'s tunnel crosses along its line stays above ground', () => {
  const water = [pipe(0, 1, 1), ...[1, 2, 3, 4, 5, 6, 7].map(x => pipe(0, x, 0)), pipe(0, 7, 1)];
  const steam = [tunnel(1, 0, 0, W), tunnel(1, 8, 0, E)];
  const block = buryPipes(blockOf([...water, ...steam]), catalogOf(10), logistics);
  assert.equal(block.entities.filter(e => e.kind === 'pipe').length, water.length);
  assert.deepEqual(separateNetworks(block, catalogOf(10), logistics), []);
});
