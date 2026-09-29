export function buildFlows(plan) {
  const producerOf = new Map(plan.map((sb, i) => [sb.item, i]));
  const internal = [];
  plan.forEach((sb, to) => {
    for (const input of sb.inputs) {
      const from = producerOf.get(input.name);
      if (from !== undefined && from !== to) internal.push({ from, to, item: input.name, type: input.type, rate: input.rate });
    }
  });
  const sideInput = [];
  const sideOutput = [];
  for (const sb of plan) {
    for (const input of sb.inputs) {
      if (!producerOf.has(input.name)) addRate(sideInput, input.name, input.type, input.rate);
    }
  }
  for (const sb of plan) {
    const main = sb.outputs.find(o => o.name === sb.item);
    const consumed = internal.filter(e => e.item === sb.item).reduce((sum, e) => sum + e.rate, 0);
    if (main.rate - consumed > 0) addRate(sideOutput, main.name, main.type, main.rate - consumed);
    for (const b of sb.byproducts) addRate(sideOutput, b.name, b.type, b.rate);
  }
  return { order: dependencyOrder(plan.length, internal), internal, sideInput, sideOutput };
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
