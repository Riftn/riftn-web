/**
 * Gratitude pen pals
 * ==================
 * `/arcade/gratitude` — two people take turns writing one thing they are
 * grateful for, with 1 to 7 days per turn. No repeats: the server compares a
 * new line with every earlier one and turns away the same blessing said
 * again, without using the turn. Whoever lets their turn run out loses.
 * `?game=<id>` opens one game; only its two players can read the lines.
 * "The computer" starts a game against @assistant at once (Easy, Normal or
 * Hard; 1 min, 5 min or 1 day a turn). It answers in a few seconds and wins
 * if you run out; run it out of new ideas and you win.
 *
 * The rules live in riftn-backend src/games/gratitude.service.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUp, Flag, Heart, Loader2, Mail, RotateCcw, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { formatCount } from '@/lib/format-count';
import {
  gratitudeAction, gratitudeCheck, gratitudeCreate, gratitudeGet, gratitudeList, gratitudeWrite,
  type GamePlayer, type GratitudeCheck, type GratitudeGame, type GratitudeLevel,
} from '@/lib/api/dehub/games';

const PAGE_URL = 'https://riftn.com/arcade/gratitude';
const OG_IMAGE = 'https://riftn.com/og/arcade-gratitude.jpg';
const DAY_CHOICES = [1, 2, 3, 5, 7];
const LEVELS: GratitudeLevel[] = ['easy', 'normal', 'hard'];
const TURN_CHOICES = [60, 300, 86_400];
const ACCENT = 'var(--tint-accent, rgb(161 161 170))';

const nameOf = (p: GamePlayer | null | undefined) => (p ? p.displayName || (p.username ? `@${p.username}` : `${p.address.slice(0, 6)}…`) : '');
const initial = (p: GamePlayer | null | undefined) => nameOf(p).replace('@', '').charAt(0).toUpperCase() || '?';
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** "2d 4h", "5h 20m", "12m" until the deadline; "0:42" on quick games. */
function timeLeft(deadline: string | null, now: number, seconds = false): string {
  if (!deadline) return '';
  const ms = Math.max(0, new Date(deadline).getTime() - now);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (seconds) return `${m}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;
  return `${m}m`;
}

/** Quick computer games (a minute or five a turn) tick by the second. */
const isQuick = (game: Pick<GratitudeGame, 'turnSeconds'>) => !!game.turnSeconds && game.turnSeconds < 86_400;

function useComputerLabels() {
  const { t } = useTranslation();
  const level = (l: GratitudeLevel | null | undefined) => ({
    easy: t('games.gratitude.levelEasy', { defaultValue: 'Easy' }),
    normal: t('games.gratitude.levelNormal', { defaultValue: 'Normal' }),
    hard: t('games.gratitude.levelHard', { defaultValue: 'Hard' }),
  })[l || 'normal'];
  const turn = (s: number | null | undefined) => (s === 60
    ? t('games.gratitude.turn1m', { defaultValue: '1 min' })
    : s === 300
      ? t('games.gratitude.turn5m', { defaultValue: '5 min' })
      : t('games.gratitude.turn1d', { defaultValue: '1 day' }));
  const computer = t('games.gratitude.computer', { defaultValue: 'The computer' });
  /** A player's name, "The computer" for the computer's side. */
  const who = (game: Pick<GratitudeGame, 'vsComputer'>, p: GamePlayer | null | undefined, wallet: string | null) => (game.vsComputer && p && p.address !== wallet ? computer : nameOf(p));
  const subtitle = (game: GratitudeGame) => (game.vsComputer
    ? t('games.gratitude.computerEach', { defaultValue: '{{level}} · {{time}} per turn', level: level(game.level), time: turn(game.turnSeconds) })
    : t('games.gratitude.daysEach', { defaultValue: '{{days}} days per turn', days: game.daysPerTurn }));
  return { level, turn, computer, who, subtitle };
}

/** Three dots while the computer writes its line. */
function Writing({ player }: { player: GamePlayer | null | undefined }) {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-[88%] items-end gap-2 self-start" role="status" aria-label={t('games.gratitude.writing', { defaultValue: 'Writing…' })}>
      <Face player={player} size="h-7 w-7" />
      <div className="flex h-[38px] items-center gap-1 rounded-2xl px-3.5 ring-1 ring-white/[0.08]" style={{ background: 'rgba(255,255,255,0.06)' }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-300" style={{ animationDelay: `${i * 140}ms`, animationDuration: '900ms' }} />
        ))}
      </div>
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

function Face({ player, size = 'h-8 w-8' }: { player: GamePlayer | null | undefined; size?: string }) {
  return (
    <Avatar className={`${size} shrink-0`}>
      {player?.avatarImageUrl ? <AvatarImage src={player.avatarImageUrl} alt="" /> : null}
      <AvatarFallback className="bg-zinc-800 text-xs text-white">{initial(player)}</AvatarFallback>
    </Avatar>
  );
}

function Rules() {
  const { t } = useTranslation();
  const rules = [
    t('games.gratitude.rule1', { defaultValue: 'Write one thing you are grateful for and send it.' }),
    t('games.gratitude.rule2', { defaultValue: 'They answer with theirs. Back and forth.' }),
    t('games.gratitude.rule3', { defaultValue: 'No repeats. Each new one is checked against every earlier line in the game.' }),
    t('games.gratitude.rule4', { defaultValue: 'Run out of ideas before your turn time is up and they win.' }),
  ];
  return (
    <div className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/[0.06]">
      <p className="text-sm font-semibold text-white">{t('games.gratitude.howItWorks', { defaultValue: 'How it works' })}</p>
      <ol className="mt-2 flex flex-col gap-2">
        {rules.map((rule, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-zinc-300">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">{i + 1}</span>
            {rule}
          </li>
        ))}
      </ol>
    </div>
  );
}

// --------------------------------------------------------------- one game

function GameView({ id, wallet }: { id: string; wallet: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [text, setText] = useState('');
  const [hint, setHint] = useState<GratitudeCheck | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [, setSearchParams] = useSearchParams();
  const labels = useComputerLabels();
  const listRef = useRef<HTMLDivElement>(null);
  const { data, error, refetch } = useQuery({
    queryKey: ['gratitude', id, wallet],
    queryFn: () => gratitudeGet(id, !!wallet),
    // Days per turn: a quiet poll is plenty while waiting on them. The computer answers in seconds.
    refetchInterval: (q) => {
      const g = q.state.data?.game;
      if (g?.status !== 'active' || g.yourTurn) return false;
      return g.vsComputer ? 1500 : 20_000;
    },
    refetchOnWindowFocus: true,
  });
  const game = data?.game;
  const lineCount = game?.lines?.length ?? 0;
  const quick = !!game && isQuick(game) && game.status === 'active';
  const computerWriting = !!game?.vsComputer && game.status === 'active' && !game.yourTurn;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), quick ? 1000 : 30_000);
    return () => window.clearInterval(timer);
  }, [quick]);

  // Out of time on a quick game: ask the server, which ends it.
  const expired = quick && !!game?.turnDeadline && new Date(game.turnDeadline).getTime() < now;
  useEffect(() => {
    if (expired) void refetch();
  }, [expired, refetch]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lineCount, computerWriting]);

  // Live "already said" check while typing, so the warning shows before Send.
  useEffect(() => {
    setHint(null);
    const value = text.trim();
    if (!game?.yourTurn || value.length < 8) return;
    const timer = window.setTimeout(() => {
      gratitudeCheck(id, value).then((r) => setHint(r.ok || r.reason !== 'repeat' ? null : r)).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [game?.yourTurn, id, text]);

  const run = useCallback(async (work: () => Promise<{ game: GratitudeGame }>) => {
    setBusy(true);
    try {
      const next = await work();
      queryClient.setQueryData(['gratitude', id, wallet], next);
      void queryClient.invalidateQueries({ queryKey: ['gratitude-list'] });
      return true;
    } catch (e) {
      const message = errorText(e);
      if (/already said/i.test(message)) setHint({ ok: false, reason: 'repeat', message });
      else toast.error(message);
      void refetch();
      return false;
    } finally {
      setBusy(false);
    }
  }, [id, queryClient, refetch, wallet]);

  if (error) {
    return <p className="py-16 text-center text-sm text-zinc-400">{t('games.gratitude.notFound', { defaultValue: 'This game could not be found. Only its two players can open it.' })}</p>;
  }
  if (!game) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>;

  const opponent = game.players.find((p) => p.address !== wallet) ?? (game.createdBy?.address === wallet ? game.invitee : game.createdBy);
  const opponentName = labels.who(game, opponent, wallet);
  const clock = game.status === 'active' ? timeLeft(game.turnDeadline, now, isQuick(game)) : '';
  const playAgain = async () => {
    setReplaying(true);
    try {
      const next = await gratitudeCreate({ computer: true, level: game.level ?? 'normal', turnSeconds: game.turnSeconds ?? 300 });
      void queryClient.invalidateQueries({ queryKey: ['gratitude-list'] });
      setSearchParams({ game: next.game.id });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setReplaying(false);
    }
  };
  const send = async () => {
    const value = text.trim();
    if (!value || busy) return;
    if (await run(() => gratitudeWrite(id, value))) {
      setText('');
      setHint(null);
    }
  };

  let status = '';
  if (game.status === 'pending') {
    status = game.invitee && wallet === game.invitee.address
      ? t('games.gratitude.statusInvited', { defaultValue: '{{name}} wants to swap what you are grateful for, {{days}} days a turn.', name: nameOf(game.createdBy), days: game.daysPerTurn })
      : t('games.gratitude.statusWaiting', { defaultValue: 'Waiting for your invite to be accepted.' });
  } else if (game.status === 'active') {
    status = game.yourTurn
      ? t('games.gratitude.statusYourTurn', { defaultValue: 'Your turn. {{time}} left.', time: clock })
      : game.vsComputer
        ? t('games.gratitude.statusComputerTurn', { defaultValue: 'The computer is writing…' })
        : t('games.gratitude.statusTheirTurn', { defaultValue: '{{name}} is writing. {{time}} left.', name: nameOf(game.turn), time: clock });
  } else if (game.status === 'finished') {
    const youWon = game.winner?.address === wallet;
    const reason = game.endReason === 'gave_up'
      ? t('games.gratitude.endGaveUp', { defaultValue: 'out of ideas' })
      : t('games.gratitude.endTimeout', { defaultValue: 'time ran out' });
    status = youWon
      ? t('games.gratitude.statusYouWon', { defaultValue: 'You won ({{reason}}). {{n}} things to be grateful for.', reason, n: formatCount(game.lineCount) })
      : t('games.gratitude.statusTheyWon', { defaultValue: '{{name}} won ({{reason}}). {{n}} things to be grateful for.', name: labels.who(game, game.winner, wallet), reason, n: formatCount(game.lineCount) });
  } else {
    status = t('games.gratitude.statusClosed', { defaultValue: 'This invite was not taken up.' });
  }

  const canAccept = game.status === 'pending' && !!wallet && wallet !== game.createdBy?.address && (!game.invitee || game.invitee.address === wallet);
  const canCancel = game.status === 'pending' && wallet === game.createdBy?.address;
  const playing = game.status === 'active' && !!game.you;
  const button = 'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold disabled:opacity-50';

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div className="flex min-w-0 flex-1 flex-col rounded-2xl bg-zinc-900 ring-1 ring-white/[0.06] md:min-h-[560px]">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <Face player={opponent} size="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{opponent ? opponentName : t('games.gratitude.anyone', { defaultValue: 'Open to anyone' })}</p>
            <p className="text-xs text-zinc-500">{labels.subtitle(game)}</p>
          </div>
          {game.status === 'active' ? (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${game.yourTurn ? 'text-white' : ''}`}
              style={game.yourTurn ? { background: 'color-mix(in srgb, var(--tint-accent, rgb(161 161 170)) 34%, transparent)', boxShadow: `inset 0 0 0 1px ${ACCENT}` } : { background: 'rgba(255,255,255,0.08)', color: 'rgb(212 212 216)' }}
            >
              {game.yourTurn
                ? t('games.gratitude.chipYourTurn', { defaultValue: 'Your turn · {{time}}', time: clock })
                : game.vsComputer
                  ? t('games.gratitude.chipComputerTurn', { defaultValue: 'Its turn' })
                  : t('games.gratitude.chipTheirTurn', { defaultValue: 'Their turn · {{time}}', time: clock })}
            </span>
          ) : null}
        </div>

        <div ref={listRef} className="flex max-h-[55vh] flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4 md:max-h-[520px]">
          {(game.lines ?? []).length === 0 && !computerWriting ? (
            <p className="m-auto max-w-xs py-10 text-center text-sm text-zinc-500">
              {game.status === 'active'
                ? (game.yourTurn
                  ? t('games.gratitude.emptyYou', { defaultValue: 'You go first. What are you grateful for today?' })
                  : t('games.gratitude.emptyThem', { defaultValue: '{{name}} writes first.', name: nameOf(game.turn) }))
                : status}
            </p>
          ) : null}
          {(game.lines ?? []).map((line) => {
            const mine = line.by === wallet;
            const author = game.players.find((p) => p.address === line.by);
            return (
              <div key={line.n} className={`flex max-w-[88%] items-end gap-2 ${mine ? 'flex-row-reverse self-end' : 'self-start'}`}>
                <Face player={author} size="h-7 w-7" />
                <div
                  className="rounded-2xl px-3.5 py-2.5 ring-1 ring-white/[0.08]"
                  style={{ background: mine ? 'color-mix(in srgb, var(--tint-accent, rgb(161 161 170)) 22%, transparent)' : 'rgba(255,255,255,0.06)' }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">#{line.n} · {mine ? t('games.gratitude.you', { defaultValue: 'You' }) : labels.who(game, author, wallet)}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-snug text-white">{line.text}</p>
                </div>
              </div>
            );
          })}
          {computerWriting ? <Writing player={opponent} /> : null}
        </div>

        {playing && game.yourTurn ? (
          <div className="flex flex-col gap-2 border-t border-white/[0.06] p-3">
            {hint?.message ? (
              <div className="rounded-xl px-3 py-2 text-[13px] leading-snug text-zinc-200 ring-1" style={{ background: 'rgba(255,255,255,0.05)', ['--tw-ring-color' as string]: ACCENT }}>
                {hint.message}
              </div>
            ) : null}
            <form
              className="flex items-end gap-2 rounded-3xl bg-white/[0.06] p-1.5 pl-4 ring-1 ring-white/10"
              onSubmit={(e) => { e.preventDefault(); void send(); }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, game.maxChars))}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                rows={1}
                placeholder={t('games.gratitude.placeholder', { defaultValue: 'I am grateful for…' })}
                aria-label={t('games.gratitude.placeholder', { defaultValue: 'I am grateful for…' })}
                className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] text-white placeholder:text-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !text.trim()}
                aria-label={t('games.gratitude.send', { defaultValue: 'Send' })}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </form>
          </div>
        ) : (
          <p className="border-t border-white/[0.06] px-4 py-3 text-center text-xs text-zinc-500">{status}</p>
        )}
      </div>

      <div className="flex w-full flex-col gap-3 md:w-72">
        <div className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/[0.06]">
          <p className="text-sm font-medium text-white">{status}</p>
          <p className="mt-1 text-xs text-zinc-500">{t('games.gratitude.lineCount', { defaultValue: '{{n}} so far', n: formatCount(game.lineCount) })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canAccept ? (
              <>
                <button type="button" disabled={busy} onClick={() => void run(() => gratitudeAction(id, 'accept'))} className={`${button} bg-white text-black`}>
                  {t('games.gratitude.accept', { defaultValue: 'Accept' })}
                </button>
                {game.invitee?.address === wallet ? (
                  <button type="button" disabled={busy} onClick={() => void run(() => gratitudeAction(id, 'decline'))} className={`${button} bg-zinc-800 text-zinc-200`}>
                    {t('games.gratitude.decline', { defaultValue: 'Decline' })}
                  </button>
                ) : null}
              </>
            ) : null}
            {canCancel ? (
              <button type="button" disabled={busy} onClick={() => void run(() => gratitudeAction(id, 'decline'))} className={`${button} bg-zinc-800 text-zinc-200`}>
                {t('games.gratitude.cancel', { defaultValue: 'Cancel invite' })}
              </button>
            ) : null}
            {canCancel && !game.invitee ? (
              <button
                type="button"
                onClick={() => share(`${PAGE_URL}?game=${id}`, t('games.gratitude.title', { defaultValue: 'Gratitude pen pals' }), t('games.linkCopied', { defaultValue: 'Link copied' }))}
                className={`${button} bg-zinc-800 text-zinc-200`}
              >
                <Share2 className="h-3.5 w-3.5" />{t('games.gratitude.shareInvite', { defaultValue: 'Share invite' })}
              </button>
            ) : null}
            {playing ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t('games.gratitude.giveUpConfirm', { defaultValue: 'Out of ideas? {{name}} wins this game.', name: opponentName }))) void run(() => gratitudeAction(id, 'give-up'));
                }}
                className={`${button} bg-zinc-800 text-red-300`}
              >
                <Flag className="h-3.5 w-3.5" />{t('games.gratitude.giveUp', { defaultValue: "I'm out of ideas" })}
              </button>
            ) : null}
            {game.vsComputer && game.status === 'finished' && game.you ? (
              <button type="button" disabled={replaying} onClick={() => void playAgain()} className={`${button} bg-white text-black`}>
                {replaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {t('games.gratitude.playAgain', { defaultValue: 'Play again' })}
              </button>
            ) : null}
          </div>
          {game.status === 'active' && !isQuick(game) ? (
            <p className="mt-3 text-xs text-zinc-500">{t('games.gratitude.pushNote', { defaultValue: 'You get a notification when it is your turn, and a reminder 6 hours before time runs out.' })}</p>
          ) : null}
        </div>
        <Rules />
      </div>
    </div>
  );
}

