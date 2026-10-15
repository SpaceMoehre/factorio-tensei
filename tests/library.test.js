import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLibrary, writeLibrary, addEntry, editEntry, removeEntry, renameFolder, foldersOf, grouped, LIBRARY_KEY } from '../js/library.js';

const memory = () => {
  const items = new Map();
  return { getItem: k => items.get(k) ?? null, setItem: (k, v) => items.set(k, String(v)) };
};

test('kept blueprints come back from storage, the same string once', () => {
  const storage = memory();
  let { entries } = addEntry([], { kind: 'city', name: 'Roboport grid', string: '0eNabc ' }, 1);
  const again = addEntry(entries, { kind: 'city', name: 'Other', string: '0eNabc' }, 2);
  assert.equal(again.added, false);
  assert.equal(again.entry.name, 'Roboport grid');
  ({ entries } = addEntry(entries, { kind: 'block', name: '', string: '0eNdef', note: 'rayon 646.9/min' }, 3));
  assert.ok(writeLibrary(storage, entries));
  const read = readLibrary(storage);
  assert.deepEqual(read.map(e => [e.kind, e.name, e.string]), [['block', 'Untitled', '0eNdef'], ['city', 'Roboport grid', '0eNabc']]);
});

test('storage that is full, missing or holds something else', () => {
  assert.equal(writeLibrary({ setItem() { throw new Error('quota'); } }, []), false);
  assert.deepEqual(readLibrary(null), []);
  const storage = memory();
  storage.setItem(LIBRARY_KEY, '{"not":"a list"}');
  assert.deepEqual(readLibrary(storage), []);
  storage.setItem(LIBRARY_KEY, JSON.stringify([{ id: 'a', kind: 'city', string: 's' }, { id: 'b', kind: 'other', string: 's' }, null]));
  assert.deepEqual(readLibrary(storage).map(e => [e.id, e.folder, e.name]), [['a', '', '']]);
});

test('renamed, moved into folders, folders renamed and merged, removed', () => {
  let entries = [];
  for (const [i, name] of ['a', 'b', 'c'].entries()) ({ entries } = addEntry(entries, { kind: 'block', name, string: name }, i));
  const [c, b, a] = entries;
  entries = editEntry(entries, a.id, { name: '  Aramid  ', folder: ' Py ' });
  entries = editEntry(entries, b.id, { name: ' ', folder: 'Vanilla' });
  assert.deepEqual(entries.map(e => [e.name, e.folder]), [['c', ''], ['b', 'Vanilla'], ['Aramid', 'Py']]);
  assert.deepEqual(foldersOf(entries), ['Py', 'Vanilla']);
  assert.deepEqual(grouped(entries).map(g => [g.folder, g.entries.map(e => e.name)]), [['Py', ['Aramid']], ['Vanilla', ['b']], ['', ['c']]]);
  entries = renameFolder(entries, 'Vanilla', 'Py');
  assert.deepEqual(grouped(entries).map(g => [g.folder, g.entries.map(e => e.name)]), [['Py', ['b', 'Aramid']], ['', ['c']]]);
  assert.deepEqual(grouped(entries, 'ARA').map(g => g.entries.map(e => e.name)), [['Aramid']]);
  assert.deepEqual(removeEntry(entries, c.id).map(e => e.name), ['b', 'Aramid']);
});
