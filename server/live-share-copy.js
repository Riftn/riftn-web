/**
 * Title and description for a live stream's link, in the crawler page and on
 * the share card. A live post used to share with the generic post template
 * (`Read "glo is live", a post by pureglo on Riftn, the open source,
 * user-owned social network. Topics: web3.`), which reads like an article.
 * A link to a stream should say what the person will find when they open it:
 * the stream itself while it is on air, the recording once it has ended.
 */

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/**
 * 'live', 'upcoming', 'replay' or 'ended' for a live post; '' for anything
 * else. `stream.recording` only counts once the capture is `ready` (see
 * extractReplayUrl in src/lib/live-replay.ts): a skipped or failed capture
 * leaves nothing to watch.
 */
export function liveShareState(post, now = Date.now()) {
  if (!post || post.postType !== 'live') return '';
  const stream = post.stream && typeof post.stream === 'object' ? post.stream : {};
  const status = String(stream.status || '').toUpperCase();
  if (status === 'LIVE' || (stream.isActive === true && status !== 'ENDED')) return 'live';
  const scheduled = Date.parse(stream.scheduledFor || '');
  if (status === 'SCHEDULED' || (!stream.startedAt && scheduled > now)) return 'upcoming';
  const recording = stream.recording;
  if (recording && recording.status === 'ready' && recording.url) return 'replay';
  return 'ended';
}

/** A title the go-live sheet wrote for the streamer (`pureglo is live`) says nothing once the stream is over. */
export function saysOnlyLive(title) {
  return !title || /\bis (?:now )?live\b/i.test(title);
}

function streamDate(post) {
  const stream = (post && post.stream) || {};
  const date = new Date(stream.startedAt || post.createdAt || '');
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * `{ state, title, description }` for a live post, or null for any other
 * post. `name` is the streamer as the page names them (display name first).
 * Titles stay within `titleMax`; a stream with its own title keeps it in
 * front so two replays from one streamer never share a <title>.
 */
export function liveShareCopy(post, name, { titleMax = 70, now = Date.now() } = {}) {
  const state = liveShareState(post, now);
  if (!state) return null;
  const who = clean(name) || clean(post.minterDisplayName || post.mintername || post.minterUsername) || 'A creator';
  const caption = clean(post.name || post.title);
  const quoted = caption ? ` "${caption}"` : '';
  const date = streamDate(post);
  const fit = (...candidates) => candidates.find((c) => c && c.length <= titleMax) || candidates[candidates.length - 1];

  if (state === 'live') {
    return { state, title: fit(`${who} is live on Riftn`, `${who} is live`), description: `Watch ${who} live on Riftn now!${quoted}` };
  }
  if (state === 'upcoming') {
    return {
      state,
      title: fit(`${who} is going live on Riftn`, `${who} is going live`),
      description: `${who} is going live on Riftn soon!${quoted}`,
    };
  }
  const own = !saysOnlyLive(caption);
  const about = own ? `: "${caption}".` : '.';
  const streamed = date ? ` Streamed on ${date}.` : '';
  if (state === 'replay') {
    return {
      state,
      title: own
        ? fit(`${caption} | ${who}'s live replay on Riftn`, `${caption} | ${who} on Riftn`, caption)
        : fit(`${who}'s live replay on Riftn${date ? `, ${date}` : ''}`, `${who}'s live replay on Riftn`, `${who}'s live replay`),
      description: `Watch ${who}'s live replay on Riftn${about}${streamed}`,
    };
  }
  return {
    state,
    title: own
      ? fit(`${caption} | ${who} was live on Riftn`, `${caption} | ${who} on Riftn`, caption)
      : fit(`${who} was live on Riftn${date ? `, ${date}` : ''}`, `${who} was live on Riftn`, `${who} was live`),
    description: `${who} was live on Riftn${date ? ` on ${date}` : ''}${about} Follow ${who} to catch the next stream live.`,
  };
}
