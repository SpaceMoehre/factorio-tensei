// Names as people read them: the game's, from the catalog (its `names`, from Factorio's locale
// dump), else the prototype name made words ("iron-pulp-01" is "Iron pulp 01").
let names = {};

export function useNames(catalog) {
  names = { ...catalog?.recipeNames, ...catalog?.names };
}

export function displayName(name) {
  const key = String(name ?? '');
  if (names[key]) return names[key];
  const text = key.replace(/[-_]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
