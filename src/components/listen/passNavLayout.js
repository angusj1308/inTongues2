export const calculatePassNavLayout = ({
  playerBottom,
  viewportHeight,
  navHeight,
  buffer = 12,
  reserveBuffer = 24,
}) => {
  const midpoint = playerBottom + (viewportHeight - playerBottom) / 2
  let top = Math.min(midpoint, viewportHeight - navHeight - buffer)
  top = Math.max(top, playerBottom + buffer)
  return {
    top,
    reserve: navHeight + reserveBuffer,
  }
}
