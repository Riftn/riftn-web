/**
 * A view-once photo sent to me. Never drawn in the chat: a closed tile that
 * opens the picture one time, tells the server (which removes it for both
 * people), and then says "Opened" so it can't be opened again here.
 */
import { useState } from 'react';
import { Eye, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { markDmMessageViewed } from '@/lib/api/dehub/dm';

export function DmViewOncePhoto({
  messageId,
  resolveUrl,
  onOpenImage,
}: {
  messageId: string;
  resolveUrl: () => Promise<string | null | undefined> | string | null | undefined;
  onOpenImage?: (url: string) => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'closed' | 'starting' | 'done'>('closed');

  if (phase === 'done') {
    return (
      <div className="flex min-w-[180px] items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white/60" data-dm-view-once="done">
        <Eye className="h-4 w-4 shrink-0" />
        {t('dm.openTimer.opened', 'Opened')}
      </div>
    );
  }

  const open = async () => {
    if (phase !== 'closed') return;
    setPhase('starting');
    const url = await Promise.resolve(resolveUrl()).catch(() => null);
    void markDmMessageViewed(messageId).catch(() => undefined);
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
