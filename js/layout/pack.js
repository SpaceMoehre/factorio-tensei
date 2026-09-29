// Shelf packing in Dependency Order: Sub-Blocks fill a shelf left to right until the width
// budget is spent, then a new shelf starts below. Gaps of `margin` tiles are routing channels.
export function shelfPack(sizes, order, margin) {
  const area = order.reduce((sum, i) => sum + (sizes[i].w + margin) * (sizes[i].h + margin), 0);
  const budget = Math.max(...sizes.map(s => s.w), Math.ceil(Math.sqrt(area)));
  const placed = [];
  let x = 0, y = 0, shelfHeight = 0;
  for (const i of order) {
    const { w, h } = sizes[i];
    if (x > 0 && x + w > budget) {
      y += shelfHeight + margin;
      x = 0;
      shelfHeight = 0;
    }
    placed[i] = { x, y };
    x += w + margin;
    shelfHeight = Math.max(shelfHeight, h);
  }
  return placed;
}
