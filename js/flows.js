// Flows between Sub-Blocks: Internal Paths (internal), the Side Input and the Side Output. A
// Recipe Loop's last link — an item taken by a Sub-Block that the item's own producer (through
// those it takes from) takes from, or by its producer itself — is its feedback: fed back from the
// producer's output (an item; a fluid comes by train), not part of the Dependency Order.
// A Byproduct Use's Sub-Block (sb.use) makes its item besides: it feeds only Byproduct Uses of
// its own (sb.from) and the Sub-Blocks taking it from it (a Recycled Byproduct), and what it
// makes of an item another Sub-Block makes joins that one's on its way to its consumers
// (sb.joins: a Supplied Item; `joined`: { from, into, item, type, rate }), what else it makes
// leaving by train.
// belt: what a belt carries a minute (Infinity: any). apart(i): whether Sub-Block i puts each solid
// product on a belt of its own (One Item a Belt, ADR 0066).
export function buildFlows(plan, belt = Infinity, apart = /** @type {(i: number) => boolean} */ (() => false)) {
  const producerOf = new Map(plan.flatMap((sb, i) => (sb.use ? [] : [[sb.item, i]])));
  const edges = [];
  // What a Sub-Block takes by train though another makes it (the chain's choice) is no link.
  // (A part of a split Sub-Block takes an item from the part of its producer named in `from`.)
  const fromOf = (sb, name) => (sb.byTrain?.includes(name) ? undefined : sb.from?.[name] ?? producerOf.get(name));
  plan.forEach((sb, to) => {
    for (const input of sb.inputs) {
      const from = fromOf(sb, input.name);
      if (from !== undefined) edges.push({ from, to, item: input.name, type: input.type, rate: input.rate });
    }
  });
  // The links that close a loop, walking from each Sub-Block (Goals first) to those it takes from.
  const closing = new Set();
  const state = plan.map(() => 0);
  const walk = c => {
    state[c] = 1;
    for (const e of edges.filter(x => x.to === c)) {
      if (state[e.from] === 1) closing.add(e);
      else if (!state[e.from]) walk(e.from);
    }
    state[c] = 2;
  };
  plan.forEach((_, i) => state[i] || walk(i));
  // (A fluid fed back through valves closes its loop in the block, ADR 0062: an Internal Path, but
  // no step of the Dependency Order.)
  const fedBack = new Set([...closing].filter(e => e.type === 'fluid' && plan[e.from].overflow?.includes(e.item)));
  for (const e of fedBack) closing.delete(e);
  // A byproduct taken by a Sub-Block that takes nothing else off its producer's belt, while that
  // belt goes on to others with what they take: tapped off it right after the producers (a
  // filter splitter, as a Recipe Loop's feedback is), not riding on through them. Its surplus
  // would stop the belt where it ends (Py's p2s5 with pyrite, ADR 0054). Not where another
  // Sub-Block's of it joins that belt (a Supplied Item): it rides on, as before; but where the
  // step takes more of it than a belt carries, it is tapped off, and what joined it is tapped off
  // its own producers' belt onto a belt of its own: the step takes it from both, each of its
  // machines from either (Py's BOFs taking coal from crushers and screeners, ADR 0064).
  const solidsOf = i => new Set(plan[i].outputs.filter(o => o.type === 'item').map(o => o.name));
  const tapped = edges.filter(e => {
    if (closing.has(e) || e.type === 'fluid' || e.item === plan[e.from].item) return false;
    if (plan.some(sb => sb.joins?.[e.item] === e.from) && !(e.rate > belt + 1e-6)) return false;
    const solids = solidsOf(e.from);
    return !plan[e.to].inputs.some(x => x.name !== e.item && solids.has(x.name))
      && edges.some(o => o.from === e.from && o.to !== e.to && o.type !== 'fluid' && o.item !== e.item);
  }).map(e => ({ ...e }));
  const own = plan.flatMap((sb, from) => Object.entries(sb.joins ?? {}).flatMap(([item, into]) => {
    const on = tapped.find(e => e.from === into && e.item === item);
    const o = sb.outputs.find(o => o.name === item);
    if (!on || !o) return [];
    on.rate -= o.rate;
    return [{ from, to: on.to, item, type: o.type, rate: o.rate }];
  }));
  // (A producer putting each product on a belt of its own: nothing to tap off, each a belt of
  // that product into the step, ADR 0066.)
  const off = e => !apart(e.from);
  const sameAs = (a, b) => a.from === b.from && a.to === b.to && a.item === b.item;
  const internal = [
    ...edges.filter(e => !closing.has(e) && !tapped.some(t => off(t) && sameAs(t, e))).map(e => tapped.find(t => sameAs(t, e)) ?? e),
    ...own.filter(e => !off(e)),
  ];
  const feedback = [...edges.filter(e => closing.has(e) && e.type !== 'fluid'), ...[...tapped, ...own].filter(off).map(e => ({ ...e, tapped: true }))];
  // (Only into an Internal Path: one of the item's consumers' takes it from there.)
  const joined = plan.flatMap((sb, from) => Object.entries(sb.joins ?? {}).flatMap(([item, into]) => {
    const o = sb.outputs.find(o => o.name === item);
    return o && internal.some(e => e.from === into && e.item === item) && !own.some(e => e.from === from && e.item === item) ? [{ from, into, item, type: o.type, rate: o.rate }] : [];
  }));
  // A fluid fed back (ADR 0062): what makes up the rest (a Sub-Block's, or the train's) comes into
  // its producer's pipe through a top-up valve (`valve`).
  plan.forEach((sb, into) => {
    for (const [item, { from, rate }] of Object.entries(sb.topUp ?? {})) joined.push({ from, into, item, type: 'fluid', rate, valve: true });
  });
  const sideInput = [];
  const sideOutput = [];
  // An input no Sub-Block makes arrives by train, and a fluid a loop takes back.
  plan.forEach((sb, i) => {
    for (const input of sb.inputs) {
      const from = fromOf(sb, input.name);
      if (from === undefined || (input.type === 'fluid' && [...closing].some(e => e.to === i && e.item === input.name))) addRate(sideInput, input.name, input.type, input.rate);
    }
  });
  plan.forEach((sb, i) => {
    // (Its item first, then its byproducts.)
    for (const o of [sb.outputs.find(o => o.name === sb.item), ...sb.byproducts]) {
      // (An Extension's extra stays on its pipe for an Annex to draw.)
      const left = o.rate - (o.name === sb.item ? sb.extra ?? 0 : 0) + joinedInto({ joined }, i, o.name) - taken(plan, { internal, feedback, joined }, i, o.name);
      if (left > 1e-9 * Math.max(1, o.rate)) addRate(sideOutput, o.name, o.type, left);
    }
  });
  // (A Supplied Item's Use before the consumers of the Sub-Block it joins, where that makes no
  // cycle: its belt joins theirs before them.)
  const reaches = (a, b, seen = new Set()) => a === b || (!seen.has(a) && seen.add(a) && internal.some(e => e.from === a && reaches(e.to, b, seen)));
  const ahead = joined.filter(j => typeof j.from === 'number').flatMap(j => internal.filter(e => e.from === j.into && e.item === j.item && !reaches(e.to, j.from)).map(e => ({ from: j.from, to: e.to })));
  return { order: dependencyOrder(plan.length, [...internal.filter(e => !fedBack.has(e)), ...ahead]), fedBack: [...fedBack], internal, feedback, joined, sideInput, sideOutput };
}

