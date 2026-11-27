/**
 * AudioPostMiniPlayer
 * ===================
 * The corner player for a popped-out audio post. Mounted once, app-wide, and
 * shown when somebody asks for it — the pop-out control beside fullscreen on
 * an audio card. Playing in place is the common case; this is for carrying
 * the track with you while you browse, so it waits to be asked, same rule as
 * the stage recording player.
 *
 * **Pause and close are two different buttons.** The round control holds the
 * track where it is; the X ends playback and dismisses the panel.
 *
 * Bottom left, like the stage recording player, and lifted above it when both
 * are open — the right-hand corner already holds the radio and live-stage
 * players.
 *
 * @module components/app/audio/AudioPostMiniPlayer
 */

import { useTranslation } from 'react-i18next';
import { AudioLines, Loader2, Shuffle, SkipBack, SkipForward } from "lucide-react";
import Pause from "@/components/ui/cut-icons/pause";
import Play from "@/components/ui/cut-icons/play";
import X from "@/components/ui/cut-icons/close";

import { cn } from '@/lib/utils';
import { StaticWaveform } from '@/components/app/audio/StaticWaveform';
import { useStagePlayback } from '@/lib/stage-playback';
import {
  CROSSFADE_STEPS,
  seekAudioPost,
  setAudioCrossfade,
  skipAudioQueue,
  stopAudioPost,
  toggleAudioPost,
  toggleAudioQueueShuffle,
  useAudioPostPlayback,
} from '@/lib/audio-post-playback';

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export function AudioPostMiniPlayer() {
  const { t } = useTranslation();
  const { tokenId, track, isPlaying, isLoading, progress, currentTime, duration, queueLength, queuePos, shuffle, crossfade } =
    useAudioPostPlayback();
  const stage = useStagePlayback();

  if (!tokenId || !track) return null;

  const stageShowing = !!stage.spaceId && stage.popout;

  return (
    <div
      className={cn(
        'fixed left-4 z-50 select-none w-[calc(100vw-2rem)] max-w-sm',
        stageShowing ? 'bottom-48 md:bottom-32' : 'bottom-20 md:bottom-4',
      )}
      role="region"
      aria-label={t('audioPost.cornerPlayer')}
    >
      <div data-glass-mini-audio className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl shadow-2xl p-3">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-9 h-9 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center">
            {track.artworkUrl && !track.artworkUrl.split('?')[0].endsWith('/placeholder.svg') ? (
              <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <AudioLines className="w-4 h-4 text-white/60" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate leading-5">{track.title}</p>
            <p className="text-[11px] text-white/50 truncate tabular-nums leading-4">
              {`${track.artist}  ·  ${formatTime(currentTime)} / ${formatTime(duration)}`}
            </p>
          </div>

          <button
            type="button"
            onClick={toggleAudioPost}
            aria-label={isPlaying ? t('audioPost.pause') : t('audioPost.play')}
            title={isPlaying ? t('audioPost.pause') : t('audioPost.play')}
            className="shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-3.5 h-3.5" fill="currentColor" />
            ) : (
              <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
            )}
          </button>

          <button
            type="button"
            onClick={stopAudioPost}
            aria-label={t('audioPost.stopAndClose')}
            title={t('audioPost.stopAndClose')}
            className="shrink-0 -mr-1 w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className={cn(
            'mt-2 h-8 transition-opacity duration-300',
            isPlaying ? 'opacity-100' : 'opacity-60',
          )}
        >
          <StaticWaveform
            seed={tokenId}
            className="w-full h-full"
            animated={isPlaying}
            volumeLevel={1}
            color="rgba(255,255,255,0.95)"
            progress={progress}
            onSeek={seekAudioPost}
          />
        </div>

        {queueLength > 1 && (
          <div className="mt-2 flex items-center gap-1 text-white" data-audio-queue-controls>
            <button type="button" onClick={() => skipAudioQueue(-1)} aria-label={t('common.previous', { defaultValue: 'Previous' })}
              className="grid size-9 place-items-center rounded-xl hover:bg-white/10">
              <SkipBack className="size-4" fill="currentColor" />
            </button>
            <button type="button" onClick={() => skipAudioQueue(1)} disabled={queuePos + 1 >= queueLength} aria-label={t('common.next', { defaultValue: 'Next' })}
              className="grid size-9 place-items-center rounded-xl hover:bg-white/10 disabled:opacity-40">
              <SkipForward className="size-4" fill="currentColor" />
            </button>
            <button type="button" onClick={toggleAudioQueueShuffle} aria-pressed={shuffle} aria-label={t('audioPost.shuffle', { defaultValue: 'Shuffle' })}
              className={cn('grid size-9 place-items-center rounded-xl hover:bg-white/10', shuffle ? 'text-white bg-white/15' : 'text-white/50')}>
              <Shuffle className="size-4" />
            </button>
            <span className="ml-1 text-[11px] text-white/50 tabular-nums">{queuePos + 1}/{queueLength}</span>
            <button type="button"
              onClick={() => setAudioCrossfade(CROSSFADE_STEPS[(CROSSFADE_STEPS.indexOf(crossfade as typeof CROSSFADE_STEPS[number]) + 1) % CROSSFADE_STEPS.length])}
              aria-label={t('audioPost.crossfade', { defaultValue: 'Crossfade' })}
              className={cn('ml-auto h-8 rounded-xl px-2.5 text-[11px] font-semibold hover:bg-white/10', crossfade ? 'bg-white/15 text-white' : 'text-white/50')}>
              {t('audioPost.crossfade', { defaultValue: 'Crossfade' })} {crossfade ? `${crossfade}s` : t('assistant.off', { defaultValue: 'Off' })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
