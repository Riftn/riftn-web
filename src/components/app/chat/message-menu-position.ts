const EDGE = 10;

/** Map a viewport anchor into the menu's positioned container. */
export function placeMessageMenu(
  point: { x: number; y: number },
  width: number,
  height: number,
  container?: HTMLElement,
) {
  let { x, y } = point;
  if (container) {
    const rect = container.getBoundingClientRect();
    x -= rect.left + container.clientLeft;
    y -= rect.top + container.clientTop;
  }
  const availableWidth = container?.clientWidth ?? window.innerWidth;
  const availableHeight = container?.clientHeight ?? window.innerHeight;
  const flipX = x + width + EDGE > availableWidth;
  const flipY = y + height + EDGE > availableHeight && y - height - EDGE > 0;
  return {
    left: Math.max(EDGE, Math.min(flipX ? x - width : x, availableWidth - width - EDGE)),
    top: Math.max(EDGE, Math.min(flipY ? y - height : y, availableHeight - height - EDGE)),
    originX: flipX ? 'right' : 'left',
    originY: flipY ? 'bottom' : 'top',
  };
}
