import { useTranslation as _useCopy } from 'react-i18next';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Loader2, RotateCcw } from "lucide-react";
import Music from "@/components/ui/cut-icons/music";

import Pause from "@/components/ui/cut-icons/pause";
import Play from "@/components/ui/cut-icons/play";

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { SoundCreditLink } from './SoundCreditLink';
import { releaseSoundWindow, soundCredit } from '@/lib/sound-window';

interface Props {
  title?: string;
  creator?: string;
  /** The song's link; carries the credit for songs from outside libraries. */
  url?: string;
  playing: boolean;
  loading: boolean;
  error: boolean;
  toggle: () => void;
  audioRef?: RefObject<HTMLAudioElement | null>;
  /** overlay: the idle capsule on the photo.
   *  bar: the player docked under the photo while the song plays.
   *  inline: the capsule alone, for places with no photo edge to run along. */
  layout?: 'overlay' | 'bar' | 'inline';
}

function useProgress(audioRef: RefObject<HTMLAudioElement | null> | undefined, active: boolean) {
  const [state, setState] = useState({ current: 0, duration: 0 });
  const read = useCallback(() => {
    const a = audioRef?.current;
    const duration = a && a.duration > 0 && Number.isFinite(a.duration) ? a.duration : 0;
    const current = duration ? a!.currentTime : 0;
    setState(prev => prev.current === current && prev.duration === duration ? prev : { current, duration });
  }, [audioRef]);
  useEffect(() => {
    if (!active) return;
    read();
    const id = window.setInterval(read, 250);
    return () => window.clearInterval(id);
  }, [read, active]);
  return { ...state, read };
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function SoundtrackControl({ title, creator, url, playing, loading, error, toggle, audioRef, layout = 'overlay' }: Props) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const action = error ? t('explorePage.retry') : loading ? t('common.cancel') : playing ? t('audioPost.pause') : t('audioPost.play');
  const name = title || t('feed.music');
  const label = `${action}: ${name}${creator ? ` — ${creator}` : ''}`;
  const open = playing || loading;
  const { current, duration, read } = useProgress(audioRef, open && layout === 'bar');
  const onClick = (event: React.MouseEvent) => { event.stopPropagation(); toggle(); };

  // The seek bar has to catch its own pointer: left click-through, a drag
  // along it landed on the post underneath and opened it.
  const [scrub, setScrub] = useState<number | null>(null);
  const dragging = useRef(false);
  const fractionAt = (el: HTMLElement, clientX: number) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 ? Math.min(1, Math.max(0, (clientX - box.left) / box.width)) : 0;
  };
  const seek = (seconds: number) => {
    const a = audioRef?.current;
    if (!a || !duration) return;
    // Moving through the song themselves means the listener wants the whole
    // song, not the post's part: without this the part's guard pulled every
    // seek past its end straight back to the start.
    releaseSoundWindow(a);
    a.currentTime = Math.min(duration, Math.max(0, seconds));
    read();
  };
  const onScrubDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!duration) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setScrub(fractionAt(event.currentTarget, event.clientX));
  };
  const onScrubMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) setScrub(fractionAt(event.currentTarget, event.clientX));
  };
  const onScrubUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!dragging.current) return;
    dragging.current = false;
    seek(fractionAt(event.currentTarget, event.clientX) * duration);
    setScrub(null);
  };
  const onScrubCancel = () => { dragging.current = false; setScrub(null); };
  const onScrubKey = (event: React.KeyboardEvent) => {
    const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[event.key];
    const to = step !== undefined ? current + step : event.key === 'Home' ? 0 : event.key === 'End' ? duration : null;
    if (to === null || !duration) return;
    event.preventDefault();
    event.stopPropagation();
    seek(to);
  };
  const progress = scrub ?? (duration ? current / duration : 0);

  const icon = loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    : error ? <RotateCcw className="h-4 w-4" aria-hidden="true" />
    : playing ? <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
    : <Play className="h-4 w-4 translate-x-px fill-current" aria-hidden="true" />;

  if (layout === 'bar') {
    const shown = scrub === null ? current : scrub * duration;
    const hasCredit = !!soundCredit(url);
    return (
      <div data-glass-embed className="dh-soundbar flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-white">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/10 text-white/70" aria-hidden="true">
          <span className={cn('dh-sound-eq', playing && 'is-playing')}><i /><i /><i /><i /></span>
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">{name}</span>
          {hasCredit
            ? <SoundCreditLink url={url} creator={creator} className="block truncate text-xs text-white/50" />
            : creator && <span className="block truncate text-xs text-white/50">{creator}</span>}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="w-9 shrink-0 text-[11px] tabular-nums text-white/50">{clock(shown)}</span>
            <div
              role="slider"
              tabIndex={0}
              aria-label={_copy("copy.67ae3405bcd4", { defaultValue: "Seek" })}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(shown)}
              aria-valuetext={_copy("copy.a48c498b8725", { defaultValue: "{{value1}} of {{value2}}", value1: clock(shown), value2: clock(duration) })}
              data-no-navigate
              data-no-swipe
              onPointerDown={onScrubDown}
              onPointerMove={onScrubMove}
              onPointerUp={onScrubUp}
              onPointerCancel={onScrubCancel}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={onScrubKey}
              className="group relative flex-1 cursor-pointer touch-none rounded py-2 outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <div className="relative h-1 rounded-full bg-white/15">
                <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progress * 100}%` }} />
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  style={{ left: `${progress * 100}%`, opacity: scrub !== null ? 1 : undefined }}
                />
              </div>
            </div>
            <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/50">{duration ? clock(duration) : '–:––'}</span>
          </div>
        </div>
        <button
          type="button"
          data-no-navigate
          aria-label={label}
          aria-pressed={playing}
          onClick={onClick}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-black transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {icon}
        </button>
      </div>
    );
  }

  const capsule = (
    <button
      type="button"
      data-no-navigate
      data-keep-dark
      aria-label={label}
      aria-pressed={playing}
      onClick={onClick}
      className={cn(
        'dh-sound-glass pointer-events-auto flex h-9 max-w-full items-center gap-2 rounded-full px-3 text-white transition-[width,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
        layout === 'overlay' && 'mb-2 ml-2',
      )}
    >
      {playing ? (
        <span className="dh-sound-eq is-playing" aria-hidden="true"><i /><i /><i /><i /></span>
      ) : error ? <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        : loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        : <Music className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 max-w-[10rem] truncate text-xs font-semibold">{name}</span>
      {playing ? <Pause className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden="true" /> : !error && !loading && <Play className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden="true" />}
    </button>
  );
  return capsule;
}
