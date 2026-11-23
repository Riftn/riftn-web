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
  onStateChange?: (state: WhepState, detail?: string) => void;
}

/** Re-exported so callers that already import this module keep one import. */
export { playbackIdFromHlsUrl } from './playback-id';

export async function subscribeToWhep({
  playbackId,
  endpoint: endpointOverride,
  iceServers: extraIceServers,
  onStateChange,
}: SubscribeOptions): Promise<WhepSubscription> {
  if (!playbackId) throw new Error('A playback id is required to subscribe.');

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

  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    try {
      pc.close();
    } catch {
      /* already closed */
    }
    if (resourceUrl) {
      try {
        await fetch(whepHangUpUrl(resourceUrl), { method: 'DELETE', keepalive: true });
      } catch {
        // The server times the session out on its own; this is tidiness.
      }
    }
    listener?.('closed');
  };

  emit('connecting');

  try {
    // recvonly: this is playback, we never send anything back up.
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.addEventListener('track', (event) => {
      // One MediaStream for both tracks: handing a <video> element two
      // separate streams plays whichever arrived last and drops the other.
      stream.addTrack(event.track);
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
    await pc.setLocalDescription(offer);
    // A relayed run is only worth anything with its TURN candidate in the offer.
    const relayed = !!extraIceServers?.length;
    await waitForIceGathering(pc, relayed ? 'relay' : 'srflx', relayed ? RELAY_GATHER_CAP_MS : DIRECT_GATHER_CAP_MS);
    if (relayed && !/ typ relay/.test(pc.localDescription?.sdp ?? '')) throw new Error(NO_RELAY_CANDIDATE);

    const endpoint =
      endpointOverride || `${WHEP_BASE_URL.replace(/\/$/, '')}/${playbackId}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription?.sdp ?? '',
    });

    if (!response.ok) {
      throw new Error(`WebRTC playback unavailable (HTTP ${response.status}).`);
    }

    const answer = await response.text();
    if (!answer.trim()) throw new Error('The playback server returned an empty answer.');

    resourceUrl = resolveSessionResource(response);
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });

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
