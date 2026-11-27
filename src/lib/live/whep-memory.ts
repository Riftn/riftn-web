/**
 * Streams whose WebRTC answered but never sent a picture
 * ======================================================
 * Some broadcasts negotiate WebRTC fine and then deliver no frames (an
 * encoder setting WebRTC can't carry, a host whose media port is shut). The
 * player only learns that by waiting, and that wait sat in front of every
 * open of the stream. Once a stream has been silent on this device, skip
 * straight to HLS for a while; a stream that did play over WebRTC is
 * forgotten here so it gets the fast path again.
 */
const KEY = 'dehub.live.whepSilent';
const ROUTE_KEY = 'dehub.live.whepRouteBlocked';
const FORGET_AFTER_MS = 30 * 60_000;

type Marks = Record<string, number>;

function read(key: string): Marks {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as Marks) : {};
    const now = Date.now();
    for (const [id, at] of Object.entries(parsed)) if (now - at > FORGET_AFTER_MS) delete parsed[id];
    return parsed;
  } catch {
    return {};
  }
}

function write(key: string, next: Marks) {
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* Private mode or storage off: every open just tries WebRTC again. */
  }
}

export function whepRecentlySilent(playbackId: string | null | undefined): boolean {
  return !!playbackId && playbackId in read(KEY);
}

export function rememberWhepSilent(playbackId: string | null | undefined) {
  if (!playbackId) return;
  write(KEY, { ...read(KEY), [playbackId]: Date.now() });
}

export function forgetWhepSilent(playbackId: string | null | undefined) {
  if (!playbackId) return;
  const current = read(KEY);
  if (!(playbackId in current)) return;
  delete current[playbackId];
  write(KEY, current);
}

/**
 * Networks that carry no WebRTC media
 * ===================================
 * The same lesson one level up. On a network that drops the media (UDP shut,
 * a filtered hosting range) the ingest still answers the offer, and every
 * live opened there waited out the same dead connect before its picture
 * came another way. So the route that got an answer and no media is noted
 * for this device, and the next live starts on the one after it: the relay,
 * then HLS. Half an hour, because a phone changes network all day.
 *
 * Only the self-hosted ingest has two routes; a Livepeer stream is always
 * tried directly.
 */
export type WhepRoute = 'direct' | 'relay';

export function whepRouteBlocked(route: WhepRoute): boolean {
  return route in read(ROUTE_KEY);
}

export function rememberWhepRouteBlocked(route: WhepRoute) {
  write(ROUTE_KEY, { ...read(ROUTE_KEY), [route]: Date.now() });
}

export function forgetWhepRouteBlocked(route: WhepRoute) {
  const current = read(ROUTE_KEY);
  if (!(route in current)) return;
  delete current[route];
  write(ROUTE_KEY, current);
}

/**
 * Why a relayed attempt stopped before its offer was sent: the relay gave no
 * candidate, so the offer would only have repeated the direct one. Here, not
 * beside the subscriber that throws it, so the card can read it without
 * pulling the peer-connection code onto its own chunk.
 */
export const NO_RELAY_CANDIDATE = 'no relay candidate';

/** The WebRTC route a live should open on from this network; null means HLS. */
export function firstWhepRoute(selfHosted: boolean): WhepRoute | null {
  if (!selfHosted || !whepRouteBlocked('direct')) return 'direct';
  return whepRouteBlocked('relay') ? null : 'relay';
}

/** A real picture, not the 2x2 placeholder a silent WebRTC track reports. */
export function hasRealPicture(video: HTMLVideoElement): boolean {
  return video.videoWidth >= 16 && video.videoHeight >= 16;
}
