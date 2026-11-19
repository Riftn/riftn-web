import { describe, expect, it } from 'vitest';
import { setPrivateCaptionTopic, setShowCaptions, stageCaptionChannel } from '@/lib/stage-captions';

describe('call subtitles', () => {
  it('ride a private channel once the server has named it, and stages keep theirs', () => {
    const room = 'dm-call-11111111-2222-3333-4444-555555555555';
    expect(stageCaptionChannel(room)).toBe(`stage-captions:${room}`);
    setPrivateCaptionTopic(room, 'abc123');
    expect(stageCaptionChannel(room)).toBe('call-captions:abc123');
    expect(stageCaptionChannel('stage-1')).toBe('stage-captions:stage-1');
  });

  it('start off in calls and stay independent of the stage switch', async () => {
    window.localStorage.clear();
    const mod = await import('@/lib/stage-captions');
    const { renderHook } = await import('@testing-library/react');
    const call = renderHook(() => mod.useShowCaptions('call'));
    const stage = renderHook(() => mod.useShowCaptions('stage'));
    expect(call.result.current).toBe(false);
    expect(stage.result.current).toBe(true);
    const { act } = await import('@testing-library/react');
    act(() => setShowCaptions(true, 'call'));
    expect(call.result.current).toBe(true);
    expect(stage.result.current).toBe(true);
    act(() => setShowCaptions(false, 'stage'));
    expect(call.result.current).toBe(true);
    expect(stage.result.current).toBe(false);
  });
});
