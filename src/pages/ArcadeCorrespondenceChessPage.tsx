/**
 * Correspondence chess
 * ====================
 * `/arcade/correspondence-chess` — challenge a friend, then take days, not
 * minutes, over each move. A push arrives when it is your turn. `?game=<id>`
 * opens one board; anyone with that link can watch it.
 *
 * The server keeps the rules (riftn-backend src/games/chess.service.ts) and
 * sends the legal moves for whoever is on move, so this page only draws.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Crown, Flag, Handshake, Loader2, Share2, Swords } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { ChessBoard2D, type BoardMove } from '@/components/app/games/ChessBoard2D';
import {
  chessAction, chessCreate, chessDraw, chessGet, chessList, chessMove, fenBoard,
  type ChessGame, type GamePlayer,
} from '@/lib/api/dehub/games';

const PAGE_URL = 'https://riftn.com/arcade/correspondence-chess';
const DAY_CHOICES = [1, 2, 3, 5, 7];

const nameOf = (p: GamePlayer | null | undefined) => (p ? p.displayName || (p.username ? `@${p.username}` : `${p.address.slice(0, 6)}…`) : '');

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** "2d 4h", "5h 20m", "12m" until the deadline. */
function timeLeft(deadline: string | null, now: number): string {
  if (!deadline) return '';
  const ms = Math.max(0, new Date(deadline).getTime() - now);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function PlayerChip({ player, active, clock }: { player: GamePlayer | null; active?: boolean; clock?: string }) {
  const name = nameOf(player);
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${active ? 'bg-white/10 ring-1 ring-white/25' : ''}`}>
      <Avatar className="h-8 w-8 shrink-0">
        {player?.avatarImageUrl ? <AvatarImage src={player.avatarImageUrl} alt="" /> : null}
        <AvatarFallback className="bg-zinc-800 text-xs text-white">{name.replace('@', '').charAt(0).toUpperCase() || '?'}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{name || '…'}</span>
      {clock ? <span className={`shrink-0 font-mono text-xs ${active ? 'text-white' : 'text-zinc-500'}`}>{clock}</span> : null}
    </div>
  );
}

function share(url: string, title: string, copied: string) {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    void nav.share({ url, title }).catch(() => undefined);
    return;
  }
  void navigator.clipboard?.writeText(url).then(() => toast.success(copied));
}

// --------------------------------------------------------------- one game

function GameView({ id, wallet }: { id: string; wallet: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { data, error, refetch } = useQuery({
    queryKey: ['corr-chess', id, wallet],
    queryFn: () => chessGet(id, !!wallet),
    // Correspondence: nobody needs a live socket, a quiet poll is plenty.
    refetchInterval: (q) => (q.state.data?.game.status === 'active' && !q.state.data.game.yourTurn ? 15_000 : false),
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const game = data?.game;

  const run = useCallback(async (work: () => Promise<{ game: ChessGame }>) => {
    setBusy(true);
    try {
      const next = await work();
      queryClient.setQueryData(['corr-chess', id, wallet], next);
      void queryClient.invalidateQueries({ queryKey: ['corr-chess-list'] });
    } catch (e) {
      toast.error(errorText(e));
      void refetch();
    } finally {
      setBusy(false);
    }
  }, [id, queryClient, refetch, wallet]);

  const checkSquare = useMemo(() => {
    if (!game?.inCheck) return null;
    const king = game.turn === 'w' ? 'K' : 'k';
    return fenBoard(game.fen).find((s) => s.piece === king)?.square ?? null;
  }, [game]);

  if (error) {
    return <p className="py-16 text-center text-sm text-zinc-400">{t('games.chess.notFound', { defaultValue: 'This game could not be found.' })}</p>;
  }
  if (!game) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>;

  const flipped = game.you === 'b';
  const top = flipped ? game.white : game.black;
  const bottom = flipped ? game.black : game.white;
  const topSide = flipped ? 'w' : 'b';
  const clock = game.status === 'active' ? timeLeft(game.moveDeadline, now) : '';
  const opponentOffered = game.drawOfferBy && wallet && game.drawOfferBy !== wallet;
  const iOffered = game.drawOfferBy && wallet && game.drawOfferBy === wallet;

  let status = '';
  if (game.status === 'pending') {
    status = game.invitee && wallet === game.invitee.address
      ? t('games.chess.statusInvited', { defaultValue: '{{name}} challenged you, {{days}} days a move.', name: nameOf(game.createdBy), days: game.daysPerMove })
      : t('games.chess.statusWaiting', { defaultValue: 'Waiting for the challenge to be accepted.' });
  } else if (game.status === 'active') {
    status = game.yourTurn
      ? t('games.chess.statusYourMove', { defaultValue: 'Your move. {{time}} left.', time: clock })
      : t('games.chess.statusTheirMove', { defaultValue: '{{name}} to move. {{time}} left.', name: nameOf(game.turn === 'w' ? game.white : game.black), time: clock });
  } else if (game.status === 'finished') {
    const reason = t(`games.chess.end.${game.endReason}`, { defaultValue: game.endReason ?? '' });
    status = game.result === '1/2-1/2'
      ? t('games.chess.statusDraw', { defaultValue: 'Draw ({{reason}}).', reason })
      : t('games.chess.statusWon', { defaultValue: '{{name}} won ({{reason}}).', name: nameOf(game.result === '1-0' ? game.white : game.black), reason });
  } else {
    status = t('games.chess.statusClosed', { defaultValue: 'This challenge was not taken up.' });
  }

  const pairs: Array<[number, string, string | undefined]> = [];
  for (let i = 0; i < game.moves.length; i += 2) pairs.push([i / 2 + 1, game.moves[i], game.moves[i + 1]]);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div className="flex w-full flex-col gap-2 md:max-w-[560px]">
        <PlayerChip player={top} active={game.status === 'active' && game.turn === topSide} clock={game.status === 'active' && game.turn === topSide ? clock : undefined} />
        <ChessBoard2D
          fen={game.fen}
          flipped={flipped}
          legal={game.yourTurn ? game.legal : undefined}
          lastMove={game.lastMove}
          checkSquare={checkSquare}
          disabled={busy || !game.yourTurn}
          onMove={(move: BoardMove) => void run(() => chessMove(id, move))}
        />
        <PlayerChip player={bottom} active={game.status === 'active' && game.turn !== topSide} clock={game.status === 'active' && game.turn !== topSide ? clock : undefined} />
      </div>

      <div className="flex w-full flex-col gap-3 md:w-72">
        <div className="rounded-xl bg-zinc-900 p-4 ring-1 ring-white/[0.06]">
          <p className="text-sm font-medium text-white">{status}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {t('games.chess.daysEach', { defaultValue: '{{days}} days per move', days: game.daysPerMove })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {game.status === 'pending' && wallet && wallet !== game.createdBy?.address && (!game.invitee || game.invitee.address === wallet) ? (
              <>
                <button type="button" disabled={busy} onClick={() => void run(() => chessAction(id, 'accept'))} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">
                  {t('games.chess.accept', { defaultValue: 'Accept' })}
                </button>
                {game.invitee?.address === wallet ? (
                  <button type="button" disabled={busy} onClick={() => void run(() => chessAction(id, 'decline'))} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-50">
                    {t('games.chess.decline', { defaultValue: 'Decline' })}
                  </button>
                ) : null}
              </>
            ) : null}
            {game.status === 'pending' && wallet === game.createdBy?.address ? (
              <button type="button" disabled={busy} onClick={() => void run(() => chessAction(id, 'decline'))} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-50">
                {t('games.chess.cancel', { defaultValue: 'Cancel challenge' })}
              </button>
            ) : null}
            {game.status === 'active' && game.you ? (
              <>
                {opponentOffered ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => void run(() => chessDraw(id, 'accept'))} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">
                      <Handshake className="h-3.5 w-3.5" />{t('games.chess.acceptDraw', { defaultValue: 'Accept draw' })}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void run(() => chessDraw(id, 'decline'))} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-50">
                      {t('games.chess.declineDraw', { defaultValue: 'No draw' })}
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={busy || !!iOffered} onClick={() => void run(() => chessDraw(id, 'offer'))} className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-50">
                    <Handshake className="h-3.5 w-3.5" />{iOffered ? t('games.chess.drawOffered', { defaultValue: 'Draw offered' }) : t('games.chess.offerDraw', { defaultValue: 'Offer draw' })}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t('games.chess.resignConfirm', { defaultValue: 'Resign this game?' }))) void run(() => chessAction(id, 'resign'));
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-red-300 disabled:opacity-50"
                >
                  <Flag className="h-3.5 w-3.5" />{t('games.chess.resign', { defaultValue: 'Resign' })}
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => share(`${PAGE_URL}?game=${id}`, t('games.chess.title', { defaultValue: 'Correspondence chess' }), t('games.linkCopied', { defaultValue: 'Link copied' }))}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200"
            >
              <Share2 className="h-3.5 w-3.5" />{t('games.share', { defaultValue: 'Share' })}
            </button>
          </div>
        </div>
        {pairs.length ? (
          <div className="max-h-64 overflow-y-auto rounded-xl bg-zinc-900 p-3 font-mono text-xs text-zinc-300 ring-1 ring-white/[0.06]">
            {pairs.map(([n, w, b]) => (
              <div key={n} className="grid grid-cols-[2.5rem_1fr_1fr] py-0.5">
                <span className="text-zinc-600">{n}.</span>
                <span>{w}</span>
                <span>{b ?? ''}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- the lobby

function GameRow({ game, wallet }: { game: ChessGame; wallet: string | null }) {
  const { t } = useTranslation();
  const opponent = game.status === 'pending'
    ? (game.createdBy?.address === wallet ? game.invitee : game.createdBy)
    : (game.white?.address === wallet ? game.black : game.white);
  let note = '';
  if (game.status === 'active') note = game.yourTurn ? t('games.chess.rowYourMove', { defaultValue: 'Your move' }) : t('games.chess.rowTheirMove', { defaultValue: 'Their move' });
  else if (game.status === 'pending') note = game.createdBy?.address === wallet ? t('games.chess.rowSent', { defaultValue: 'Challenge sent' }) : t('games.chess.rowChallenge', { defaultValue: 'Wants to play' });
  else if (game.status === 'finished') note = game.result === '1/2-1/2' ? t('games.chess.rowDraw', { defaultValue: 'Draw' }) : (game.result === '1-0') === (game.white?.address === wallet) ? t('games.chess.rowWon', { defaultValue: 'You won' }) : t('games.chess.rowLost', { defaultValue: 'You lost' });
  else note = t('games.chess.rowClosed', { defaultValue: 'Not played' });
  return (
    <Link to={`/arcade/correspondence-chess?game=${game.id}`} className="flex items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3 ring-1 ring-white/[0.06] transition-colors hover:ring-white/20">
      <Avatar className="h-9 w-9 shrink-0">
        {opponent?.avatarImageUrl ? <AvatarImage src={opponent.avatarImageUrl} alt="" /> : null}
        <AvatarFallback className="bg-zinc-800 text-xs text-white">{nameOf(opponent).replace('@', '').charAt(0).toUpperCase() || '?'}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{opponent ? nameOf(opponent) : t('games.chess.anyone', { defaultValue: 'Open to anyone' })}</p>
        <p className="text-xs text-zinc-500">
          {t('games.chess.daysEach', { defaultValue: '{{days}} days per move', days: game.daysPerMove })}
          {game.status === 'active' ? ` · ${t('games.chess.moveNumber', { defaultValue: 'move {{n}}', n: Math.floor(game.moves.length / 2) + 1 })}` : ''}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${game.yourTurn || (game.status === 'pending' && game.createdBy?.address !== wallet) ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}>{note}</span>
    </Link>
  );
}

function Lobby({ wallet }: { wallet: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  const [opponent, setOpponent] = useState('');
  const [days, setDays] = useState(3);
  const [color, setColor] = useState<'white' | 'black' | 'random'>('random');
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['corr-chess-list', wallet], queryFn: chessList, refetchInterval: 30_000 });

  const send = async () => {
    setBusy(true);
    try {
      const { game } = await chessCreate({ opponent: opponent.trim() || undefined, days, color });
      toast.success(opponent.trim()
        ? t('games.chess.sent', { defaultValue: 'Challenge sent' })
        : t('games.chess.openPosted', { defaultValue: 'Open challenge posted' }));
      setOpponent('');
      void queryClient.invalidateQueries({ queryKey: ['corr-chess-list'] });
      setSearchParams({ game: game.id });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const games = data?.games ?? [];
  const yourMove = games.filter((g) => g.status === 'active' && g.yourTurn);
  const invites = games.filter((g) => g.status === 'pending');
  const theirMove = games.filter((g) => g.status === 'active' && !g.yourTurn);
  const done = games.filter((g) => !['active', 'pending'].includes(g.status)).slice(0, 15);

  const section = (title: string, list: ChessGame[]) => list.length ? (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {list.map((g) => <GameRow key={g.id} game={g} wallet={wallet} />)}
    </section>
  ) : null;

  const chip = (active: boolean) => active
    ? 'rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black'
    : 'rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700';

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/[0.06]">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Swords className="h-4 w-4" />{t('games.chess.newGame', { defaultValue: 'New game' })}</h2>
        <input
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder={t('games.chess.opponentPlaceholder', { defaultValue: '@username of a friend (empty = open to anyone)' })}
          className="w-full rounded-lg bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <p className="mb-1.5 mt-3 text-xs text-zinc-500">{t('games.chess.daysLabel', { defaultValue: 'Days per move' })}</p>
        <div className="flex flex-wrap gap-1.5">
          {DAY_CHOICES.map((d) => (
            <button key={d} type="button" className={chip(days === d)} onClick={() => setDays(d)}>
              {t('games.chess.dayChip', { defaultValue: '{{days}}d', days: d })}
            </button>
          ))}
        </div>
        <p className="mb-1.5 mt-3 text-xs text-zinc-500">{t('games.chess.colorLabel', { defaultValue: 'You play' })}</p>
        <div className="flex flex-wrap gap-1.5">
          {(['random', 'white', 'black'] as const).map((c) => (
            <button key={c} type="button" className={chip(color === c)} onClick={() => setColor(c)}>
              {t(`games.chess.color.${c}`, { defaultValue: c === 'random' ? 'Random' : c === 'white' ? 'White' : 'Black' })}
            </button>
          ))}
        </div>
        <button type="button" disabled={busy} onClick={() => void send()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
          {opponent.trim() ? t('games.chess.sendChallenge', { defaultValue: 'Send challenge' }) : t('games.chess.postOpen', { defaultValue: 'Post open challenge' })}
        </button>
      </section>

      {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div> : null}
      {section(t('games.chess.yourMove', { defaultValue: 'Your move' }), yourMove)}
      {section(t('games.chess.challenges', { defaultValue: 'Challenges' }), invites)}
      {section(t('games.chess.waitingOnThem', { defaultValue: 'Waiting on them' }), theirMove)}
      {section(t('games.chess.openChallenges', { defaultValue: 'Open challenges' }), data?.open ?? [])}
      {section(t('games.chess.finished', { defaultValue: 'Finished' }), done)}
      {!isLoading && !games.length && !(data?.open ?? []).length ? (
        <p className="text-center text-sm text-zinc-500">{t('games.chess.empty', { defaultValue: 'No games yet. Challenge a friend above.' })}</p>
      ) : null}
    </div>
  );
}

export default function ArcadeCorrespondenceChessPage() {
  const { t } = useTranslation();
  const { walletAddress, connect } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const [searchParams] = useSearchParams();
  const gameId = searchParams.get('game');
  const title = t('games.chess.title', { defaultValue: 'Correspondence chess' });

  return (
    <div data-glass-page data-theme-page-surface className="relative z-[1] min-h-screen bg-black">
      <SEOHead
        title={t('games.chess.seoTitle', { defaultValue: 'Correspondence chess with friends | Riftn Arcade' })}
        description={t('games.chess.seoDescription', { defaultValue: 'Challenge a friend to chess and take up to a week per move. You get a notification when it is your turn. Free on Riftn.' })}
        image="https://riftn.com/og/arcade-correspondence-chess.jpg"
        url={PAGE_URL}
        noindex={!!gameId}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'VideoGame',
          name: 'Correspondence chess',
          url: PAGE_URL,
          image: 'https://riftn.com/og/arcade-correspondence-chess.jpg',
          applicationCategory: 'Game',
          gamePlatform: 'Web browser',
          playMode: 'MultiPlayer',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <div className="mb-5 flex items-center gap-3">
          <Link
            to={gameId ? '/arcade/correspondence-chess' : '/arcade'}
            aria-label={t('games.back', { defaultValue: 'Back' })}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-bold text-white"><Crown className="h-5 w-5" />{title}</h1>
            <p className="text-xs text-zinc-500">{t('games.chess.intro', { defaultValue: 'Play a friend at your own pace. Days per move, and a notification when it is your turn.' })}</p>
          </div>
        </div>
        {gameId ? (
          <GameView id={gameId} wallet={wallet} />
        ) : wallet ? (
          <Lobby wallet={wallet} />
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-zinc-400">{t('games.signInToPlay', { defaultValue: 'Sign in to play with friends.' })}</p>
            <button type="button" onClick={() => void connect()} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">
              {t('games.signIn', { defaultValue: 'Sign in' })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
