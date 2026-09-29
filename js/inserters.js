// Approximate inserter throughput in items/minute, moving `handSize` items per swing (1 without
// inserter capacity research). A swing turns the hand through `angle` degrees while it extends or retracts between
// its pickup and drop distances; whichever takes longer sets the swing time. Pickup and drop
// themselves are ignored, so real rates run a few percent lower.
export function inserterRate(spec, angle, handSize = 1) {
  const length = v => Math.hypot(v.x, v.y);
  const turnTicks = angle / 360 / spec.rotationSpeed;
  const reachTicks = Math.abs(length(spec.insert) - length(spec.pickup)) / spec.extensionSpeed;
  return handSize * 3600 / (2 * Math.max(turnTicks, reachTicks));
}
