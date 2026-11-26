import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, ClipboardCopy, ShoppingCart } from 'lucide-react';
import riftnCoin from '@/assets/dehub-coin.png';
import { Button } from '@/components/ui/button';
import { TokenLaunchNotify } from '@/components/app/token-launch/TokenLaunchNotify';
import { RIFT_REFERENCE_PRICE } from '@/lib/market/dhb-listing';

type Detail = 'info' | 'contract' | 'buy';

export function DhbListingSoonCard() {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<Detail | null>(null);
  const actions = [
    { key: 'info', label: t('tokenLaunch.tickerInfo', 'Info'), icon: Info },
    { key: 'contract', label: t('tokenLaunch.tickerContract', 'Contract address'), icon: ClipboardCopy },
    { key: 'buy', label: t('tokenLaunch.tickerBuy', 'Buy'), icon: ShoppingCart },
  ] as const;

  return (
    <section data-dhb-listing-card className="mb-4 overflow-hidden rounded-2xl border border-zinc-700/50 bg-zinc-800/60">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <img src={riftnCoin} alt="" className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="font-semibold text-white">$RIFT</h3>
            <span className="text-sm text-zinc-400">Riftn</span>
          </div>
          <p className="text-sm font-medium text-white">
            {RIFT_REFERENCE_PRICE} <span className="text-xs font-normal text-zinc-400">{t('tokenLaunch.referencePrice', 'In-app reference price')}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {actions.map(({ key, label, icon: Icon }) => (
            <Button key={key} type="button" variant={detail === key ? 'glass' : 'ghost'} size="sm"
              aria-expanded={detail === key} onClick={() => setDetail(current => current === key ? null : key)}
              className="gap-1.5">
              <Icon className="h-4 w-4" aria-hidden="true" />{label}
            </Button>
          ))}
        </div>
      </div>
      {detail === 'info' && (
        <p role="status" className="border-t border-zinc-700/50 px-4 py-3 text-sm text-zinc-200">
          {t('tokenLaunch.eyebrow', 'Coming soon')}
        </p>
      )}
      {detail === 'contract' && (
        <p role="status" className="border-t border-zinc-700/50 px-4 py-3 text-sm text-zinc-200">
          {t('tokenLaunch.contractPending', 'To be confirmed')}
        </p>
      )}
      {detail === 'buy' && <TokenLaunchNotify compact />}
    </section>
  );
}
