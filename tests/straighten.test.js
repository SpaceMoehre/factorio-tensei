import { test } from 'node:test';
import assert from 'node:assert/strict';
import { straightenBelts, mergeByproducts } from '../js/layout/compact.js';
import { endsAtEastEdge, routeChain } from '../js/layout/validity.js';

const N = 0, E = 4, S = 8;
const VEC = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1] };
const logistics = { belt: 'transport-belt' };
const catalog = {
  belts: { 'transport-belt': { name: 'transport-belt', underground: { name: 'underground-belt', maxDistance: 5 } } },
  inserters: {},
};
const belt = (x, y, d) => ({ name: 'transport-belt', kind: 'belt', route: 0, x, y, w: 1, h: 1, direction: d, travel: d, out: `${x + VEC[d][0]},${y + VEC[d][1]}` });
// East along row 1, but round tile 3,1 (where a pipe stood before it went underground).
const detour = () => [belt(0, 1, E), belt(1, 1, E), belt(2, 1, S), belt(2, 2, S), belt(2, 3, E), belt(3, 3, E), belt(4, 3, N), belt(4, 2, N), belt(4, 1, E), belt(5, 1, E), belt(6, 1, E)];
const blockOf = (pieces, ...more) => ({
  subBlocks: [], entities: [...pieces, ...more], bounds: { x: 0, y: 0, w: 7, h: 4 },
  routes: [{ id: 0, kind: 'belt', items: [], pieces }],
});
const shape = block => block.routes[0].pieces.map(p => `${p.x},${p.y}${'NESW'[p.travel / 4]}`);

test('a belt routed round what is no longer there goes straight', () => {
  const block = straightenBelts(blockOf(detour()), catalog, logistics);
  assert.deepEqual(shape(block), ['0,1E', '1,1E', '2,1E', '3,1E', '4,1E', '5,1E', '6,1E']);
  assert.equal(block.entities.length, 7);
});

test('a belt dives under what still stands, and keeps its way past a tile an inserter reaches', () => {
  const pipe = { name: 'pipe', kind: 'pipe', route: 1, x: 3, y: 1, w: 1, h: 1, direction: 0 };
  const under = straightenBelts(blockOf(detour(), pipe), catalog, logistics);
  assert.deepEqual(under.routes[0].pieces.map(p => `${p.kind[0]}${p.x},${p.y}`), ['b0,1', 'b1,1', 'u2,1', 'u5,1', 'b6,1']);
  const inserter = { name: 'inserter', kind: 'inserter', x: 3, y: 2, w: 1, h: 1, direction: 0, vectors: { pickup: { x: -1, y: 0 }, drop: { x: 1, y: 0 } } };
  assert.deepEqual(shape(straightenBelts(blockOf(detour(), inserter), catalog, logistics)), shape(blockOf(detour())));
});

// Two runs of producers each sorting their byproduct out, a filter splitter at the west edge,
// on to the east edge on a belt each, 300 a minute (150 a lane): one goes on with the other.
test('a byproduct belt merges with another carrying it, through a splitter beside it', () => {
  const merging = { ...catalog, belts: { 'transport-belt': { ...catalog.belts['transport-belt'], itemsPerSecond: 15 } } };
  const lineOf = (id, y) => {
    const splitter = { name: 'splitter', kind: 'splitter', x: 0, y, w: 1, h: 2, direction: E, travel: E, filter: 'biomass' };
    const away = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => ({ ...belt(x, y, E), route: id }));
    return { id, kind: 'belt', source: 1, sink: 'side-output', consumers: [], items: [{ item: 'biomass', rate: 300 }], pieces: [splitter, ...away] };
  };
  const routes = [lineOf(0, 0), lineOf(1, 3)];
  const block = { subBlocks: [], routes, entities: [...new Set(routes.flatMap(r => r.pieces))], bounds: { x: 0, y: 0, w: 11, h: 5 } };
  mergeByproducts(block, merging, logistics);
  assert.equal(routes[0].joins, 1);
  const end = routes[0].pieces.at(-1);
  assert.equal(end.kind, 'splitter');
  assert.ok(routes[1].pieces.includes(end));
  assert.deepEqual(endsAtEastEdge(block, routes[0]), []);
  assert.deepEqual(routeChain(routes[0], { belts: merging.belts }, logistics, block.entities), []);
  assert.deepEqual(routeChain(routes[1], { belts: merging.belts }, logistics, block.entities), []);
  assert.ok(block.entities.length < 22);
});
