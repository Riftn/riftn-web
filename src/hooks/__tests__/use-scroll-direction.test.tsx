import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useStickyNavVisibility', () => {
  let scrollY = 0;
  let pendingFrame: FrameRequestCallback | undefined;
  const flushFrame = () => { const callback = pendingFrame; pendingFrame = undefined; callback?.(0); };

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    scrollY = 0;
    pendingFrame = undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pendingFrame = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => scrollY,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('waits for content to cover the pill gap and only returns at the top', async () => {
    const nav = document.createElement('div');
    nav.dataset.feedNavOuter = '';
    nav.dataset.navReturnTop = '';
    nav.style.position = 'sticky';
    nav.style.top = '44px';
    Object.defineProperties(nav, {
      offsetHeight: { configurable: true, value: 200 },
      offsetParent: { configurable: true, value: document.body },
    });
    document.body.appendChild(nav);

    const { useStickyNavVisibility } = await import('../use-scroll-direction');
    const { result, unmount } = renderHook(() => useStickyNavVisibility());

    // Less than the pill's 200px height + 44px sticky offset: hiding here
    // would expose an empty strip before the list reaches the viewport top.
    act(() => {
      scrollY = 200;
      window.dispatchEvent(new Event('scroll'));
      flushFrame();
    });
    expect(result.current).toBe(true);

    act(() => {
      scrollY = 244;
      window.dispatchEvent(new Event('scroll'));
      flushFrame();
    });
    expect(result.current).toBe(false);

    // A small correction upward while reading must not cover the item again.
    act(() => {
      scrollY = 120;
      window.dispatchEvent(new Event('scroll'));
      flushFrame();
    });
    expect(result.current).toBe(false);

    act(() => {
      scrollY = 0;
      window.dispatchEvent(new Event('scroll'));
      flushFrame();
    });
    expect(result.current).toBe(true);

    unmount();
  });

  it('shows the chrome on arrival and keeps it through the restore scroll until the reader moves', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { useScrollDirection, revealNavChrome } = await import('../use-scroll-direction');
    const { result, unmount } = renderHook(() => useScrollDirection());

    // Scrolled down a profile: the bars hide.
    act(() => {
      scrollY = 300;
      window.dispatchEvent(new Event('scroll'));
      flushFrame();
      scrollY = 900;
      window.dispatchEvent(new Event('scroll'));
      flushFrame();
    });
    expect(result.current).toBe(false);

    // Back to the feed: shown at once, and the feed's own offset coming back
    // (a big jump down) must not hide them again.
    act(() => revealNavChrome());
    expect(result.current).toBe(true);
    act(() => {
      scrollY = 2600;
      window.dispatchEvent(new Event('scroll'));
      flushFrame();
    });
    expect(result.current).toBe(true);

    // The reader scrolls down again: they hide as usual.
    act(() => {
      window.dispatchEvent(Object.assign(new Event('touchstart'), { touches: [{ clientY: 500 }] }));
      window.dispatchEvent(Object.assign(new Event('touchmove'), { touches: [{ clientY: 480 }] }));
    });
    expect(result.current).toBe(false);

    unmount();
  });

  it('leaves desktop alone', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { useScrollDirection, revealNavChrome } = await import('../use-scroll-direction');
    const { result, unmount } = renderHook(() => useScrollDirection());
    act(() => {
      scrollY = 300;
      window.dispatchEvent(new Event('scroll'));
      flushFrame();
      scrollY = 900;
      window.dispatchEvent(new Event('scroll'));
      flushFrame();
    });
    expect(result.current).toBe(false);
    act(() => revealNavChrome());
    expect(result.current).toBe(false);
    unmount();
  });
});
