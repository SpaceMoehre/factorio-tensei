// Laying out a placed candidate, as the layout search, Bands and the user's moves all do: its
// links routed (compose.js); where they find no way, the same again by the caller's ladder of
// other ways to route them (Fan-outs last, none across Sub-Blocks, no splitters, …), and where a
// byproduct's splitter after its producers finds none, their belt chained through the consumers
// instead, route by route; then finished (pipes buried, belts straightened, poles placed),
// checked and scored. Why routing failed reaches the caller as plain data, never as the errors
// compose throws.

import { compose, RoutingError, PowerError } from './compose.js';
import { finishBlock, given } from './compact.js';
import { validateBlock } from './validity.js';
import { scoreOf } from './score.js';

// What a routing failure tells a ladder's rungs: whether it had Fan-outs (fans), ran across
// Sub-Blocks (across), left a pair of belts unbalanced for want of room for their splitter
// (unbalanced), was a routing failure at all (routing; else a PowerError: power).
/** @returns {{ routing: boolean, power: boolean, fans: boolean, across: boolean, unbalanced: boolean }} */
const whyOf = e => ({ routing: e instanceof RoutingError, power: e instanceof PowerError, fans: !!e.fans, across: !!e.across, unbalanced: !!e.unbalanced });

// What a failure suggests trying next: room round these Sub-Blocks (room: their indices),
// placing one first (unplaced), placing them one by one (noColumns: they fit no columns), a pole
// where a machine found none (pole: { x, y }), the route a byproduct's splitter found no way for
// (chain).
const hintOf = e => ({
  ...(e.steps ? { room: e.steps } : {}), ...(e.unplaced !== undefined ? { unplaced: e.unplaced } : {}), ...(e.noColumns ? { noColumns: true } : {}),
  ...(e.at ? { pole: e.at } : {}), ...(e.chain !== undefined ? { chain: e.chain } : {}),
});

const laidOut = e => e instanceof RoutingError || e instanceof PowerError;

// A failure placing a candidate (or laying it out) as layOut tells it: { error, hint }.
export function failureOf(e) {
  return { error: e, hint: hintOf(e) };
}

// ctx: design.js context(); rechain(chained): the candidate prepared and placed with these routes'
// belts chained through their consumers (a Set of route ids, or 'all'), { ready, positions } —
// with none chained (an empty Set) the candidate as it is; null where it cannot be.
// policy: { layout (compose's options), until (compose's, not kept in `used`), ladder (the rungs
//           tried after the first, in turn: { use (compose's options over layout's), when(why)
//           (whether to try it, by why the rung before failed, or the first did: judge), chains
//           (false: no route chained where its splitter finds no way), chained ('all': every route
//           chained), tells (judge 'first': its failure is told rather than the first's) }),
//           judge ('first': every rung judged by why the first failed, each failing as its first
//           attempt did, the first's failure told; 'last': each by why the rung before it last
//           failed, the last one's told), power (a PowerError in routing goes on to the next rung, as a RoutingError
//           does; else it ends the ladder), finish (finishBlock's options), giving (Giving Way:
//           the Sub-Block giving up machines), leaveRouted(block) (true: the block left as
//           routed, unfinished and unchecked), score (false: none) }
// Returns { block, score, used (compose's options it was laid out with), ready, positions (those
// it was laid out from), unfinished, room, chain } or { failure: { error, stage ('routed',
// 'finished' or 'valid'), hint }, composed (where finishing failed), room, chain }; room: the
// Sub-Blocks the first routing failure found no room between, where it did; chain: the route of
// the first routing failure whose splitter found no way, where one did.
export function layOut(ctx, rechain, policy = {}) {
  const { layout = {}, until = null, ladder = [], judge = 'first', power = false, finish = {}, giving = undefined, leaveRouted = null, score = true } = policy;
  const optionsOf = use => ({ ...layout, ...use, ...(until ? { until } : {}) });
  // One rung: routed as it is, then chained route by route where a splitter finds no way.
  // { composed, used, ready, positions } or { error } (as judged: its first error, or its last).
  const rung = ({ use = {}, chains = true, chained = undefined }) => {
    /** @type {Set<any> | 'all'} */
    const set = chained === 'all' ? 'all' : new Set();
    let first = null, last = null;
    for (;;) {
      let at = null;
      try {
        at = rechain(set instanceof Set ? new Set(set) : set);
        if (at) return { composed: compose(ctx, at.ready, at.positions, optionsOf(use)), used: { ...layout, ...use }, ...at };
      } catch (e) {
        if (!(e instanceof RoutingError || (power && e instanceof PowerError))) throw e;
        last = e;
        first ??= e;
      }
      if (!at || !chains || !(set instanceof Set) || !(last instanceof RoutingError) || last.chain === undefined || set.has(last.chain)) break;
      set.add(last.chain);
    }
    errors.push(first, last);
    return { error: judge === 'first' ? first : last };
  };
  // (Every rung's first and last failures, for the first whose splitter found no way.)
  const errors = [];
  let routed = null, error = null, firstError = null;
  try {
    routed = rung({});
    if (routed.error) {
      firstError = error = routed.error;
      for (const step of ladder) {
        if (step.when && !step.when(whyOf(judge === 'first' ? firstError : error))) continue;
        const out = rung(step);
        if (out.composed) {
          routed = out;
          break;
        }
        if ((judge !== 'first' || step.tells) && out.error) error = out.error;
      }
    }
  } catch (e) {
    if (!laidOut(e)) throw e;
    error = e;
    routed = { error: e };
  }
  const room = firstError instanceof RoutingError ? firstError.steps ?? null : null;
  const chain = errors.find(e => e?.chain !== undefined)?.chain;
  if (routed.error || !routed.composed) return { failure: { error: error ?? new RoutingError('no layout to route'), stage: 'routed', hint: error ? hintOf(error) : {} }, room, chain };
  const { composed, used, ready, positions } = routed;
  let block, unfinished = false;
  try {
    const plain = leaveRouted ? given(composed, giving) : null;
    unfinished = Boolean(plain && leaveRouted(plain));
    block = unfinished ? plain : given(finishBlock(composed, ctx.catalog, ctx.logistics, finish), giving);
  } catch (e) {
    if (!laidOut(e)) throw e;
    return { failure: { error: e, stage: 'finished', hint: hintOf(e) }, composed, room, chain };
  }
  if (!unfinished) {
    const problems = validateBlock(block, ctx.catalog, ctx.logistics);
    if (problems.length) return { failure: { error: new Error(`invalid layout: ${problems[0]}`), stage: 'valid', hint: {} }, room, chain };
  }
  return { block, score: score ? scoreOf(block) : null, used, ready, positions, unfinished, room, chain };
}
