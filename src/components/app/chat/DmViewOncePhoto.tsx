/**
 * A view-once photo sent to me. Never drawn in the chat: a closed tile that
 * opens the picture one time, tells the server (which removes it for both
 * people), and then says "Opened" so it can't be opened again here.
 */
import { useState } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { markDmMessageViewed } from '@/lib/api/dehub/dm';
import { OpenedBubble } from './OpenedMarker';

export function DmViewOncePhoto({
  messageId,
  resolveUrl,
  onOpenImage,
  onCameraFile,
}: {
  messageId: string;
  resolveUrl: () => Promise<string | null | undefined> | string | null | undefined;
  onOpenImage?: (url: string) => void;
  /** Answer it with a photo or video once it has been opened. */
  onCameraFile?: (file: File) => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'closed' | 'starting' | 'done'>('closed');
  const [openedAt, setOpenedAt] = useState<Date | null>(null);

  if (phase === 'done') {
    return <OpenedBubble kind="image" mine={false} openedAt={openedAt} onCameraFile={onCameraFile} />;
  }

  const open = async () => {
    if (phase !== 'closed') return;
    setPhase('starting');
    const url = await Promise.resolve(resolveUrl()).catch(() => null);
    void markDmMessageViewed(messageId).catch(() => undefined);
    setOpenedAt(new Date());
    setPhase('done');
    if (url) onOpenImage?.(url);
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      className="flex min-w-[200px] items-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-3 text-left transition-colors hover:bg-white/[0.1]"
      data-dm-view-once="closed"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
        {phase === 'starting' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{t('dm.openTimer.tapPhoto', 'Tap to view')}</span>
        <span className="block text-xs text-white/60">{t('dmVideo.destruct.view', '1 view')}</span>
      </span>
    </button>
  );
}
