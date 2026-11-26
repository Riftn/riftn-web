import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/contexts/AuthContext';
import { spendAction, spendCreate, spendGet, spendList } from '@/lib/api/dehub/games';
import {
  SPEND_BOARD, SPEND_COMPUTER_SECONDS, SPEND_LEVELS, SPEND_LIVE_SECONDS, SPEND_PALS_DAYS, SPEND_PATH, SPEND_PAWNS,
  spendMoney, spendName, spendPoll, spendSecondsLeft, spendSpace, spendTime,
  type SpendAction, type SpendCreate, type SpendGame, type SpendLevel, type SpendMode,
} from '@/lib/spend';

const button = 'min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';
const primary = button + ' bg-foreground text-background hover:opacity-90';
const quiet = button + ' bg-muted text-foreground hover:bg-accent';
const field = 'min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground';
const panel = 'rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-5';
const baseUrl = 'https://riftn.com' + SPEND_PATH;
const linkTo = (id: string) => SPEND_PATH + '?game=' + encodeURIComponent(id);

function Board({ game }: { game?: SpendGame }) {
  const { t } = useTranslation();
  const acting = game?.status === 'active' ? game.seats[game.acting] : undefined;

  return (
    <div dir="ltr" className="grid aspect-[6/5] grid-cols-6 grid-rows-6 gap-px overflow-hidden rounded-2xl border border-[#13663b] bg-[#13663b] sm:aspect-[3/2]" aria-label={t('games.spend.board')}>
      {(game?.board ?? SPEND_BOARD).map((amount, index) => {
        const spot = spendSpace(index);
        const seats = game?.seats.filter(seat => !seat.out && seat.pos === index) ?? [];
        return (
          <div
            key={amount}
            title={seats.map(seat => spendName(seat.player)).join(', ')}
            className={'flex flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-bold tabular-nums sm:text-sm ' +
              (acting?.pos === index ? 'bg-[#12643a] text-white' : 'bg-[#f1f9ed] text-[#123c25]')}
            style={{ gridColumn: spot.column + 1, gridRow: (spot.row + 1) + ' / span ' + spot.height }}
          >
            {index === 0 ? t('games.spend.startSpace') : spendMoney(amount)}
            {seats.length > 0 && (
              <div className="grid grid-cols-3 gap-0.5">
                {seats.map(seat => (
                  <span key={seat.player.address} style={{ backgroundColor: SPEND_PAWNS[seat.index] }}
                    className="flex size-3.5 items-center justify-center rounded-full text-[9px] text-white ring-1 ring-white">
                    {seat.index + 1}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="col-start-2 col-span-4 row-start-2 row-span-4 flex flex-col items-center justify-center gap-1 bg-[#e2f2dc] px-2 text-center text-[#123c25]">
        <span className="text-3xl font-black tracking-wide sm:text-5xl">{t('games.spend.boardMark')}</span>
        {game?.million ? (
          <span className="text-xs font-semibold sm:text-sm">{t('games.spend.millionRound')}</span>
        ) : game?.lastRoll ? (
          <span className="text-xs font-semibold sm:text-sm">{t('games.spend.rolled', { name: spendName(game.seats[game.lastRoll.seat]?.player), die: game.lastRoll.value })}</span>
        ) : (
          <span className="text-xs sm:text-sm">{t('games.spend.credit')}</span>
        )}
      </div>
    </div>
  );
}

function Rules() {
  const { t } = useTranslation();
  return (
    <details className={panel}>
      <summary className="cursor-pointer font-semibold">{t('games.spend.rules')}</summary>
      <p className="mt-3 text-sm text-muted-foreground">{t('games.spend.ruleText')}</p>
    </details>
  );
}

function Lobby({ wallet }: { wallet: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [mode, setMode] = useState<SpendMode>('pals');
  const [opponent, setOpponent] = useState('');
  const [days, setDays] = useState(2);
  const [liveSeconds, setLiveSeconds] = useState(60);
  const [computerSeconds, setComputerSeconds] = useState(300);
  const [level, setLevel] = useState<SpendLevel>('normal');
  const listKey = ['spend', 'lobby', wallet];
  const list = useQuery({ queryKey: listKey, queryFn: spendList, refetchInterval: 20_000 });
  const create = useMutation({
    mutationFn: spendCreate,
    onSuccess: ({ game }) => {
      void client.invalidateQueries({ queryKey: listKey });
      navigate(linkTo(game.id));
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    let input: SpendCreate;
    if (mode === 'pals') {
      input = { mode, days, opponent: opponent.trim().replace(/^@/, '') || undefined };
    } else if (mode === 'live') {
      input = { mode, turnSeconds: liveSeconds };
    } else {
      input = { mode, turnSeconds: computerSeconds, level };
    }
    create.mutate(input);
  };

  return (
    <>
      <form onSubmit={submit} className={panel + ' space-y-4'}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('games.spend.mode')}>
          {(['pals', 'live', 'computer'] as const).map(option => (
            <button key={option} type="button" disabled={create.isPending} aria-pressed={mode === option} className={mode === option ? primary : quiet}
              onClick={() => { setMode(option); create.reset(); }}>
              {t('games.spend.mode_' + option)}
            </button>
          ))}
        </div>
        {mode === 'pals' && (
          <label className="block space-y-1 text-sm">
            <span>{t('games.spend.invitee')}</span>
            <input className={field} placeholder={t('games.spend.usernamePlaceholder')} value={opponent}
              onChange={event => setOpponent(event.target.value)} />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span>{t('games.spend.turnTime')}</span>
          {mode === 'pals' ? (
            <select className={field} value={days} onChange={event => setDays(Number(event.target.value))}>
              {SPEND_PALS_DAYS.map(day => <option key={day} value={day}>{t('games.spend.days', { count: day })}</option>)}
            </select>
          ) : mode === 'live' ? (
            <select className={field} value={liveSeconds} onChange={event => setLiveSeconds(Number(event.target.value))}>
              {SPEND_LIVE_SECONDS.map(seconds => <option key={seconds} value={seconds}>{t('games.spend.seconds', { count: seconds })}</option>)}
            </select>
          ) : (
            <select className={field} value={computerSeconds} onChange={event => setComputerSeconds(Number(event.target.value))}>
              {SPEND_COMPUTER_SECONDS.map(seconds => <option key={seconds} value={seconds}>
                {seconds === 86_400 ? t('games.spend.days', { count: 1 }) : t('games.spend.minutes', { count: seconds / 60 })}
              </option>)}
            </select>
          )}
        </label>
        {mode === 'computer' && (
          <label className="block space-y-1 text-sm">
            <span>{t('games.spend.difficulty')}</span>
            <select className={field} value={level} onChange={event => setLevel(event.target.value as SpendLevel)}>
              {SPEND_LEVELS.map(item => <option key={item} value={item}>{t('games.spend.level_' + item)}</option>)}
            </select>
          </label>
        )}
        {create.isError && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
        <button className={primary} disabled={create.isPending} type="submit">{t('games.spend.create_' + mode)}</button>
      </form>
      {list.isPending && <p role="status" className="text-sm text-muted-foreground">{t('games.spend.loading')}</p>}
      {list.isError && <button className={quiet} type="button" onClick={() => void list.refetch()}>{t('games.spend.retryList')}</button>}
      {list.data && (['games', 'open'] as const).map(key => (
        <section key={key} className={panel}>
          <h2 className="mb-2 font-semibold">{t('games.spend.list_' + key)}</h2>
          {list.data[key].length === 0 && <p className="text-sm text-muted-foreground">{t('games.spend.empty_' + key)}</p>}
          {list.data[key].map(game => {
            const gameMode = game.seats.some(seat => seat.player.computer) && game.mode === 'pals' ? 'computer' : game.mode;
            return (
              <Link key={game.id} to={linkTo(game.id)} className="flex min-h-11 flex-wrap items-center gap-x-3 border-t border-border py-2 text-sm hover:underline">
                <span className="font-semibold">{t('games.spend.mode_' + gameMode)}</span>
                <span className="text-muted-foreground">{game.seats.map(seat => spendName(seat.player)).join(', ')}</span>
                <span className="ml-auto">{game.yourTurn ? t('games.spend.yourTurn') : t('games.spend.status_' + game.status)}</span>
              </Link>
            );
          })}
        </section>
      ))}
    </>
  );
}

function Game({ id, wallet, signIn }: { id: string; wallet: string | null; signIn: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const key = ['spend', 'game', id, wallet];
  const [text, setText] = useState('');
  const [level, setLevel] = useState<SpendLevel>('normal');
  const [now, setNow] = useState(Date.now);
  const detail = useQuery({
    queryKey: key,
    queryFn: () => spendGet(id, !!wallet),
    refetchInterval: query => spendPoll(query.state.data?.game),
    retry: false,
  });
  const action = useMutation({
    mutationFn: (move: SpendAction) => spendAction(id, move),
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: ({ game }, move) => {
      client.setQueryData(key, { game });
      if (move.name === 'buy') setText('');
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: ['spend', 'lobby', wallet] });
    },
  });
  const game = detail.data?.game;
  const deadline = game?.turnDeadline;
  useEffect(() => {
    if (!deadline) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  if (!game) {
    return (
      <div className={panel} role="status">
        <p>{detail.isError ? t('games.spend.unavailable') : t('games.spend.loading')}</p>
        {detail.isError && (
          <div className="mt-3 flex flex-wrap gap-2">
            {!wallet && <button type="button" className={primary} onClick={signIn}>{t('games.signIn')}</button>}
            <button type="button" className={quiet} onClick={() => void detail.refetch()}>{t('games.spend.retry')}</button>
          </div>
        )}
      </div>
    );
  }

  const remaining = spendSecondsLeft(game, detail.dataUpdatedAt, now);
  const pending = game.status === 'pending';
  const active = game.status === 'active';
  const currentSeat = game.seats[game.you];
  const acting = game.seats[game.acting];
  const canJoin = pending && game.you === -1 && game.seats.length < game.maxSeats &&
    (!game.invitee || game.invitee.address.toLowerCase() === wallet);
  const canLeave = pending && (game.you >= 0 || game.invitee?.address.toLowerCase() === wallet);
  const act = (move: SpendAction) => { if (!action.isPending) action.mutate(move); };
  const share = async () => {
    const url = 'https://riftn.com' + linkTo(id);
    try {
      if (navigator.share) await navigator.share({ title: t('games.spend.title'), url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t('games.spend.linkCopied'));
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) toast.error(t('games.spend.shareError'));
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {active ? (
          <p className="mr-auto text-sm font-semibold" role="status">
            {game.yourTurn ? t('games.spend.yourTurn') : t('games.spend.playersTurn', { name: spendName(acting?.player) })}
          </p>
        ) : (
          <p className="mr-auto text-sm font-semibold">
            {game.winner ? t('games.spend.won', { name: spendName(game.winner) }) : t('games.spend.status_' + game.status)}
          </p>
        )}
        {remaining !== null && active && (
          <span className="rounded-full bg-muted px-3 py-2 text-sm font-semibold tabular-nums" aria-label={t('games.spend.timeLeft')}>
            {spendTime(remaining)}
          </span>
        )}
        {(pending || game.mode === 'live') && (
          <button type="button" className={quiet + ' inline-flex items-center gap-2'} onClick={() => void share()}>
            <Share2 className="size-4" />{t('games.spend.share')}
          </button>
        )}
      </div>
      <Board game={game} />
      <ul className="flex flex-wrap gap-2">
        {game.seats.map(seat => (
          <li key={seat.player.address} className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs">
            <span className="grid size-5 place-items-center rounded-full font-bold text-white" style={{ backgroundColor: SPEND_PAWNS[seat.index] }}>{seat.index + 1}</span>
            {spendName(seat.player)}{seat.index === game.you && ' (' + t('games.spend.you') + ')'}
            {seat.out && <span className="text-muted-foreground">{t(seat.outReason === 'timeout' ? 'games.spend.timedOut' : 'games.spend.out')}</span>}
            {pending && game.host && seat.player.computer && (
              <button type="button" className="min-h-11 font-semibold underline" disabled={action.isPending}
                onClick={() => act({ name: 'computer', body: { remove: seat.player.address } })}>
                {t('games.spend.remove')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {!wallet && pending && <button type="button" className={primary} onClick={signIn}>{t('games.signIn')}</button>}
      {wallet && pending && (
        <div className="flex flex-wrap items-end gap-2">
          {canJoin && <button type="button" className={primary} disabled={action.isPending} onClick={() => act({ name: 'join' })}>{t('games.spend.join')}</button>}
          {game.mode === 'live' && game.host && (
            <>
              {game.seats.length < game.maxSeats && (
                <>
                  <label className="space-y-1 text-sm">
                    <span>{t('games.spend.difficulty')}</span>
                    <select className={field} value={level} onChange={event => setLevel(event.target.value as SpendLevel)}>
                      {SPEND_LEVELS.map(item => <option key={item} value={item}>{t('games.spend.level_' + item)}</option>)}
                    </select>
                  </label>
                  <button type="button" className={quiet} disabled={action.isPending}
                    onClick={() => act({ name: 'computer', body: { level } })}>{t('games.spend.addComputer')}</button>
                </>
              )}
              <button type="button" className={primary} disabled={action.isPending || game.seats.length < 2}
                onClick={() => act({ name: 'start' })}>{t('games.spend.startTable')}</button>
            </>
          )}
          {canLeave && <button type="button" className={quiet} disabled={action.isPending} onClick={() => act({ name: 'leave' })}>
            {t(game.host ? 'games.spend.cancelGame' : game.mode === 'pals' ? 'games.spend.decline' : 'games.spend.leave')}
          </button>}
        </div>
      )}
      {active && game.yourTurn && (
        game.phase === 'roll' ? (
          <button type="button" className={primary} disabled={action.isPending || remaining === 0} onClick={() => act({ name: 'roll' })}>
            {t('games.spend.roll')}
          </button>
        ) : (
          <form className={panel + ' space-y-3'} onSubmit={event => {
            event.preventDefault();
            if (text.trim() && remaining !== 0) act({ name: 'buy', body: { text: text.trim() } });
          }}>
            <label className="block space-y-2 font-semibold">
              <span>{t('games.spend.prompt', { amount: spendMoney(game.amount) })}</span>
              <input className={field} value={text} maxLength={game.maxChars} onChange={event => setText(event.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={primary} disabled={action.isPending || remaining === 0 || !text.trim()}>
                {t('games.spend.buy')}
              </button>
              {!currentSeat?.saved && <button type="button" className={quiet} disabled={action.isPending || remaining === 0}
                onClick={() => act({ name: 'save' })}>{t('games.spend.save')}</button>}
            </div>
          </form>
        )
      )}
      {active && currentSeat && !currentSeat.out && (
        <button type="button" disabled={action.isPending} className={quiet}
          onClick={() => { if (window.confirm(t('games.spend.confirmGiveUp'))) act({ name: 'give-up' }); }}>
          {t('games.spend.giveUp')}
        </button>
      )}
      {action.isError && <p role="alert" className="text-sm text-destructive">{action.error.message}</p>}
      {detail.isError && <button type="button" className={quiet} onClick={() => void detail.refetch()}>{t('games.spend.retry')}</button>}
      {!!game.buys?.length && (
        <section className={panel}>
          <h2 className="mb-2 font-semibold">{t('games.spend.history')}</h2>
          <ol className="max-h-72 overflow-auto text-sm">
            {[...game.buys].reverse().map(buy => (
              <li key={buy.n} className="flex flex-wrap gap-x-2 border-t border-border py-2">
                <span className="font-semibold">{spendName(game.seats[buy.seat]?.player)}</span>
                <span className="min-w-0 break-words text-muted-foreground">{buy.saved ? t('games.spend.saved') : buy.text}</span>
                <span className="ml-auto tabular-nums">{spendMoney(buy.amount)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

export default function ArcadeSpendPage() {
  const { t } = useTranslation();
  const { walletAddress, connect } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const [params] = useSearchParams();
  const id = params.get('game');
  const signIn = () => { void connect(); };

  return (
    <div data-glass-page data-theme-page-surface className="relative z-[1] min-h-screen bg-background text-foreground">
      <SEOHead title={t('games.spend.title') + ' | Riftn Arcade'} description={t('games.spend.cardBlurb')}
        url={baseUrl} image="https://riftn.com/og/arcade-spend.jpg" noindex={!!id} />
      <main className="mx-auto max-w-3xl space-y-4 px-4 pb-24 pt-6">
        <div className="flex items-center gap-3">
          <Link to={id ? SPEND_PATH : '/arcade'} className={quiet + ' grid min-w-11 place-items-center px-2'} aria-label={t('games.back')}>
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{t('games.spend.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('games.spend.disclaimer')}</p>
          </div>
        </div>
        {id && (
          <a className={quiet + ' hidden items-center [@media(pointer:coarse)]:inline-flex'} href={'dehub://' + linkTo(id).slice(1)}>
            {t('games.spend.openInApp')}
          </a>
        )}
        {id ? <Game key={id + ':' + (wallet ?? '')} id={id} wallet={wallet} signIn={signIn} /> : (
          <>
            <Board />
            {wallet ? <Lobby key={wallet} wallet={wallet} /> : (
              <div className={panel + ' flex flex-wrap items-center justify-between gap-3'}>
                <p className="text-sm">{t('games.signInToPlay')}</p>
                <button type="button" className={primary} onClick={signIn}>{t('games.signIn')}</button>
              </div>
            )}
          </>
        )}
        <Rules />
      </main>
    </div>
  );
}
