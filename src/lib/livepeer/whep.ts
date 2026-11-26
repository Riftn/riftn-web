/**
 * WHEP subscriber (WebRTC-HTTP Egress Protocol)
 * =============================================
 * Plays a Livepeer stream over WebRTC instead of HLS.
 *
 * HLS runs 10-20 seconds behind the broadcaster — it is a playlist of finished
 * segments, and the player needs a few of them buffered before it starts. That
 * delay is invisible on a recorded video and ruinous on a live one: a viewer
 * tips or asks a question about something that happened twenty seconds ago,
 * and the host answers into a room that has not seen it yet. WebRTC playback
 * lands around a second, which is what makes chat and tipping feel live.
 *
 * Same shape as the publisher in whip.ts, mirrored:
 *   POST {base}/{playbackId}   Content-Type: application/sdp   body: SDP offer
 *     -> 201 Created, body: SDP answer, Location: session resource URL
 *   DELETE {resource}   ends the session
 *
 * Not every stream can be played this way — a region without a nearby node, a
 * viewer behind a UDP-hostile network, an older recording — so callers must
 * keep the HLS path as a fallback rather than treating this as the only route.
 */

import { createLogger } from '@/lib/logger';
import { ICE_SERVERS, waitForIceGathering, resolveSessionResource } from './ice';
import { whepHangUpUrl } from '@/lib/live-ingest';
import { NO_RELAY_CANDIDATE } from '@/lib/live/whep-memory';

const logger = createLogger('WHEP');

/** Overridable so a self-hosted catalyst can be pointed at without a rebuild. */
const WHEP_BASE_URL =
  import.meta.env.VITE_LIVEPEER_WHEP_URL || 'https://livepeer.studio/webrtc';

/**
 * How long a viewer's offer waits for its candidates.
 *
 * Direct: the ingest has a public address, so the viewer's own (host)
 * candidates are all it needs; it learns the rest from the first packet. A
 * reflexive one is worth a moment, not the three seconds a network with STUN
 * shut used to cost before the offer even left.
 *
 * Relayed: the relay candidate is the whole point, and it sits behind a TLS
 * handshake. None by the cap means the relay is not reachable from here, and
 * an offer without it only repeats the direct attempt.
 */
const DIRECT_GATHER_CAP_MS = 600;
const RELAY_GATHER_CAP_MS = 2000;

export type WhepState = 'connecting' | 'playing' | 'reconnecting' | 'failed' | 'closed';

export interface WhepSubscription {
  /** Attach this to a <video> via srcObject. */
  stream: MediaStream;
  stop: () => Promise<void>;
  /**
   * Re-point state events at a new owner. A session handed from the feed card
   * to the post page keeps running; only who hears about it changes.
   */
  setStateListener: (listener?: (state: WhepState, detail?: string) => void) => void;
}

export interface SubscribeOptions {
  playbackId: string;
  /**
   * Full WHEP endpoint. Given, it is used verbatim. The self-hosted ingest
   * puts the stream name in the path and the verb in a suffix, which no
   * amount of base-URL juggling can reach from the Livepeer shape.
   */
  endpoint?: string;
  /**
   * Extra ICE servers (a TURN relay) appended to the STUN defaults — the
   * media leg of the relayed path for networks that cannot reach the ingest
   * address directly. The browser still prefers a direct route when one works.
   */
  iceServers?: RTCIceServer[];
  signal?: AbortSignal;
  onStateChange?: (state: WhepState, detail?: string) => void;
}

/**
 * The playback server answered, and the answer was no: the stream is not on
 * air, or it carries something WebRTC cannot (a codec the browser lacks).
 * Asking again, or by another route, gets the same answer, so callers go
 * straight to HLS.
 */
export class WhepRefusedError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`WebRTC playback unavailable (HTTP ${status}).`);
    this.name = 'WhepRefusedError';
    this.status = status;
  }
}

/** Re-exported so callers that already import this module keep one import. */
export { playbackIdFromHlsUrl } from './playback-id';

export async function subscribeToWhep({
  playbackId,
  endpoint: endpointOverride,
  iceServers: extraIceServers,
  signal,
  onStateChange,
}: SubscribeOptions): Promise<WhepSubscription> {
  if (!playbackId) throw new Error('A playback id is required to subscribe.');
  if (signal?.aborted) throw new Error('WHEP subscription cancelled');

  const pc = new RTCPeerConnection({
    iceServers: extraIceServers?.length ? [...ICE_SERVERS, ...extraIceServers] : ICE_SERVERS,
    bundlePolicy: 'max-bundle',
  });
  const stream = new MediaStream();
  let resourceUrl: string | null = null;
  let stopped = false;
  let listener = onStateChange;

  const emit = (state: WhepState, detail?: string) => {
    if (stopped && state !== 'closed') return;
    listener?.(state, detail);
  };

  const deleteResource = async () => {
    const url = resourceUrl;
    resourceUrl = null;
    if (!url) return;
    try {
      await fetch(whepHangUpUrl(url), { method: 'DELETE', keepalive: true });
    } catch {
      // The server times the session out on its own.
    }
  };
  const abort = () => { void stop(); };
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener('abort', abort);
    try { pc.close(); } catch { /* already closed */ }
    listener?.('closed');
    await deleteResource();
  };
  const checkOpen = () => {
    if (stopped) throw new Error('WHEP subscription cancelled');
  };

  signal?.addEventListener('abort', abort);
  emit('connecting');

  try {
    checkOpen();
    // recvonly: this is playback, we never send anything back up.
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.addEventListener('track', (event) => {
      // One MediaStream for both tracks: handing a <video> element two
      // separate streams plays whichever arrived last and drops the other.
      if (!stopped) stream.addTrack(event.track);
    });

    pc.addEventListener('connectionstatechange', () => {
      switch (pc.connectionState) {
        case 'connected':
          emit('playing');
          break;
        case 'disconnected':
          emit('reconnecting');
          break;
        case 'failed':
          emit('failed', 'The WebRTC playback connection was lost.');
          break;
        default:
          break;
      }
    });

    const offer = await pc.createOffer();
    checkOpen();
    await pc.setLocalDescription(offer);
    checkOpen();
    // A relayed run is only worth anything with its TURN candidate in the offer.
    const relayed = !!extraIceServers?.length;
    // Our own ingest gets the offer as soon as there is any candidate at all.
    await waitForIceGathering(pc, relayed ? 'relay' : endpointOverride ? 'any' : 'srflx', relayed ? RELAY_GATHER_CAP_MS : DIRECT_GATHER_CAP_MS, signal);
    checkOpen();
    if (relayed && !/ typ relay/.test(pc.localDescription?.sdp ?? '')) throw new Error(NO_RELAY_CANDIDATE);

    const endpoint =
      endpointOverride || `${WHEP_BASE_URL.replace(/\/$/, '')}/${playbackId}`;
    // Let an in-flight POST return its Location so we can delete a late session.
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription?.sdp ?? '',
    });

    if (!response.ok) throw new WhepRefusedError(response.status);

    resourceUrl = resolveSessionResource(response);
    if (stopped) await deleteResource();
    checkOpen();
    const answer = await response.text();
    checkOpen();
    if (!answer.trim()) throw new Error('The playback server returned an empty answer.');

    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    checkOpen();

    signal?.removeEventListener('abort', abort);
    logger.info('WHEP session opened', { playbackId });
    return {
      stream,
      stop,
      setStateListener: (next) => {
        listener = next;
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
