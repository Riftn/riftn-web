import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useVideoProcessingProgress } from '@/hooks/use-video-processing-status';

interface TranscodingBadgeProps {
  tokenId: string | number;
  /** The creator's own post: say that nobody else sees it yet. */
  isOwner?: boolean;
}

/**
 * What sits over a video post that cannot play yet. Only its creator is
 * shown such a post (the API holds it back from everyone else), so this is
 * their progress card: "Transcoding 42%" with a bar, and a line saying the
 * post appears for others once it plays.
 */
export function TranscodingBadge({ tokenId, isOwner = false }: TranscodingBadgeProps) {
  const { t } = useTranslation();
  const progress = useVideoProcessingProgress(tokenId);
  const percent = typeof progress === 'number' ? Math.max(0, Math.min(99, Math.round(progress))) : undefined;
  return (
    <div data-transcoding-badge data-keep-dark className="flex w-[min(240px,70%)] flex-col items-center gap-2 text-center">
      <div className="flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden />
        <span className="text-sm font-semibold text-white drop-shadow" aria-live="polite">
          {t('videoPlayer.transcoding')}
          {percent !== undefined && percent > 0 && <span className="tabular-nums"> {percent}%</span>}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div
          className={percent ? 'h-full rounded-full transition-[width] duration-700 ease-out' : 'h-full w-1/3 rounded-full animate-pulse'}
          // Inline so no theme recolours the fill: it sits on the dimmed poster in every theme.
          style={{ backgroundColor: percent ? '#fff' : 'rgba(255,255,255,0.8)', ...(percent ? { width: `${Math.max(4, percent)}%` } : {}) }}
        />
      </div>
      {isOwner && <span className="text-xs text-white/80 drop-shadow">{t('videoPlayer.transcodingOnlyYou')}</span>}
    </div>
  );
}
