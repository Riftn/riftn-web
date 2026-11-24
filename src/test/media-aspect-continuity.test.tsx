import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberVideoAspect, useMediaAspect } from '@/hooks/use-media-aspect';

afterEach(() => vi.unstubAllGlobals());

describe('feed video dimensions', () => {
  it('keeps the video shape after its player unmounts and its cover URL changes', () => {
    rememberVideoAspect('portrait', 9 / 16);
    const view = renderHook(({ poster }) => useMediaAspect(poster, null, undefined, 'portrait'), {
      initialProps: { poster: 'cover-small' },
    });
    expect(view.result.current).toBe(9 / 16);
    view.rerender({ poster: 'cover-large' });
    expect(view.result.current).toBe(9 / 16);
    view.unmount();
    const reopened = renderHook(() => useMediaAspect('custom-wide-cover', null, undefined, 'portrait'));
    expect(reopened.result.current).toBe(9 / 16);
  });

  it('does not carry a previous poster measurement onto a different post', () => {
    const images: Array<{ onload: () => void }> = [];
    vi.stubGlobal('Image', class {
      naturalWidth = 900;
      naturalHeight = 1600;
      onload = () => {};
      constructor() { images.push(this); }
    });
    const view = renderHook(({ poster, id }) => useMediaAspect(poster, null, undefined, id), {
      initialProps: { poster: 'first-cover', id: 'first-post' },
    });
    act(() => images[0].onload());
    expect(view.result.current).toBe(9 / 16);
    view.rerender({ poster: 'second-cover', id: 'second-post' });
    expect(view.result.current).toBe(16 / 9);
  });

  it('keeps a stored shown shape when the cover is another shape', () => {
    const images: Array<{ onload: () => void }> = [];
    vi.stubGlobal('Image', class {
      naturalWidth = 1600;
      naturalHeight = 900;
      onload = () => {};
      constructor() { images.push(this); }
    });
    // A tall clip with a custom wide cover: the frame stays tall and the cover is never probed.
    const shown = renderHook(() => useMediaAspect('wide-cover-on-tall-clip', null, undefined, 'tall-shown', 9 / 16, true));
    expect(shown.result.current).toBe(9 / 16);
    expect(images).toHaveLength(0);
    // A size stored before rotation was applied still gives way to the cover.
    const older = renderHook(() => useMediaAspect('wide-cover-older-size', null, undefined, 'tall-older', 9 / 16, false));
    act(() => images[0].onload());
    expect(older.result.current).toBe(16 / 9);
  });

  it('holds the stored shape when the playing rendition is a few pixels off', () => {
    const view = renderHook(({ intrinsic }) => useMediaAspect(null, intrinsic, undefined, 'near-shape', 394 / 700, true), {
      initialProps: { intrinsic: null as number | null },
    });
    expect(view.result.current).toBe(394 / 700);
    view.rerender({ intrinsic: 360 / 640 });
    expect(view.result.current).toBe(394 / 700);
  });
});
