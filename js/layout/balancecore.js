import { designBalancer, arrangement, layBalancer, beltsFor } from '../balancer.js';

// A belt balancer as a Sub-Block (ADR 0092): its Module is a fixed network of belts, undergrounds and
// splitters (balancer.js), no machines. Its n in belts end against its west side and its m out belts
// start at its east side, as a Head-on Belt does, so the Compound Block places it like any other
// Sub-Block and links route to it; each in belt takes the share of the item the Count's producers put
// on it. The core is the network of the n and m that suit it (design.js asks for candidates, the
// fewest belts first).
const LONG = 20;
const designs = new Map();

// The core of a balancer for n in belts (the Internal Path's parts) and the Sub-Block's m out belts:
// { core, n, m } or null where no network fits. links: coreLinks; names: balancer.js namesOf.
export function balancerCore(sb, links, names, n, perBelt) {
  const total = sb.inputs.reduce((sum, i) => sum + i.rate, 0);
  const m = Math.min(n, beltsFor(total, perBelt));
  const rates = Array(n).fill(total / n / perBelt);
  const key = `${n}:${m}:${Math.round(rates[0] * 20)}:${names.reach}`;
  if (!designs.has(key)) {
    const design = designBalancer(n, m, { rates });
    // Where the in belts stand: the rows its first splitters take them on, so no track is needed
    // (one lane of the input channel each).
    const { placed } = arrangement(design, names.reach);
    const rows = design.inLanes.map(lane => placed[0].enter[lane]);
    const ends = rows.map(y => ({ x: -1, y }));
    const height = Math.max(...placed.map(p => p.rowsUsed));
    // (Its detours by spare rows beside the band, as many as it has lanes.)
    const laid = layBalancer(design, ends, names, () => true, { y0: -height, y1: 2 * height, top: 0 });
    designs.set(key, laid ? { design, laid, rows } : null);
  }
  const found = designs.get(key);
  if (!found) return null;
  const { design, laid, rows } = found;
  const inRoute = links.inputs[0], outRoute = links.output;
  const xs = laid.x1;
  const minY = Math.min(...laid.entities.map(e => e.y)), maxY = Math.max(...laid.entities.map(e => e.y + e.h));
  const head = (routeId, part, y, x, face) => ({
    routeIds: [routeId], part, kind: 'head', face, axis: 'h', y, x: null, reserve: [[x, y]], waypoints: [[x, y]],
  });
  const inRows = rows.map((y, k) => head(inRoute, k, y - minY, 0, 'W'));
  const outRows = laid.outputs.map((o, j) => head(outRoute, j, o.y - minY, xs, 'E'));
  // (The belts' end tiles are the Links' to lay: not part of the network.)
  const tiles = new Set([...inRows, ...outRows].map(r => `${r.reserve[0][0]},${r.y}`));
  const entities = laid.entities.map(e => ({ ...e, y: e.y - minY })).filter(e => !(e.kind === 'belt' && tiles.has(`${e.x},${e.y}`)));
  const share = sb.count / n;
  const part = (r, k, output) => ({
    routeIds: r.routeIds, part: r.part, rows: [k], machines: share, lanes: 2, output, kind: 'head', face: r.face,
    canEnter: !output, canExit: output,
  });
  const core = {
    w: xs + 1, h: maxY - minY,
    entities, rows: [...inRows, ...outRows], pipeRows: [], parts: [...inRows.map((r, k) => part(r, k, false)), ...outRows.map((r, j) => part(r, j, true))],
    ports: [], pipeBlocked: [], surfacePorts: [], taps: [], poleSlots: [], dropTiles: [], supply: [], shortfall: 0, overload: 0, pathDrops: null, supporting: 0,
    balancer: { n, m, evenness: design.evenness },
  };
  return { core, n, m };
}
