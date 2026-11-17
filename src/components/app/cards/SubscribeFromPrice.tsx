import { DhbAmount } from '@/components/app/DhbAmount';
import { useTranslation } from 'react-i18next';
import {
  formatSubscriberPrice,
  formatSubscriberUsd,
  type SubscriberPlanQuote,
} from '@/lib/content-gate';
import { cn } from '@/lib/utils';

/**
 * "Subscribe from 10 (coin)" with the dollar value on its own line under it.
 * Every subscriber wall in the feed renders its price through this, so the
 * token figure and the dollar figure always come from the same quote.
 */
export function SubscribeFromPrice({
  quote,
  align = 'center',
  iconClassName = 'h-3.5 w-3.5',
  className,
}: {
  quote: SubscriberPlanQuote;
  align?: 'center' | 'start';
  iconClassName?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const usd = formatSubscriberUsd(quote.usd);
  return (
    <span
      className={cn(
        'inline-flex flex-col leading-tight',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1 flex-wrap justify-center">
        {t('copy.8b2ebd182d8e', { defaultValue: 'Subscribe from' })}
        <DhbAmount amount={formatSubscriberPrice(quote.tokens)} iconClassName={iconClassName} />
      </span>
      {usd && <span className="text-[0.85em] font-normal opacity-70 tabular-nums">{usd}</span>}
    </span>
  );
}
