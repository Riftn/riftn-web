/**
 * The phone live viewer once its chrome is cleared: nothing but the picture
 * and one small rotate button in the corner. A live can't be paused, so the
 * whole frame is the way back: a tap, or a swipe up, brings the chrome back.
 * The app's LiveStreamPlayer draws the same thing.
 */
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import MessageSquare from '@/components/ui/cut-icons/messages';
import { cn } from '@/lib/utils';

interface Props {
  onRestore: () => void;
  onRotate: () => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  /** Shows the room over the cleared picture, YouTube style. */
  onToggleChat?: () => void;
  chatOpen?: boolean;
}

export function LiveClearedLayer({ onRestore, onRotate, onTouchStart, onTouchEnd, onToggleChat, chatOpen = false }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <div
        data-no-navigate
        data-live-restore
        role="button"
        tabIndex={0}
        aria-label={t('liveAudience.showControls', 'Show controls')}
        className="absolute inset-0 z-40"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={(e) => { e.stopPropagation(); onRestore(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') onRestore(); }}
      />
      {onToggleChat && (
        <button
          type="button"
          data-no-navigate
          data-live-cleared-chat-toggle
          aria-pressed={chatOpen}
          aria-label={chatOpen ? t('stages.hideChat', 'Hide chat') : t('stages.showChat', 'Show chat')}
          onClick={(e) => { e.stopPropagation(); onToggleChat(); }}
          className={cn('absolute bottom-[calc(max(1rem,env(safe-area-inset-bottom))+3.25rem)] right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white backdrop-blur-md', chatOpen ? 'bg-white/25' : 'bg-black/45')}
        >
          <MessageSquare className="h-[18px] w-[18px]" />
        </button>
      )}
      <button
        type="button"
        data-no-navigate
        data-live-rotate
        aria-label={t('liveAudience.rotate', 'Rotate screen')}
        onClick={(e) => { e.stopPropagation(); onRotate(); }}
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur-md"
      >
        <RotateCw className="h-[18px] w-[18px]" />
      </button>
    </>
  );
}
