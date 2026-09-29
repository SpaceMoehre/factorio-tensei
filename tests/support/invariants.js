import assert from 'node:assert/strict';
import * as rules from '../../js/layout/validity.js';

// The same rules the layout search applies to every candidate, as test assertions.
const holds = problems => assert.deepEqual(problems, []);

export const assertNoOverlaps = entities => holds(rules.overlaps(entities));
export const assertRouteChain = (block, route, catalog, logistics) => holds(rules.routeChain(route, catalog, logistics, block.entities));
export const assertFeedsEveryMachine = (block, route, machines, catalog) => holds(rules.feedsEveryMachine(block, route, machines, catalog));
export const assertDrainsEveryMachine = (block, route, machines, catalog) => holds(rules.drainsEveryMachine(block, route, machines, catalog));
export const assertPowerNetwork = (block, catalog, logistics) => holds(rules.powerNetwork(block, catalog, logistics));
export const assertPipeNetwork = (block, route, catalog, logistics, machines) => holds(rules.pipeNetwork(block, route, catalog, logistics, machines));
export const assertNoFluidMixing = (block, catalog, logistics) => holds(rules.noFluidMixing(block, catalog, logistics));
export const assertSeparateNetworks = (block, catalog, logistics) => holds(rules.separateNetworks(block, catalog, logistics));
export const assertEndsAtEastEdge = (block, route) => holds(rules.endsAtEastEdge(block, route));
export const assertNoCustomVectors = block => assert.deepEqual(block.entities.filter(e => e.vectors), []);
export const assertValid = (block, catalog, logistics) => holds(rules.validateBlock(block, catalog, logistics));
