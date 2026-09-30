// Shelf packing: Sub-Blocks fill a shelf left to right in the given order until the width
// budget is spent, then a new shelf starts below. gaps[i] is the free width after Sub-Block i,
// shelfGap the free height between shelves; `shelf` widens (> 0) or narrows (< 0) the budget;
// `stack` puts every Sub-Block on a shelf of its own.
// shares[j] = { with: i, rows: [rowOfI, rowOfJ] } sets j beside i (when i comes right before it
// on the shelf) with those rows level, so i's output belt runs straight on as j's input belt.
export function shelfPack(sizes, order, { gaps, shelfGap, shelf = 0, shares = [], stack = false }) {
  const area = order.reduce((sum, i) => sum + (sizes[i].w + gaps[i]) * (sizes[i].h + shelfGap), 0);
  const budget = stack ? 0 : Math.max(...sizes.map(s => s.w), Math.ceil(Math.sqrt(area) * 1.25 ** shelf));
  const placed = [];
  let x = 0, top = 0, bottom = 0, previous = null, onShelf = [];
  for (const i of order) {
    const { w, h } = sizes[i];
    if (x > 0 && x + w > budget) {
      top = bottom + shelfGap;
      x = 0;
      onShelf = [];
      previous = null;
    }
    let y = top;
    const share = shares[i];
    if (share && share.with === previous) {
      y = placed[previous].y + share.rows[0] - share.rows[1];
      // Level rows may put this Sub-Block above the shelf: move the shelf's others down.
      if (y < top) {
        for (const j of onShelf) placed[j].y += top - y;
        y = top;
      }
    }
    placed[i] = { x, y };
    onShelf.push(i);
    bottom = Math.max(bottom, ...onShelf.map(j => placed[j].y + sizes[j].h));
    x += w + gaps[i];
    previous = i;
  }
  return placed;
}
