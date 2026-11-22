import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { marketTicker } from '@/lib/api/dehub/games';

/**
 * BTC, ETH and gold (per ounce) in USD at the top of the Money menu group.
 * Prices are money, so they stay exact rather than 1.2K style. Hidden when the
 * price source is down instead of showing an empty strip.
 */
export function MarketTicker() {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({
    queryKey: ['market-ticker'],
    queryFn: marketTicker,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  if (!data?.items?.length) return null;
  const money = (price: number) =>
    new Intl.NumberFormat(i18n.language || 'en', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: price < 10 ? 2 : 0,
    }).format(price);
  return (
    <div data-market-ticker className="mx-0.5 mb-2.5 flex gap-1.5 overflow-x-auto [scrollbar-width:none]" aria-label={t('games.markets.label', { defaultValue: 'Market prices' })}>
      {data.items.map((item) => {
        const up = (item.change24h ?? 0) >= 0;
        return (
          <div key={item.id} className="flex min-w-0 flex-1 flex-col rounded-xl bg-white/[0.06] px-2.5 py-1.5 ring-1 ring-white/[0.08]">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
              {item.id === 'gold' ? t('games.markets.gold', { defaultValue: 'Gold (oz)' }) : item.label}
            </span>
            <span className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-[13px] font-bold tabular-nums text-white">{money(item.price)}</span>
              {item.change24h !== null ? (
                <span className={`text-[10.5px] font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                  {up ? '▲' : '▼'}{Math.abs(item.change24h).toFixed(1)}%
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
