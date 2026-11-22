/**
 * A DM photo or video that disappears a few seconds after the other person
 * first opens it (3 s, 10 s, 25 s or 1 min, picked in the media studio's
 * Timer tab). The countdown starts on that first open, not when it was sent,
 * so it can't run out before they have seen it.
 *
 * - Sender: the normal bubble with a small timer chip.
 * - Recipient: a closed tile. Tapping it tells the server (which starts the
 *   countdown and removes the message for both when it ends) and shows the
 *   media full screen with the seconds counting down. Afterwards: "Opened".
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Image as ImageIcon, Loader2, Timer, Video, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { markDmMessageViewed } from '@/lib/api/dehub/dm';
import type { DmDestruct } from '@/lib/dm-destruct';

const openedKey = (id: string) => `riftn.dm.opened.${id}`;

function wasOpened(id: string): boolean {
  try { return sessionStorage.getItem(openedKey(id)) === '1'; } catch { return false; }
}
function noteOpened(id: string) {
  try { sessionStorage.setItem(openedKey(id), '1'); } catch { /* private mode */ }
}

export function DmOpenTimerMedia({
  messageId,
  mine,
  destruct,
  kind,
  src,
  onNeedSource,
  children,
}: {
  messageId: string;
  mine: boolean;
  destruct: DmDestruct;
  kind: 'image' | 'video';
  /** The playable address; may arrive after `onNeedSource` (encrypted media). */
  src?: string;
  onNeedSource?: () => void;
  /** The normal bubble, shown to the sender. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const seconds = destruct.seconds ?? 10;
  const secLabel = seconds >= 60 ? t('dm.openTimer.oneMin', '1 min') : t('dm.openTimer.secs', '{{n}} sec', { n: seconds });

  if (mine) {
    return (
      <div className="relative">
        {children}
        <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          <Timer className="h-3 w-3" />
          {t('dm.openTimer.chip', '{{time}} once opened', { time: secLabel })}
        </span>
      </div>
    );
  }
  return <RecipientTile messageId={messageId} destruct={destruct} kind={kind} src={src} onNeedSource={onNeedSource} secLabel={secLabel} seconds={seconds} />;
}

function RecipientTile({
  messageId, destruct, kind, src, onNeedSource, secLabel, seconds,
}: {
  messageId: string; destruct: DmDestruct; kind: 'image' | 'video'; src?: string; onNeedSource?: () => void; secLabel: string; seconds: number;
}) {
  const { t } = useTranslation();
  const expired = !!destruct.expiresAt && new Date(destruct.expiresAt).getTime() <= Date.now();
  const [phase, setPhase] = useState<'closed' | 'starting' | 'open' | 'done'>(() => (expired || wasOpened(messageId) ? 'done' : 'closed'));
  const [endsAt, setEndsAt] = useState<number | null>(destruct.expiresAt ? new Date(destruct.expiresAt).getTime() : null);
  const [now, setNow] = useState(Date.now());

  const open = async () => {
    if (phase !== 'closed') return;
    setPhase('starting');
    onNeedSource?.();
    try {
      const res = await markDmMessageViewed(messageId);
      const end = res.expiresAt ? new Date(res.expiresAt).getTime() : Date.now() + seconds * 1000;
      setEndsAt(end);
    } catch {
      setEndsAt(Date.now() + seconds * 1000);
    }
    noteOpened(messageId);
    setPhase('open');
  };

  useEffect(() => {
    if (phase !== 'open') return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [phase]);

  const left = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : seconds;
  const closedRef = useRef(false);
  useEffect(() => {
    if (phase === 'open' && endsAt && now >= endsAt && !closedRef.current) {
      closedRef.current = true;
      setPhase('done');
    }
  }, [phase, endsAt, now]);

  const KindIcon = kind === 'video' ? Video : ImageIcon;

  if (phase === 'done') {
    return (
      <div className="flex min-w-[180px] items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white/60" data-dm-open-timer="done">
        <Eye className="h-4 w-4 shrink-0" />
        {t('dm.openTimer.opened', 'Opened')}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        className="flex min-w-[200px] items-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-3 text-left transition-colors hover:bg-white/[0.1]"
        data-dm-open-timer="closed"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
          {phase === 'starting' ? <Loader2 className="h-5 w-5 animate-spin" /> : <KindIcon className="h-5 w-5" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">
            {kind === 'video' ? t('dm.openTimer.tapVideo', 'Tap to watch') : t('dm.openTimer.tapPhoto', 'Tap to view')}
          </span>
          <span className="flex items-center gap-1 text-xs text-white/60">
            <Timer className="h-3 w-3" />
            {t('dm.openTimer.goneAfter', 'Disappears {{time}} after you open it', { time: secLabel })}
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
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold tabular-nums text-white">
            <Timer className="h-4 w-4" />{left}
          </span>
          <button
            type="button"
            onClick={() => setPhase('done')}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label={t('common.close', 'Close')}
          >
            <X className="h-5 w-5" />
          </button>
          {!src ? (
            <Loader2 className="h-8 w-8 animate-spin text-white/70" />
          ) : kind === 'video' ? (
            <video src={src} autoPlay playsInline controls={false} className="max-h-[90vh] max-w-[95vw] rounded-lg" />
          ) : (
            <img src={src} alt="" draggable={false} onContextMenu={(e) => e.preventDefault()} className="max-h-[90vh] max-w-[95vw] select-none rounded-lg object-contain" />
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
