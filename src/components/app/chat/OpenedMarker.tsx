/**
 * What a view-once or on-open photo/video leaves in the chat once it has been
 * opened: a small pill with the photo icon, "Opened" and when. Both people see
 * it, so a photo that was sent and seen never vanishes without a trace. The
 * person who got it also has a camera button after a thin line, to answer
 * that photo with a photo or video of their own (sent as a reply to it).
 *
 * Phones: the camera button is the phone's own camera (file input with
 * `capture`). Computers: a small camera card with the laptop camera, and
 * "Upload instead" for a photo or video from the computer.
 * Same pill as the app's components/DM/OpenedMarker.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CheckCheck, Image as ImageIcon, Upload, Video, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMessageTime } from '@/i18n/date-locale';

const coarsePointer = () => {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
};

export function OpenedBubble({
  kind = 'image',
  mine,
  openedAt,
  onCameraFile,
  deliveryStatus,
}: {
  kind?: 'image' | 'video';
  mine: boolean;
  openedAt?: string | Date | null;
  /** The person who got it: what they took or picked, to send as a reply. */
  onCameraFile?: (file: File) => void;
  deliveryStatus?: 'sending' | 'failed' | 'sent';
}) {
  const { t } = useTranslation();
  const [cardOpen, setCardOpen] = useState(false);
  const when = openedAt ? formatMessageTime(new Date(openedAt)) : '';
  const label = deliveryStatus === 'sending' ? t('copy.b8ed5279e897', 'Sending…')
    : deliveryStatus === 'failed' ? t('toasts.failed_to_send', 'Failed to send')
    : deliveryStatus === 'sent' ? t('dm.openTimer.sent', 'Sent')
    : t('dm.openTimer.opened', 'Opened');
  const KindIcon = kind === 'video' ? Video : ImageIcon;
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onCameraFile?.(file);
  };
  return (
    <div
      data-dm-bubble={mine ? 'me' : 'them'}
      data-dm-bubble-first=""
      data-dm-bubble-last=""
      data-dm-opened={deliveryStatus ? undefined : ''}
      className={`inline-flex min-w-[168px] items-center gap-3 rounded-xl py-2 pl-3.5 text-left ${onCameraFile ? 'pr-2' : 'pr-4'} ${
        mine ? 'bg-white/[0.11] text-white rounded-br-sm' : 'border border-white/[0.16] text-zinc-100 rounded-bl-sm'
      }`}
      aria-label={deliveryStatus ? `${t('dm.photo', 'Photo')}, ${label}` : kind === 'video'
        ? t('dm.opened.videoA11y', 'Video, opened {{time}}', { time: when })
        : t('dm.opened.photoA11y', 'Photo, opened {{time}}', { time: when })}
    >
      <KindIcon className="h-[22px] w-[22px] shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold opacity-80">{label}</span>
        {when && (
          <span className="flex items-center gap-1 text-[11px] opacity-60">
            {mine && <CheckCheck className="h-3 w-3" />}
            {mine ? t('dm.opened.seenAt', 'Seen {{time}}', { time: when }) : when}
          </span>
        )}
      </span>
      {onCameraFile && (
        <>
          <span aria-hidden className="w-px self-stretch my-1 bg-current opacity-20" />
          {coarsePointer() ? (
            <label
              onClick={(e) => e.stopPropagation()}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full"
              style={{ background: 'color-mix(in srgb, currentColor 14%, transparent)' }}
              aria-label={t('dm.opened.replyCamera', 'Reply with the camera')}
            >
              <Camera className="h-5 w-5" />
              <input type="file" accept="image/*,video/*" capture="environment" className="sr-only" onChange={pick} />
            </label>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setCardOpen(true); }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80"
              style={{ background: 'color-mix(in srgb, currentColor 14%, transparent)' }}
              aria-label={t('dm.opened.replyCamera', 'Reply with the camera')}
            >
              <Camera className="h-5 w-5" />
            </button>
          )}
        </>
      )}
      {cardOpen && onCameraFile && (
        <DmCameraCard
          onClose={() => setCardOpen(false)}
          onFile={(file) => { setCardOpen(false); onCameraFile(file); }}
        />
      )}
    </div>
  );
}

/** The laptop camera, for answering a photo from a computer. */
function DmCameraCard({ onClose, onFile }: { onClose: () => void; onFile: (file: File) => void }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live: MediaStream | null = null;
    let gone = false;
    navigator.mediaDevices?.getUserMedia?.({ video: { facingMode: 'user' }, audio: false })
      .then((s) => {
        if (gone) { s.getTracks().forEach((tr) => tr.stop()); return; }
        live = s;
        setStream(s);
      })
      .catch(() => setFailed(true));
    return () => {
      gone = true;
      live?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // The preview is mirrored like a mirror; the photo is the right way round.
    ctx.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) onFile(new File([b], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })); }, 'image/jpeg', 0.9);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose} data-dm-camera-card="">
      <div
        className="w-full max-w-[360px] rounded-2xl border border-white/[0.12] bg-zinc-900/95 p-3 text-white shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
        data-keep-dark=""
      >
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[13px] font-bold">{t('dm.opened.cameraTitle', 'Reply to this photo')}</span>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10" aria-label={t('common.close', 'Close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
          {failed ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-white/70">
              {t('dm.opened.cameraOff', 'Camera access is off. Upload a photo or video instead.')}
            </div>
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
          )}
          {!failed && (
            <button
              type="button"
              onClick={snap}
              disabled={!stream}
              className="absolute bottom-2.5 left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border-[3px] border-white disabled:opacity-50"
              aria-label={t('dm.opened.takePhoto', 'Take photo')}
            >
              <span className="block h-9 w-9 rounded-full bg-white" />
            </button>
          )}
        </div>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.08] text-[12.5px] font-bold hover:bg-white/[0.12]"
          >
            <Upload className="h-4 w-4" />
            {t('dm.opened.uploadInstead', 'Upload instead')}
          </button>
          <input
            ref={uploadRef}
            type="file"
            accept="image/*,video/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onFile(file);
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
