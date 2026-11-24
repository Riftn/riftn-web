/**
 * Chestard
 * ========
 * `/arcade/chestard`: a dice-drop arcade game from the Requests board.
 * Six columns, nine rows. Roll the die and the checker drops into that
 * column. A full bottom row clears like Tetris and pays a bonus; a column
 * that tops out ends the game.
 *
 * Signed in, the server rolls every die (riftn-backend
 * src/games/chestard.service.ts), so the top 10 is games really played.
 * Signed out, the same rules (src/lib/chestard.ts) run on this page and
 * nothing is saved.
 *
 * The look is the retro screen the requester drew: magenta checkers, cyan
 * grid, pixel type. Sounds are short chip-tune clips in
 * public/sounds/chestard (the app ships the same files); the speaker button
 * mutes them.
 */
import { useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { ArcadeShareMenu } from '@/components/app/arcade/ArcadeShareMenu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { AuthContext, useAuth } from '@/contexts/AuthContext';
import { drawChestardSnapshot } from '@/lib/chestard-snapshot';
import { formatCount } from '@/lib/format-count';
import { COLS, ROWS, drop, emptyBoard, perDrop, type ChestardBoard } from '@/lib/chestard';
import { chestardRoll, chestardStart, chestardState, type ChestardState, type GamePlayer } from '@/lib/api/dehub/games';

const PAGE_URL = 'https://riftn.com/arcade/chestard';
const OG_IMAGE = 'https://riftn.com/og/arcade-chestard.jpg';
const CYAN = '#55ffff';
const MAGENTA = '#ff55ff';
const WHITE = '#e8e8e8';
const PIXEL = "'Press Start 2P', ui-monospace, monospace";
const TUMBLE_MS = 420;
const CLEAR_MS = 300;
const SHIFT_MS = 220;
const GUEST_BEST_KEY = 'chestard.best';
const MUTE_KEY = 'chestard.muted';

type SnapshotRef = MutableRefObject<(() => Promise<File | null>) | null>;

type Sound = 'roll' | 'drop' | 'clear' | 'over' | 'best';

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const fallMs = (rowsFallen: number) => Math.round(150 + 24 * rowsFallen);
/** Counters read short (1.2K); under 1,000 the score keeps the arcade zeros. */
const scoreText = (n: number) => (n < 1000 ? String(n).padStart(6, '0') : formatCount(n));
const nameOf = (p: GamePlayer) => (p.username ? `@${p.username}` : p.displayName || `${p.address.slice(0, 6)}…`);

function readLocal(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
}

function useSounds() {
  const [muted, setMuted] = useState(() => readLocal(MUTE_KEY) === '1');
  const clips = useRef<Partial<Record<Sound, HTMLAudioElement>>>({});
  useEffect(() => {
    for (const s of ['roll', 'drop', 'clear', 'over', 'best'] as Sound[]) {
      const a = new Audio(`/sounds/chestard/chestard-${s}.wav`);
      a.preload = 'auto';
      a.volume = 0.5;
      clips.current[s] = a;
    }
  }, []);
  const play = useCallback((s: Sound) => {
    if (muted) return;
    const a = clips.current[s];
    if (!a) return;
    try {
      a.currentTime = 0;
      void a.play().catch(() => undefined);
    } catch { /* a sound is never worth an error */ }
  }, [muted]);
  const toggle = useCallback(() => {
    setMuted((m) => {
      writeLocal(MUTE_KEY, m ? '0' : '1');
      return !m;
    });
  }, []);
  return { muted, play, toggle };
}

interface Checker { id: number; row: number; state: 'enter' | 'idle' | 'clear'; fall: number }

let nextId = 1;
const stacksFrom = (heights: number[]): Checker[][] =>
  heights.map((h) => Array.from({ length: h }, (_, row) => ({ id: nextId++, row, state: 'idle' as const, fall: 0 })));


function Stat({ label, value, accent = WHITE, big = false }: { label: string; value: string; accent?: string; big?: boolean }) {
  return (
    <div className="text-center">
      <div style={{ color: CYAN, fontFamily: PIXEL }} className="text-[10px] md:text-xs">{label}</div>
      <div style={{ color: accent, fontFamily: PIXEL }} className={`mt-1.5 tabular-nums md:mt-2 ${big ? 'text-base md:text-2xl' : 'text-sm md:text-lg'}`}>{value}</div>
    </div>
  );
}

function Die({ face, rolling, size }: { face: number | null; rolling: boolean; size: 'sm' | 'lg' }) {
  return (
    <div
      data-chestard-die
      className={`grid shrink-0 place-items-center ${size === 'lg' ? 'h-32 w-32 border-[7px] text-5xl' : 'h-16 w-16 border-4 text-2xl'} ${rolling ? 'chestard-shake' : ''}`}
      style={{ background: MAGENTA, borderColor: WHITE, color: '#fff', fontFamily: PIXEL }}
      aria-live="polite"
    >
      {face ?? '?'}
    </div>
  );
}

function Stacks({ heights }: { heights: number[] }) {
  return (
    <div className="flex items-end gap-2" aria-hidden>
      {heights.map((h, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          <div className="relative h-24 w-5 overflow-hidden" style={{ backgroundImage: `repeating-conic-gradient(${CYAN}55 0 25%, transparent 0 50%)`, backgroundSize: '4px 4px' }}>
            <div className="absolute inset-x-0 bottom-0 transition-[height] duration-300" style={{ height: `${(Math.min(h, ROWS) / ROWS) * 100}%`, background: h >= ROWS - 2 ? MAGENTA : CYAN }} />
          </div>
          <span style={{ color: CYAN, fontFamily: PIXEL }} className="text-[10px]">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

function Board({ stacks, column }: { stacks: Checker[][]; column: number | null }) {
  return (
    <div>
      <div
        data-chestard-board
        className="relative box-content overflow-hidden"
        style={{
          width: `calc(var(--cell) * ${COLS})`,
          height: `calc(var(--cell) * ${ROWS})`,
          border: `3px solid ${CYAN}`,
          background: `radial-gradient(${CYAN} 0 1.6px, transparent 2.2px) 0 0 / var(--cell) var(--cell), #000`,
        }}
      >
        {column != null ? (
          <div className="pointer-events-none absolute inset-y-0 transition-[left] duration-150" style={{ left: `calc(var(--cell) * ${column})`, width: 'var(--cell)', background: `${CYAN}14` }} />
        ) : null}
        {stacks.map((stack, col) =>
          stack.map((c) => (
            <div
              key={c.id}
              className={`absolute p-[3px] ${c.state === 'enter' ? 'chestard-fall' : ''} ${c.state === 'clear' ? 'chestard-clear' : ''}`}
              style={{
                left: `calc(var(--cell) * ${col})`,
                top: `calc(var(--cell) * ${ROWS - 1 - c.row})`,
                width: 'var(--cell)',
                height: 'var(--cell)',
                transition: `top ${SHIFT_MS}ms cubic-bezier(.55,0,1,.45)`,
                ['--fall' as string]: `calc(var(--cell) * -${ROWS - c.row})`,
                animationDuration: c.state === 'enter' ? `${c.fall}ms` : undefined,
              } as CSSProperties}
            >
              <div className="h-full w-full rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, #fff 0 12%, ${MAGENTA} 13% 70%, #aa00aa 71%)`, boxShadow: 'inset 0 0 0 2px #fff' }} />
            </div>
          )),
        )}
      </div>
      <div className="grid pt-2 text-center" style={{ gridTemplateColumns: `repeat(${COLS}, var(--cell))`, color: CYAN, fontFamily: PIXEL }}>
        {Array.from({ length: COLS }, (_, i) => <span key={i} className="text-[11px] md:text-sm">{i + 1}</span>)}
      </div>
    </div>
  );
}

const STYLE = `
@font-face { font-family: 'Press Start 2P'; src: url('/fonts/PressStart2P-Regular.ttf') format('truetype'); font-display: swap; }
[data-chestard] { --cell: min(calc((100vw - 64px) / 6), 48px); }
@media (min-width: 768px) { [data-chestard] { --cell: 54px; } }
[data-chestard-px], [data-chestard-px] * { font-family: 'Press Start 2P', ui-monospace, monospace !important; }
@keyframes chestard-fall { 0% { transform: translateY(var(--fall)); animation-timing-function: cubic-bezier(.55,0,1,.45); } 86% { transform: translateY(0); animation-timing-function: ease-out; } 93% { transform: translateY(-6%); animation-timing-function: ease-in; } 100% { transform: translateY(0); } }
.chestard-fall { animation-name: chestard-fall; animation-fill-mode: both; }
@keyframes chestard-clear { 0%, 50% { opacity: 1; filter: brightness(1.8); } 25%, 75% { opacity: .35; } 100% { opacity: 0; transform: scale(.4); } }
.chestard-clear { animation: chestard-clear ${CLEAR_MS}ms linear both; }
@keyframes chestard-shake { 0%,100% { transform: rotate(0) } 25% { transform: rotate(-8deg) translateY(-2px) } 75% { transform: rotate(8deg) translateY(1px) } }
.chestard-shake { animation: chestard-shake 140ms linear infinite; }
@keyframes chestard-float { 0% { opacity: 0; transform: translate(-50%, 10px); } 15% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -36px); } }
.chestard-float { animation: chestard-float 1100ms ease-out both; }
@media (prefers-reduced-motion: reduce) { .chestard-fall, .chestard-shake { animation: none; } }
`;

function ChestardGame({ wallet, data, onSignIn, snapshotRef }: { wallet: string | null; data: ChestardState | undefined; onSignIn: () => void; snapshotRef: SnapshotRef }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const signedIn = !!wallet;
  const sounds = useSounds();

  const [board, setBoard] = useState<ChestardBoard>(() => (data?.run ? { ...data.run } : emptyBoard()));
  const [stacks, setStacks] = useState<Checker[][]>(() => stacksFrom(data?.run?.heights ?? Array(COLS).fill(0)));
  const [runId, setRunId] = useState<string | null>(data?.run?.id ?? null);
  const [face, setFace] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [column, setColumn] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(!!data?.run);
  const [float, setFloat] = useState<{ id: number; text: string } | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [guestBest, setGuestBest] = useState(() => Number(readLocal(GUEST_BEST_KEY)) || 0);
  const busyRef = useRef(false);

  const best = Math.max(signedIn ? data?.me?.best ?? 0 : guestBest, board.score);
  const auth = useContext(AuthContext);
  const handle = auth?.user?.username ? `@${auth.user.username.replace(/^@+/, '')}` : null;
  // The share menu lives in the page header; it asks for the board through this.
  snapshotRef.current = () => drawChestardSnapshot({
    board,
    best,
    name: handle,
    labels: {
      score: t('games.chestard.score', { defaultValue: 'SCORE' }),
      hi: t('games.chestard.hiScore', { defaultValue: 'HI-SCORE' }),
      lines: t('games.chestard.lines', { defaultValue: 'LINES' }),
      drops: t('games.chestard.drops', { defaultValue: 'DROPS' }),
      perDrop: t('games.chestard.perDrop', { defaultValue: 'PER DROP' }),
      gameOver: t('games.chestard.gameOver', { defaultValue: 'GAME OVER' }),
    },
  });

  const reset = useCallback(() => {
    setBoard(emptyBoard());
    setStacks(stacksFrom(Array(COLS).fill(0)));
    setFace(null);
    setColumn(null);
    setNewBest(false);
    setFloat(null);
  }, []);

  const roll = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    let current = board;
    let id = runId;
    try {
      if (current.over) {
        reset();
        current = emptyBoard();
        id = null;
      }
      if (signedIn && !id) {
        const res = await chestardStart();
        id = res.run.id;
        setRunId(id);
      }
      setStarted(true);
      sounds.play('roll');
      setRolling(true);
      const tumble = window.setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 70);
      const began = Date.now();
      let result;
      try {
        result = signedIn ? (await chestardRoll(id!)).roll : { ...drop(current, 1 + Math.floor(Math.random() * 6)), newBest: false };
      } finally {
        await sleep(Math.max(0, TUMBLE_MS - (Date.now() - began)));
        window.clearInterval(tumble);
        setRolling(false);
      }
      setFace(result.die);
      setColumn(result.column);

      // The checker falls from the top into its column.
      const fall = fallMs(ROWS - result.landedRow);
      const checker: Checker = { id: nextId++, row: result.landedRow, state: 'enter', fall };
      setStacks((s) => s.map((stack, i) => (i === result.column ? [...stack, checker] : stack)));
      await sleep(fall);
      sounds.play('drop');
      setStacks((s) => s.map((stack) => stack.map((c) => (c.id === checker.id ? { ...c, state: 'idle' } : c))));
      setBoard((b) => ({ ...b, drops: result.drops, score: result.score - result.bonus }));

      if (result.cleared) {
        sounds.play('clear');
        setFloat({ id: nextId++, text: t('games.chestard.lineBonus', { defaultValue: 'LINE! +{{bonus}}', bonus: formatCount(result.bonus) }) });
        setStacks((s) => s.map((stack) => stack.map((c) => (c.row === 0 ? { ...c, state: 'clear' } : c))));
        await sleep(CLEAR_MS);
        setStacks((s) => s.map((stack) => stack.filter((c) => c.row > 0).map((c) => ({ ...c, row: c.row - 1 }))));
        await sleep(SHIFT_MS);
      }
      const next: ChestardBoard = { heights: result.heights, score: result.score, lines: result.lines, drops: result.drops, over: result.over };
      setBoard(next);

      if (next.over) {
        const beat = signedIn ? result.newBest : next.score > guestBest;
        setNewBest(beat);
        sounds.play(beat ? 'best' : 'over');
        if (!signedIn && beat) {
          setGuestBest(next.score);
          writeLocal(GUEST_BEST_KEY, String(next.score));
        }
        setRunId(null);
        if (signedIn) void queryClient.invalidateQueries({ queryKey: ['chestard'] });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || t('games.chestard.rollFailed', { defaultValue: 'That roll did not go through. Try again.' }));
      if (/over|not found/i.test(message)) {
        setRunId(null);
        setBoard((b) => ({ ...b, over: true }));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [board, runId, signedIn, sounds, reset, t, guestBest, queryClient]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName)) return;
      e.preventDefault();
      void roll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [roll]);

  const leaderboard = data?.leaderboard ?? [];
  const rollLabel = board.over
    ? t('games.chestard.playAgain', { defaultValue: 'PLAY AGAIN' })
    : started ? t('games.chestard.roll', { defaultValue: 'ROLL' }) : t('games.chestard.start', { defaultValue: 'START' });

  const rollButton = (
    <button
      type="button"
      data-chestard-roll
      onClick={() => void roll()}
      disabled={busy}
      className="flex h-12 w-full items-center justify-center rounded-md text-sm transition-transform active:scale-[0.98] disabled:opacity-70 md:h-14"
      style={{ background: CYAN, color: '#000', fontFamily: PIXEL }}
    >
      {rollLabel}
    </button>
  );

  const muteButton = (
    <button
      type="button"
      onClick={sounds.toggle}
      aria-label={sounds.muted ? t('games.chestard.soundOn', { defaultValue: 'Turn sound on' }) : t('games.chestard.soundOff', { defaultValue: 'Turn sound off' })}
      className="flex h-9 w-9 items-center justify-center rounded-full ring-1"
      style={{ color: CYAN, ['--tw-ring-color' as string]: `${CYAN}55` } as CSSProperties}
    >
      {sounds.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </button>
  );

  return (
    <div data-chestard className="flex flex-col gap-4">
      <style>{STYLE}</style>
      <section data-chestard-px className="relative overflow-hidden rounded-2xl bg-[#050505] px-4 pb-5 pt-4 ring-1 ring-[#55ffff]/25 md:px-8 md:py-7" aria-label="Chestard">
        <div className="pointer-events-none absolute inset-0 z-10" style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 1px, transparent 1px 3px)' }} />

        {/* Phone: stats on top, die and Roll under the board. */}
        <div className="flex items-start justify-between md:hidden">
          <Stat label={t('games.chestard.score', { defaultValue: 'SCORE' })} value={scoreText(board.score)} />
          <Stat label={t('games.chestard.lines', { defaultValue: 'LINES' })} value={String(board.lines).padStart(2, '0')} />
          <Stat label={t('games.chestard.perDrop', { defaultValue: 'PER DROP' })} value={`X${perDrop(board.lines)}`} accent={MAGENTA} />
        </div>

        <div className="mt-4 flex items-center justify-center gap-10 md:mt-0">
          <div className="hidden w-48 flex-col gap-6 md:flex">
            <Stat label={t('games.chestard.score', { defaultValue: 'SCORE' })} value={scoreText(board.score)} big />
            <Stat label={t('games.chestard.hiScore', { defaultValue: 'HI-SCORE' })} value={scoreText(best)} big />
            <Stat label={t('games.chestard.perDrop', { defaultValue: 'PER DROP' })} value={`X${perDrop(board.lines)}`} accent={MAGENTA} big />
            <Stat label={t('games.chestard.lines', { defaultValue: 'LINES' })} value={String(board.lines).padStart(2, '0')} />
            <Stat label={t('games.chestard.drops', { defaultValue: 'DROPS' })} value={String(board.drops).padStart(3, '0')} />
          </div>

          <div className="relative">
            <Board stacks={stacks} column={column} />
            {float ? (
              <div key={float.id} className="chestard-float pointer-events-none absolute left-1/2 top-1/3 z-20 whitespace-nowrap text-sm md:text-lg" style={{ color: MAGENTA, fontFamily: PIXEL, textShadow: '0 0 12px #ff55ff88' }}>
                {float.text}
              </div>
            ) : null}
            {board.over ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/75 text-center" style={{ fontFamily: PIXEL }}>
                <div className="text-base md:text-xl" style={{ color: MAGENTA }}>{t('games.chestard.gameOver', { defaultValue: 'GAME OVER' })}</div>
                <div className="text-sm md:text-base" style={{ color: WHITE }}>{scoreText(board.score)}</div>
                {newBest ? <div className="text-[10px] md:text-xs" style={{ color: CYAN }}>{t('games.chestard.newBest', { defaultValue: 'NEW HI-SCORE!' })}</div> : null}
              </div>
            ) : null}
          </div>

          <div className="hidden w-64 flex-col items-center gap-5 md:flex">
            <div style={{ color: CYAN, fontFamily: PIXEL }} className="text-sm">{t('games.chestard.die', { defaultValue: 'DIE' })}</div>
            <Die face={face} rolling={rolling} size="lg" />
            <div style={{ color: CYAN, fontFamily: PIXEL }} className="text-xs">
              {t('games.chestard.column', { defaultValue: 'COLUMN' })} <span className="text-sm" style={{ color: MAGENTA }}>{column != null ? column + 1 : '?'}</span>
            </div>
            {rollButton}
            <div style={{ color: CYAN, fontFamily: PIXEL }} className="mt-2 text-xs">{t('games.chestard.stacks', { defaultValue: 'STACKS' })}</div>
            <Stacks heights={board.heights} />
            {muteButton}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:hidden">
          <div className="flex items-center gap-3">
            <Die face={face} rolling={rolling} size="sm" />
            <div className="min-w-0 flex-1 text-[10px] leading-6" style={{ color: CYAN, fontFamily: PIXEL }}>
              <div>{t('games.chestard.column', { defaultValue: 'COLUMN' })} <span className="text-sm" style={{ color: MAGENTA }}>{column != null ? column + 1 : '?'}</span></div>
              <div style={{ color: WHITE }}>{t('games.chestard.drops', { defaultValue: 'DROPS' })} {String(board.drops).padStart(3, '0')}</div>
              <div style={{ color: WHITE }}>{t('games.chestard.hi', { defaultValue: 'HI' })} {scoreText(best)}</div>
            </div>
            {muteButton}
          </div>
          {rollButton}
        </div>
      </section>
      <p className="-mt-2 hidden text-center text-xs text-zinc-500 md:block">{t('games.chestard.keysHint', { defaultValue: 'Space or Enter rolls too.' })}</p>

      {!signedIn ? (
        <div className="flex items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3 ring-1 ring-white/[0.06]">
          <p className="min-w-0 flex-1 text-sm text-zinc-300">{t('games.chestard.signInNote', { defaultValue: 'Sign in to save your hi-score and get on the top 10.' })}</p>
          <button type="button" onClick={onSignIn} className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">
            {t('games.signIn', { defaultValue: 'Sign in' })}
          </button>
        </div>
      ) : null}

      <section className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/[0.06]">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <ThemedIcon icon="trophy" alt="" className="h-5 w-5 object-contain" />
          {t('games.chestard.boardTitle', { defaultValue: 'Top 10' })}
        </h2>
        {leaderboard.length ? (
          <ol className="flex flex-col gap-1.5">
            {leaderboard.map((row) => (
              <li key={row.player.address} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${row.player.address === wallet ? 'bg-fuchsia-400/10 ring-1 ring-fuchsia-400/40' : ''}`}>
                <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-zinc-500">{row.rank}</span>
                <Avatar className="h-7 w-7 shrink-0">
                  {row.player.avatarImageUrl ? <AvatarImage src={row.player.avatarImageUrl} alt="" /> : null}
                  <AvatarFallback className="bg-zinc-800 text-[11px] text-zinc-300">{nameOf(row.player).replace('@', '').slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                {row.player.username ? (
                  <Link to={`/${row.player.username}`} className="min-w-0 flex-1 truncate text-sm text-white hover:underline">{nameOf(row.player)}</Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{nameOf(row.player)}</span>
                )}
                <span className="shrink-0 text-xs text-zinc-500">{t('games.chestard.linesShort', { defaultValue: '{{count}} lines', count: row.lines })}</span>
                <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums" style={{ color: MAGENTA }}>{formatCount(row.best)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-zinc-500">{t('games.chestard.boardEmpty', { defaultValue: 'No scores yet. Be the first.' })}</p>
        )}
      </section>

      <section className="rounded-2xl bg-zinc-900 p-4 text-sm leading-relaxed text-zinc-300 ring-1 ring-white/[0.06]">
        <h2 className="mb-2 text-sm font-semibold text-white">{t('games.chestard.howTitle', { defaultValue: 'How to play' })}</h2>
        <p>{t('games.chestard.how', { defaultValue: 'Roll the die and a checker drops into that column. Fill the bottom row to clear it: everything above falls one row and you get a line bonus. Every line also raises your points per drop. If any column fills to the top, the game is over.' })}</p>
      </section>
    </div>
  );
}

export default function ArcadeChestardPage() {
  const { t } = useTranslation();
  const { walletAddress, connect } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const { data, isLoading } = useQuery({
    queryKey: ['chestard', wallet],
    queryFn: () => chestardState(!!wallet),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const title = t('games.chestard.title', { defaultValue: 'Chestard' });
  const snapshotRef: SnapshotRef = useRef(null);

  return (
    <div data-glass-page data-theme-page-surface className="relative z-[1] min-h-screen bg-black">
      <SEOHead
        title={t('games.chestard.seoTitle', { defaultValue: 'Chestard dice drop game | Riftn Arcade' })}
        description={t('games.chestard.seoDescription', { defaultValue: 'Roll the die, drop the checker, clear the bottom row. A free retro arcade game on Riftn with a top 10.' })}
        image={OG_IMAGE}
        url={PAGE_URL}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'VideoGame',
          name: 'Chestard',
          url: PAGE_URL,
          image: OG_IMAGE,
          applicationCategory: 'Game',
          gamePlatform: 'Web browser',
          playMode: 'SinglePlayer',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
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
            <p className="text-xs text-zinc-500">{t('games.chestard.intro', { defaultValue: 'Roll, drop, clear the bottom row. Don’t top out.' })}</p>
          </div>
          <ArcadeShareMenu slug="chestard" title={title} snapshot={() => snapshotRef.current?.() ?? Promise.resolve(null)} />
        </div>

        {isLoading && wallet ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
        ) : (
          <ChestardGame key={wallet ?? 'guest'} wallet={wallet} data={data} onSignIn={() => void connect()} snapshotRef={snapshotRef} />
        )}
      </div>
    </div>
  );
}
