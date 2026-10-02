import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathFlow } from '../js/layout/flow.js';

const LANE = 450;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
const machines = (n, rate) => new Map(Array.from({ length: n }, (_, k) => [k, rate]));

// Two-Way Output: an inserter whose lane is full waits, so a machine dropping onto two belts puts
// its output wherever there is room. Three bolt factories (600/min) fill two belts of 900: the
// middle one gives each belt the 300 it lacks.
test('Path Flow: a machine on two belts feeds whichever needs it', () => {
  const both = { left: 300, right: 300 };
  const flow = pathFlow({
    lane: LANE, total: 1800, machines: machines(3, 600),
    belts: [
      { want: 900, drops: [{ machine: 0, left: 300, right: 300 }, { machine: 1, ...both }] },
      { want: 900, drops: [{ machine: 1, ...both }, { machine: 2, left: 300, right: 300 }] },
    ],
  });
  near(flow.total, 1800);
  assert.deepEqual(flow.delivered.map(Math.round), [900, 900]);
});

// A lane carries half a belt: drops that all land on one lane fill it and no more, while drops
// whose lane the module still picks (free) fill both.
test('Path Flow: lanes cap a belt; free drops fill both lanes', () => {
  const oneLane = pathFlow({ lane: LANE, total: 1200, machines: machines(2, 600), belts: [{ want: Infinity, drops: [0, 1].map(machine => ({ machine, left: 600, right: 0 })) }] });
  near(oneLane.total, 450);
  const free = pathFlow({ lane: LANE, total: 1200, machines: machines(2, 600), belts: [{ want: Infinity, drops: [0, 1].map(machine => ({ machine, left: 0, right: 0, free: 600 })) }] });
  near(free.total, 900);
});

// A drop whose lane is undecided (onto a curve) counts on the worse lane.
test('Path Flow: undecided lanes count the worse case', () => {
  const flow = pathFlow({
    lane: LANE, total: 900, machines: machines(2, 450),
    belts: [{ want: Infinity, drops: [{ machine: 0, left: 450, right: 0 }, { machine: 1, left: 0, right: 0, either: 450 }] }],
  });
  near(flow.total, 450);
});

// Machines make no more than the plan's total, however fast they could run.
test('Path Flow: the plan total caps what machines with headroom make', () => {
  const flow = pathFlow({ lane: LANE, total: 500, machines: machines(2, 400), belts: [{ want: Infinity, drops: [0, 1].map(machine => ({ machine, left: 0, right: 0, free: 400 })) }] });
  near(flow.total, 500);
});

// Splitters join belts after their producers, lane to lane: 2 to 2 evens out a full belt and a
// half one; 2 to 1 merges a second producers' belt into one; 1 to 2 forks one belt into two
// consumer runs.
test('Path Flow: splitters 2 to 2, 2 to 1 and 1 to 2', () => {
  const full = { machine: 0, left: 450, right: 450 }, half = { machine: 1, left: 450, right: 0 };
  const spec = { lane: LANE, total: 1350, machines: new Map([[0, 900], [1, 450]]), belts: [{ want: 675, drops: [full] }, { want: 675, drops: [half] }] };
  near(pathFlow(spec).total, 675 + 450);
  const paired = pathFlow({ ...spec, splitters: [{ ins: [0, 1], outs: [0, 1] }] });
  near(paired.total, 1350);
  assert.deepEqual(paired.delivered.map(Math.round), [675, 675]);

  const merged = pathFlow({
    lane: LANE, total: 900, machines: new Map([[0, 450], [1, 450]]),
    belts: [{ want: 900, drops: [{ machine: 0, left: 450, right: 0 }] }, { want: 0, drops: [{ machine: 1, left: 0, right: 450 }] }],
    splitters: [{ ins: [0, 1], outs: [0] }],
  });
  near(merged.delivered[0], 900);

  const forked = pathFlow({
    lane: LANE, total: 900, machines: machines(1, 900),
    belts: [{ want: 450, drops: [{ machine: 0, left: 450, right: 450 }] }, { want: 450, drops: [] }],
    splitters: [{ ins: [0], outs: [0, 1] }],
  });
  assert.deepEqual(forked.delivered.map(Math.round), [450, 450]);
});
