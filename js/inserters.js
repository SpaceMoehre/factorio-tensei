// Approximate inserter throughput in items/minute, moving one item per swing (no capacity
// bonus). A swing turns the hand through `angle` degrees while it extends or retracts between
// its pickup and drop distances; whichever takes longer sets the swing time. Pickup and drop
// themselves are ignored, so real rates run a few percent lower.
export function inserterRate(spec, angle) {
  const length = v => Math.hypot(v.x, v.y);
  const turnTicks = angle / 360 / spec.rotationSpeed;
  const reachTicks = Math.abs(length(spec.insert) - length(spec.pickup)) / spec.extensionSpeed;
  return 3600 / (2 * Math.max(turnTicks, reachTicks));
}
