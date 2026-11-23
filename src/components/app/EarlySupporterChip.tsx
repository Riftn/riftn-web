/**
 * Early supporter chip
 * ====================
 * Beside the name on a profile, for anyone with at least one request on the
 * Requests board that shipped (Requests 4dbc2296). Tapping it opens their
 * latest shipped request.
 *
 * The chip itself came out with a one-day head start for the person who
 * asked for it, so it rides useEarlyAccess like any feature built from a
 * request.
 *
 * @module components/app/EarlySupporterChip
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import RequestsIcon from '@/components/ui/cut-icons/feature-requests';
import { useEarlyAccess, useEarlySupporter } from '@/hooks/use-early-access';
import { EARLY_SUPPORTER_OPEN_BY, EARLY_SUPPORTER_REQUEST_ID } from '@/lib/early-access';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';

interface EarlySupporterChipProps {
  /** Wallet of the person whose profile is on screen. */
  address?: string | null;
  /** Their username, for a few old requests saved under it. */
  username?: string | null;
  className?: string;
}

export function EarlySupporterChip({ address, username, className }: EarlySupporterChipProps) {
  const { t } = useTranslation();
  const open = useEarlyAccess(EARLY_SUPPORTER_REQUEST_ID, EARLY_SUPPORTER_OPEN_BY);
  const { data } = useEarlySupporter(address, username, open);

  if (!open || !data || data.shipped < 1) return null;

  const title = t('features.earlySupporter.title', {
    defaultValue: 'Early supporter: {{value}} of their requests shipped',
    value: formatCount(data.shipped),
  });

  return (
    <Link
      to={data.latestId ? `/build?feature=${data.latestId}` : '/build'}
      data-early-supporter-chip
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md',
        'bg-white/[0.12] text-white/75 border border-white/[0.12] text-[10px] font-semibold leading-none whitespace-nowrap flex-shrink-0',
        'transition-colors duration-200 hover:bg-white/[0.18] hover:text-white',
        className,
      )}
    >
      <RequestsIcon className="w-2.5 h-2.5" />
      {t('features.earlySupporter.chip', 'Early supporter')}
    </Link>
  );
}
