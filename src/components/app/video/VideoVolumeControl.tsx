import { useCallback, useEffect, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Whether this browser lets a page set a video's volume. iPhone and iPad
 * Safari keep `volume` at 1 whatever the page writes (the hardware buttons
 * own it), so a slider there would move and change nothing: those keep the
 * plain mute toggle.
 */
let volumeSettable: boolean | null = null;
export function canSetMediaVolume(): boolean {
  if (volumeSettable !== null) return volumeSettable;
  try {
    const probe = document.createElement('audio');
    probe.volume = 0.5;
    volumeSettable = Math.abs(probe.volume - 0.5) < 0.01;
  } catch {
    volumeSettable = false;
  }
  return volumeSettable;
}
/** Tests only. */
export function resetMediaVolumeProbe(value: boolean | null = null) { volumeSettable = value; }

/** How long a finger sits on the speaker before it means volume, not mute. */
export const VOLUME_HOLD_MS = 300;
/** Finger travel that covers the whole range once the hold has landed. */
const HOLD_TRAVEL_PX = 120;
/** Movement under this before the hold lands is still a tap. */
const SLOP_PX = 8;
/** A touch-opened slider tucks away after this long untouched. */
const TOUCH_IDLE_CLOSE_MS = 2200;
/** The mouse can cross the gap between speaker and slider in this time. */
const HOVER_CLOSE_MS = 350;
const KEY_STEP = 0.05;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export type VolumeLayout = 'beside' | 'below' | 'above';

interface Props {
  /** Saved level, 0 to 1. */
  volume: number;
  /** Muted shows as zero, so the speaker icon and the slider always agree. */
  muted: boolean;
  /** A tap or click on the speaker. */
  onToggleMute: (event: MouseEvent<HTMLButtonElement>) => void;
  /** A new level from the slider, already clamped. 0 means muted. */
  onVolume: (level: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `beside` slides a slim slider out to the right of the speaker (a control
   * row). `below` and `above` pop a short upright one under or over it (a
   * corner button, or a button on a bottom bar).
   */
  layout: VolumeLayout;
  /** The speaker glyph. */
  children: ReactNode;
  label: string;
  sliderLabel: string;
  className?: string;
  buttonClassName?: string;
  buttonStyle?: CSSProperties;
  /** Extra data attributes for the button (theme hooks). */
  buttonData?: Record<`data-${string}`, string | boolean | undefined>;
  wrapperData?: Record<`data-${string}`, string | boolean | undefined>;
}

/**
 * The video speaker with its volume slider.
 *
 * Mouse: hover the speaker and the slider comes out; click still mutes.
 * Touch: a quick tap mutes; press and hold, and the slider pops up and follows
 * the finger (up or right is louder) without lifting it. Where the browser
 * will not let a page set the volume (iPhone and iPad), the speaker only mutes.
 */
export function VideoVolumeControl({
  volume, muted, onToggleMute, onVolume, open, onOpenChange, layout, children, label, sliderLabel,
  className, buttonClassName, buttonStyle, buttonData, wrapperData,
}: Props) {
  const level = muted ? 0 : clamp(volume);
  const percent = Math.round(level * 100);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const touchOpened = useRef(false);
  const hold = useRef({ x: 0, y: 0, start: 0, held: false, moved: false, suppressClickUntil: 0 });
  const latest = useRef({ level, onVolume, onOpenChange, open });
  latest.current = { level, onVolume, onOpenChange, open };

  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);
  const closeAfter = useCallback((ms: number) => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      if (dragging.current) return;
      touchOpened.current = false;
      latest.current.onOpenChange(false);
    }, ms);
  }, [cancelClose]);
  const clearHold = () => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; } };
  useEffect(() => () => { cancelClose(); clearHold(); }, [cancelClose]);

  // Touch: hold, then drag. Native listeners because the move handler has to
  // be allowed to cancel scrolling once the hold has landed, and React's
  // touch listeners are passive.
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const finger = event.touches[0];
      hold.current = { ...hold.current, x: finger.clientX, y: finger.clientY, held: false, moved: false };
      clearHold();
      if (!canSetMediaVolume()) return;
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        if (hold.current.moved) return;
        hold.current.held = true;
        hold.current.start = latest.current.level;
        touchOpened.current = true;
        dragging.current = true;
        cancelClose();
        latest.current.onOpenChange(true);
        try { navigator.vibrate?.(8); } catch { /* not every browser */ }
      }, VOLUME_HOLD_MS);
    };
    const onMove = (event: TouchEvent) => {
      const finger = event.touches[0];
      if (!finger) return;
      const dx = finger.clientX - hold.current.x;
      const dy = finger.clientY - hold.current.y;
      if (!hold.current.held) {
        // Moving before the hold lands is a scroll, never a volume change.
        if (Math.hypot(dx, dy) > SLOP_PX) { hold.current.moved = true; clearHold(); }
        return;
      }
      if (event.cancelable) event.preventDefault();
      const travel = layout === 'beside' ? dx : -dy;
      latest.current.onVolume(clamp(hold.current.start + travel / HOLD_TRAVEL_PX));
    };
    const onEnd = (event: TouchEvent) => {
      clearHold();
      if (!hold.current.held) return;
      hold.current.held = false;
      dragging.current = false;
      // The lifted finger must not also count as a tap on the speaker.
      hold.current.suppressClickUntil = Date.now() + 600;
      if (event.cancelable) event.preventDefault();
      closeAfter(TOUCH_IDLE_CLOSE_MS);
    };
    const onCancel = () => {
      clearHold();
      if (hold.current.held) { hold.current.held = false; dragging.current = false; closeAfter(TOUCH_IDLE_CLOSE_MS); }
    };
    button.addEventListener('touchstart', onStart, { passive: true });
    button.addEventListener('touchmove', onMove, { passive: false });
    button.addEventListener('touchend', onEnd, { passive: false });
    button.addEventListener('touchcancel', onCancel);
    return () => {
      button.removeEventListener('touchstart', onStart);
      button.removeEventListener('touchmove', onMove);
      button.removeEventListener('touchend', onEnd);
      button.removeEventListener('touchcancel', onCancel);
    };
  }, [layout, cancelClose, closeAfter]);

  // A slider a finger opened closes on a tap anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: globalThis.PointerEvent) => {
      if (!touchOpened.current || event.pointerType === 'mouse') return;
      if (wrapRef.current?.contains(event.target as Node)) return;
      touchOpened.current = false;
      cancelClose();
      latest.current.onOpenChange(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, cancelClose]);

  const levelAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return level;
    return layout === 'beside'
      ? clamp((event.clientX - rect.left) / (rect.width || 1))
      : clamp((rect.bottom - event.clientY) / (rect.height || 1));
  };

  const onTrackDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    dragging.current = true;
    cancelClose();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* old browsers */ }
    onVolume(levelAt(event));
  };
  const onTrackMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    event.stopPropagation();
    onVolume(levelAt(event));
  };
  const onTrackUp = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!dragging.current) return;
    dragging.current = false;
    if (event.pointerType !== 'mouse' || touchOpened.current) closeAfter(TOUCH_IDLE_CLOSE_MS);
    else if (!wrapRef.current?.matches(':hover')) closeAfter(HOVER_CLOSE_MS);
  };
  const onTrackKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? KEY_STEP
      : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -KEY_STEP : null;
    if (step !== null) onVolume(clamp(level + step));
    else if (event.key === 'Home') onVolume(0);
    else if (event.key === 'End') onVolume(1);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const vertical = layout !== 'beside';
  const track = (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={open ? 0 : -1}
      aria-label={sliderLabel}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      data-volume-slider
      className={cn('relative shrink-0 cursor-pointer touch-none select-none outline-none focus-visible:ring-1 focus-visible:ring-white/70 rounded-full',
        vertical ? 'h-[84px] w-6' : 'h-6 w-[64px]')}
      onPointerDown={onTrackDown}
      onPointerMove={onTrackMove}
      onPointerUp={onTrackUp}
      onPointerCancel={onTrackUp}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={onTrackKey}
    >
      <span aria-hidden="true" className={cn('absolute rounded-full bg-white/30', vertical ? 'left-1/2 -translate-x-1/2 top-0 bottom-0 w-1' : 'top-1/2 -translate-y-1/2 left-0 right-0 h-1')} />
      <span aria-hidden="true" className={cn('absolute rounded-full bg-white', vertical ? 'left-1/2 -translate-x-1/2 bottom-0 w-1' : 'top-1/2 -translate-y-1/2 left-0 h-1')}
        style={vertical ? { height: `${percent}%` } : { width: `${percent}%` }} />
      <span aria-hidden="true" className="absolute h-3 w-3 rounded-full bg-white shadow-md"
        style={vertical
          ? { left: '50%', bottom: `calc(${percent}% - 6px)`, transform: 'translateX(-50%)' }
          : { top: '50%', left: `calc(${percent}% - 6px)`, transform: 'translateY(-50%)' }} />
    </div>
  );

  return (
    <div
      ref={wrapRef}
      data-volume-hover
      {...wrapperData}
      className={cn(layout === 'beside' ? 'relative flex items-center' : 'relative', className)}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse' || !canSetMediaVolume()) return;
        touchOpened.current = false;
        cancelClose();
        onOpenChange(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse' || touchOpened.current || dragging.current) return;
        closeAfter(HOVER_CLOSE_MS);
      }}
      // Hold-and-drag on the speaker must not start the card's own presses,
      // swipes or long-press menus.
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
      // A long press would otherwise also open the browser's own menu.
      onContextMenu={(event) => { if (hold.current.held || holdTimer.current || Date.now() < hold.current.suppressClickUntil) event.preventDefault(); }}
    >
      <button
        ref={buttonRef}
        type="button"
        {...buttonData}
        aria-label={label}
        className={cn('select-none [-webkit-touch-callout:none]', buttonClassName)}
        style={buttonStyle}
        onClick={(event) => {
          event.stopPropagation();
          if (Date.now() < hold.current.suppressClickUntil) { event.preventDefault(); return; }
          onToggleMute(event);
        }}
      >
        {children}
      </button>
      {layout === 'beside' ? (
        <div
          data-volume-pop
          data-volume-open={open || undefined}
          aria-hidden={!open || undefined}
          className="overflow-hidden transition-[width,opacity] duration-200 ease-out"
          style={{ width: open ? 76 : 0, opacity: open ? 1 : 0 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex h-8 w-[76px] items-center pl-1.5 pr-2">{track}</div>
        </div>
      ) : open ? (
        <div
          data-volume-pop
          data-on-media
          className={cn('absolute left-1/2 z-30 -translate-x-1/2', layout === 'below' ? 'top-full pt-1.5' : 'bottom-full pb-1.5')}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex h-[104px] w-8 items-center justify-center rounded-xl border border-white/10 bg-black/40 backdrop-blur-[24px] backdrop-saturate-[180%]">
            {track}
          </div>
        </div>
      ) : null}
    </div>
  );
}
