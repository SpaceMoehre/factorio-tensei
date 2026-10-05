// Flows between Sub-Blocks: Internal Paths (internal), the Side Input and the Side Output. A
// Recipe Loop's last link — an item taken by a Sub-Block that the item's own producer (through
// those it takes from) takes from, or by its producer itself — is its feedback: fed back from the
// producer's output (an item; a fluid comes by train), not part of the Dependency Order.
export function buildFlows(plan) {
  const producerOf = new Map(plan.map((sb, i) => [sb.item, i]));
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
  for (const sb of plan) {
    const main = sb.outputs.find(o => o.name === sb.item);
    const consumed = [...internal, ...feedback].filter(e => e.item === sb.item).reduce((sum, e) => sum + e.rate, 0);
    if (main.rate - consumed > 1e-9) addRate(sideOutput, main.name, main.type, main.rate - consumed);
    for (const b of sb.byproducts) addRate(sideOutput, b.name, b.type, b.rate);
  }
  return { order: dependencyOrder(plan.length, internal), internal, feedback, sideInput, sideOutput };
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
