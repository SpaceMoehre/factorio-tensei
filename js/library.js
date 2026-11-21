// The Library: blueprints the user kept (city blocks pasted, factory blocks built), each with a
// name and a folder, in the browser's storage. Entries: { id, kind ('city' | 'block'), name,
// folder ('' unsorted), note, string, saved (ms) }.

export const LIBRARY_KEY = 'factory-tensei:library:v1';
const KINDS = new Set(['city', 'block']);

/** The kept entries, newest first; none where storage is missing or holds something else. */
export function readLibrary(storage) {
  try {
    const list = JSON.parse(storage?.getItem(LIBRARY_KEY) ?? '[]');
    if (!Array.isArray(list)) return [];
    return list.filter(e => e && typeof e.id === 'string' && typeof e.string === 'string' && KINDS.has(e.kind))
      .map(e => ({ name: '', folder: '', note: '', saved: 0, ...e }));
  } catch {
    return [];
  }
}

/** Keeps the entries; false where storage refuses them (full, or unavailable). */
export function writeLibrary(storage, entries) {
  try {
    storage.setItem(LIBRARY_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/**
 * Adds a blueprint first, unless the same string of the same kind is kept already: that entry
 * then comes back (`added` false).
 */
export function addEntry(entries, { kind, name, string, note = '', folder = '' }, now = Date.now()) {
  const text = string.trim();
  const kept = entries.find(e => e.kind === kind && e.string === text);
  if (kept) return { entries, entry: kept, added: false };
  const entry = { id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, kind, name: name.trim() || 'Untitled', folder: folder.trim(), note, string: text, saved: now };
  return { entries: [entry, ...entries], entry, added: true };
}

/** The entries with `id`'s fields changed (name, folder, note): blank names stay as they were. */
export function editEntry(entries, id, fields) {
  return entries.map(e => {
    if (e.id !== id) return e;
    const next = { ...e, ...fields };
    next.name = String(next.name).trim() || e.name;
    next.folder = String(next.folder ?? '').trim();
    return next;
  });
}

export function removeEntry(entries, id) {
  return entries.filter(e => e.id !== id);
}

/** Every entry of folder `from` moved into `to` (merging where `to` exists; '' is Unsorted). */
export function renameFolder(entries, from, to) {
  const name = to.trim();
  return entries.map(e => (e.folder === from ? { ...e, folder: name } : e));
}

/** The folders in use, by name. */
export function foldersOf(entries) {
  return [...new Set(entries.map(e => e.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * The entries matching `query` (in name, folder or note; any case), by folder (named folders by
 * name, Unsorted last), newest first in each.
 */
export function grouped(entries, query = '') {
  const q = query.trim().toLowerCase();
  const shown = q ? entries.filter(e => `${e.name}\n${e.folder}\n${e.note}`.toLowerCase().includes(q)) : entries;
  const groups = new Map([...foldersOf(shown), ''].map(f => [f, []]));
  for (const e of [...shown].sort((a, b) => b.saved - a.saved)) groups.get(e.folder).push(e);
  return [...groups].filter(([, list]) => list.length).map(([folder, list]) => ({ folder, entries: list }));
}
