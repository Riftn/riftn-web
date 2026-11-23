/**
 * SillyCoin
 * =========
 * `/arcade/sillycoin`: a tap-to-mine idle game. Tap the coin, buy a bigger pick
 * and auto-miners, send coins to friends, climb the top 10.
 *
 * SillyCoins are just for fun and have no value: not a token, never connected
 * to a wallet, nothing to buy or cash out. The server keeps the count so that
 * sending works (riftn-backend src/games/sillycoin.service.ts). Taps are
 * batched and synced every few seconds; the server accepts at most 15 a second
 * and pays auto-miners for at most 8 hours away, so this page counts the same
 * way to keep the number on screen honest.
 *
 * Signed out, the coin still taps (nothing is saved) and the page asks to sign
 * in to keep the coins and send them.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Bot, Drill, Loader2, Pickaxe, Send, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { useAuth } from '@/contexts/AuthContext';
import { formatCount } from '@/lib/format-count';
import {
  SILLY_UPGRADES, sillyMine, sillySend, sillyState, sillyUpgrade,
  type GamePlayer, type SillyMe, type SillyState, type SillyUpgradeKind,
} from '@/lib/api/dehub/games';

const PAGE_URL = 'https://riftn.com/arcade/sillycoin';
const OG_IMAGE = 'https://riftn.com/og/arcade-sillycoin.jpg';
const MAX_TAPS_PER_SECOND = 15;
const SYNC_MS = 3000;
const NOTE_MAX = 80;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const short = (n: number) => formatCount(Math.floor(n));
const nameOf = (p: GamePlayer | null | undefined) =>
  !p ? '' : p.username ? `@${p.username}` : p.displayName || `${p.address.slice(0, 6)}…`;

const UPGRADE_ICONS: Record<SillyUpgradeKind, typeof Pickaxe> = { pick: Pickaxe, miner: Bot, rig: Drill };
const UPGRADE_NAMES: Record<SillyUpgradeKind, string> = { pick: 'Bigger pick', miner: 'Auto-miner', rig: 'Drill rig' };
const BOUGHT: Record<SillyUpgradeKind, string> = { pick: 'Bigger pick bought', miner: 'Auto-miner bought', rig: 'Drill rig bought' };

function share(title: string, copied: string) {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    void nav.share({ url: PAGE_URL, title }).catch(() => undefined);
    return;
  }
  void navigator.clipboard?.writeText(PAGE_URL).then(() => toast.success(copied));
}

/** The coin itself: drawn here so it is crisp at any size and in every theme. */
function CoinArt() {
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full drop-shadow-[0_12px_30px_rgba(245,158,11,0.35)]" aria-hidden>
      <defs>
        <radialGradient id="sc-face" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#FFF3B0" />
          <stop offset="45%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </radialGradient>
        <linearGradient id="sc-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#92400E" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill="url(#sc-rim)" />
      <circle cx="100" cy="100" r="84" fill="url(#sc-face)" />
      <circle cx="100" cy="100" r="68" fill="none" stroke="#B45309" strokeOpacity="0.55" strokeWidth="3" />
      <text x="102" y="104" textAnchor="middle" dominantBaseline="central" fontSize="92" fontWeight="900" fill="#92400E" fillOpacity="0.55" fontFamily="Inter, system-ui, sans-serif">S</text>
      <text x="99" y="100" textAnchor="middle" dominantBaseline="central" fontSize="92" fontWeight="900" fill="#FFF7D6" fontFamily="Inter, system-ui, sans-serif">S</text>
      <ellipse cx="72" cy="52" rx="26" ry="11" fill="#FFFFFF" fillOpacity="0.35" transform="rotate(-28 72 52)" />
    </svg>
  );
}

interface Floater { id: number; x: number; y: number; n: number }

function useNow(active: boolean, ms = 200) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(timer);
  }, [active, ms]);
  return now;
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/[0.06]">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">{icon}{title}</h2>
      {children}
    </section>
  );
}

