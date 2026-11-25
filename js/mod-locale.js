// The names the game shows, made from mods' locale files (ADR 0125): each prototype's name as the
// game makes it, references resolved. scripts/mod-locale.mjs reads the files and writes the
// result as prototype-locale.json, which build-catalog reads.

/**
 * Every key of locale files (.cfg text, in the mods' load order) as `section.key`: one a later file
 * gives again is the later one's.
 * @param {string[]} files
 */
export function localeKeys(files) {
  const keys = new Map();
  for (const file of files) {
    let section = '';
    for (const line of file.split(/\r?\n/)) {
      const text = line.trim();
      if (!text || text.startsWith(';') || text.startsWith('#')) continue;
      const head = /^\[([^\]]+)\]/.exec(text);
      if (head) { section = head[1].trim(); continue; }
      const eq = line.indexOf('=');
      if (eq > 0) keys.set(`${section}.${line.slice(0, eq).trim()}`, line.slice(eq + 1).trim());
    }
  }
  return keys;
}

/**
 * Each prototype's name as the game makes it: its `localised_name`, else its section's key (an
 * item's `item-name`, else the name of what it places; a recipe's `recipe-name`, else its main or
 * one product's; a technology `x-2`'s `x` and its level), `__1__` and `__ITEM__x__` resolved. One
 * needing a key none gives is left out. { fluid, item, entity, recipe, technology: { names } }:
 * technologies those of the data and every one the keys name (Py's TURD choices are not in it).
 * @param {Record<string, Record<string, any>>} raw
 * @param {Map<string, string>} keys
 */
export function modLocale(raw, keys) {
  const itemTypes = Object.keys(raw).filter(t => Object.values(raw[t] ?? {}).some(p => p?.stack_size !== undefined));
  const entityTypes = Object.keys(raw).filter(t => Object.values(raw[t] ?? {}).some(p => p?.collision_box || p?.selection_box) && !itemTypes.includes(t));
  const find = (types, name) => { for (const t of types) if (raw[t]?.[name]) return raw[t][name]; return null; };

  // A localised string's text, or null where a key it needs is missing.
  function text(ls, depth = 0) {
    if (depth > 20) return null;
    if (typeof ls === 'string' || typeof ls === 'number' || typeof ls === 'boolean') return String(ls);
    if (!Array.isArray(ls) || !ls.length) return null;
    const [key, ...params] = ls;
    if (key === '') {
      const parts = params.map(p => text(p, depth + 1));
      return parts.some(p => p === null) ? null : parts.join('');
    }
    if (key === '?') {
      for (const p of params) { const t = text(p, depth + 1); if (t !== null) return t; }
      return null;
    }
    const template = keys.get(key);
    if (template === undefined) return null;
    return fill(template, params, depth);
  }

  const REF = { ITEM: 'item', ENTITY: 'entity', FLUID: 'fluid', RECIPE: 'recipe', TILE: 'tile', TECHNOLOGY: 'technology', EQUIPMENT: 'equipment' };
  function fill(template, params, depth) {
    let ok = true;
    const value = template
      .replace(/__plural_for_parameter__(\d+)__\{([^}]*)\}__/g, (_, n, forms) => {
        const p = text(params[n - 1], depth + 1);
        const options = Object.fromEntries(forms.split('|').map(f => f.split('=')));
        const hit = Object.entries(options).find(([k]) => k.split(',').includes(p));
        return (hit ?? [null, options.rest ?? ''])[1];
      })
      .replace(/__(\d+)__/g, (_, n) => { const t = text(params[n - 1], depth + 1); if (t === null) ok = false; return t ?? ''; })
      .replace(/__([A-Z]+)__([^_]+(?:_[^_]+)*)__/g, (whole, kind, name) => {
        if (!REF[kind]) return whole;
        const t = nameOf(REF[kind], name, depth + 1);
        if (t === null) ok = false;
        return t ?? '';
      })
      .replace(/\[\/?(?:color|font)[^\]]*\]/g, '')
      .replace(/\\n/g, ' ');
    return ok ? value : null;
  }

  // The game's name of a prototype: its localised_name, else its section's key, else (items) what
  // it places, (recipes) its one product.
  function nameOf(kind, name, depth = 0) {
    if (depth > 20) return null;
    const types = kind === 'item' ? itemTypes : kind === 'entity' ? entityTypes : [kind];
    const p = find(types, name);
    if (p?.localised_name) return text(p.localised_name, depth + 1);
    const own = text([`${kind}-name.${name}`], depth + 1);
    if (own !== null) return own;
    if (kind === 'item' && p) {
      if (p.place_result) return nameOf('entity', p.place_result, depth + 1);
      if (p.place_as_tile?.result) return nameOf('tile', p.place_as_tile.result, depth + 1);
      if (p.place_as_equipment_result) return nameOf('equipment', p.place_as_equipment_result, depth + 1);
    }
    if (kind === 'recipe' && p) {
      const results = p.results ?? [];
      const main = p.main_product ? results.find(r => r.name === p.main_product) : results.length === 1 ? results[0] : null;
      if (main) return nameOf(main.type === 'fluid' ? 'fluid' : 'item', main.name, depth + 1);
    }
    if (kind === 'technology' && /-\d+$/.test(name)) {
      const base = text([`technology-name.${name.replace(/-\d+$/, '')}`], depth + 1);
      if (base !== null) return `${base} ${name.match(/\d+$/)[0]}`;
    }
    return null;
  }

    const locale = {};
  const put = (kind, types) => {
    const names = {};
    for (const t of types) for (const name of Object.keys(raw[t] ?? {})) {
      const value = nameOf(kind, name);
      if (value) names[name] ??= value;
    }
    locale[kind] = { names };
  };
  put('fluid', ['fluid']);
  put('item', itemTypes);
  put('entity', entityTypes);
  put('recipe', ['recipe']);
  locale.technology = { names: {} };
  for (const name of new Set([...Object.keys(raw.technology ?? {}), ...[...keys.keys()].filter(k => k.startsWith('technology-name.')).map(k => k.slice(16))])) {
    const value = nameOf('technology', name);
    if (value) locale.technology.names[name] = value;
  }
  return locale;
}
