const MIN_RATIO = 2 / 3;
const MAX_RATIO = 2;

export function profilePhotoRows(ratios: readonly (number | undefined)[], adaptive: boolean) {
  const rows: { start: number; count: number; tracks: number[] }[] = [];
  for (let start = 0; start < ratios.length;) {
    const columns = adaptive && rows.length % 2 === 0 ? 2 : 3;
    const count = Math.min(columns, ratios.length - start);
    // Reserve empty tracks at the end so a lone photo doesn't balloon to fill
    // the row. These ratios size the tiles; the images themselves are contained.
    const tracks = Array.from({ length: columns }, (_, column) => {
      const ratio = column < count ? ratios[start + column] : undefined;
      return adaptive && ratio !== undefined && ratio > 0 && Number.isFinite(ratio)
        ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio))
        : 1;
    });
    rows.push({ start, count, tracks });
    start += count;
  }
  return rows;
}
