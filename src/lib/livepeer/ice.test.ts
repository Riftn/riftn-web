import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ICE_GATHERING_TIMEOUT_MS, waitForIceGathering } from './ice';

function fakePeer() {
  const target = new EventTarget();
  return Object.assign(target, { iceGatheringState: 'gathering' }) as unknown as RTCPeerConnection & EventTarget;
}

const candidate = (type: string) => Object.assign(new Event('icecandidate'), { candidate: { type } });

describe('waiting for candidates', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lets a viewer stop waiting at its own cap', async () => {
    const done = vi.fn();
    void waitForIceGathering(fakePeer(), 'srflx', 600).then(done);
    await vi.advanceTimersByTimeAsync(590);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(done).toHaveBeenCalled();
  });

  it('keeps the long cap where none is given', async () => {
    const done = vi.fn();
    void waitForIceGathering(fakePeer(), 'srflx').then(done);
    await vi.advanceTimersByTimeAsync(ICE_GATHERING_TIMEOUT_MS - 10);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(done).toHaveBeenCalled();
  });

  it('still leaves early once the wanted candidate is there', async () => {
    const pc = fakePeer();
    const done = vi.fn();
    void waitForIceGathering(pc, 'srflx', 600).then(done);
    pc.dispatchEvent(candidate('host'));
    await vi.advanceTimersByTimeAsync(200);
    expect(done).not.toHaveBeenCalled();
    pc.dispatchEvent(candidate('srflx'));
    await vi.advanceTimersByTimeAsync(160);
    expect(done).toHaveBeenCalled();
  });
});
