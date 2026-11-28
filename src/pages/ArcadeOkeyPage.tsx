/**
 * Okey 101
 * ========
 * `/arcade/okey` — the room list (who sits where, free seats, locked rooms),
 * and `?table=<id>` for the table itself. Four seats; bots fill the empty
 * ones when the host starts, and anyone joining later takes a bot's seat.
 *
 * The rules live on the server (riftn-backend src/games/okey.engine.ts). This
 * page keeps only your own rack order and the groups you are building before
 * you lay them down. Nothing here moves money.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bot, Layers, Loader2, Lock, LogOut, Play, Plus, Share2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { OkeyTile } from '@/components/app/games/OkeyTile';
import { formatCount } from '@/lib/format-count';
import {
  isPairTiles, meldPoints, okeyAct, okeyCreate, okeyGet, okeyJoin, okeyLeave, okeyLobby, okeyNext, okeyOf, okeyStart,
  sortTiles, type OkeyAction, type OkeyLobbyRow, type OkeySeatView, type OkeyTable,
} from '@/lib/api/dehub/games';

const PAGE_URL = 'https://riftn.com/arcade/okey';
const OPEN_POINTS = 101;
const OPEN_PAIRS = 5;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function share(url: string, title: string, copied: string) {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    void nav.share({ url, title }).catch(() => undefined);
    return;
  }
  void navigator.clipboard?.writeText(url).then(() => toast.success(copied));
}

const seatName = (s: OkeySeatView | undefined, empty: string) =>
  !s ? empty : s.bot ? `${s.name ?? 'Bot'}` : s.name || (s.username ? `@${s.username}` : s.address ? `${s.address.slice(0, 6)}…` : empty);

// ------------------------------------------------------------------ seats

function SeatBadge({ seat, active, endsAt, offset, compact }: { seat: OkeySeatView; active: boolean; endsAt: number | null; offset: number; compact?: boolean }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active || !endsAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active, endsAt]);
  const left = active && endsAt ? Math.max(0, Math.ceil((endsAt - (now + offset)) / 1000)) : null;
  const name = seatName(seat, t('games.okey.emptySeat', { defaultValue: 'Empty seat' }));
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 ${active ? 'bg-amber-400/15 ring-1 ring-amber-400/60' : 'bg-black/25'}`}>
      <Avatar className="h-7 w-7 shrink-0">
        {seat.avatarImageUrl ? <AvatarImage src={seat.avatarImageUrl} alt="" /> : null}
        <AvatarFallback className="bg-zinc-800 text-[10px] text-white">{seat.bot ? <Bot className="h-3.5 w-3.5" /> : name.replace('@', '').charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-white">
          {name}{seat.bot ? <span className="ml-1 text-[10px] font-normal text-zinc-400">{t('games.okey.bot', { defaultValue: 'bot' })}</span> : null}
        </p>
        {!compact ? (
          <p className="text-[10px] text-zinc-300">
            {t('games.okey.tilesLeft', { defaultValue: '{{n}} tiles', n: seat.tiles })}
            {seat.opened ? ` · ${seat.opened === 'pairs' ? t('games.okey.openedPairs', { defaultValue: 'opened, pairs' }) : t('games.okey.openedPoints', { defaultValue: 'opened {{p}}', p: formatCount(seat.openedPoints) })}` : ''}
            {left !== null ? ` · ${left}s` : ''}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ table

function TableView({ id, wallet }: { id: string; wallet: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { connect } = useAuth();
  const [busy, setBusy] = useState(false);
  const requestInFlight = useRef(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [groups, setGroups] = useState<number[][]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [password, setPassword] = useState('');
  const key = useMemo(() => ['okey-table', id, wallet], [id, wallet]);

  const { data, error } = useQuery({
    queryKey: key,
    queryFn: () => okeyGet(id, !!wallet),
    refetchInterval: (q) => (q.state.data?.table.status === 'playing' ? 1500 : 4000),
  });
  const table = data?.table;
  const offset = table ? table.serverTime - Date.now() : 0;
  const hand = table?.hand ?? null;
  const round = table?.round ?? null;
  const me = table?.mySeat ?? null;
  const roundNumber = round?.number;

  useEffect(() => {
    setOrder([]);
    setSelected([]);
    setGroups([]);
  }, [me, roundNumber]);

  // Keep your own rack order: tiles that stay keep their place, new ones go on the end.
  useEffect(() => {
    if (!hand) { setOrder([]); return; }
    setOrder((prev) => {
      const kept = prev.filter((tile) => hand.includes(tile));
      const added = hand.filter((tile) => !kept.includes(tile));
      return [...kept, ...added];
    });
    setSelected((prev) => prev.filter((tile) => hand.includes(tile)));
    setGroups((prev) => prev.map((g) => g.filter((tile) => hand.includes(tile))).filter((g) => g.length));
  }, [hand, me, roundNumber]);

  const run = useCallback(async (work: () => Promise<{ table: OkeyTable }>, after?: () => void) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    try {
      const next = await work();
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      queryClient.setQueryData(key, next);
      after?.();
    } catch (e) {
      toast.error(errorText(e));
      void queryClient.invalidateQueries({ queryKey: key });
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }, [key, queryClient]);

  const act = (action: OkeyAction, after?: () => void) => run(() => okeyAct(id, action), after);

  if (error && !table) return <p className="py-16 text-center text-sm text-zinc-400">{t('games.okey.notFound', { defaultValue: 'This table could not be found.' })}</p>;
  if (!table) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>;

  const base = me ?? 0;
  const seatAt = (shift: number) => table.seats[(base + shift) % 4];
  const myTurn = !!round && !round.over && me !== null && round.turn === me;
  const mySeat = me !== null ? table.seats[me] : null;
  const leftSeat = seatAt(3);
  const offered = leftSeat?.discards.at(-1) ?? null;
  const staged = new Set(groups.flat());
  const rack = order.filter((tile) => !staged.has(tile));
  const indicator = round?.indicator;
  const okey = indicator !== undefined ? okeyOf(indicator) : null;
  const allPairs = groups.length > 0 && groups.every((g) => g.length === 2);
  const stagedPoints = groups.reduce((sum, g) => sum + (meldPoints(g, indicator ?? 0) ?? 0), 0);
  const stagedValid = groups.length > 0 && groups.every((g) => (allPairs ? isPairTiles(g, indicator ?? 0) : meldPoints(g, indicator ?? 0) !== null));
  const canDiscard = myTurn && round?.phase === 'play' && round.takenDiscard === null && selected.length === 1;
  const canLay = myTurn && round?.phase === 'play' && stagedValid && rack.length > 0
    && (allPairs
      ? mySeat?.opened === 'pairs' || (!mySeat?.opened && groups.length >= OPEN_PAIRS)
      : mySeat?.opened === 'melds' || (!mySeat?.opened && stagedPoints >= OPEN_POINTS));
  const canLayOff = (hand?.length ?? 0) > 1 && myTurn && round?.phase === 'play' && !!mySeat?.opened && selected.length === 1;

  const toggle = (tile: number) => setSelected((prev) => (prev.includes(tile) ? prev.filter((x) => x !== tile) : [...prev, tile]));
  const sortBy = (by: 'runs' | 'sets') => setOrder((prev) => sortTiles(prev, by, indicator));

  const seated = me !== null;
  const turnSeat = round ? table.seats[round.turn] : null;

  return (
    <div className="flex flex-col gap-3">
      {/* top strip */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
        <span className="rounded-full bg-zinc-900 px-3 py-1.5 font-semibold text-white ring-1 ring-white/10">
          {table.locked ? <Lock className="mr-1 inline h-3 w-3" /> : null}{table.name}
        </span>
        {round ? (
          <span className="rounded-full bg-zinc-900 px-3 py-1.5 ring-1 ring-white/10">
            {t('games.okey.roundN', { defaultValue: 'Round {{n}}', n: round.number })} · {t('games.okey.pileN', { defaultValue: '{{n}} in the pile', n: round.deckCount })}
          </span>
        ) : null}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => share(`${PAGE_URL}?table=${id}`, table.name, t('games.linkCopied', { defaultValue: 'Link copied' }))} className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 ring-1 ring-white/10 hover:text-white">
            <Share2 className="h-3.5 w-3.5" />{t('games.okey.invite', { defaultValue: 'Invite' })}
          </button>
          {seated ? (
            <button type="button" disabled={busy} onClick={() => void okeyLeave(id).then(() => { window.location.assign('/arcade/okey'); })} className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 ring-1 ring-white/10 hover:text-white">
              <LogOut className="h-3.5 w-3.5" />{t('games.okey.leave', { defaultValue: 'Leave' })}
            </button>
          ) : null}
        </div>
      </div>

      {/* felt */}
      <div className="relative rounded-3xl p-3 shadow-inner ring-1 ring-black/40 sm:p-5" style={{ background: 'radial-gradient(ellipse at center, #1f6b4a 0%, #134a33 70%, #0d3524 100%)' }}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <div />
          {seatAt(2) ? <SeatBadge seat={seatAt(2)} active={round?.turn === seatAt(2).seat && !round.over} endsAt={round?.turnEndsAt ?? null} offset={offset} /> : <div />}
          <div className="flex justify-end">
            {round && indicator !== undefined && okey ? (
              <div className="flex items-end gap-1.5 rounded-xl bg-black/25 px-2 py-1.5">
                <div className="flex flex-col items-center gap-0.5">
                  <OkeyTile tile={indicator} size="xs" />
                  <span className="text-[9px] text-emerald-100/80">{t('games.okey.indicator', { defaultValue: 'shown' })}</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <OkeyTile tile={okey.c * 26 + okey.n - 1} indicator={indicator} size="xs" />
                  <span className="text-[9px] text-emerald-100/80">{t('games.okey.okeyLabel', { defaultValue: 'okey' })}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          {leftSeat ? <SeatBadge seat={leftSeat} active={round?.turn === leftSeat.seat && !round.over} endsAt={round?.turnEndsAt ?? null} offset={offset} compact /> : <div />}
          <div />
          {seatAt(1) ? <SeatBadge seat={seatAt(1)} active={round?.turn === seatAt(1).seat && !round.over} endsAt={round?.turnEndsAt ?? null} offset={offset} compact /> : <div />}
        </div>

        {/* table melds */}
        {round ? (
          <div className="mt-3 flex max-h-56 flex-wrap content-start gap-2 overflow-y-auto">
            {round.melds.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={!canLayOff || m.kind === 'pair'}
                onClick={() => void act({ type: 'layoff', tile: selected[0], meld: m.id }, () => setSelected([]))}
                className={`flex items-center gap-0.5 rounded-lg p-1 ${canLayOff && m.kind !== 'pair' ? 'bg-amber-300/25 ring-1 ring-amber-300' : 'bg-black/20'}`}
                aria-label={t('games.okey.addHere', { defaultValue: 'Add to this group' })}
              >
                {m.tiles.map((tile) => <OkeyTile key={tile} tile={tile} indicator={indicator} size="xs" />)}
              </button>
            ))}
            {!round.melds.length ? <p className="w-full py-3 text-center text-xs text-emerald-100/70">{t('games.okey.noMelds', { defaultValue: 'Nobody has opened yet. Opening needs 101 points or 5 pairs.' })}</p> : null}
          </div>
        ) : null}

        {/* pile, discards */}
        {round && !round.over ? (
          <div className="mt-3 flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                disabled={!myTurn || round.phase !== 'draw' || offered === null || busy}
                onClick={() => void act({ type: 'draw', from: 'discard' })}
                className="disabled:cursor-default"
                aria-label={t('games.okey.takeDiscard', { defaultValue: 'Take this tile' })}
              >
                <OkeyTile tile={offered} indicator={indicator} size="sm" />
              </button>
              <span className="text-[10px] text-emerald-100/80">{t('games.okey.theirDiscard', { defaultValue: 'take' })}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                disabled={!myTurn || round.phase !== 'draw' || busy}
                onClick={() => void act({ type: 'draw', from: 'deck' })}
                className={`flex h-11 w-8 items-center justify-center rounded-md bg-emerald-950 text-xs font-bold text-emerald-100 ring-1 ring-white/20 ${myTurn && round.phase === 'draw' ? 'ring-2 ring-amber-300' : ''}`}
                aria-label={t('games.okey.drawPile', { defaultValue: 'Draw from the pile' })}
              >
                {formatCount(round.deckCount)}
              </button>
              <span className="text-[10px] text-emerald-100/80">{t('games.okey.pile', { defaultValue: 'pile' })}</span>
            </div>
            {mySeat ? (
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  disabled={!canDiscard || busy}
                  onClick={() => void act({ type: 'discard', tile: selected[0] }, () => setSelected([]))}
                  className={`rounded-md ${canDiscard ? 'ring-2 ring-amber-300' : ''}`}
                  aria-label={t('games.okey.discard', { defaultValue: 'Discard' })}
                >
                  <OkeyTile tile={mySeat.discards.at(-1) ?? null} indicator={indicator} size="sm" />
                </button>
                <span className="text-[10px] text-emerald-100/80">{t('games.okey.yourDiscard', { defaultValue: 'throw' })}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* status line */}
        <p className="mt-3 text-center text-xs font-medium text-white">
          {table.status === 'waiting'
            ? t('games.okey.waitingForPlayers', { defaultValue: 'Waiting for players. Share the invite, or start and bots take the empty seats.' })
            : round?.over
              ? ''
              : myTurn
                ? round?.phase === 'draw'
                  ? t('games.okey.yourTurnDraw', { defaultValue: 'Your turn: draw from the pile or take the tile on the left.' })
                  : t('games.okey.yourTurnPlay', { defaultValue: 'Lay down if you can, then pick one tile and throw it.' })
                : t('games.okey.waitingFor', { defaultValue: '{{name}} is playing…', name: seatName(turnSeat ?? undefined, '') })}
        </p>
      </div>

      {/* waiting room controls */}
      {table.status === 'waiting' ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/[0.06]">
          <p className="text-xs text-zinc-400">{t('games.okey.seatsTaken', { defaultValue: '{{n}} of 4 seats taken', n: table.seats.filter((s) => s.address).length })}</p>
          {table.youHost ? (
            <button type="button" disabled={busy} onClick={() => void run(() => okeyStart(id))} className="flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">
              <Play className="h-4 w-4" />{t('games.okey.start', { defaultValue: 'Start (bots take empty seats)' })}
            </button>
          ) : seated ? (
            <p className="text-xs text-zinc-500">{t('games.okey.hostStarts', { defaultValue: 'The host starts the game.' })}</p>
          ) : null}
        </div>
      ) : null}

      {/* sit down */}
      {!seated && table.status !== 'closed' && table.seats.some((s) => !s.address) ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/[0.06]">
          {table.locked ? (
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('games.okey.password', { defaultValue: 'Table password' })}
              type="password"
              className="rounded-lg bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
            />
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => (wallet ? void run(() => okeyJoin(id, { password })) : void connect())}
            className="flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            <Users className="h-4 w-4" />
            {table.status === 'playing' ? t('games.okey.takeBotSeat', { defaultValue: "Sit down (take a bot's seat)" }) : t('games.okey.sitDown', { defaultValue: 'Sit down' })}
          </button>
        </div>
      ) : null}

      {/* staged groups */}
      {seated && round && !round.over && groups.length ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-3 ring-1 ring-white/[0.06]">
          <div className="flex flex-wrap gap-2">
            {groups.map((g, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setGroups((prev) => prev.filter((_, j) => j !== i))}
                className="flex items-center gap-0.5 rounded-lg bg-black/30 p-1 ring-1 ring-white/10"
                aria-label={t('games.okey.removeGroup', { defaultValue: 'Take this group back' })}
              >
                {g.map((tile) => <OkeyTile key={tile} tile={tile} indicator={indicator} size="xs" />)}
                <span className="px-1 text-[10px] text-zinc-400">
                  {g.length === 2 ? (isPairTiles(g, indicator ?? 0) ? '✓' : '✕') : meldPoints(g, indicator ?? 0) ?? '✕'}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-400">
              {allPairs
                ? t('games.okey.pairsCount', { defaultValue: '{{n}} pairs (5 to open)', n: groups.length })
                : mySeat?.opened
                  ? t('games.okey.stagedPoints', { defaultValue: '{{p}} points', p: formatCount(stagedPoints) })
                  : t('games.okey.stagedToOpen', { defaultValue: '{{p}} of 101 points to open', p: formatCount(stagedPoints) })}
            </p>
            <button
              type="button"
              disabled={!canLay || busy}
              onClick={() => void act({ type: 'lay', groups }, () => setGroups([]))}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
            >
              <Layers className="h-3.5 w-3.5" />{mySeat?.opened ? t('games.okey.lay', { defaultValue: 'Lay down' }) : t('games.okey.open', { defaultValue: 'Open' })}
            </button>
          </div>
        </div>
      ) : null}

      {/* rack */}
      {seated && round && !round.over ? (
        <div className="rounded-2xl p-2 shadow-lg ring-1 ring-black/40 sm:p-3" style={{ background: 'linear-gradient(#8a5a2b, #6b431d)' }}>
          <div className="flex flex-wrap justify-center gap-1 pt-2 sm:gap-1.5">
            {rack.map((tile) => (
              <OkeyTile key={tile} tile={tile} indicator={indicator} selected={selected.includes(tile)} onClick={() => toggle(tile)} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            <button type="button" onClick={() => sortBy('runs')} className="rounded-full bg-black/30 px-3 py-1.5 text-[11px] font-semibold text-amber-50">{t('games.okey.sortRuns', { defaultValue: 'Sort by colour' })}</button>
            <button type="button" onClick={() => sortBy('sets')} className="rounded-full bg-black/30 px-3 py-1.5 text-[11px] font-semibold text-amber-50">{t('games.okey.sortSets', { defaultValue: 'Sort by number' })}</button>
            <button
              type="button"
              disabled={selected.length < 2}
              onClick={() => { setGroups((prev) => [...prev, selected]); setSelected([]); }}
              className="flex items-center gap-1 rounded-full bg-amber-300 px-3 py-1.5 text-[11px] font-semibold text-black disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />{t('games.okey.makeGroup', { defaultValue: 'Make group' })}
            </button>
            {myTurn && round.takenDiscard !== null ? (
              <button type="button" disabled={busy} onClick={() => void act({ type: 'putback' })} className="rounded-full bg-black/30 px-3 py-1.5 text-[11px] font-semibold text-amber-50">
                {t('games.okey.putBack', { defaultValue: 'Put the tile back' })}
              </button>
            ) : null}
          </div>
          {canLayOff ? <p className="mt-2 text-center text-[11px] text-amber-100">{t('games.okey.tapToAdd', { defaultValue: 'Tap a glowing group on the table to add this tile, or throw it.' })}</p> : null}
        </div>
      ) : null}

      {/* round over */}
      {round?.over ? (
        <div className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/[0.06]">
          <p className="mb-3 text-sm font-semibold text-white">
            {round.winner !== null
              ? t('games.okey.roundWon', { defaultValue: '{{name}} finished the round!', name: seatName(table.seats[round.winner], '') })
              : t('games.okey.roundEmpty', { defaultValue: 'The pile ran out. No winner this round.' })}
          </p>
          <div className="flex flex-col gap-1">
            {table.seats.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-zinc-300">
                <span className="truncate">{seatName(s, '')}</span>
                <span className="font-mono">
                  {(round.scores?.[i] ?? 0) > 0 ? '+' : ''}{round.scores?.[i] ?? 0} · {t('games.okey.totalShort', { defaultValue: 'total' })} {s.total + (round.scores?.[i] ?? 0)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">{t('games.okey.scoreHelp', { defaultValue: 'Lowest total wins. Finishing gives -101, not opening costs 202.' })}</p>
          {seated ? (
            <button type="button" disabled={busy} onClick={() => void run(() => okeyNext(id))} className="mt-3 w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">
              {t('games.okey.nextRound', { defaultValue: 'Next round' })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ lobby

function LobbyRow({ row, onOpen }: { row: OkeyLobbyRow; onOpen: (row: OkeyLobbyRow) => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={() => onOpen(row)} className="flex w-full items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-left ring-1 ring-white/[0.06] transition-colors hover:ring-white/20">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
          {row.locked ? <Lock className="h-3.5 w-3.5 shrink-0 text-amber-300" /> : null}{row.name}
        </p>
        <p className="text-xs text-zinc-500">
          {row.status === 'waiting' ? t('games.okey.rowWaiting', { defaultValue: 'Waiting to start' }) : t('games.okey.rowPlaying', { defaultValue: 'Playing, round {{n}}', n: row.round })}
          {' · '}{t('games.okey.rowPeople', { defaultValue: '{{n}}/4 people', n: row.players })}
        </p>
      </div>
      <div className="flex shrink-0 -space-x-1.5">
        {row.seats.map((s) => (
          <span key={s.seat} className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-full ring-2 ring-zinc-900 ${s.empty ? 'border border-dashed border-zinc-600 bg-zinc-900' : 'bg-zinc-700'}`}>
            {s.avatarImageUrl ? <img src={s.avatarImageUrl} alt="" className="h-full w-full object-cover" /> : s.bot ? <Bot className="h-3.5 w-3.5 text-zinc-300" /> : s.empty ? null : <span className="text-[10px] text-white">{(s.name ?? '?').charAt(0).toUpperCase()}</span>}
          </span>
        ))}
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.mine ? 'bg-zinc-700 text-white' : row.openSeats ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
        {row.mine ? t('games.okey.rejoin', { defaultValue: 'Back to table' }) : row.openSeats ? t('games.okey.join', { defaultValue: 'Join' }) : t('games.okey.watch', { defaultValue: 'Watch' })}
      </span>
    </button>
  );
}

function Lobby({ wallet }: { wallet: string | null }) {
  const { t } = useTranslation();
  const { connect } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const requestInFlight = useRef(false);
  const { data, isLoading } = useQuery({ queryKey: ['okey-lobby', wallet], queryFn: () => okeyLobby(!!wallet), refetchInterval: 5000 });

  const create = async (withBots: boolean) => {
    if (!wallet) { void connect(); return; }
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    try {
      const { table } = await okeyCreate(withBots ? { withBots: true } : { name: name.trim() || undefined, password: password.trim() || undefined });
      setSearchParams({ table: table.id });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };

  const tables = data?.tables ?? [];
  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={busy} onClick={() => void create(true)} className="flex flex-col items-start gap-1 rounded-2xl p-4 text-left ring-1 ring-white/10 disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #1f6b4a, #0d3524)' }}>
          <span className="flex items-center gap-2 text-sm font-semibold text-white"><Bot className="h-4 w-4" />{t('games.okey.quickPlay', { defaultValue: 'Play now with bots' })}</span>
          <span className="text-xs text-emerald-100/80">{t('games.okey.quickPlayHint', { defaultValue: 'Starts straight away. Friends can take a bot seat later.' })}</span>
        </button>
        <div className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/[0.06]">
          <span className="flex items-center gap-2 text-sm font-semibold text-white"><Users className="h-4 w-4" />{t('games.okey.newTable', { defaultValue: 'Open a table for friends' })}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={t('games.okey.tableName', { defaultValue: 'Table name (optional)' })} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} maxLength={40} type="password" placeholder={t('games.okey.lockPassword', { defaultValue: 'Password to lock it (optional)' })} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none" />
          <button type="button" disabled={busy} onClick={() => void create(false)} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">
            {password.trim() ? t('games.okey.openLocked', { defaultValue: 'Open locked table' }) : t('games.okey.openTable', { defaultValue: 'Open table' })}
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t('games.okey.rooms', { defaultValue: 'Tables' })}</h2>
        {isLoading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div> : null}
        {tables.map((row) => <LobbyRow key={row.id} row={row} onOpen={(r) => setSearchParams({ table: r.id })} />)}
        {!isLoading && !tables.length ? <p className="py-4 text-center text-sm text-zinc-500">{t('games.okey.noRooms', { defaultValue: 'No tables open right now. Start one!' })}</p> : null}
      </section>

      <details className="rounded-2xl bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-400 ring-1 ring-white/[0.06]">
        <summary className="cursor-pointer text-sm font-semibold text-white">{t('games.okey.rulesTitle', { defaultValue: 'How to play Okey 101' })}</summary>
        <p className="mt-2">{t('games.okey.rules1', { defaultValue: '106 tiles: red, yellow, blue and black 1 to 13 twice, plus two false jokers. The tile shown in the middle picks the okey: the next number in the same colour. The okey is wild; a false joker plays as the okey tile.' })}</p>
        <p className="mt-2">{t('games.okey.rules2', { defaultValue: 'On your turn draw from the pile or take the tile the player on your left just threw, then throw one. A taken tile must go on the table the same turn, or be put back.' })}</p>
        <p className="mt-2">{t('games.okey.rules3', { defaultValue: 'To open, lay runs (same colour in a row, 12-13-1 is fine) and sets (same number, different colours) worth 101 points or more, or 5 pairs. After opening you can add tiles to any group on the table.' })}</p>
        <p className="mt-2">{t('games.okey.rules4', { defaultValue: 'Throw your last tile to win the round. Lowest total wins: finishing gives -101, not opening costs 202, everyone else counts the tiles left in hand.' })}</p>
      </details>
    </div>
  );
}

export default function ArcadeOkeyPage() {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get('table');
  return (
    <div data-glass-page data-theme-page-surface className="relative z-[1] min-h-screen bg-black">
      <SEOHead
        title={t('games.okey.seoTitle', { defaultValue: 'Okey 101 with friends | Riftn Arcade' })}
        description={t('games.okey.seoDescription', { defaultValue: 'Play Okey 101 with friends in your browser. Open a table, lock it with a password, and bots fill any empty seat. Free on Riftn.' })}
        image="https://riftn.com/og/arcade-okey.jpg"
        url={PAGE_URL}
        noindex={!!tableId}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'VideoGame',
          name: 'Okey 101',
          url: PAGE_URL,
          image: 'https://riftn.com/og/arcade-okey.jpg',
          applicationCategory: 'Game',
          gamePlatform: 'Web browser',
          playMode: 'MultiPlayer',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />
      <div className="mx-auto max-w-3xl px-3 pb-24 pt-6 sm:px-4">
        <div className="mb-4 flex items-center gap-3">
          <Link
            to={tableId ? '/arcade/okey' : '/arcade'}
            aria-label={t('games.back', { defaultValue: 'Back' })}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white">{t('games.okey.title', { defaultValue: 'Okey 101' })}</h1>
            <p className="text-xs text-zinc-500">{t('games.okey.intro', { defaultValue: 'Four seats, friends or bots. Just for fun, no money.' })}</p>
          </div>
        </div>
        {tableId ? <TableView key={tableId} id={tableId} wallet={wallet} /> : <Lobby wallet={wallet} />}
      </div>
    </div>
  );
}
