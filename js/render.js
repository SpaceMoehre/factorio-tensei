// Pan/zoom map of a Compound Block on a <canvas>: drag to pan, wheel or pinch to zoom around the
// cursor or the fingers, a double tap to zoom in; a tap or click selects what is there (an entity,
// else the Sub-Block whose box it is in), outlined with its route, and onSelect hears of it.
const ARROW = { 0: [0, -1], 4: [1, 0], 8: [0, 1], 12: [-1, 0] };
const MIN_SCALE = 2, MAX_SCALE = 64;

// circuit: the circuit wires to draw, { colors: ['red', 'green'], pairs (circuitPairs) }, or null.
/**
 * @param {HTMLCanvasElement} canvas
 * @param {any} block
 * @param {{ onHover?: (entity: any, block: any) => void, onSelect?: (hit: any, block: any) => void, starving?: Set<number>, icon?: (name: string) => string | null, circuit?: { colors: string[], pairs: number[][] } | null }} [options]
 */
export function createMap(canvas, block, { onHover = () => {}, onSelect = () => {}, starving = new Set(), icon = () => null, circuit = null } = {}) {
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
  const view = { scale: 16, x: 0, y: 0 };
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

  function draw() {
    const t = theme();
    const { width, height } = canvas.getBoundingClientRect();
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
    ctx.fillRect(sx(b.x + b.w - 1), sy(b.y), s, b.h * s);

    // The City Block's entities, which the block is built around.
    for (const f of fixtures) {
      const x = sx(f.x), y = sy(f.y), w = f.w * s, h = f.h * s;
      if (x > width || y > height || x + w < 0 || y + h < 0) continue;
      ctx.fillStyle = 'rgba(120, 128, 145, 0.45)';
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      if (s * Math.min(f.w, f.h) >= 12) drawIcon(f.name, x + w / 2, y + h / 2, Math.min(w, h) * 0.8);
    }

    for (const sb of block.subBlocks) {
      ctx.strokeStyle = starving.has(sb.index) ? t.starve : t.subBlock;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      // Machines broken out of it (Breakout) in boxes of their own.
      for (const b of [sb, ...(sb.apart ?? [])]) ctx.strokeRect(sx(b.x) - 3, sy(b.y) - 3, b.w * s + 6, b.h * s + 6);
      ctx.setLineDash([]);
      if (s >= 3) {
        ctx.fillStyle = starving.has(sb.index) ? t.starve : t.subBlock;
        ctx.font = `${Math.max(10, Math.min(14, s))}px system-ui, sans-serif`;
        ctx.fillText(`${words(sb.item)} ×${sb.count}`, sx(sb.x), sy(sb.y) - 6);
      }
    }

    for (const e of block.entities) {
      const x = sx(e.x), y = sy(e.y), w = e.w * s, h = e.h * s;
      if (x > width || y > height || x + w < 0 || y + h < 0) continue;
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

    // Output Drops, as the game shows them: a yellow arrow out of the machine, across its edge
    // onto the tile it puts its products on.
    if (s >= 8) {
      ctx.fillStyle = '#f0c419';
      for (const e of block.entities.filter(m => m.kind === 'building' && m.drop)) {
        const [dx, dy] = ARROW[directionOf({ x: e.drop.x - e.w / 2, y: e.drop.y - e.h / 2 })];
        // The edge point it crosses, and the arrow's tip a third of a tile out from it.
        const ex = sx(e.x + e.drop.x), ey = sy(e.y + e.drop.y);
        const r = s * 0.22;
        ctx.beginPath();
        ctx.moveTo(ex + dx * r, ey + dy * r);
        ctx.lineTo(ex - dx * r * 0.2 - dy * r, ey - dy * r * 0.2 + dx * r);
        ctx.lineTo(ex - dx * r * 0.2 + dy * r, ey - dy * r * 0.2 - dx * r);
        ctx.fill();
      }
    }

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
          ctx.fillRect(sx(b.x), sy(b.y), b.w * s, b.h * s);
          outline(b, 3, 2.5);
        }
      }
    }
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
  const pointers = new Map();
  let drag = null, pinch = null, moved = 0, lastTap = null;
  const local = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const span = () => {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const onDown = e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) {
      drag = local(e);
      moved = 0;
    } else if (pointers.size === 2) {
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
    if (drag && pointers.has(e.pointerId)) {
      moved += Math.hypot(at.x - drag.x, at.y - drag.y);
      view.x -= (at.x - drag.x) / view.scale;
      view.y -= (at.y - drag.y) / view.scale;
      drag = at;
      draw();
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const tx = Math.floor(view.x + at.x / view.scale), ty = Math.floor(view.y + at.y / view.scale);
    onHover(byTile.get(`${tx},${ty}`) ?? null, block);
  };
  const onUp = e => {
    const at = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      // (The pinch over: the finger left pans on from where it is.)
      pinch = null;
      drag = [...pointers.values()][0];
      return;
    }
    if (pointers.size) return;
    const tap = drag && moved < 8;
    drag = null;
    pinch = null;
    if (!tap) return;
    // A double tap (or click) zooms in there.
    const now = performance.now();
    if (lastTap && now - lastTap.time < 300 && Math.hypot(at.x - lastTap.x, at.y - lastTap.y) < 24) {
      lastTap = null;
      zoomAt(at.x, at.y, 2);
      return;
    }
    lastTap = { time: now, x: at.x, y: at.y };
    const hit = hitAt(Math.floor(view.x + at.x / view.scale), Math.floor(view.y + at.y / view.scale));
    selected = hit;
    draw();
    onSelect(hit && (hit.entity ? { entity: hit.entity, route: hit.route } : hit), block);
  };
  const onCancel = e => {
    pointers.delete(e.pointerId);
    if (!pointers.size) [drag, pinch] = [null, null];
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
  observer.observe(canvas);
  resize();
  fit();

  return {
    fit,
    zoom: factor => {
      const { width, height } = canvas.getBoundingClientRect();
      zoomAt(width / 2, height / 2, factor);
    },
    destroy() {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('gesturestart', onGesture);
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

// A name as people read it: "iron-pulp-01" is "Iron pulp 01".
function words(name) {
  const text = String(name ?? '').replace(/[-_]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
