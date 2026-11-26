import { afterEach, expect, it, vi } from 'vitest';
import { subscribeToWhep } from '@/lib/livepeer/whep';

afterEach(() => vi.unstubAllGlobals());

it('closes a pending peer immediately and deletes a late session without attaching it', async () => {
  const peer = {
    addTransceiver: vi.fn(),
    addEventListener: vi.fn(),
    createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'offer' }),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    setRemoteDescription: vi.fn(),
    localDescription: { sdp: 'offer' },
    iceGatheringState: 'complete',
    close: vi.fn(),
  };
  vi.stubGlobal('RTCPeerConnection', function Peer() { return peer; });
  vi.stubGlobal('MediaStream', function Stream() {});
  let finishPost!: (response: Response) => void;
  const fetchMock = vi.fn()
    .mockImplementationOnce(() => new Promise((resolve) => { finishPost = resolve; }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  const endpoint = 'https://example.test/live/whep';
  const resource = endpoint + '/old';
  const opened = subscribeToWhep({ playbackId: 'live', endpoint, signal: controller.signal });
  const rejected = expect(opened).rejects.toThrow('WHEP subscription cancelled');
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  controller.abort();
  expect(peer.close).toHaveBeenCalledTimes(1);
  finishPost(new Response('answer', { status: 201, headers: { Location: resource } }));
  await rejected;
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenLastCalledWith(resource, { method: 'DELETE', keepalive: true });
  expect(peer.setRemoteDescription).not.toHaveBeenCalled();
});
