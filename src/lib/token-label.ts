import i18n from 'i18next';
import { isDhbSymbol } from '@/lib/market/dhb-symbols';

/** Display wording only; callers keep the original symbol for settlement. */
export function tokenLabel(symbol?: string | null): string {
  if (symbol?.trim() && !isDhbSymbol(symbol)) return symbol;
  return i18n.t('buyCoins.tokensUnit', { defaultValue: 'tokens' }) || 'tokens';
}

/** PPV prices use the branded unit wherever the currency is written out. */
export function ppvTokenLabel(symbol: string): string {
  return isDhbSymbol(symbol) ? 'RIFT Tokens' : symbol;
}
