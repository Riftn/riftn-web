/**
 * A DM photo or video that disappears a few seconds after the other person
 * first opens it (3 s, 10 s, 25 s or 1 min, picked in the media studio's
 * Timer tab). The countdown starts on that first open, not when it was sent,
 * so it can't run out before they have seen it. The sender may allow one
 * replay: when the first countdown ends it closes, and one more open runs the
 * countdown again. The server decides every open; this only shows it.
 *
 * - Sender: the normal bubble with a small timer chip.
 * - Recipient: a closed tile. Tapping it tells the server (which starts the
 *   countdown and removes the message for both when it ends) and shows the
 *   media full screen with a big "29s" countdown. Afterwards: "Tap to replay"
 *   while a replay is left, then "Opened".
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, Loader2, RotateCcw, Timer, Video, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { markDmMessageViewed } from '@/lib/api/dehub/dm';
import { countdownLabel, replaysLeft, type DmDestruct } from '@/lib/dm-destruct';
import { OpenedBubble } from './OpenedMarker';

const openedKey = (id: string) => `riftn.dm.opened.${id}`;

/** Replays left after the last open in this tab, or null if not opened here. */
function openedHere(id: string): number | null {
  try {
    const v = sessionStorage.getItem(openedKey(id));
    if (v == null) return null;
    return v.startsWith('r') ? Math.max(0, Number(v.slice(1)) || 0) : 0;
  } catch { return null; }
}
function noteOpened(id: string, left: number) {
  try { sessionStorage.setItem(openedKey(id), left > 0 ? `r${left}` : '1'); } catch { /* private mode */ }
}

type Phase = 'closed' | 'replay' | 'starting' | 'open' | 'done';

/** Where a recipient's tile starts, from this tab's memory and what the server sent. */
function initialOpenPhase(messageId: string, destruct: DmDestruct, now = Date.now()): 'closed' | 'replay' | 'done' {
  const here = openedHere(messageId);
  if (here != null) return here > 0 ? 'replay' : 'done';
  const end = destruct.expiresAt ? new Date(destruct.expiresAt).getTime() : null;
  if (end != null && end > now) return 'closed';
  const opened = !!destruct.openedAt || end != null;
  if (!opened) return 'closed';
  return replaysLeft(destruct) > 0 ? 'replay' : 'done';
}

