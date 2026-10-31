// Pan/zoom map of a Compound Block on a <canvas>: drag to pan, wheel or pinch to zoom around the
// cursor or the fingers; a tap or click selects what is there (an entity, else the Sub-Block whose
// box it is in), outlined with its route, and onSelect hears of it; a double tap or click selects
// the whole Sub-Block it is on, anywhere on it, and elsewhere zooms in.
// A Sub-Block (its stack, or a machine a Breakout stood apart) picked up — pressed and held, or
// dragged once selected — follows the pointer tile by tile, and onMove hears where it was put.
import { displayName } from './names.js';

const ARROW = { 0: [0, -1], 4: [1, 0], 8: [0, 1], 12: [-1, 0] };
const MIN_SCALE = 2, MAX_SCALE = 64;
// How long a press picks a Sub-Block up (ms), how far a pointer moves before a press pans (px),
// and how close to the map's edge a Sub-Block carried pans it (px).
const HOLD = 420, SLOP = 8, EDGE = 36;

// circuit: the circuit wires to draw, { colors: ['red', 'green'], pairs (circuitPairs) }, or null.
// onMove: called with ({ step, inst }, dx, dy, turns) where a Sub-Block (its stack; `inst`: a
// machine stood apart) was put down that many tiles off, turned so many quarter turns clockwise
// (R while carried; null: nothing moves; only a block with `edit` may be moved, edit.js). onContext: called with ({ step, inst }, { x, y }: where on the page) on a
// right click on a Sub-Block that may be moved, which it selects. view: where the map starts
// ({ scale, x, y }), else it fits the block.
/**
 * @param {HTMLCanvasElement} canvas
 * @param {any} block
 * @param {{ onHover?: (entity: any, block: any) => void, onSelect?: (hit: any, block: any) => void, onMove?: ((unit: { step: number, inst?: number }, dx: number, dy: number, turns: number) => void) | null, onContext?: ((unit: { step: number, inst?: number }, at: { x: number, y: number }) => void) | null, starving?: Set<number>, icon?: (name: string) => string | null, circuit?: { colors: string[], pairs: number[][] } | null, view?: { scale: number, x: number, y: number } | null }} [options]
 */
