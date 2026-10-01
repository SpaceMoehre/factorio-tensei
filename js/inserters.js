// Approximate inserter throughput in items/minute, moving `handSize` items per swing (1 without
// inserter capacity research). A swing turns the hand through `angle` degrees while it extends or retracts between
// its pickup and drop distances; whichever takes longer sets the swing time. Pickup and drop
// themselves are ignored, so real rates run a few percent lower.
// lengths: { pickup, insert } overrides the prototype's distances, for custom vectors (a long
// inserter reaching an adjacent tile).
export function inserterRate(spec, angle, handSize = 1, lengths = null) {
  const length = v => Math.hypot(v.x, v.y);
  const pickup = lengths?.pickup ?? length(spec.pickup), insert = lengths?.insert ?? length(spec.insert);
  const turnTicks = angle / 360 / spec.rotationSpeed;
  const reachTicks = Math.abs(insert - pickup) / spec.extensionSpeed;
  return handSize * 3600 / (2 * Math.max(turnTicks, reachTicks));
}