export function DmOpenTimerMedia({
  messageId,
  mine,
  destruct,
  kind,
  src,
  onNeedSource,
  onCameraFile,
  children,
}: {
  messageId: string;
  mine: boolean;
  destruct: DmDestruct;
  kind: 'image' | 'video';
  /** The playable address; may arrive after `onNeedSource` (encrypted media). */
  src?: string;
  onNeedSource?: () => void;
  /** Recipient: answer it with a photo or video once it has been opened. */
  onCameraFile?: (file: File) => void;
  /** The normal bubble, shown to the sender. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const seconds = destruct.seconds ?? 10;
  const secLabel = seconds >= 60 ? t('dm.openTimer.oneMin', '1 min') : t('dm.openTimer.secs', '{{n}} sec', { n: seconds });
  const allowsReplay = (Number(destruct.replaysAllowed) || 0) > 0;

  // The sender: once they have opened it, it reads "Opened" here too.
  if (mine && destruct.openedAt) return <OpenedBubble kind={kind} mine openedAt={destruct.openedAt} />;
  if (mine) {
    return (
      <div className="relative">
        {children}
        <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          <Timer className="h-3 w-3" />
          {t('dm.openTimer.chip', '{{time}} once opened', { time: secLabel })}
          {allowsReplay && <RotateCcw className="h-3 w-3" aria-label={t('dm.openTimer.replayAllowed', 'One replay allowed')} />}
        </span>
      </div>
    );
  }
  return <RecipientTile messageId={messageId} destruct={destruct} kind={kind} src={src} onNeedSource={onNeedSource} onCameraFile={onCameraFile} secLabel={secLabel} seconds={seconds} />;
}

function RecipientTile({
  messageId, destruct, kind, src, onNeedSource, onCameraFile, secLabel, seconds,
}: {
  messageId: string; destruct: DmDestruct; kind: 'image' | 'video'; src?: string; onNeedSource?: () => void; onCameraFile?: (file: File) => void; secLabel: string; seconds: number;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>(() => initialOpenPhase(messageId, destruct));
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [left, setLeft] = useState(() => replaysLeft(destruct));
  const [isReplay, setIsReplay] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [openedAt, setOpenedAt] = useState<Date | null>(null);

  const open = async () => {
    if (phase !== 'closed' && phase !== 'replay') return;
    const replaying = phase === 'replay';
    setIsReplay(replaying);
    setPhase('starting');
    onNeedSource?.();
    let end = Date.now() + seconds * 1000;
    let after = replaying ? 0 : replaysLeft(destruct);
    try {
      const res = await markDmMessageViewed(messageId);
      if (res.status === 'gone') {
        noteOpened(messageId, 0);
        setPhase('done');
        return;
      }
      if (res.expiresAt) end = new Date(res.expiresAt).getTime();
      if (typeof res.replaysLeft === 'number') after = res.replaysLeft;
    } catch { /* offline: show it with the local countdown */ }
    noteOpened(messageId, after);
    setOpenedAt((d) => d ?? new Date());
    setLeft(after);
    setEndsAt(end);
    setNow(Date.now());
    setPhase('open');
  };

  const finish = () => setPhase(left > 0 ? 'replay' : 'done');

  useEffect(() => {
    if (phase !== 'open') return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === 'open' && endsAt && now >= endsAt) setPhase(left > 0 ? 'replay' : 'done');
  }, [phase, endsAt, now, left]);

  const secsLeft = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : seconds;
  const KindIcon = kind === 'video' ? Video : ImageIcon;

  if (phase === 'done') {
    return <OpenedBubble kind={kind} mine={false} openedAt={destruct.openedAt ?? openedAt} onCameraFile={onCameraFile} />;
  }

  const replayTile = phase === 'replay' || (phase === 'starting' && isReplay);
  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        className="flex min-w-[200px] items-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-3 text-left transition-colors hover:bg-white/[0.1]"
        data-dm-open-timer={replayTile ? 'replay' : 'closed'}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
          {phase === 'starting' ? <Loader2 className="h-5 w-5 animate-spin" /> : replayTile ? <RotateCcw className="h-5 w-5" /> : <KindIcon className="h-5 w-5" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">
            {replayTile
              ? t('dm.openTimer.tapReplay', 'Tap to replay')
              : kind === 'video' ? t('dm.openTimer.tapVideo', 'Tap to watch') : t('dm.openTimer.tapPhoto', 'Tap to view')}
          </span>
          <span className="flex items-center gap-1 text-xs text-white/60">
            <Timer className="h-3 w-3 shrink-0" />
            {replayTile
              ? t('dm.openTimer.lastView', 'Last view, {{time}}', { time: secLabel })
              : replaysLeft(destruct) > 0
                ? t('dm.openTimer.goneAfterReplay', 'Disappears {{time}} after you open it. One replay.', { time: secLabel })
                : t('dm.openTimer.goneAfter', 'Disappears {{time}} after you open it', { time: secLabel })}
          </span>
        </span>
      </button>
      {phase === 'open' && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95" role="dialog" aria-modal="true" data-keep-dark>
          <div className="absolute inset-x-0 top-0 h-1 bg-white/10">
            <div
              className="h-full bg-white transition-[width] duration-200 ease-linear"
              style={{ width: `${endsAt ? Math.max(0, Math.min(100, ((endsAt - now) / (seconds * 1000)) * 100)) : 100}%` }}
            />
          </div>
          <button
            type="button"
            onClick={finish}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label={t('common.close', 'Close')}
          >
            <X className="h-5 w-5" />
          </button>
          <div className="relative">
            {!src ? (
              <Loader2 className="h-8 w-8 animate-spin text-white/70" />
            ) : kind === 'video' ? (
              <video src={src} autoPlay playsInline controls={false} className="max-h-[90vh] max-w-[95vw] rounded-lg" />
            ) : (
              <img src={src} alt="" draggable={false} onContextMenu={(e) => e.preventDefault()} className="max-h-[90vh] max-w-[95vw] select-none rounded-lg object-contain" />
            )}
            {/* The countdown sits on the photo itself so it can't be missed. */}
            <span
              className="pointer-events-none absolute left-1/2 top-3 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/65 px-3.5 py-1.5 text-base font-bold tabular-nums text-white shadow-lg backdrop-blur-md"
              role="timer"
              aria-live="off"
              data-dm-countdown
            >
              <Timer className="h-4 w-4" />
              {countdownLabel(secsLeft)}
              {isReplay && <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[11px] font-semibold">{t('dm.openTimer.replaying', 'Replay')}</span>}
            </span>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
