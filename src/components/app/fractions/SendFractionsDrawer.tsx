/**
 * Send Fractions Drawer
 * =====================
 * Give some of your fractions of a post to another Riftn account: search a
 * person, pick how many, send.
 *
 * The fractions move straight from your wallet to theirs (ERC-1155
 * safeTransferFrom). Afterwards the server reads the transfer back and tells
 * the receiver. What you have listed for sale is held back, so a send can
 * never leave a live listing without the fractions behind it.
 */

import { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Send from '@/components/ui/cut-icons/send';
import Minus from '@/components/ui/cut-icons/minus';
import Plus from '@/components/ui/cut-icons/add';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthContext } from '@/contexts/AuthContext';
import { searchUsers } from '@/lib/api/dehub/users';
import { confirmFractionGift } from '@/lib/api/dehub/fraction-gifts';
import { useFractionBalance } from '@/hooks/use-fraction-balance';
import { useFractionListings, invalidateFractionQueries, TOTAL_FRACTIONS } from '@/hooks/use-fraction-marketplace';
import { coAuthorName, type CoAuthorUser } from '@/lib/co-author-store';
import { CoAuthorFace } from '@/components/app/cards/CoAuthorByline';
import { formatCount } from '@/lib/format-count';
import type { ChainId } from '@/components/app/ChainSelector';
import { FractionThumb } from './FractionThumb';