export function createMap(canvas, block, { onHover = () => {}, onSelect = () => {}, onMove: onPut = null, onContext = null, starving = new Set(), icon = () => null, circuit = null, view: start = null } = {}) {
  const ctx = canvas.getContext('2d');
  // Icons load in the background; the map redraws as each arrives.
  const images = new Map();
  const image = name => {
    if (!images.has(name)) {
      const url = icon(name);
      const img = url ? new Image() : null;
      if (img) {
        img.onload = () => draw();
        img.src = url;
      }
      images.set(name, img);
    }
    const img = images.get(name);
    return img?.complete && img.naturalWidth ? img : null;
  };
  // Draws an icon's first mipmap (the square at the left of the file) centred in a box.
  const drawIcon = (name, cx, cy, size) => {
    const img = image(name);
    if (!img) return false;
    // Half a pixel in from the edges, so smoothing never samples the next mipmap.
    const h = img.naturalHeight;
    ctx.drawImage(img, 0.5, 0.5, h - 1, h - 1, cx - size / 2, cy - size / 2, size, size);
    return true;
  };
  const pieceIndex = new Map();
  for (const r of block.routes) r.pieces.forEach((p, i) => pieceIndex.set(p, i));
  const view = { scale: 16, x: 0, y: 0, ...(start ?? {}) };
  const colors = palette(block);
  // A City Block: its area, the Buffer inside its border, and its Fixtures.
  const { site = null } = block;
  const fixtures = site?.fixtures ?? [];
  // What the map covers: the City Block, else the block itself.
  const extent = site?.area ?? block.bounds;
  const byTile = new Map();
  for (const e of [...fixtures, ...block.entities]) {
    for (let dx = 0; dx < e.w; dx++) for (let dy = 0; dy < e.h; dy++) byTile.set(`${e.x + dx},${e.y + dy}`, e);
  }

  // What may be moved: each Sub-Block's stack and each machine stood apart (its box, the copies it
  // holds), with their pieces; where their pieces stand.
  const units = [];
  if (onPut && block.edit) {
    const { instances } = block.edit;
    block.subBlocks.forEach((sb, i) => {
      units.push({ step: i, box: sb, members: new Set(instances.filter(n => n.step === i && !n.detached).map(n => n.index)), pieces: [] });
      for (const b of sb.apart ?? []) if (b.inst !== undefined) units.push({ step: i, inst: b.inst, box: b, members: new Set([b.inst]), pieces: [] });
    });
  }
  const unitOf = new Map();
  for (const u of units) for (const n of u.members) unitOf.set(n, u);
  const owner = new Map();
  for (const e of block.entities) {
    const u = unitOf.get(e.copy);
    if (!u) continue;
    u.pieces.push(e);
    for (let dx = 0; dx < e.w; dx++) for (let dy = 0; dy < e.h; dy++) owner.set(`${e.x + dx},${e.y + dy}`, u);
  }
  const fixed = new Set();
  for (const f of fixtures) for (let dx = 0; dx < f.w; dx++) for (let dy = 0; dy < f.h; dy++) fixed.add(`${f.x + dx},${f.y + dy}`);
  // The unit at a tile: the one its piece is of, else the box it is in (a machine apart's first).
  const unitAt = (tx, ty) => {
    const mine = owner.get(`${tx},${ty}`);
    if (mine) return mine;
    const inBox = b => tx >= b.x && ty >= b.y && tx < b.x + b.w && ty < b.y + b.h;
    return units.find(u => u.inst !== undefined && inBox(u.box)) ?? units.find(u => u.inst === undefined && inBox(u.box)) ?? null;
  };
  // Whether a unit `dx`, `dy` off stands outside the City Block ('outside'), or on another's
  // pieces or a Fixture ('taken'); else false.
  const clashes = (u, dx, dy, turns = 0) => {
    let taken = false;
    for (const e of u.pieces) {
      for (let ax = 0; ax < e.w; ax++) {
        for (let ay = 0; ay < e.h; ay++) {
          const [tx, ty] = turned(u.box, e.x + ax, e.y + ay, turns);
          const x = tx + dx, y = ty + dy, k = `${x},${y}`;
          if (site && (x < site.inner.x || y < site.inner.y || x >= site.inner.x + site.inner.w || y >= site.inner.y + site.inner.h)) return 'outside';
          if ((owner.get(k) ?? u) !== u || fixed.has(k)) taken = true;
        }
      }
    }
    return taken && 'taken';
  };
  // A unit carried (lift: picked up, dx and dy off where it stood, from the world point it was
  // picked up at), and one put down whose move is being laid out (`placing`).
  let lift = null, placing = null;

  // The selection: { entity } or { subBlock } (its index), and the route its entity is on.
  let selected = null;
  const routeOf = new Map();
  for (const r of block.routes) for (const p of r.pieces) routeOf.set(p, r.id);
  const hitAt = (tx, ty) => {
    const entity = byTile.get(`${tx},${ty}`);
    if (entity) return { entity, route: entity.route ?? routeOf.get(entity) ?? null };
    const sb = block.subBlocks.find(b => [b, ...(b.apart ?? [])].some(r => tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h));
    return sb ? { subBlock: sb.index ?? block.subBlocks.indexOf(sb) } : null;
  };
  // The Sub-Block a tile is part of: its machine or inserter, a piece of its stack, or a tile of
  // its box (or a machine's it stood apart); else null.
  const subBlockAt = (tx, ty) => {
    const entity = byTile.get(`${tx},${ty}`);
    if (entity?.subBlock !== undefined && entity.subBlock !== null) return entity.subBlock;
    const mine = owner.get(`${tx},${ty}`);
    if (mine) return mine.step;
    const sb = block.subBlocks.find(b => [b, ...(b.apart ?? [])].some(r => tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h));
    return sb ? sb.index ?? block.subBlocks.indexOf(sb) : null;
  };

  const theme = () => {
    const css = getComputedStyle(canvas);
    return {
      bg: css.getPropertyValue('--map-bg').trim() || '#14161b',
      grid: css.getPropertyValue('--map-grid').trim() || '#23262e',
      machine: css.getPropertyValue('--map-machine').trim() || '#3b4658',
      machineEdge: css.getPropertyValue('--map-machine-edge').trim() || '#8aa0c0',
      text: css.getPropertyValue('--map-text').trim() || '#e8e8e8',
      starve: css.getPropertyValue('--map-starve').trim() || '#ff5c5c',
      subBlock: css.getPropertyValue('--map-subblock').trim() || '#e0c097',
    };
  };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function fit() {
    const { width, height } = canvas.getBoundingClientRect();
    const b = extent;
    view.scale = clamp(Math.min(width / b.w, height / b.h) * 0.95, MIN_SCALE, MAX_SCALE);
    view.x = b.x + b.w / 2 - width / 2 / view.scale;
    view.y = b.y + b.h / 2 - height / 2 / view.scale;
    draw();
  }

  function zoomAt(px, py, factor) {
    const wx = view.x + px / view.scale, wy = view.y + py / view.scale;
    view.scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
    view.x = wx - px / view.scale;
    view.y = wy - py / view.scale;
    draw();
  }

  // The theme and the canvas's size as the map draws it now.
  let shade = null, size = { width: 0, height: 0 };

  function draw() {
    const t = shade = theme();
    const { width, height } = size = canvas.getBoundingClientRect();
    const s = view.scale;
    const sx = x => (x - view.x) * s, sy = y => (y - view.y) * s;
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, width, height);

    if (s >= 6) {
      const g = extent;
      ctx.strokeStyle = t.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = g.x; x <= g.x + g.w; x++) { ctx.moveTo(sx(x), sy(g.y)); ctx.lineTo(sx(x), sy(g.y + g.h)); }
      for (let y = g.y; y <= g.y + g.h; y++) { ctx.moveTo(sx(g.x), sy(y)); ctx.lineTo(sx(g.x + g.w), sy(y)); }
      ctx.stroke();
    }

    if (site) {
      // The Buffer, kept free, and the City Block's border.
      const { area: a, inner: n } = site;
      ctx.fillStyle = 'rgba(160, 170, 190, 0.08)';
      ctx.fillRect(sx(a.x), sy(a.y), a.w * s, (n.y - a.y) * s);
      ctx.fillRect(sx(a.x), sy(n.y + n.h), a.w * s, (a.y + a.h - n.y - n.h) * s);
      ctx.fillRect(sx(a.x), sy(n.y), (n.x - a.x) * s, n.h * s);
      ctx.fillRect(sx(n.x + n.w), sy(n.y), (a.x + a.w - n.x - n.w) * s, n.h * s);
      ctx.strokeStyle = t.machineEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx(a.x), sy(a.y), a.w * s, a.h * s);
    }
    // Side Input enters on the west edge, Side Output leaves on the east edge (in a City Block,
    // inside its Buffer).
    const b = site?.inner ?? block.bounds;
    ctx.fillStyle = 'rgba(120, 200, 140, 0.18)';
    ctx.fillRect(sx(b.x), sy(b.y), s, b.h * s);
    ctx.fillStyle = 'rgba(230, 160, 90, 0.18)';
    // (On the Output Side the user chose, ADR 0069: block.out, east by default.)
    if (block.out === 0) ctx.fillRect(sx(b.x), sy(b.y), b.w * s, s);
    else if (block.out === 8) ctx.fillRect(sx(b.x), sy(b.y + b.h - 1), b.w * s, s);
    else ctx.fillRect(sx(b.x + b.w - 1), sy(b.y), s, b.h * s);

    // The City Block's entities, which the block is built around.
    for (const f of fixtures) {
      const x = sx(f.x), y = sy(f.y), w = f.w * s, h = f.h * s;
      if (x > width || y > height || x + w < 0 || y + h < 0) continue;
      ctx.fillStyle = 'rgba(120, 128, 145, 0.45)';
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      if (s * Math.min(f.w, f.h) >= 12) drawIcon(f.name, x + w / 2, y + h / 2, Math.min(w, h) * 0.8);
    }

    // (A Sub-Block carried, or put down while its move is laid out, stands where it goes.)
    const away = lift?.unit ?? placing?.unit ?? null;
    for (const sb of block.subBlocks) {
      ctx.strokeStyle = starving.has(sb.index) ? t.starve : t.subBlock;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      // Machines broken out of it (Breakout) in boxes of their own.
      for (const b of [sb, ...(sb.apart ?? [])]) if (b !== away?.box) ctx.strokeRect(sx(b.x) - 3, sy(b.y) - 3, b.w * s + 6, b.h * s + 6);
      ctx.setLineDash([]);
      if (s >= 3 && sb !== away?.box) {
        ctx.fillStyle = starving.has(sb.index) ? t.starve : t.subBlock;
        ctx.font = `${Math.max(10, Math.min(14, s))}px system-ui, sans-serif`;
        ctx.fillText(`${words(sb.item)} ×${sb.count}`, sx(sb.x), sy(sb.y) - 6);
      }
    }

    for (const e of block.entities) if (!away || !away.members.has(e.copy)) drawEntity(e, 0, 0);

    // Output Drops, as the game shows them: a yellow arrow out of the machine, across its edge
    // onto the tile it puts its products on.
    if (s >= 8) for (const e of block.entities) if (e.kind === 'building' && e.drop && (!away || !away.members.has(e.copy))) drawDrop(e, 0, 0);

    // Copper wires between poles (on to the City Block's: indices past the entities), then the
    // circuit wires, red and green side by side.
    const wire = (pairs, style, width, shift) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const [a, b] of pairs) {
        const p = block.entities[a] ?? fixtures[a - block.entities.length], q = block.entities[b] ?? fixtures[b - block.entities.length];
        ctx.moveTo(sx(p.x + p.w / 2) + shift, sy(p.y + p.h / 2) + shift);
        ctx.lineTo(sx(q.x + q.w / 2) + shift, sy(q.y + q.h / 2) + shift);
      }
      ctx.stroke();
    };
    wire(block.wires ?? [], 'rgba(214, 140, 70, 0.9)', Math.max(1, s * 0.08), 0);
    (circuit?.colors ?? []).forEach((color, k) => wire(circuit.pairs, color === 'red' ? 'rgba(230, 70, 70, 0.85)' : 'rgba(70, 200, 90, 0.85)',
      Math.max(1, s * 0.05), (k - (circuit.colors.length - 1) / 2) * Math.max(1, s * 0.1)));

    // The selection: its route's every piece, then it, outlined in the accent colour.
    if (selected) {
      const accent = t.subBlock;
      const outline = (e, pad, width) => {
        ctx.strokeStyle = accent;
        ctx.lineWidth = width;
        ctx.strokeRect(sx(e.x) - pad, sy(e.y) - pad, e.w * s + 2 * pad, e.h * s + 2 * pad);
      };
      if (selected.route !== null && selected.route !== undefined) {
        ctx.fillStyle = 'rgba(232, 160, 60, 0.28)';
        for (const p of block.routes[selected.route]?.pieces ?? []) ctx.fillRect(sx(p.x), sy(p.y), p.w * s, p.h * s);
      }
      if (selected.entity) {
        const sb = block.subBlocks[selected.entity.subBlock];
        if (sb) {
          ctx.setLineDash([6, 4]);
          for (const b of [sb, ...(sb.apart ?? [])]) outline(b, 3, 2);
          ctx.setLineDash([]);
        }
        ctx.shadowColor = accent;
        ctx.shadowBlur = 12;
        outline(selected.entity, 2, Math.max(2, s * 0.12));
        ctx.shadowBlur = 0;
      } else if (selected.subBlock !== undefined) {
        const sb = block.subBlocks[selected.subBlock];
        ctx.fillStyle = 'rgba(232, 160, 60, 0.1)';
        for (const b of [sb, ...(sb.apart ?? [])]) {
          if (b === away?.box) continue;
          ctx.fillRect(sx(b.x), sy(b.y), b.w * s, b.h * s);
          outline(b, 3, 2.5);
        }
      }
    }

    // A Sub-Block carried: faint where it stood, whole where it goes, its box in the accent
    // colour (red where it would stand on another or a Fixture: the move takes it to the nearest
    // room; or outside the City Block), with how far it goes; put down, while its move is laid
    // out, the same.
    if (away) {
      const { dx, dy, clash, turns = 0 } = lift ?? placing;
      ctx.globalAlpha = 0.28;
      for (const e of away.pieces) drawEntity(e, 0, 0);
      ctx.globalAlpha = 1;
      // (Turned: drawn turned about its box's middle, where it goes.)
      const o = away.box, mid = { x: sx(o.x + dx + o.w / 2), y: sy(o.y + dy + o.h / 2) };
      ctx.save();
      ctx.translate(mid.x, mid.y);
      ctx.rotate(turns * Math.PI / 2);
      ctx.translate(-mid.x, -mid.y);
      for (const e of away.pieces) drawEntity(e, dx, dy);
      if (s >= 8) for (const e of away.pieces) if (e.kind === 'building' && e.drop) drawDrop(e, dx, dy);
      ctx.restore();
      const b = turns % 2 ? { x: o.x + (o.w - o.h) / 2, y: o.y + (o.h - o.w) / 2, w: o.h, h: o.w } : o, color = clash ? t.starve : t.subBlock;
      ctx.fillStyle = clash ? 'rgba(255, 92, 92, 0.12)' : 'rgba(232, 160, 60, 0.12)';
      ctx.fillRect(sx(b.x + dx), sy(b.y + dy), b.w * s, b.h * s);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash(placing ? [3, 5] : [8, 4]);
      ctx.strokeRect(sx(b.x + dx) - 3, sy(b.y + dy) - 3, b.w * s + 6, b.h * s + 6);
      ctx.setLineDash([]);
      const sb = block.subBlocks[away.step];
      const turn = turns ? `turned ${turns * 90}°` : '';
      const how = placing ? 'laying it out…' : clash === 'outside' ? 'outside the city block' : clash ? 'on another: it goes to the nearest room'
        : [offset(dx, dy), turn].filter(Boolean).join(', ');
      ctx.font = `600 ${Math.max(11, Math.min(14, s))}px system-ui, sans-serif`;
      const text = `${words(sb.item)} ×${sb.count}${how ? ` · ${how}` : ''}`;
      const tx = sx(b.x + dx), ty = sy(b.y + dy) - 10;
      const pad = 5, tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(22, 21, 20, 0.88)';
      ctx.fillRect(tx - pad, ty - 14, tw + 2 * pad, 20);
      ctx.fillStyle = color;
      ctx.fillText(text, tx, ty);
    }
  }

  // One entity, `ox`, `oy` tiles off where it stands.
  function drawEntity(e, ox, oy) {
    const t = shade ?? theme();
    const { width, height } = size;
    const s = view.scale;
    const x = (e.x + ox - view.x) * s, y = (e.y + oy - view.y) * s, w = e.w * s, h = e.h * s;
    if (x > width || y > height || x + w < 0 || y + h < 0) return;
    switch (e.kind) {
      case 'building':
        // An offshore pump on its shallow water.
        ctx.fillStyle = e.recipe === 'offshore-water' ? '#2d6a8f' : t.machine;
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        ctx.strokeStyle = t.machineEdge;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        // What the machine makes, with the machine itself in the corner.
        drawIcon(block.subBlocks[e.subBlock]?.item ?? e.recipe, x + w / 2, y + h / 2, Math.min(w, h) * 0.55);
        const corner = Math.min(w, h) * 0.25;
        if (corner >= 12) drawIcon(e.name, x + w - corner * 0.7, y + h - corner * 0.7, corner);
        if (s * e.w >= 40) {
          ctx.fillStyle = t.text;
          ctx.font = `${Math.min(12, s * 0.8)}px system-ui, sans-serif`;
          ctx.fillText(words(e.recipe), x + 4, y + 4 + Math.min(12, s * 0.8), w - 8);
        }
        break;
      case 'belt':
      case 'underground-belt': {
        ctx.fillStyle = colors.route(e.route);
        ctx.fillRect(x + s * 0.15, y + s * 0.15, s * 0.7, s * 0.7);
        if (e.kind === 'underground-belt') {
          ctx.strokeStyle = t.text;
          ctx.lineWidth = Math.max(1, s * 0.08);
          ctx.strokeRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8);
        }
        arrow(x, y, s, e.travel, t.bg);
        // The items it carries, on every third tile, each merged item in turn.
        const n = pieceIndex.get(e);
        const items = block.routes[e.route].items;
        if (s >= 14 && n % 3 === 0) drawIcon(items[(n / 3) % items.length].item, x + s / 2, y + s / 2, s * 0.55);
        break;
      }
      case 'splitter':
        ctx.fillStyle = t.machineEdge;
        ctx.fillRect(x + s * 0.1, y + s * 0.1, w - s * 0.2, h - s * 0.2);
        arrow(x + (w - s) / 2, y + (h - s) / 2, s, e.travel ?? e.direction, t.bg);
        break;
      case 'pipe':
      case 'pipe-to-ground':
        ctx.fillStyle = colors.fluid(e.fluid);
        if (e.kind === 'pipe') ctx.fillRect(x + s * 0.3, y + s * 0.3, s * 0.4, s * 0.4);
        else {
          ctx.beginPath();
          ctx.arc(x + s / 2, y + s / 2, s * 0.38, 0, Math.PI * 2);
          ctx.fill();
          arrow(x, y, s, e.direction, t.bg);
        }
        pipeLinks(e, x, y, s);
        if (s >= 14 && pieceIndex.get(e) % 4 === 0) drawIcon(e.fluid, x + s / 2, y + s / 2, s * 0.5);
        break;
      // A valve (ADR 0062): its fluid's colour, ringed, an arrow the way the fluid goes through it.
      case 'valve':
        ctx.fillStyle = colors.fluid(e.fluid);
        ctx.fillRect(x + s * 0.15, y + s * 0.15, s * 0.7, s * 0.7);
        ctx.strokeStyle = e.mode === 'overflow' ? '#e05a4f' : '#4fbf6a';
        ctx.lineWidth = Math.max(1, s * 0.1);
        ctx.strokeRect(x + s * 0.15, y + s * 0.15, s * 0.7, s * 0.7);
        arrow(x, y, s, e.flow, t.bg);
        break;
      // A void destroying its fluid (a sinkhole, a gas vent): dark, its icon on it.
      case 'void':
        ctx.fillStyle = t.machineEdge;
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        if (!drawIcon(e.name, x + w / 2, y + h / 2, Math.min(w, h) * 0.8)) drawIcon(e.fluid, x + w / 2, y + h / 2, Math.min(w, h) * 0.6);
        break;
      case 'inserter':
        if (s >= 20 && drawIcon(e.name, x + s / 2, y + s / 2, s * 0.8)) {
          arrow(x, y, s, e.vectors ? directionOf(e.vectors.drop) : (e.direction + 8) % 16, t.text);
          break;
        }
        ctx.fillStyle = turnsSideways(e) ? '#9b6fe0' : e.name.startsWith('long') ? '#d08a3c' : '#4fa3e0';
        ctx.fillRect(x + s * 0.3, y + s * 0.3, s * 0.4, s * 0.4);
        // Arrow points toward the drop.
        arrow(x, y, s, e.vectors ? directionOf(e.vectors.drop) : (e.direction + 8) % 16, t.text);
        break;
      case 'pole':
        if (s >= 20 && drawIcon(e.name, x + w / 2, y + h / 2, Math.min(w, h) * 0.9)) break;
        ctx.fillStyle = '#c9a227';
        ctx.fillRect(x + w * 0.25, y + h * 0.25, w * 0.5, h * 0.5);
        break;
    }
  }

  // A machine's Output Drop: a yellow arrow out of it, across its edge onto its drop tile.
  function drawDrop(e, ox, oy) {
    const s = view.scale;
    const [dx, dy] = ARROW[directionOf({ x: e.drop.x - e.w / 2, y: e.drop.y - e.h / 2 })];
    // The edge point it crosses, and the arrow's tip a third of a tile out from it.
    const ex = (e.x + ox + e.drop.x - view.x) * s, ey = (e.y + oy + e.drop.y - view.y) * s;
    const r = s * 0.22;
    ctx.fillStyle = '#f0c419';
    ctx.beginPath();
    ctx.moveTo(ex + dx * r, ey + dy * r);
    ctx.lineTo(ex - dx * r * 0.2 - dy * r, ey - dy * r * 0.2 + dx * r);
    ctx.lineTo(ex - dx * r * 0.2 + dy * r, ey - dy * r * 0.2 - dx * r);
    ctx.fill();
  }

  function pipeLinks(e, x, y, s) {
    ctx.strokeStyle = colors.fluid(e.fluid);
    ctx.lineWidth = s * 0.25;
    ctx.beginPath();
    for (const [d, [dx, dy]] of Object.entries(ARROW)) {
      if (e.kind === 'pipe-to-ground' && +d !== e.direction) continue;
      const n = byTile.get(`${e.x + dx},${e.y + dy}`);
      if (!n || n.fluid !== e.fluid) continue;
      ctx.moveTo(x + s / 2, y + s / 2);
      ctx.lineTo(x + s / 2 + dx * s / 2, y + s / 2 + dy * s / 2);
    }
    ctx.stroke();
  }

  function arrow(x, y, s, dir, color) {
    if (s < 8) return;
    const [dx, dy] = ARROW[dir];
    const cx = x + s / 2, cy = y + s / 2, r = s * 0.25;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx + dx * r, cy + dy * r);
    ctx.lineTo(cx - dx * r - dy * r * 0.8, cy - dy * r + dx * r * 0.8);
    ctx.lineTo(cx - dx * r + dy * r * 0.8, cy - dy * r - dx * r * 0.8);
    ctx.fill();
  }

  // Pointers down (a pinch: two), how far the gesture moved, and the last tap (a double tap zooms).
  // A press on a Sub-Block that may be moved (`press`): held still, it picks it up; dragged, it
  // pans the map, unless that Sub-Block is selected: then it carries it straight away.
  const pointers = new Map();
  let drag = null, pinch = null, moved = 0, lastTap = null, press = null, edgeFrame = 0;
  // How the last press began (a mouse, a finger), and whether it opened a Sub-Block's menu (then it
  // is no tap).
  let pressedBy = 'mouse', menued = false;
  const local = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const span = () => {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const world = at => ({ x: view.x + at.x / view.scale, y: view.y + at.y / view.scale });
  const tileOf = at => {
    const w = world(at);
    return [Math.floor(w.x), Math.floor(w.y)];
  };
  // Picks a unit up, the pointer at `at`: it follows the pointer from there, tile by tile.
  // (Selected, quietly: a panel opening over the map would hide where it goes.)
  const pickUp = (unit, at) => {
    clearTimeout(press?.timer);
    press = null;
    lift = { unit, from: world(at), at, dx: 0, dy: 0, clash: false, turns: 0 };
    selected = { subBlock: unit.step };
    canvas.style.cursor = 'grabbing';
    canvas.dataset.carrying = '';
    navigator.vibrate?.(12);
    draw();
    window.addEventListener('keydown', onKey);
    edgeFrame = requestAnimationFrame(edgePan);
  };
  // Where the unit carried goes, the pointer at `at`.
  const carry = at => {
    lift.at = at;
    const w = world(at);
    const dx = Math.round(w.x - lift.from.x), dy = Math.round(w.y - lift.from.y);
    if (dx === lift.dx && dy === lift.dy) return;
    Object.assign(lift, { dx, dy, clash: clashes(lift.unit, dx, dy, lift.turns) });
    draw();
  };
  // Near the map's edge, a unit carried pans the map that way.
  const edgePan = () => {
    if (!lift) return;
    const { width, height } = canvas.getBoundingClientRect();
    const toward = (v, end) => (v < EDGE ? v - EDGE : v > end - EDGE ? v - end + EDGE : 0);
    const vx = toward(lift.at.x, width), vy = toward(lift.at.y, height);
    if (vx || vy) {
      view.x += vx * 0.3 / view.scale;
      view.y += vy * 0.3 / view.scale;
      carry(lift.at);
      draw();
    }
    edgeFrame = requestAnimationFrame(edgePan);
  };
  const stopLift = () => {
    lift = null;
    cancelAnimationFrame(edgeFrame);
    window.removeEventListener('keydown', onKey);
    canvas.style.cursor = '';
    delete canvas.dataset.carrying;
  };
  // Puts the unit carried down: moved, onMove hears where, and it shows there while its move is
  // laid out (until settle(), or the map made again); not moved, it is selected as a tap would.
  const putDown = () => {
    const { unit, dx, dy, clash, turns } = lift;
    stopLift();
    if (dx || dy || turns) {
      placing = { unit, dx, dy, clash, turns };
      onPut({ step: unit.step, ...(unit.inst !== undefined ? { inst: unit.inst } : {}) }, dx, dy, turns);
    } else onSelect({ subBlock: unit.step }, block);
    draw();
  };
  // Escape: the unit carried goes back where it stood. R turns it a quarter clockwise (Shift+R
  // the other way), as in the game; a machine stood apart does not turn.
  const onKey = e => {
    if (!lift) return;
    if (e.key === 'Escape') {
      stopLift();
      drag = null;
      draw();
    } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey && lift.unit.inst === undefined) {
      e.preventDefault();
      lift.turns = (lift.turns + (e.shiftKey ? 3 : 1)) % 4;
      lift.clash = clashes(lift.unit, lift.dx, lift.dy, lift.turns);
      draw();
    }
  };
  const onDown = e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) {
      drag = local(e);
      moved = 0;
      pressedBy = e.pointerType;
      menued = false;
      // (Only the main button picks a Sub-Block up: the other, or a Ctrl click, opens its menu.)
      const unit = placing || e.button !== 0 || (e.ctrlKey && e.pointerType === 'mouse') ? null : unitAt(...tileOf(drag));
      if (unit) {
        const now = selected?.subBlock === unit.step;
        press = { unit, at: drag, last: drag, now, timer: now ? 0 : setTimeout(() => pickUp(unit, press?.last ?? drag), HOLD) };
      }
    } else if (pointers.size === 2) {
      clearTimeout(press?.timer);
      press = null;
      if (lift) {
        stopLift();
        draw();
      }
      pinch = span();
      moved = Infinity;
    }
  };
  const onMove = e => {
    const at = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, at);
    if (pinch && pointers.size >= 2) {
      const now = span();
      view.x -= (now.x - pinch.x) / view.scale;
      view.y -= (now.y - pinch.y) / view.scale;
      if (pinch.d > 0) zoomAt(now.x, now.y, now.d / pinch.d);
      else draw();
      pinch = now;
      return;
    }
    if (lift && pointers.has(e.pointerId)) {
      carry(at);
      return;
    }
    if (press && pointers.has(e.pointerId)) {
      const far = Math.hypot(at.x - press.at.x, at.y - press.at.y);
      press.last = at;
      if (press.now && far > SLOP / 2) {
        pickUp(press.unit, drag);
        carry(at);
        return;
      }
      if (far <= SLOP) return;
      // (Not held still: a pan, from where the press began.)
      clearTimeout(press.timer);
      press = null;
    }
    if (drag && pointers.has(e.pointerId)) {
      moved += Math.hypot(at.x - drag.x, at.y - drag.y);
      view.x -= (at.x - drag.x) / view.scale;
      view.y -= (at.y - drag.y) / view.scale;
      drag = at;
      draw();
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const [tx, ty] = tileOf(at);
    onHover(byTile.get(`${tx},${ty}`) ?? null, block);
    // (A selected Sub-Block that may be moved: dragged, it goes.)
    const unit = units.length && !placing ? unitAt(tx, ty) : null;
    canvas.style.cursor = unit && selected?.subBlock === unit.step ? 'move' : '';
  };
  const onUp = e => {
    const at = local(e);
    pointers.delete(e.pointerId);
    clearTimeout(press?.timer);
    press = null;
    if (lift) {
      if (pointers.size) return;
      carry(at);
      putDown();
      drag = null;
      return;
    }
    if (pointers.size === 1) {
      // (The pinch over: the finger left pans on from where it is.)
      pinch = null;
      drag = [...pointers.values()][0];
      return;
    }
    if (pointers.size) return;
    const tap = drag && moved < 8 && !menued && e.button === 0;
    drag = null;
    pinch = null;
    if (!tap) return;
    // A double tap (or click) on a Sub-Block, anywhere on it, selects the whole Sub-Block;
    // elsewhere it zooms in there.
    const now = performance.now();
    if (lastTap && now - lastTap.time < 300 && Math.hypot(at.x - lastTap.x, at.y - lastTap.y) < 24) {
      lastTap = null;
      const step = subBlockAt(...tileOf(at));
      if (step === null) {
        zoomAt(at.x, at.y, 2);
        return;
      }
      selected = { subBlock: step };
      draw();
      onSelect(selected, block);
      return;
    }
    lastTap = { time: now, x: at.x, y: at.y };
    const hit = hitAt(...tileOf(at));
    selected = hit;
    draw();
    onSelect(hit && (hit.entity ? { entity: hit.entity, route: hit.route } : hit), block);
  };
  const onCancel = e => {
    pointers.delete(e.pointerId);
    clearTimeout(press?.timer);
    press = null;
    if (lift) {
      stopLift();
      draw();
    }
    if (!pointers.size) [drag, pinch] = [null, null];
  };
  // (A long press is a pick-up, not the browser's menu.) A right click on a Sub-Block that may be
  // moved selects it and opens its menu (onContext).
  const onMenu = e => {
    if (lift || (press && pressedBy !== 'mouse')) return e.preventDefault();
    if (!onContext || placing) return;
    const unit = unitAt(...tileOf(local(e)));
    if (!unit) return;
    e.preventDefault();
    clearTimeout(press?.timer);
    press = null;
    menued = true;
    selected = { subBlock: unit.step };
    draw();
    onSelect({ subBlock: unit.step }, block);
    onContext({ step: unit.step, ...(unit.inst !== undefined ? { inst: unit.inst } : {}) }, { x: e.clientX, y: e.clientY });
  };
  const onWheel = e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  };
  // (Safari's own pinch zooms the page, not the map.)
  const onGesture = e => e.preventDefault();
  const onLeave = () => onHover(null, block);
  const observer = new ResizeObserver(resize);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('gesturestart', onGesture);
  canvas.addEventListener('contextmenu', onMenu);
  observer.observe(canvas);
  resize();
  if (!start) fit();

  return {
    fit,
    zoom: factor => {
      const { width, height } = canvas.getBoundingClientRect();
      zoomAt(width / 2, height / 2, factor);
    },
    destroy() {
      observer.disconnect();
      clearTimeout(press?.timer);
      stopLift();
      canvas.removeEventListener('contextmenu', onMenu);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('gesturestart', onGesture);
    },
    // Where the map stands and how far it is zoomed in (`view` for another map of the same place).
    viewport: () => ({ scale: view.scale, x: view.x, y: view.y }),
    // The move put down is over without a new map (it found no way): the Sub-Block shows where it
    // stands again.
    settle() {
      placing = null;
      draw();
    },
    // Shows a Sub-Block ({ step, inst }) `dx`, `dy` tiles off while its move is laid out, as if
    // dragged there; false where it may not be moved.
    place({ step, inst }, dx, dy, turns = 0) {
      const unit = units.find(u => u.step === step && u.inst === inst);
      if (!unit) return false;
      placing = { unit, dx, dy, turns, clash: clashes(unit, dx, dy, turns) };
      draw();
      return true;
    },
    // Selects `hit` ({ entity, route } or { subBlock }; null: nothing), as a tap would, quietly.
    select(hit) {
      selected = hit;
      draw();
    },
    // Pans the map so a tile box stands clear of the bottom `inset` pixels (a sheet over the map),
    // where it is behind them.
    reveal({ y, h }, inset) {
      const { height } = canvas.getBoundingClientRect();
      const bottom = (y + h - view.y) * view.scale, room = height - inset - 12;
      if (bottom <= room) return;
      view.y += Math.min(bottom - room, (y - view.y) * view.scale - 12) / view.scale;
      draw();
    },
    // Centres the map on a tile box.
    show({ x, y, w, h }) {
      const { width, height } = canvas.getBoundingClientRect();
      view.x = x + w / 2 - width / 2 / view.scale;
      view.y = y + h / 2 - height / 2 / view.scale;
      draw();
    },
  };
}

