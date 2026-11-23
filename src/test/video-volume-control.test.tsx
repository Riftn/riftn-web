import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoVolumeControl, VOLUME_HOLD_MS, resetMediaVolumeProbe, type VolumeLayout } from '@/components/app/video/VideoVolumeControl';

// jsdom has no PointerEvent, so `pointerType` would be dropped.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventShim extends MouseEvent {
    pointerType: string; pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? 'mouse';
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventShim;
}

const toggle = vi.fn();
const setLevel = vi.fn();

function Speaker({ layout = 'beside', start = 0.5 }: { layout?: VolumeLayout; start?: number }) {
  const [open, setOpen] = useState(false);
  const [volume, setVolume] = useState(start);
  return (
    <VideoVolumeControl layout={layout} volume={volume} muted={volume === 0}
      onToggleMute={toggle} onVolume={(level) => { setLevel(level); setVolume(level); }}
      open={open} onOpenChange={setOpen} label="Mute" sliderLabel="Volume">
      <span>speaker</span>
    </VideoVolumeControl>
  );
}
const finger = (x: number, y: number) => ({ identifier: 1, clientX: x, clientY: y });
const slider = () => screen.queryByRole('slider', { hidden: true });
const isOpen = () => {
  const pop = document.querySelector('[data-volume-pop]');
  return !!pop && pop.getAttribute('aria-hidden') !== 'true';
};

describe('video volume control', () => {
  beforeEach(() => { toggle.mockClear(); setLevel.mockClear(); resetMediaVolumeProbe(true); });
  afterEach(() => { cleanup(); vi.useRealTimers(); resetMediaVolumeProbe(null); });

  it('slides out on mouse hover and a click still mutes', () => {
    render(<Speaker />);
    const button = screen.getByRole('button', { name: 'Mute' });
    expect(isOpen()).toBe(false);
    fireEvent.pointerEnter(button.parentElement!, { pointerType: 'mouse' });
    expect(isOpen()).toBe(true);
    expect(slider()).toHaveAttribute('aria-valuenow', '50');
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('a quick tap mutes without opening the slider', () => {
    vi.useFakeTimers();
    render(<Speaker layout="below" />);
    const button = screen.getByRole('button', { name: 'Mute' });
    fireEvent.touchStart(button, { touches: [finger(10, 10)] });
    fireEvent.touchEnd(button, { touches: [], changedTouches: [finger(10, 10)] });
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(slider()).toBeNull();
  });

  it('press and hold pops the slider, dragging sets the level, and the lift does not mute', () => {
    vi.useFakeTimers();
    render(<Speaker layout="below" />);
    const button = screen.getByRole('button', { name: 'Mute' });
    fireEvent.touchStart(button, { touches: [finger(10, 100)] });
    act(() => vi.advanceTimersByTime(VOLUME_HOLD_MS));
    expect(slider()).not.toBeNull();
    // Up is louder: 60px of the 120px travel is half the range.
    fireEvent.touchMove(button, { touches: [finger(10, 40)] });
    expect(setLevel).toHaveBeenLastCalledWith(1);
    fireEvent.touchMove(button, { touches: [finger(10, 220)] });
    expect(setLevel).toHaveBeenLastCalledWith(0);
    fireEvent.touchEnd(button, { touches: [], changedTouches: [finger(10, 220)] });
    fireEvent.click(button);
    expect(toggle).not.toHaveBeenCalled();
    expect(slider()).toHaveAttribute('aria-valuenow', '0');
    act(() => vi.advanceTimersByTime(3000));
    expect(slider()).toBeNull();
  });

  it('a finger that moves before the hold lands is scrolling, not volume', () => {
    vi.useFakeTimers();
    render(<Speaker layout="beside" />);
    const button = screen.getByRole('button', { name: 'Mute' });
    fireEvent.touchStart(button, { touches: [finger(10, 10)] });
    fireEvent.touchMove(button, { touches: [finger(10, 60)] });
    act(() => vi.advanceTimersByTime(VOLUME_HOLD_MS));
    expect(isOpen()).toBe(false);
    expect(setLevel).not.toHaveBeenCalled();
  });

  it('keyboard arrows step the level', () => {
    render(<Speaker />);
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Mute' }).parentElement!, { pointerType: 'mouse' });
    fireEvent.keyDown(slider()!, { key: 'ArrowRight' });
    expect(setLevel).toHaveBeenLastCalledWith(0.55);
    fireEvent.keyDown(slider()!, { key: 'Home' });
    expect(setLevel).toHaveBeenLastCalledWith(0);
  });

  it('keeps mute only where the browser will not set the volume (iPhone)', () => {
    resetMediaVolumeProbe(false);
    vi.useFakeTimers();
    render(<Speaker layout="below" />);
    const button = screen.getByRole('button', { name: 'Mute' });
    fireEvent.pointerEnter(button.parentElement!, { pointerType: 'mouse' });
    fireEvent.touchStart(button, { touches: [finger(10, 10)] });
    act(() => vi.advanceTimersByTime(VOLUME_HOLD_MS * 2));
    fireEvent.touchEnd(button, { touches: [], changedTouches: [finger(10, 10)] });
    fireEvent.click(button);
    expect(slider()).toBeNull();
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});
