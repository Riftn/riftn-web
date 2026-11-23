/** Cashtags and legacy aliases that identify the Riftn token. */
const DHB_SYMBOLS = new Set(['DHB', 'DEHUB', 'RIFT', 'RIFTN']);

export function isDhbSymbol(symbol?: string | null): boolean {
  const s = symbol?.trim().replace(/^\$/, '').toUpperCase();
  return !!s && DHB_SYMBOLS.has(s);
}
