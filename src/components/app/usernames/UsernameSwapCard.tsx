import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  acceptUsernameSwap,
  cancelUsernameSwap,
  getUsernameSwaps,
  requestUsernameSwap,
} from '@/lib/api/dehub/username-market';

/**
 * Swap usernames with another account you own, in one step. Start it here,
 * then switch to the other account and accept: the names change places at
 * the same moment, so neither is ever free for someone else to take.
 */
export function UsernameSwapCard() {
  const { t } = useTranslation();
  const { isAuthenticated, user, refreshUser } = useAuth();
  const client = useQueryClient();
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const swaps = useQuery({ queryKey: ['username-swaps', user?.username], queryFn: getUsernameSwaps, enabled: isAuthenticated, refetchInterval: 15_000 });
  if (!isAuthenticated) return null;

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast.success(done);
      await swaps.refetch();
    } catch (err: any) {
      toast.error(err?.message || t('common.tryAgain'));
    } finally {
      setBusy(null);
    }
  };

  const incoming = swaps.data?.incoming ?? [];
  const outgoing = swaps.data?.outgoing ?? [];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="w-4 h-4 text-white" />
        <p className="font-semibold text-white">{t('usernames.swap.title', 'Swap with your other account')}</p>
      </div>
      <p className="text-xs text-zinc-400">{t('usernames.swap.body', 'Own two accounts? Swap their usernames in one step. Start here, then switch to the other account and accept. Neither name is ever free for someone else to take.')}</p>

      {incoming.map((s) => (
        <div key={s.id} className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
          <p className="text-sm text-white">
            {t('usernames.swap.incoming', '@{{from}} wants to swap: this account becomes @{{from}}, and that one becomes @{{to}}.', { from: s.fromUsername, to: s.toUsername })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => run(`a${s.id}`, async () => { await acceptUsernameSwap(s.id); await refreshUser().catch(() => {}); client.invalidateQueries(); }, t('usernames.swap.done', 'Swapped. You are now @{{name}}.', { name: s.fromUsername }))}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {busy === `a${s.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : t('usernames.swap.accept', 'Swap now')}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => run(`d${s.id}`, () => cancelUsernameSwap(s.id))}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {t('usernames.swap.decline', 'Decline')}
            </button>
          </div>
        </div>
      ))}

      {outgoing.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-sm text-white">
            {t('usernames.swap.waiting', 'Waiting for @{{to}} to accept. Switch to that account to finish.', { to: s.toUsername })}
          </p>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run(`c${s.id}`, () => cancelUsernameSwap(s.id))}
            className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      ))}

      {!outgoing.length && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = other.trim();
            if (!name) return;
            void run('req', async () => { await requestUsernameSwap(name); setOther(''); }, t('usernames.swap.sent', 'Sent. Switch to @{{name}} and accept.', { name: name.replace(/^@/, '') }));
          }}
        >
          <input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder={t('usernames.swap.placeholder', '@your_other_account')}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button type="submit" disabled={!!busy || !other.trim()} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-50">
            {busy === 'req' ? <Loader2 className="w-4 h-4 animate-spin" /> : t('usernames.swap.start', 'Start swap')}
          </button>
        </form>
      )}
    </div>
  );
}
