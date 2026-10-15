/** Shows the jump control whenever the reader leaves the latest-message zone. */
export function shouldShowJumpToLatest(distanceFromBottom: number): boolean {
  return distanceFromBottom > 80;
}
