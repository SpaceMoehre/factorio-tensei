// Which of a building's fluid boxes each fluid of a recipe takes, as Factorio assigns them: the
// recipe's fluid ingredients the building's input boxes, its fluid products the output boxes, each
// side on its own, the boxes in the building's order. A fluid with a fluidbox_index takes that box
// alone (counted from 1 among the side's boxes); the others share the boxes left, in recipe order,
// a run each, the first ones a box more where they do not divide evenly. So a recipe with fewer
// fluids than boxes uses them all: Py's research center has three input boxes, py-science-pack-2
// two fluids, arqad honey taking the first two and flavonoids the third. A fluid's boxes join into
// one: a pipe to any of their connections feeds it.
// Returns { inputs: { [fluid]: [box] }, outputs: { [fluid]: [box] } }, a box being its index in
// building.fluidBoxes, or null where the building cannot take the recipe's fluids: too few boxes,
// or one filtered for another fluid.
// A machine burning a Liquid Fuel (fuel, its name) takes it through its energy source's box
// (production 'fuel'), apart from the recipe's fluids; one taking that fluid in the recipe too
// cannot.
export function assignFluidBoxes(recipe, building, fuel = null) {
  const inputs = assign(recipe.ingredients, building, ['input', 'input-output']);
  const outputs = assign(recipe.products, building, ['output', 'input-output']);
  if (!inputs || !outputs) return null;
  const box = building.fluidBoxes.findIndex(b => b.production === 'fuel');
  if (fuel && box >= 0) {
    if (inputs[fuel] || outputs[fuel]) return null;
    inputs[fuel] = [box];
  }
  return { inputs, outputs };
}

function assign(flows, building, types) {
  const fluids = flows.filter(f => f.type === 'fluid');
  const boxes = building.fluidBoxes.flatMap((b, i) => (types.includes(b.production) ? [i] : []));
  const out = {};
  for (const f of fluids.filter(f => f.fluidboxIndex)) {
    const box = boxes[f.fluidboxIndex - 1];
    if (box === undefined || Object.values(out).some(taken => taken.includes(box))) return null;
    out[f.name] = [box];
  }
  const taken = new Set(Object.values(out).flat());
  const left = boxes.filter(b => !taken.has(b));
  const rest = fluids.filter(f => !f.fluidboxIndex);
  if (rest.length > left.length) return null;
  let at = 0;
  rest.forEach((f, k) => {
    const n = Math.ceil((left.length - at) / (rest.length - k));
    out[f.name] = left.slice(at, at += n);
  });
  const misfit = Object.entries(out).some(([name, list]) => list.some(b => building.fluidBoxes[b].filter && building.fluidBoxes[b].filter !== name));
  return misfit ? null : out;
}
