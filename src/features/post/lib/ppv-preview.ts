/** Blank and zero both leave the preview off. */
export function parsePpvPreviewSeconds(value: string): number | null {
  const input = value.trim();
  if (!input) return 0;
  if (!/^\d{1,2}$/.test(input)) return null;
  const seconds = Number(input);
  return seconds <= 30 ? seconds : null;
}
