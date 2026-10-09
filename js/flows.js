// Flows between Sub-Blocks: Internal Paths (internal), the Side Input and the Side Output. A
// Recipe Loop's last link — an item taken by a Sub-Block that the item's own producer (through
// those it takes from) takes from, or by its producer itself — is its feedback: fed back from the
// producer's output (an item; a fluid comes by train), not part of the Dependency Order.
// A Byproduct Use's Sub-Block (sb.use) makes its item besides: it feeds only Byproduct Uses of
// its own (sb.from), what else it makes leaving by train.
export function buildFlows(plan) {
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
  const internal = edges.filter(e => !closing.has(e));
  const feedback = edges.filter(e => closing.has(e) && e.type !== 'fluid');
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
      const left = o.rate - taken(plan, { internal, feedback }, i, o.name);
      if (left > 1e-9 * Math.max(1, o.rate)) addRate(sideOutput, o.name, o.type, left);
    }
  });
  return { order: dependencyOrder(plan.length, internal), internal, feedback, sideInput, sideOutput };
}

// What Sub-Blocks take of a Sub-Block's item: its own (a Sub-Block in parts, Bands: all its
// parts') through Internal Paths and feedback.
export function taken(plan, flows, i, item) {
  const of = plan[i].item === item && plan[i].part && !plan[i].use ? plan.flatMap((sb, j) => (sb.item === item && sb.part ? [j] : [])) : [i];
  return [...flows.internal, ...flows.feedback ?? []].filter(e => e.item === item && of.includes(e.from)).reduce((sum, e) => sum + e.rate, 0);
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
