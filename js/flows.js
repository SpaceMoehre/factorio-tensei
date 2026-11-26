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
  const fedBack = new Set([...closing].filter(e => e.type === 'fluid' && (plan[e.from].overflow?.includes(e.item) || plan[e.from].closed?.includes(e.item))));
  for (const e of fedBack) closing.delete(e);
  // Byproducts joined in a loop (ADR 0127): where an item other Sub-Blocks' of it join (Supplied
  // Items, a General Use's sources) goes to a Sub-Block closing a loop, or to one leading back to a
  // joining Sub-Block (Py's plutonium shuffles: each isotope made by three, taken by two, in a
  // ring), it cannot join before them. Each maker's (the one joined into, every joining one) is
  // tapped off its own belt into each taker instead, its share of what each takes (a belt of its
  // own: no step of the Dependency Order). Once one item pools so, one whose takers lead back to
  // the Sub-Block joined into pools too (the ring's other isotopes). Only where the makers cover
  // what the takers take.
  // (By items only: a loop closed by a fluid, Py coke's quench steam back to the ovens, closes as
  // before, the join riding on.)
  const leadsTo = (a, b, seen = new Set()) => a === b || (!seen.has(a) && seen.add(a) && edges.some(e => e.from === a && e.type !== 'fluid' && leadsTo(e.to, b, seen)));
  const joinersOf = new Map();
  plan.forEach((sb, from) => {
    for (const [item, into] of Object.entries(sb.joins ?? {})) {
      if (typeof into !== 'number' || !sb.outputs.some(o => o.name === item && o.type === 'item')) continue;
      const k = `${item}|${into}`;
      joinersOf.set(k, [...joinersOf.get(k) ?? [], from]);
    }
  });
  const makesOf = (i, item) => plan[i].outputs.find(o => o.name === item)?.rate ?? 0;
  const takersOf = (item, into) => edges.filter(e => e.from === into && e.item === item);
  const covered = (k, joiners) => {
    const [item, at] = k.split('|');
    const into = Number(at);
    const made = [into, ...joiners].reduce((sum, i) => sum + makesOf(i, item), 0);
    const taken = takersOf(item, into).reduce((sum, e) => sum + e.rate, 0);
    return taken > 0 && made >= taken * (1 - 1e-6);
  };
  const pools = new Map();
  for (const ring of [false, true]) {
    if (ring && !pools.size) break;
    for (const [k, joiners] of joinersOf) {
      if (pools.has(k)) continue;
      const [item, at] = k.split('|');
      const into = Number(at);
      const takers = takersOf(item, into);
      const looping = takers.some(e => (closing.has(e) && e.type !== 'fluid') || joiners.some(j => leadsTo(e.to, j)) || (ring && leadsTo(e.to, into)));
      if (looping && covered(k, joiners)) pools.set(k, joiners);
    }
  }
  const unjoined = new Set();
  for (const [k, joiners] of pools) {
    const [item, at] = k.split('|');
    const into = Number(at);
    // (Each taker filled from the makers in turn, most first: as few belts as there are makers and
    // takers less one. Never from itself.)
    const makers = [into, ...joiners].map(i => ({ i, left: makesOf(i, item) })).sort((a, b) => b.left - a.left);
    for (const e of takersOf(item, into).sort((a, b) => b.rate - a.rate)) {
      edges.splice(edges.indexOf(e), 1);
      closing.delete(e);
      const mine = [];
      let want = e.rate;
      for (const m of makers) {
        if (want <= 1e-9 * Math.max(1, e.rate)) break;
        const rate = Math.min(want, m.left);
        if (m.i === e.to || !(rate > 1e-9 * Math.max(1, e.rate))) continue;
        mine.push({ from: m.i, to: e.to, item, type: e.type, rate, split: true });
        m.left -= rate;
        want -= rate;
      }
      // (Rounding: the last of its belts brings the rest; a real shortfall from the one joined
      // into, as before.)
      if (mine.length && want <= 1e-6 * e.rate) mine.at(-1).rate += want;
      else if (want > 1e-9 * Math.max(1, e.rate)) mine.push({ ...e, rate: want });
      edges.push(...mine);
    }
    for (const j of joiners) unjoined.add(`${j}|${item}`);
  }
  const joinsOf = (sb, from) => Object.entries(sb.joins ?? {}).filter(([item]) => !unjoined.has(`${from}|${item}`));
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
    if (e.split) return true;
    if (closing.has(e) || e.type === 'fluid' || e.item === plan[e.from].item) return false;
    if (plan.some((sb, i) => joinsOf(sb, i).some(([item, into]) => item === e.item && into === e.from)) && !(e.rate > belt + 1e-6)) return false;
    const solids = solidsOf(e.from);
    return !plan[e.to].inputs.some(x => x.name !== e.item && solids.has(x.name))
      && edges.some(o => o.from === e.from && o.to !== e.to && o.type !== 'fluid' && o.item !== e.item);
  }).map(e => ({ ...e }));
  // (A Supplied Item more than a lane carries, `feeds`: on a belt of its own into those taking it
  // off the other's, each their share, ADR 0068.)
  const fed = plan.flatMap((sb, from) => Object.entries(sb.feeds ?? {}).flatMap(([item, into]) => {
    const o = sb.outputs.find(o => o.name === item);
    const takers = edges.filter(e => e.from === into && e.item === item && !closing.has(e) && !e.split);
    const all = takers.reduce((sum, e) => sum + e.rate, 0);
    if (!o || !all) return [];
    return takers.map(e => {
      const rate = o.rate * e.rate / all;
      e.rate -= rate;
      return { from, to: e.to, item, type: o.type, rate };
    });
  }));
  const own = plan.flatMap((sb, from) => joinsOf(sb, from).flatMap(([item, into]) => {
    const on = tapped.find(e => e.from === into && e.item === item);
    const o = sb.outputs.find(o => o.name === item);
    if (!on || !o) return [];
    on.rate -= o.rate;
    return [{ from, to: on.to, item, type: o.type, rate: o.rate }];
  }));
  // (A producer putting each product on a belt of its own: nothing to tap off, each a belt of
  // that product into the step, ADR 0066.)
  // (A pool's taps a belt of their own whatever the producer, ADR 0127.)
  const off = e => e.split || !apart(e.from);
  const sameAs = (a, b) => a.from === b.from && a.to === b.to && a.item === b.item;
  const internal = [
    ...edges.filter(e => !closing.has(e) && !tapped.some(t => off(t) && sameAs(t, e))).map(e => tapped.find(t => sameAs(t, e)) ?? e),
    ...own.filter(e => !off(e)),
    ...fed,
  ];
  const feedback = [...edges.filter(e => closing.has(e) && e.type !== 'fluid'), ...[...tapped, ...own].filter(off).map(e => ({ ...e, tapped: true }))];
  // A belt every product of which would be tapped off, none left for the train, goes into one of its takers itself, the
  // biggest whose steps lead not back to it (a ring's taps stay as they are: Py's plutonium
  // shuffles), the others tapped off before it (each the filtered item off it, the rest going on):
  // not on to the train with nothing on it (Py tin's grade 1 screeners' grade 2 to the crushers,
  // their grade 1 on into the grade 3 screeners, ADR 0132). A producer putting each product on a
  // belt of its own: each such belt. (Not an item tapped into several: a filter splitter sends all
  // of it one way.) Placed as a tap was, free of the Dependency Order (`loose`): a step of it, the
  // steps between stood in one row too long to place.
  const loose = new Set();
  const back = (a, b, seen = new Set()) => a === b || (!seen.has(a) && seen.add(a) && edges.some(e => e.from === a && back(e.to, b, seen)));
  plan.forEach((_, i) => {
    const solids = new Set(plan[i].outputs.filter(o => o.type === 'item').map(o => o.name));
    for (const belt of apart(i) ? [...solids].map(item => new Set([item])) : [solids]) {
      if (internal.some(e => e.from === i && belt.has(e.item))) continue;
      // (Only one bringing nothing on to the train: else it runs there, with what it brings.)
      const sent = item => [...internal, ...feedback].filter(e => e.from === i && e.item === item).reduce((sum, e) => sum + e.rate, 0);
      if (plan[i].outputs.some(o => belt.has(o.name) && o.rate - (o.name === plan[i].item ? plan[i].extra ?? 0 : 0) - sent(o.name) > 1e-9 * Math.max(1, o.rate))) continue;
      const taps = feedback.filter(e => e.tapped && e.from === i && belt.has(e.item));
      const into = taps.filter(e => taps.filter(t => t.item === e.item).length === 1 && !back(e.to, i)).sort((a, b) => b.rate - a.rate)[0];
      if (!into) continue;
      feedback.splice(feedback.indexOf(into), 1);
      const { tapped: _t, split: _s, ...rest } = into;
      // (Bringing its share of what its taker takes, as the tap did: `loose`.)
      const plain = { ...rest, loose: true };
      internal.push(plain);
      loose.add(plain);
    }
  });
  // (Only into an Internal Path: one of the item's consumers' takes it from there.)
  const joined = plan.flatMap((sb, from) => joinsOf(sb, from).flatMap(([item, into]) => {
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
  return { order: dependencyOrder(plan.length, [...internal.filter(e => !fedBack.has(e) && !loose.has(e)), ...ahead]), fedBack: [...fedBack], internal, feedback, joined, sideInput, sideOutput };
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