function PlayerAvatar({ player }: { player: GamePlayer }) {
  const name = nameOf(player);
  return (
    <Avatar className="h-7 w-7 shrink-0">
      {player.avatarImageUrl ? <AvatarImage src={player.avatarImageUrl} alt="" /> : null}
      <AvatarFallback className="bg-zinc-800 text-[11px] text-zinc-300">{name.replace('@', '').slice(0, 1).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

function SillyGame({ wallet, data, onSignIn }: { wallet: string | null; data: SillyState | undefined; onSignIn: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const signedIn = !!wallet;

  // Server truth plus when it arrived; the screen adds miners and pending taps.
  const [base, setBase] = useState<{ me: SillyMe; at: number } | null>(null);
  const pending = useRef(0);
  /** Taps sent to the server and not answered yet: still on screen meanwhile. */
  const inflight = useRef(0);
  const [pendingShown, setPendingShown] = useState(0);
  const tapTimes = useRef<number[]>([]);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [pop, setPop] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [demoCoins, setDemoCoins] = useState(0);
  const floaterId = useRef(0);
  const awayShown = useRef(false);

  useEffect(() => {
    if (!data?.me) return;
    setBase({ me: data.me, at: Date.now() });
    if (!awayShown.current && data.me.awayEarned > 0) {
      awayShown.current = true;
      const hours = Math.max(1, Math.round(data.me.awaySeconds / 3600));
      toast.success(t('games.sillycoin.awayToast', { defaultValue: 'Your miners dug {{coins}} SillyCoins while you were away ({{hours}} h).', coins: short(data.me.awayEarned), hours }));
    }
  }, [data?.me, t]);

  const me = base?.me ?? null;
  const now = useNow(!!me && me.perSecond > 0);
  const live = me
    ? me.balance + (me.perSecond * Math.max(0, now - base!.at)) / 1000 + pendingShown * me.perTap
    : demoCoins;

  const apply = useCallback((next: SillyMe) => {
    setBase({ me: next, at: Date.now() });
  }, []);

  /** Take the waiting taps for a request; they stay on screen until it answers. */
  const takeTaps = useCallback(() => {
    const taps = pending.current;
    pending.current = 0;
    inflight.current = taps;
    return taps;
  }, []);
  /** The request answered: on success the server counted them, else keep them. */
  const doneTaps = useCallback((taps: number, ok: boolean) => {
    inflight.current = 0;
    if (!ok) pending.current += taps;
    setPendingShown(pending.current);
  }, []);

  /** Hand the server every tap made since the last sync. */
  const flush = useCallback(async () => {
    if (!signedIn) return;
    if (pending.current <= 0 || inflight.current > 0) return;
    const taps = takeTaps();
    try {
      const res = await sillyMine(taps);
      apply(res.me);
      doneTaps(taps, true);
    } catch {
      // Keep the taps for the next try rather than dropping them.
      doneTaps(taps, false);
    }
  }, [signedIn, apply, takeTaps, doneTaps]);

  useEffect(() => {
    if (!signedIn) return;
    const timer = window.setInterval(() => void flush(), SYNC_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [signedIn, flush]);

  const tap = (event: ReactPointerEvent<HTMLButtonElement> | ReactKeyboardEvent<HTMLButtonElement>) => {
    const at = Date.now();
    tapTimes.current = tapTimes.current.filter((x) => at - x < 1000);
    const counted = tapTimes.current.length < MAX_TAPS_PER_SECOND;
    if (counted) tapTimes.current.push(at);
    const per = me?.perTap ?? 1;
    if (counted) {
      if (signedIn) {
        pending.current += 1;
        setPendingShown(pending.current + inflight.current);
      } else {
        setDemoCoins((c) => c + 1);
      }
    }
    setPop((p) => p + 1);
    try { navigator.vibrate?.(6); } catch { /* not every browser has it */ }
    const rect = event.currentTarget.getBoundingClientRect();
    const hasPoint = 'clientX' in event && event.clientX > 0;
    const x = hasPoint ? (event as ReactPointerEvent).clientX - rect.left : rect.width / 2;
    const y = hasPoint ? (event as ReactPointerEvent).clientY - rect.top : rect.height / 3;
    if (counted) {
      const id = ++floaterId.current;
      setFloaters((list) => [...list.slice(-14), { id, x, y, n: per }]);
      window.setTimeout(() => setFloaters((list) => list.filter((f) => f.id !== id)), 850);
    }
  };

  const buy = async (kind: SillyUpgradeKind) => {
    if (!signedIn) return onSignIn();
    if (inflight.current > 0) return;
    setBusy(kind);
    const taps = takeTaps();
    try {
      const res = await sillyUpgrade(kind, taps);
      apply(res.me);
      doneTaps(taps, true);
      toast.success(t(`games.sillycoin.bought.${kind}`, { defaultValue: BOUGHT[kind] }));
    } catch (e) {
      doneTaps(taps, false);
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  // ------------------------------------------------------------- sending
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const send = async () => {
    if (!signedIn) return onSignIn();
    const n = Math.floor(Number(amount));
    if (!to.trim() || !Number.isFinite(n) || n < 1) {
      toast.error(t('games.sillycoin.sendMissing', { defaultValue: 'Pick who to send to and how many.' }));
      return;
    }
    if (inflight.current > 0) return;
    setBusy('send');
    const taps = takeTaps();
    try {
      const res = await sillySend({ to: to.trim(), amount: n, note: note.trim() || undefined, taps });
      apply(res.me);
      doneTaps(taps, true);
      toast.success(t('games.sillycoin.sent', { defaultValue: 'Sent {{coins}} SillyCoins to {{name}}', coins: short(n), name: nameOf(res.transfer.other) }));
      setAmount('');
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['sillycoin'] });
    } catch (e) {
      doneTaps(taps, false);
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const upgrades = me?.upgrades ?? (Object.keys(SILLY_UPGRADES) as SillyUpgradeKind[]).map((kind) => ({
    kind, level: 0, cost: SILLY_UPGRADES[kind].base, maxed: false, perTap: SILLY_UPGRADES[kind].perTap, perSecond: SILLY_UPGRADES[kind].perSecond,
  }));
  const transfers = data?.transfers ?? [];
  const board = data?.leaderboard ?? [];

  return (
    <div className="flex flex-col gap-3">
      <style>{`
        @keyframes sc-pop { 0% { transform: scale(1) } 35% { transform: scale(0.9) } 70% { transform: scale(1.06) } 100% { transform: scale(1) } }
        @keyframes sc-float { 0% { opacity: 0; transform: translate(-50%, -20%) scale(0.8) } 15% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%, -160%) scale(1.15) } }
        @keyframes sc-ring { 0% { opacity: 0.55; transform: scale(0.85) } 100% { opacity: 0; transform: scale(1.35) } }
        @media (prefers-reduced-motion: reduce) { .sc-anim { animation: none !important } }
      `}</style>

      <section className="relative overflow-hidden rounded-2xl bg-zinc-900 px-4 pb-5 pt-5 text-center ring-1 ring-white/[0.06]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgba(245,158,11,0.16),transparent_60%)]" />
        <p className="relative text-xs font-semibold uppercase tracking-wide text-amber-300/90">{t('games.sillycoin.balanceLabel', { defaultValue: 'Your SillyCoins' })}</p>
        <p className="relative mt-1 text-4xl font-extrabold tabular-nums text-white sm:text-5xl" aria-live="polite">{short(live)}</p>
        <p className="relative mt-1 text-xs text-zinc-400">
          {t('games.sillycoin.rates', { defaultValue: '{{tap}} per tap · {{second}} a second', tap: short(me?.perTap ?? 1), second: short(me?.perSecond ?? 0) })}
        </p>

        <div className="relative mx-auto mt-4 h-52 w-52 select-none sm:h-60 sm:w-60">
          <span key={`ring-${pop}`} className="sc-anim pointer-events-none absolute inset-0 rounded-full ring-4 ring-amber-300/70" style={{ animation: pop ? 'sc-ring 450ms ease-out forwards' : 'none', opacity: 0 }} />
          <button
            type="button"
            onPointerDown={(e) => { if (e.pointerType !== 'mouse' || e.button === 0) tap(e); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(e); } }}
            aria-label={t('games.sillycoin.tapLabel', { defaultValue: 'Tap to mine' })}
            className="relative h-full w-full touch-manipulation rounded-full outline-none focus-visible:ring-4 focus-visible:ring-amber-300/60"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span key={`coin-${pop}`} className="sc-anim block h-full w-full" style={{ animation: pop ? 'sc-pop 180ms ease-out' : 'none' }}>
              <CoinArt />
            </span>
            <Pickaxe className="pointer-events-none absolute -right-1 -top-1 h-12 w-12 rotate-12 text-zinc-200 drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]" aria-hidden />
            {floaters.map((f) => (
              <span
                key={f.id}
                className="sc-anim pointer-events-none absolute text-lg font-extrabold text-amber-200 drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]"
                style={{ left: f.x, top: f.y, animation: 'sc-float 800ms ease-out forwards' }}
              >
                +{short(f.n)}
              </span>
            ))}
          </button>
        </div>
        <p className="relative mt-3 text-xs text-zinc-500">{t('games.sillycoin.tapHint', { defaultValue: 'Tap the coin to mine. Up to 15 taps a second count.' })}</p>

        {!signedIn ? (
          <div className="relative mx-auto mt-4 flex max-w-sm flex-col items-center gap-2 rounded-xl bg-black/30 p-3 ring-1 ring-white/10">
            <p className="text-xs text-zinc-300">{t('games.sillycoin.signInPrompt', { defaultValue: 'Sign in to save your SillyCoins, buy upgrades and send coins to friends.' })}</p>
            <button type="button" onClick={onSignIn} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">
              {t('games.signIn', { defaultValue: 'Sign in' })}
            </button>
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Section title={t('games.sillycoin.upgradesTitle', { defaultValue: 'Upgrades' })} icon={<Pickaxe className="h-4 w-4 text-amber-300" />}>
          <div className="flex flex-col gap-2">
            {upgrades.map((u) => {
              const Icon = UPGRADE_ICONS[u.kind];
              const affordable = !!me && u.cost !== null && live >= u.cost;
              return (
                <div key={u.kind} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300"><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold text-white">
                      {t(`games.sillycoin.upgrade.${u.kind}`, { defaultValue: UPGRADE_NAMES[u.kind] })}
                      <span className="ml-1.5 text-xs font-normal text-zinc-500">{t('games.sillycoin.level', { defaultValue: 'Lv {{level}}', level: u.level })}</span>
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      {u.perTap
                        ? t('games.sillycoin.effectTap', { defaultValue: '+{{n}} per tap', n: short(u.perTap) })
                        : t('games.sillycoin.effectSecond', { defaultValue: '+{{n}} a second', n: short(u.perSecond) })}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={u.maxed || busy === u.kind || (signedIn && !affordable)}
                    onClick={() => void buy(u.kind)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-black transition-opacity disabled:opacity-40"
                  >
                    {busy === u.kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {u.maxed ? t('games.sillycoin.maxed', { defaultValue: 'Max' }) : short(u.cost ?? 0)}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-zinc-500">{t('games.sillycoin.idleNote', { defaultValue: 'Auto-miners keep digging while you are away, for up to 8 hours.' })}</p>
        </Section>

        <Section title={t('games.sillycoin.sendTitle', { defaultValue: 'Send SillyCoins' })} icon={<Send className="h-4 w-4 text-amber-300" />}>
          <div className="flex flex-col gap-2">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={t('games.sillycoin.toPlaceholder', { defaultValue: '@username' })}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder={t('games.sillycoin.amountPlaceholder', { defaultValue: 'How many' })}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder={t('games.sillycoin.notePlaceholder', { defaultValue: 'Note (optional)' })}
              maxLength={NOTE_MAX}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            <button
              type="button"
              disabled={busy === 'send'}
              onClick={() => void send()}
              className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t('games.sillycoin.sendButton', { defaultValue: 'Send' })}
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">{t('games.sillycoin.sendNote', { defaultValue: 'They get the coins straight away. SillyCoins stay in the game: no wallet, no token.' })}</p>
          {transfers.length ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {transfers.slice(0, 6).map((tr) => (
                <li key={tr.id} className="flex items-center gap-2 text-xs">
                  {tr.direction === 'in' ? <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
                  <span className="min-w-0 flex-1 truncate text-zinc-300">
                    {tr.direction === 'in'
                      ? t('games.sillycoin.fromLine', { defaultValue: 'From {{name}}', name: nameOf(tr.other) })
                      : t('games.sillycoin.toLine', { defaultValue: 'To {{name}}', name: nameOf(tr.other) })}
                    {tr.note ? <span className="text-zinc-500"> · {tr.note}</span> : null}
                  </span>
                  <span className={`shrink-0 font-semibold tabular-nums ${tr.direction === 'in' ? 'text-emerald-400' : 'text-zinc-300'}`}>
                    {tr.direction === 'in' ? '+' : '−'}{short(tr.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      </div>

      <Section title={t('games.sillycoin.boardTitle', { defaultValue: 'Top miners' })} icon={<ThemedIcon icon="trophy" alt="" className="h-5 w-5 object-contain" />}>
        {board.length ? (
          <ol className="flex flex-col gap-1.5">
            {board.map((row) => (
              <li key={row.player.address} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${row.player.address === wallet ? 'bg-amber-400/10 ring-1 ring-amber-400/40' : ''}`}>
                <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-zinc-500">{row.rank}</span>
                <PlayerAvatar player={row.player} />
                {row.player.username ? (
                  <Link to={`/${row.player.username}`} className="min-w-0 flex-1 truncate text-sm text-white hover:underline">{nameOf(row.player)}</Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{nameOf(row.player)}</span>
                )}
                <span className="shrink-0 text-xs font-semibold tabular-nums text-amber-300">{short(row.totalMined)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-zinc-500">{t('games.sillycoin.boardEmpty', { defaultValue: 'Nobody has mined yet. Be the first.' })}</p>
        )}
      </Section>
    </div>
  );
}

export default function ArcadeSillyCoinPage() {
  const { t } = useTranslation();
  const { walletAddress, connect } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const { data, isLoading } = useQuery({
    queryKey: ['sillycoin', wallet],
    queryFn: () => sillyState(!!wallet),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const title = t('games.sillycoin.title', { defaultValue: 'SillyCoin' });

  return (
    <div data-glass-page data-theme-page-surface className="relative z-[1] min-h-screen bg-black">
      <SEOHead
        title={t('games.sillycoin.seoTitle', { defaultValue: 'SillyCoin mining simulator | Riftn Arcade' })}
        description={t('games.sillycoin.seoDescription', { defaultValue: 'Tap to mine SillyCoins, buy a bigger pick and auto-miners, and send coins to friends. Just for fun: SillyCoins have no value. Free on Riftn.' })}
        image={OG_IMAGE}
        url={PAGE_URL}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'VideoGame',
          name: 'SillyCoin',
          url: PAGE_URL,
          image: OG_IMAGE,
          applicationCategory: 'Game',
          gamePlatform: 'Web browser',
          playMode: 'SinglePlayer',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        <div className="mb-4 flex items-center gap-3">
          <Link
            to="/arcade"
            aria-label={t('games.back', { defaultValue: 'Back' })}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <ThemedIcon icon="arcade" alt="" className="h-9 w-9 shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-white">{title}</h1>
            <p className="text-xs text-zinc-500">{t('games.sillycoin.intro', { defaultValue: 'Tap to mine, upgrade, send coins to friends.' })}</p>
          </div>
          <button
            type="button"
            onClick={() => share(title, t('games.linkCopied', { defaultValue: 'Link copied' }))}
            aria-label={t('games.share', { defaultValue: 'Share' })}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 hover:text-white"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>

        {isLoading && wallet ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
        ) : (
          <SillyGame key={wallet ?? 'guest'} wallet={wallet} data={data} onSignIn={() => void connect()} />
        )}

        <p className="mt-4 rounded-xl bg-amber-400/10 px-4 py-3 text-center text-xs leading-relaxed text-amber-200/90 ring-1 ring-amber-400/20">
          {t('games.sillycoin.disclaimer', { defaultValue: 'SillyCoins are just for fun and have no value. They are not a cryptocurrency, never touch your wallet, and cannot be bought, sold or cashed out.' })}
        </p>
      </div>
    </div>
  );
}
