import { machineEffect } from './modules.js';

// Inserter Clocks (CONTEXT.md): how often each inserter swings while its machine runs at full
// speed, as whole swings in whole seconds, so a clock signal can enable it no more often than
// that (one swing a pulse). A swing moves a hand of one item (`handSize`): what the inserter
// moves a second over its hand. Into a machine an inserter moves its share of every item on its
// belt the machine takes (they add up: 1 iron and 2 copper in 3 s are 1 in 1 s, a swing a second
// with a hand of 1, one in 2 s with a hand of 2); out of one, its share of the machine's products.
// Inserters on one belt into a machine, or out of one machine, share it evenly (two of them:
// 1 in 2 s each). Those supporting a machine's Output Drop share what the drop leaves them.

// A block → each inserter's clock (`of`: entity → key, "swings/seconds"), and every clock with
// how many inserters run on it, the items they move and how many a minute each, fastest first.
export function clocksOf(block, catalog, handSize = 1) {
  const hand = Math.max(1, Math.floor(handSize));
  const full = block.subBlocks.map(sb => fullSpeed(sb, catalog));
  const of = new Map();
  const clocks = new Map();
  for (const e of block.entities) {
    const rates = e.kind === 'inserter' && e.sharing ? full[e.subBlock]?.[e.role] : null;
    if (!rates) continue;
    const moved = e.moves.filter(name => rates.has(name));
    // Beside a machine's Output Drop, its supporting inserters move only what the drop surely
    // cannot (dropping: items/s its lane surely takes).
    const perSecond = (moved.reduce((sum, name) => sum + rates.get(name), 0) - (e.dropping ?? 0)) / e.sharing;
    if (!(perSecond > 0)) continue;
    const [swings, seconds] = fraction(perSecond / hand);
    const key = `${swings}/${seconds}`;
    of.set(e, key);
    if (!clocks.has(key)) clocks.set(key, { key, swings, seconds, perMinute: perSecond * 60, inserters: 0, names: new Set() });
    const clock = clocks.get(key);
    clock.inserters++;
    for (const name of moved) clock.names.add(name);
  }
  const ratios = [...clocks.values()].map(c => ({ ...c, names: [...c.names] }))
    .sort((a, b) => b.swings / b.seconds - a.swings / a.seconds);
  return { of, ratios };
}

export const clockLabel = key => `${key.split('/')[0]} ${key.startsWith('1/') ? 'swing' : 'swings'} in ${key.split('/')[1]} s`;

// Items/s one machine of the Sub-Block takes (input) and makes (output) at full speed, by item:
// the plan's flows, scaled from the Sub-Block's rate to one machine's (its Fuel included).
function fullSpeed(sb, catalog) {
  const recipe = catalog.recipes?.[sb.recipe], building = catalog.buildings?.[sb.building];
  const product = recipe?.products.find(p => p.name === sb.item);
  if (!product || !building || !(sb.rate > 0)) return null;
  const effect = machineEffect(catalog, sb.recipe, sb.building, sb.modules ?? []);
  const made = building.craftingSpeed * effect.speed / recipe.time * product.amount * (1 + effect.productivity);
  const rates = flows => new Map(flows.map(f => [f.name, f.rate * made / sb.rate]));
  return { input: rates(sb.inputs ?? []), output: rates(sb.outputs ?? []) };
}

// x as a fraction in lowest terms, [numerator, denominator] (continued fractions: the first
// convergent within float error, so 0.30000000000000004 is 3/10).
export function fraction(x, most = 1e6) {
  let [p0, p1, q0, q1] = [0, 1, 1, 0];
  let v = x;
  for (let k = 0; k < 64; k++) {
    const a = Math.floor(v);
    const [p, q] = [a * p1 + p0, a * q1 + q0];
    if (q > most) break;
    [p0, p1, q0, q1] = [p1, p, q1, q];
    if (Math.abs(x - p1 / q1) <= 1e-9 * x || v === a) break;
    v = 1 / (v - a);
  }
  return p1 ? [p1, q1] : [1, Math.round(1 / x)];
}
