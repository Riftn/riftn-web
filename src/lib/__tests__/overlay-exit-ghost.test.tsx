import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useState } from 'react';
import { exitFor, ghostOverlayExit } from '@/lib/overlay-exit-ghost';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

describe('exitFor', () => {
  const el = document.createElement('div');
  it('sends a bottom sheet back down', () => {
    expect(exitFor(el, rect(0, 400, 390, 444), 390, 844)).toEqual({ kind: 'slide', dx: 0, dy: 468 });
  });
  it('sends a right side panel back right', () => {
    expect(exitFor(el, rect(1000, 0, 280, 800), 1280, 800)).toMatchObject({ kind: 'slide', dy: 0 });
    expect((exitFor(el, rect(1000, 0, 280, 800), 1280, 800) as { dx: number }).dx).toBeGreaterThan(0);
  });
  it('fades a centred card or menu', () => {
    expect(exitFor(el, rect(400, 200, 480, 300), 1280, 800)).toEqual({ kind: 'pop' });
    expect(exitFor(el, rect(20, 60, 200, 160), 390, 844)).toEqual({ kind: 'pop' });
  });
  it('follows a vaul drawer direction', () => {
    const d = document.createElement('div');
    d.setAttribute('data-vaul-drawer', '');
    d.setAttribute('data-vaul-drawer-direction', 'bottom');
    expect(exitFor(d, rect(0, 0, 390, 844), 390, 844)).toMatchObject({ kind: 'slide', dx: 0 });
  });
});

describe('ghostOverlayExit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const stubLayout = () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(0, 400, 1024, 368));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = vi.fn(() => ({ finished: new Promise(() => {}) }));
    (HTMLElement.prototype as unknown as { getAnimations: unknown }).getAnimations = () => [];
  };

  it('leaves an inert copy in place of the closing surface, then removes it', () => {
    vi.useFakeTimers();
    stubLayout();
    const host = document.createElement('div');
    host.innerHTML = '<div id="x" role="dialog"><input name="q" /><p>Hi</p></div>';
    document.body.appendChild(host);
    ghostOverlayExit(host.firstElementChild as HTMLElement);
    const ghost = document.querySelector('[data-overlay-ghost]');
    expect(ghost).not.toBeNull();
    expect(ghost!.hasAttribute('inert')).toBe(true);
    expect(ghost!.querySelector('#x')).toBeNull();
    expect(ghost!.querySelector('input')!.hasAttribute('name')).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(document.querySelector('[data-overlay-ghost]')).toBeNull();
    vi.useRealTimers();
  });

  it('copies a dialog while it is still on screen when it closes', () => {
    stubLayout();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button data-testid="close" onClick={() => setOpen(false)}>close</button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent><DialogTitle>Title</DialogTitle><p data-testid="body">Body</p></DialogContent>
          </Dialog>
        </>
      );
    }
    const { getByTestId, queryByTestId } = render(<Harness />);
    expect(queryByTestId('body')).not.toBeNull();
    act(() => { getByTestId('close').click(); });
    // The real dialog is gone at once; only the frozen copy carrying the exit is left.
    const bodies = document.querySelectorAll('[data-testid="body"]');
    expect(bodies.length).toBe(1);
    expect(bodies[0].closest('[data-overlay-ghost]')).not.toBeNull();
    const ghosts = document.querySelectorAll('[data-overlay-ghost]');
    expect(ghosts.length).toBeGreaterThan(0);
    expect(Array.from(ghosts).some((g) => g.textContent?.includes('Body'))).toBe(true);
  });
});
