// Shelf packing: Sub-Blocks fill a shelf left to right in the given order until the width
// budget is spent, then a new shelf starts below. gaps[i] is the free width after Sub-Block i,
// shelfGap the free height between shelves; `shelf` widens (> 0) or narrows (< 0) the budget.
export function shelfPack(sizes, order, { gaps, shelfGap, shelf = 0 }) {
  const area = order.reduce((sum, i) => sum + (sizes[i].w + gaps[i]) * (sizes[i].h + shelfGap), 0);
  const budget = Math.max(...sizes.map(s => s.w), Math.ceil(Math.sqrt(area) * 1.25 ** shelf));
  const placed = [];
  let x = 0, y = 0, shelfHeight = 0;
  for (const i of order) {
    const { w, h } = sizes[i];
    if (x > 0 && x + w > budget) {
      y += shelfHeight + shelfGap;
      x = 0;
      shelfHeight = 0;
    }
    placed[i] = { x, y };
    x += w + gaps[i];
    shelfHeight = Math.max(shelfHeight, h);
  }
  return placed;
}