// --------------------------------------------------------------- the lobby

function GameRow({ game, wallet }: { game: GratitudeGame; wallet: string }) {
  const { t } = useTranslation();
  const labels = useComputerLabels();
  const opponent = game.players.find((p) => p.address !== wallet) ?? (game.createdBy?.address === wallet ? game.invitee : game.createdBy);
  let note = '';
  let hot = false;
  if (game.status === 'active') {
    hot = game.yourTurn;
    note = game.yourTurn ? t('games.gratitude.rowYourTurn', { defaultValue: 'Your turn' }) : t('games.gratitude.rowTheirTurn', { defaultValue: 'Their turn' });
  } else if (game.status === 'pending') {
    hot = game.createdBy?.address !== wallet;
    note = hot ? t('games.gratitude.rowInvite', { defaultValue: 'Wants to play' }) : t('games.gratitude.rowSent', { defaultValue: 'Invite sent' });
  } else if (game.status === 'finished') {
    note = game.winner?.address === wallet ? t('games.gratitude.rowWon', { defaultValue: 'You won' }) : t('games.gratitude.rowLost', { defaultValue: 'You lost' });
  } else {
    note = t('games.gratitude.rowClosed', { defaultValue: 'Not played' });
  }
  return (
    <Link to={`/arcade/gratitude?game=${game.id}`} className="flex items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3 ring-1 ring-white/[0.06] transition-colors hover:ring-white/20">
      <Face player={opponent} size="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{opponent ? labels.who(game, opponent, wallet) : t('games.gratitude.anyone', { defaultValue: 'Open to anyone' })}</p>
        <p className="truncate text-xs text-zinc-500">
          {game.lastLine ? `#${formatCount(game.lineCount)} ${game.lastLine.text}` : labels.subtitle(game)}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${hot ? 'text-white' : ''}`}
        style={hot ? { background: 'color-mix(in srgb, var(--tint-accent, rgb(161 161 170)) 34%, transparent)', boxShadow: `inset 0 0 0 1px ${ACCENT}` } : { background: 'rgba(255,255,255,0.08)', color: 'rgb(212 212 216)' }}
      >
        {note}
      </span>
    </Link>
  );
}

function Lobby({ wallet }: { wallet: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  const labels = useComputerLabels();
  const [mode, setMode] = useState<'friend' | 'computer'>('friend');
  const [opponent, setOpponent] = useState('');
  const [days, setDays] = useState(2);
  const [level, setLevel] = useState<GratitudeLevel>('normal');
  const [turnSeconds, setTurnSeconds] = useState(300);
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['gratitude-list', wallet], queryFn: gratitudeList, refetchInterval: 30_000 });

  const create = async () => {
    setBusy(true);
    try {
      if (mode === 'computer') {
        const { game } = await gratitudeCreate({ computer: true, level, turnSeconds });
        void queryClient.invalidateQueries({ queryKey: ['gratitude-list'] });
        setSearchParams({ game: game.id });
        return;
      }
      const { game } = await gratitudeCreate({ opponent: opponent.trim() || undefined, days });
      toast.success(opponent.trim()
        ? t('games.gratitude.sent', { defaultValue: 'Invite sent' })
        : t('games.gratitude.openPosted', { defaultValue: 'Open invite posted. Share the link with a friend.' }));
      setOpponent('');
      void queryClient.invalidateQueries({ queryKey: ['gratitude-list'] });
      setSearchParams({ game: game.id });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const games = data?.games ?? [];
  const sections: Array<[string, GratitudeGame[]]> = [
    [t('games.gratitude.yourTurn', { defaultValue: 'Your turn' }), games.filter((g) => g.status === 'active' && g.yourTurn)],
    [t('games.gratitude.invites', { defaultValue: 'Invites' }), games.filter((g) => g.status === 'pending')],
    [t('games.gratitude.waitingOnThem', { defaultValue: 'Waiting on them' }), games.filter((g) => g.status === 'active' && !g.yourTurn)],
    [t('games.gratitude.openInvites', { defaultValue: 'Open invites' }), data?.open ?? []],
    [t('games.gratitude.finished', { defaultValue: 'Finished' }), games.filter((g) => !['active', 'pending'].includes(g.status)).slice(0, 15)],
  ];
  const chip = (active: boolean) => (active
    ? 'rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black'
    : 'rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700');

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <section className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/[0.06]">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Mail className="h-4 w-4" />{t('games.gratitude.newGame', { defaultValue: 'New game' })}</h2>
          <div role="tablist" className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-zinc-800 p-1" data-gratitude-mode>
            {(['friend', 'computer'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${mode === m ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'}`}
              >
                {m === 'friend' ? t('games.gratitude.withFriend', { defaultValue: 'A friend' }) : t('games.gratitude.withComputer', { defaultValue: 'The computer' })}
              </button>
            ))}
          </div>
          {mode === 'friend' ? (
            <>
              <input
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder={t('games.gratitude.opponentPlaceholder', { defaultValue: '@username of a friend (empty = open to anyone)' })}
                className="w-full rounded-xl bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30"
                autoCapitalize="none"
                autoCorrect="off"
              />
              <p className="mb-1.5 mt-3 text-xs text-zinc-500">{t('games.gratitude.daysLabel', { defaultValue: 'Days per turn' })}</p>
              <div className="flex flex-wrap gap-2">
                {DAY_CHOICES.map((d) => (
                  <button key={d} type="button" className={chip(days === d)} onClick={() => setDays(d)}>
                    {t('games.gratitude.dayChip', { defaultValue: '{{days}}d', days: d })}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px] leading-snug text-zinc-400">{t('games.gratitude.computerNote', { defaultValue: 'It answers in a few seconds. Make it run out of new ideas to win.' })}</p>
              <p className="mb-1.5 mt-3 text-xs text-zinc-500">{t('games.gratitude.levelLabel', { defaultValue: 'Level' })}</p>
              <div className="flex flex-wrap gap-2">
                {LEVELS.map((l) => (
                  <button key={l} type="button" className={chip(level === l)} onClick={() => setLevel(l)}>{labels.level(l)}</button>
                ))}
              </div>
              <p className="mb-1.5 mt-3 text-xs text-zinc-500">{t('games.gratitude.turnLabel', { defaultValue: 'Time per turn' })}</p>
              <div className="flex flex-wrap gap-2">
                {TURN_CHOICES.map((sec) => (
                  <button key={sec} type="button" className={chip(turnSeconds === sec)} onClick={() => setTurnSeconds(sec)}>{labels.turn(sec)}</button>
                ))}
              </div>
            </>
          )}
          <button type="button" disabled={busy} onClick={() => void create()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
            {mode === 'computer'
              ? t('games.gratitude.playComputer', { defaultValue: 'Play the computer' })
              : opponent.trim() ? t('games.gratitude.sendInvite', { defaultValue: 'Send invite' }) : t('games.gratitude.postOpen', { defaultValue: 'Post open invite' })}
          </button>
        </section>

        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div> : null}
        {sections.map(([title, list]) => (list.length ? (
          <section key={title} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
            {list.map((g) => <GameRow key={g.id} game={g} wallet={wallet} />)}
          </section>
        ) : null))}
        {!isLoading && !games.length && !(data?.open ?? []).length ? (
          <p className="text-center text-sm text-zinc-500">{t('games.gratitude.empty2', { defaultValue: 'No games yet. Invite a friend or play the computer above.' })}</p>
        ) : null}
      </div>
      <div className="w-full md:w-72"><Rules /></div>
    </div>
  );
}