function palette(block) {
  const hue = i => `hsl(${(i * 137.5) % 360} 65% 55%)`;
  const fluids = [...new Set(block.entities.filter(e => e.fluid).map(e => e.fluid))];
  return {
    route: id => hue(id),
    fluid: name => `hsl(${(fluids.indexOf(name) * 97 + 190) % 360} 70% 60%)`,
  };
}

// The main direction of a vector: 0 north, 4 east, 8 south, 12 west.
// A 90° inserter (Inserter_Config): it drops beside where it picks up, not across from it. Custom
// vectors on a straight one only set its Drop Offset.
export function turnsSideways(e) {
  if (!e.vectors) return false;
  const { pickup: p, drop: d } = e.vectors;
  return p.x * d.x + p.y * d.y > -0.7 * Math.hypot(p.x, p.y) * Math.hypot(d.x, d.y);
}

function directionOf({ x, y }) {
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 4 : 12;
  return y > 0 ? 8 : 0;
}

// Where a tile of a unit's `box` stands, the unit turned `turns` quarter turns clockwise about
// its box's middle (as edit.js turns it, about).
function turned(box, x, y, turns) {
  let lx = x - box.x, ly = y - box.y, w = box.w, h = box.h;
  for (let k = 0; k < turns; k++) {
    [lx, ly] = [h - 1 - ly, lx];
    [w, h] = [h, w];
  }
  return [Math.round(box.x + (box.w - w) / 2) + lx, Math.round(box.y + (box.h - h) / 2) + ly];
}

// How far a move goes: "3 east, 2 south".
function offset(dx, dy) {
  const parts = [];
  if (dx) parts.push(`${Math.abs(dx)} ${dx > 0 ? 'east' : 'west'}`);
  if (dy) parts.push(`${Math.abs(dy)} ${dy > 0 ? 'south' : 'north'}`);
  return parts.join(', ');
}

// A name as people read it: the game's, else "iron-pulp-01" is "Iron pulp 01" (names.js).
function words(name) {
  return displayName(name);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