// What Byproduct Uses' Supplied Items bring a Sub-Block's route of an item.
export function joinedInto(flows, i, item) {
  return (flows.joined ?? []).filter(j => j.into === i && j.item === item).reduce((sum, j) => sum + j.rate, 0);
}

// What Sub-Blocks take of a Sub-Block's item: its own (a Sub-Block in parts, Bands: all its
// parts') through Internal Paths and feedback, and what joins another's (a Supplied Item).
export function taken(plan, flows, i, item) {
  const of = plan[i].item === item && plan[i].part && !plan[i].use ? plan.flatMap((sb, j) => (sb.item === item && sb.part ? [j] : [])) : [i];
  return [...flows.internal, ...flows.feedback ?? [], ...flows.joined ?? []].filter(e => e.item === item && of.includes(e.from)).reduce((sum, e) => sum + e.rate, 0);
}

function addRate(flows, item, type, rate) {
  const existing = flows.find(f => f.item === item);
  if (existing) existing.rate += rate;
  else flows.push({ item, type, rate });
}

// Kahn's algorithm, stable on Goal order; Sub-Blocks left in a cycle keep Goal order.
function dependencyOrder(n, edges) {
  const indegree = Array(n).fill(0);
  for (const e of edges) indegree[e.to]++;
  const order = [];
  const placed = new Set();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let i = 0; i < n; i++) {
      if (placed.has(i) || indegree[i] > 0) continue;
      order.push(i);
      placed.add(i);
      for (const e of edges) if (e.from === i) indegree[e.to]--;
      progressed = true;
      break;
    }
  }
  for (let i = 0; i < n; i++) if (!placed.has(i)) order.push(i);
  return order;
}