export default function ArcadeGratitudePage() {
  const { t } = useTranslation();
  const { walletAddress, connect } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const [searchParams] = useSearchParams();
  const gameId = searchParams.get('game');
  const title = t('games.gratitude.title', { defaultValue: 'Gratitude pen pals' });

  return (
    <div data-glass-page data-theme-page-surface className="relative z-[1] min-h-screen bg-black">
      <SEOHead
        title={t('games.gratitude.seoTitle', { defaultValue: 'Gratitude pen pals: a turn-based game for two | Riftn Arcade' })}
        description={t('games.gratitude.seoDescription', { defaultValue: 'Take turns with a friend saying what you are grateful for. No repeats, and whoever runs out of ideas before their turn time is up loses. Free on Riftn.' })}
        image={OG_IMAGE}
        url={PAGE_URL}
        noindex={!!gameId}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'VideoGame',
          name: 'Gratitude pen pals',
          url: PAGE_URL,
          image: OG_IMAGE,
          applicationCategory: 'Game',
          gamePlatform: 'Web browser',
          playMode: ['SinglePlayer', 'MultiPlayer'],
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <div className="mb-5 flex items-center gap-3">
          <Link
            to={gameId ? '/arcade/gratitude' : '/arcade'}
            aria-label={t('games.back', { defaultValue: 'Back' })}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-bold text-white"><Heart className="h-5 w-5" />{title}</h1>
            <p className="text-xs text-zinc-500">{t('games.gratitude.intro', { defaultValue: 'Take turns saying what you are grateful for. No repeats. Miss your turn and they win.' })}</p>
          </div>
        </div>
        {gameId ? (
          <GameView id={gameId} wallet={wallet} />
        ) : wallet ? (
          <Lobby wallet={wallet} />
        ) : (
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <div className="flex flex-1 flex-col items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-14 text-center ring-1 ring-white/[0.06]">
              <p className="text-sm text-zinc-400">{t('games.signInToPlay', { defaultValue: 'Sign in to play with friends.' })}</p>
              <button type="button" onClick={() => void connect()} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
                {t('games.signIn', { defaultValue: 'Sign in' })}
              </button>
            </div>
            <div className="w-full md:w-72"><Rules /></div>
          </div>
        )}
      </div>
    </div>
  );
}
