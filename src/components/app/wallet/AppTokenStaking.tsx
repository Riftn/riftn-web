import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { APP_TOKENS_QUERY_KEY, useAppTokens } from '@/hooks/use-app-tokens';
import { useDraftState } from '@/hooks/use-draft-state';
import {
  moveAppTokenStake, newAppTokenKey, type AppTokenStakeRequest, type AppTokensAccount,
} from '@/lib/api/dehub/app-tokens';

export function AppTokenStaking() {
  const { walletAddress, isAuthenticated, isLoading, openLoginModal } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated || !walletAddress) return <SignInToStake onSignIn={() => openLoginModal({ path: '/stake' })} />;
  return <StakingForm key={walletAddress.toLowerCase()} address={walletAddress.toLowerCase()} />;
}

function SignInToStake({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation();
  return <Button variant="glass" onClick={onSignIn}>{t('staking.signInToStake', 'Sign in to stake')}</Button>;
}

function StakingForm({ address }: { address: string }) {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useAppTokens();
  const queryClient = useQueryClient();
  const [pending, setPending] = useDraftState<AppTokenStakeRequest | null>('app-token-stake-request', null);
  const [direction, setDirection] = useState<AppTokenStakeRequest['direction']>(pending?.direction ?? 'stake');
  const [amount, setAmount] = useState(pending?.amount ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const sending = useRef(false);
  const balance = data?.balance ?? '0';
  const staked = data?.staked ?? '0';
  const max = direction === 'stake' ? balance : staked;
  const valid = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0 && Number(amount) <= Number(max);
  const stakeLabel = t('staking.appStake', 'Stake');
  const unstakeLabel = t('staking.appUnstake', 'Unstake');
  const action = direction === 'stake' ? stakeLabel : unstakeLabel;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || (!pending && !valid)) return;
    sending.current = true;
    setBusy(true);
    setMessage('');
    const request = pending ?? { direction, amount, key: newAppTokenKey() };
    setPending(request);
    try {
      const result = await moveAppTokenStake(request);
      setPending.complete(request, null);
      setAmount('');
      queryClient.setQueryData<AppTokensAccount>([APP_TOKENS_QUERY_KEY, address], current =>
        current ? { ...current, balance: result.balance, staked: result.staked } : current,
      );
      setMessage(request.direction === 'stake'
        ? t('appTokens.kindStaked', 'Staked')
        : t('appTokens.kindUnstaked', 'Unstaked'));
      void queryClient.invalidateQueries({ queryKey: [APP_TOKENS_QUERY_KEY, address] });
    } catch (error) {
      const failure = error as { httpStatus?: number; message?: string; errorCode?: string };
      const rejected = [400, 402, 403].includes(failure.httpStatus ?? 0) || failure.errorCode === 'KEY_REUSED';
      if (rejected) setPending.complete(request, null);
      setMessage(rejected && failure.message
        ? failure.message
        : t('staking.pendingAppStake', 'Confirm the result by retrying this request.'));
      void refetch();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (isPending && !pending) return <p role="status">{t('common.loading', 'Loading…')}</p>;
  if (isError && !data && !pending) {
    return <Button variant="glass" onClick={() => void refetch()}>{t('staking.retryBalance', 'Retry loading balances')}</Button>;
  }
  return (
    <form onSubmit={submit} data-kit-section className="space-y-4 border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-white/65">{t('staking.inAppDescription', 'Stake from your Riftn wallet. Unstake at any time to make your tokens available again.')}</p>
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs text-white/60">{t('staking.availableTokens', 'Available tokens')}</p><p className="text-lg font-semibold">{data ? balance : '—'}</p></div>
        <div><p className="text-xs text-white/60">{t('staking.stakedTokens', 'Staked tokens')}</p><p className="text-lg font-semibold">{data ? staked : '—'}</p></div>
      </div>
      <div className="flex gap-2">
        {(['stake', 'unstake'] as const).map(option => (
          <Button key={option} type="button" variant={direction === option ? 'glass' : 'ghost'} aria-pressed={direction === option} disabled={!!pending}
            onClick={() => { setDirection(option); setAmount(''); setMessage(''); }}>
            {option === 'stake' ? stakeLabel : unstakeLabel}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-28 flex-1" aria-label={t('appTokens.amount')} placeholder={t('appTokens.amount')}
          inputMode="decimal" value={amount} disabled={!!pending} maxLength={24}
          onChange={event => setAmount(event.target.value.replace(',', '.'))} />
        <Button type="button" variant="ghost" disabled={!!pending || !data} onClick={() => setAmount(max)}>{t('staking.max')}</Button>
        <Button type="submit" variant="glass" disabled={busy || (!pending && !valid)}>
          {busy ? t('common.loading', 'Loading…') : pending ? t('staking.retryAction', { action, defaultValue: 'Retry {{action}}' }) : action}
        </Button>
      </div>
      <p role="status" className="text-sm text-white/75">{message}</p>
    </form>
  );
}