interface SendFractionsDrawerProps {
  tokenId: string;
  chainId?: number;
  post?: { title?: string; imageUrl?: string; type?: string };
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

function PersonRow({ user, action, onClick }: { user: CoAuthorUser; action?: React.ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <CoAuthorFace user={user} className="w-9 h-9 shrink-0" />
      <div className="flex flex-col min-w-0 flex-1 text-left">
        <span className="text-white font-semibold truncate">{coAuthorName(user)}</span>
        <span className="text-zinc-500 text-sm truncate">{user.username ? `@${user.username}` : user.address}</span>
      </div>
      {action}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex items-center gap-3 px-3 py-2 min-w-0 w-full rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors">
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-3 px-3 py-2 min-w-0">{body}</div>
  );
}

export function SendFractionsDrawer({ tokenId, chainId = 8453, post, open, onOpenChange }: SendFractionsDrawerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const me = useContext(AuthContext)?.walletAddress?.toLowerCase() ?? '';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CoAuthorUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [to, setTo] = useState<CoAuthorUser | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [sending, setSending] = useState(false);

  const { data: balance, isLoading: loadingBalance } = useFractionBalance(tokenId, chainId);
  const { data: listings = [] } = useFractionListings(tokenId);
  const listed = useMemo(
    () => listings
      .filter(l => l.status === 'active' && l.seller_address.toLowerCase() === me)
      .reduce((sum, l) => sum + (l.quantity - l.filled_quantity), 0),
    [listings, me],
  );
  const held = balance ?? 0;
  const sendable = Math.max(0, held - listed);

  useEffect(() => {
    setQuantity(q => Math.min(Math.max(1, q), Math.max(1, sendable)));
  }, [sendable]);

  useEffect(() => {
    const q = query.trim().replace(/^@/, '');
    if (to || q.length < 2) { setResults([]); setSearching(false); return; }
    let live = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchUsers({ q, limit: 8 })
        .then(res => {
          if (!live) return;
          setResults(
            (res.data || [])
              .map(u => ({
                address: String(u.address || u.wallet_address || '').toLowerCase(),
                username: u.username || undefined,
                displayName: (u as { displayName?: string }).displayName || undefined,
                avatarImageUrl: (u as { avatarImageUrl?: string }).avatarImageUrl || undefined,
              }))
              .filter(u => /^0x[0-9a-f]{40}$/.test(u.address) && u.address !== me),
          );
        })
        .catch(() => { if (live) setResults([]); })
        .finally(() => { if (live) setSearching(false); });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [query, to, me]);

  const send = async () => {
    if (!to || !me || sending || quantity < 1 || quantity > sendable) return;
    setSending(true);
    try {
      const { transferFractions } = await import('@/lib/contracts/fraction-transfer');
      const result = await transferFractions(tokenId, me, to.address, quantity, chainId as ChainId);
      if (!result?.hash) throw new Error(t('fractions.giftNotSubmitted', 'The transfer was not sent'));

      // The fractions have moved. Telling the receiver is best effort: retry
      // while the transaction is still being picked up, never fail the send.
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          const res = await confirmFractionGift({ chainId, txHash: result.hash, to: to.address, tokenId });
          if (!res?.pending) break;
        } catch {
          // Not readable yet, or the server said no; the transfer still stands.
        }
        await wait(2500);
      }

      invalidateFractionQueries(queryClient, tokenId);
      queryClient.invalidateQueries({ queryKey: ['fraction-portfolio'] });
      toast.success(t('fractions.giftSent', { count: quantity, name: coAuthorName(to), defaultValue: 'Sent {{count}} to {{name}}' }));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('fractions.giftFailed', "Couldn't send. Try again."));
    } finally {
      setSending(false);
    }
  };

  const title = post?.title || t('fractions.postNumber', { id: tokenId });

  return (
    <Drawer open={open} onOpenChange={v => { if (!sending) onOpenChange(v); }}>
      <DrawerContent scrollable column glass className="px-4 pb-6" data-send-fractions>
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle className="text-white text-lg">{t('fractions.giftTitle', 'Send fractions')}</DrawerTitle>
          <DrawerDescription className="text-zinc-400 text-sm">
            {t('fractions.giftHint', 'They go straight from your wallet to theirs.')}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/5 shrink-0">
            <FractionThumb tokenId={tokenId} imageUrl={post?.imageUrl ?? null} title={post?.title ?? null} postType={post?.type ?? null} width={96} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{title}</p>
            <p className="text-xs text-zinc-400">
              {loadingBalance
                ? ' '
                : t('fractions.giftYouOwn', { count: held, total: formatCount(TOTAL_FRACTIONS), defaultValue: 'You own {{count}} of {{total}}' })}
            </p>
          </div>
        </div>

        {listed > 0 && sendable < held && (
          <p className="text-xs text-zinc-500 px-1 pt-2">
            {t('fractions.giftListedNote', { count: listed, defaultValue: '{{count}} are listed for sale. Cancel the listing to send those.' })}
          </p>
        )}

        <div className="flex flex-col gap-2 pt-4">
          <span className="text-zinc-500 text-xs font-medium uppercase tracking-wide px-1">{t('fractions.giftTo', 'To')}</span>
          {to ? (
            <div className="rounded-xl border border-white/10 bg-white/5">
              <PersonRow
                user={to}
                action={(
                  <Button size="sm" variant="secondary" disabled={sending} onClick={() => { setTo(null); setQuery(''); }}>
                    {t('fractions.giftChange', 'Change')}
                  </Button>
                )}
              />
            </div>
          ) : (
            <>
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('fractions.giftSearch', 'Search people')}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label={t('fractions.giftSearch', 'Search people')}
                className="h-11 rounded-xl border-zinc-500/30 bg-zinc-500/10 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-400/40"
              />
              {results.length > 0 ? (
                <div className="flex flex-col">
                  {results.map(user => (
                    <PersonRow key={user.address} user={user} onClick={() => setTo(user)} />
                  ))}
                </div>
              ) : query.trim().replace(/^@/, '').length >= 2 && !searching ? (
                <p className="text-zinc-500 text-sm px-1">{t('fractions.giftNoOne', 'No one found')}</p>
              ) : null}
            </>
          )}
        </div>

        {to && (
          <div className="flex flex-col gap-2 pt-4">
            <span className="text-zinc-500 text-xs font-medium uppercase tracking-wide px-1">{t('fractions.giftHowMany', 'How many')}</span>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="secondary"
                className="h-11 w-11 rounded-xl shrink-0"
                disabled={sending || quantity <= 1}
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                aria-label={t('fractions.giftLess', 'One less')}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={sendable}
                value={quantity}
                disabled={sending}
                onChange={e => {
                  const n = Math.floor(Number(e.target.value));
                  setQuantity(Number.isFinite(n) ? Math.min(Math.max(1, n), Math.max(1, sendable)) : 1);
                }}
                aria-label={t('fractions.giftHowMany', 'How many')}
                className="h-11 rounded-xl border-zinc-500/30 bg-zinc-500/10 text-white text-center tabular-nums"
              />
              <Button
                size="icon"
                variant="secondary"
                className="h-11 w-11 rounded-xl shrink-0"
                disabled={sending || quantity >= sendable}
                onClick={() => setQuantity(q => Math.min(sendable, q + 1))}
                aria-label={t('fractions.giftMore', 'One more')}
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                variant="secondary"
                className="h-11 rounded-xl shrink-0"
                disabled={sending || sendable < 1}
                onClick={() => setQuantity(Math.max(1, sendable))}
              >
                {t('fractions.giftAll', 'All')}
              </Button>
            </div>
          </div>
        )}

        <Button
          className="mt-5 h-12 rounded-xl w-full"
          disabled={!to || sending || loadingBalance || sendable < 1 || quantity < 1 || quantity > sendable}
          onClick={send}
        >
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('fractions.giftSending', 'Sending…')}
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              {to
                ? t('fractions.giftButton', { count: quantity, name: coAuthorName(to), defaultValue: 'Send {{count}} to {{name}}' })
                : t('fractions.giftTitle', 'Send fractions')}
            </>
          )}
        </Button>
      </DrawerContent>
    </Drawer>
  );
}
