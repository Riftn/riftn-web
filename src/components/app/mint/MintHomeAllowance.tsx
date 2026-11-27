import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { getPostQuota, type PostQuotaStatus } from '@/lib/api/dehub';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';

/**
 * How many of today's mints still reach the home feed.
 *
 * Information only: minting is never blocked by it. Past the number a mint
 * still goes through and shows on the creator's profile, in Following and in
 * the fractions market, it just stays off Home. Renders nothing when the API
 * does not send the mint numbers yet.
 */
export function MintHomeAllowanceLine({
  quota,
  className,
}: {
  quota: Pick<PostQuotaStatus, 'mintsPerDay' | 'homeMintsRemaining'> | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const total = quota?.mintsPerDay;
  if (typeof total !== 'number' || total <= 0) return null;
  const left = Math.max(0, Math.min(total, quota?.homeMintsRemaining ?? total));
  return (
    <p className={cn('text-xs text-white/50 leading-snug', className)} data-mint-home-allowance>
      {t('mintChain.homeAllowance', {
        defaultValue: '{{left}} of {{total}} mints today reach Home. Extra mints go to your profile and the market.',
        left: formatCount(left),
        total: formatCount(total),
      })}
    </p>
  );
}

/** The same line, reading the signed-in creator's allowance itself. */
export function MintHomeAllowance({ enabled = true, className }: { enabled?: boolean; className?: string }) {
  const { walletAddress, isAuthenticated } = useAuth();
  const { data } = useQuery({
    queryKey: ['post-quota', walletAddress?.toLowerCase() ?? null],
    queryFn: getPostQuota,
    enabled: enabled && isAuthenticated && !!walletAddress,
    staleTime: 15_000,
  });
  if (!enabled) return null;
  return <MintHomeAllowanceLine quota={data} className={className} />;
}
