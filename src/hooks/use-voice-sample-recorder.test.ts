import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useVoiceSampleRecorder } from './use-voice-sample-recorder';

afterEach(() => vi.unstubAllGlobals());

it('releases a microphone granted after the drawer closes', async () => {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] };
  let grant!: (stream: unknown) => void;
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: () => new Promise(resolve => { grant = resolve; }) },
  });
  const onSample = vi.fn();
  const hook = renderHook(({ open }) => useVoiceSampleRecorder(open, onSample, vi.fn()), {
    initialProps: { open: true },
  });
  let pending!: Promise<void>;
  act(() => { pending = hook.result.current.startRecording(); });
  hook.rerender({ open: false });
  await act(async () => { grant(stream); await pending; });
  expect(stop).toHaveBeenCalledOnce();
  expect(onSample).not.toHaveBeenCalled();
});
