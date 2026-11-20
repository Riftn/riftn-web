/**
 * Live reaction arrival
 * =====================
 * A reaction landing on a chat line, yours or somebody else's, used to change
 * a number and nothing else. Every chat chip (live chat, the side panel, DMs,
 * groups, community rooms) now draws its emoji through `ReactionGlyph`, which
 * notices the moment a reaction arrives and plays it:
 *
 *   - the emoji itself moves once (Noto animated emoji, the flame flickers,
 *     the heart beats), all the way to its last frame, and then melts back
 *     into the still glyph;
 *   - the chip answers with the arrival motion picked in Settings (fly in by
 *     default, pop, burst, or off);
 *   - the number rolls up (`RollingCount`).
 *
 * What counts as an arrival: the chip's count went up while it was on screen,
 * or a chip appeared on a message that was already on screen. History, older
 * pages, a re-mounted list and a reset never play, so opening a busy chat is
 * quiet. A message tells the system it is on screen with `useReactionHost`.
 *
 * Effects that leave the chip (the flight, the burst) are painted on a layer
 * on <body>, never inside the chat list, so a scroll box or a bubble edge
 * cannot clip them (same rule as the double-tap hearts, lib/tap-reactions).
 * Reduced-motion viewers get the count change only.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { InlineEmoji } from '@/components/app/emoji/EmojiText';
import {
  animatedChatEmojiSrc,
  paintReactionArrival,
  prefersReducedMotion,
  reactionMotionStyle,
  withEmojiClip,
  type EmojiClip,
} from '@/lib/chat-reaction-motion';
import './reaction-arrival.css';

/** After its last frame the moving emoji rests this long, then melts into the still one. */
const REST_MS = 140;
const MELT_MS = 240;
/** The moving emoji is put in place this long before a flying copy lands, so it is drawn by then. */
const MOUNT_LEAD_MS = 50;
/** A chip that shows up on a message this soon after the message did is history, not news. */
const HOST_SETTLE_MS = 700;

const hostSeenAt = new Map<string, number>();
const chipsSeen = new Set<string>();

/** Call once per rendered chat message, before its reactions. */
export function useReactionHost(messageId: string | undefined | null) {
  if (messageId && !hostSeenAt.has(messageId)) hostSeenAt.set(messageId, Date.now());
}

function hostAge(messageId: string): number {
  const at = hostSeenAt.get(messageId);
  return at === undefined ? 0 : Date.now() - at;
}

function includes(list: readonly string[], me: string | undefined): boolean {
  if (!me) return false;
  const low = me.toLowerCase();
  return list.some((a) => a.toLowerCase() === low);
}

interface ClipPlay {
  id: number;
  url: string;
  ms: number;
  /** A flying copy is landing on top, so it appears at once instead of fading in. */
  covered: boolean;
}
let playIds = 0;

/**
 * Plays a clip once over the still emoji and hands back to it.
 *
 * `stage` is where the hand-over is: `idle` (still emoji), `on` (clip drawn,
 * still emoji hidden), `melt` (clip fading out over the still emoji fading
 * in). The still emoji only goes once the clip has actually been decoded,
 * and the end is timed from that moment on a copy of the file that plays a
 * single time, so the motion always reaches its last frame.
 */
export function useClipPlayer() {
  const [play, setPlay] = useState<ClipPlay | null>(null);
  const [stage, setStage] = useState<'idle' | 'on' | 'melt'>('idle');
  const state = useRef({ play: null as ClipPlay | null, stage: 'idle' as 'idle' | 'on' | 'melt', timer: 0, alive: true });

  const drop = (p: ClipPlay | null) => { if (p) window.setTimeout(() => URL.revokeObjectURL(p.url), 200); };
  useEffect(() => {
    const s = state.current;
    s.alive = true;
    return () => {
      s.alive = false;
      clearTimeout(s.timer);
      drop(s.play);
    };
  }, []);

  const set = (p: ClipPlay | null, st: 'idle' | 'on' | 'melt') => {
    state.current.play = p;
    state.current.stage = st;
    setPlay(p);
    setStage(st);
  };

  /** Starts the clip unless one is already running (a pile-on lets it finish). */
  const start = useCallback((clip: EmojiClip, covered: boolean) => {
    const s = state.current;
    if (!s.alive || (s.play && s.stage !== 'melt')) return;
    clearTimeout(s.timer);
    drop(s.play);
    set({ id: ++playIds, url: URL.createObjectURL(clip.once), ms: clip.ms, covered }, 'idle');
    // A picture that never decodes must not leave a play pending for ever.
    s.timer = window.setTimeout(() => { drop(s.play); set(null, 'idle'); }, 4000);
  }, []);

  /** The clip's first frame is drawn: it takes over from the still emoji and its run is timed from here. */
  const drawn = useCallback((id: number) => {
    const s = state.current;
    if (!s.alive || s.play?.id !== id || s.stage !== 'idle') return;
    clearTimeout(s.timer);
    set(s.play, 'on');
    s.timer = window.setTimeout(() => {
      set(s.play, 'melt');
      s.timer = window.setTimeout(() => { drop(s.play); set(null, 'idle'); }, MELT_MS + 40);
    }, s.play.ms + REST_MS);
  }, []);

  const busy = useCallback(() => !!state.current.play && state.current.stage !== 'melt', []);
  return { play, stage, start, drawn, busy };
}

interface ReactionGlyphProps {
  messageId: string;
  emoji: string;
  /** Everyone on this chip, in order. A longer list than last render is an arrival. */
  addresses: readonly string[];
  /** The viewer, to tell their own reaction apart (it gets the bigger moment). */
  me?: string;
  className?: string;
}

export function ReactionGlyph({ messageId, emoji, addresses, me, className }: ReactionGlyphProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const before = useRef<readonly string[] | null>(null);
  const { play, stage, start, drawn } = useClipPlayer();
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useLayoutEffect(() => {
    const prev = before.current;
    before.current = addresses;
    let arrived = false;
    let mine = false;
    if (prev === null) {
      const key = `${messageId}|${emoji}`;
      const known = chipsSeen.has(key);
      chipsSeen.add(key);
      if (!known && hostAge(messageId) > HOST_SETTLE_MS) {
        arrived = true;
        mine = includes(addresses, me);
      }
    } else if (addresses.length > prev.length) {
      arrived = true;
      mine = includes(addresses, me) && !includes(prev, me);
    }
    const style = reactionMotionStyle();
    if (!arrived || !ref.current || prefersReducedMotion() || style === 'off') return;

    const el = ref.current;
    const fresh = prev === null;
    const flies = style === 'fly' || (style === 'burst' && mine);
    let landAt = 0;
    const go = (clip: EmojiClip | null) => {
      if (!mounted.current || !el.isConnected) return;
      const chip = (el.closest('[data-chat-reaction-chip]') as HTMLElement | null) ?? el;
      const plan = paintReactionArrival({ chip, glyph: el, emoji, mine, clip, fresh });
      landAt = Date.now() + plan.landMs;
      if (!clip || plan.played) return;
      if (plan.landMs === 0) { start(clip, false); return; }
      window.setTimeout(() => { if (mounted.current) start(clip, true); }, Math.max(0, plan.landMs - MOUNT_LEAD_MS));
    };
    // First use of this emoji: its place stays empty for the moment the file takes, then it arrives as usual.
    let hold: Animation | null = null;
    const now = withEmojiClip(
      animatedChatEmojiSrc(emoji),
      (clip) => { hold?.cancel(); go(clip); },
      // The file came after the reaction had already set off: play it in the chip once that has landed.
      (clip) => window.setTimeout(() => { if (mounted.current && Date.now() - landAt < 1500) start(clip, false); }, Math.max(0, landAt - Date.now())),
    );
    if (!now && fresh && flies) hold = el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 400 });
    // Only a change in who reacted can be an arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses]);

  return (
    <span ref={ref} data-reaction-glyph className="relative inline-flex items-center">
      <span className="dehub-reaction-still inline-flex items-center" data-covered={stage === 'on' ? (play?.covered ? 'now' : 'fade') : undefined}>
        <InlineEmoji value={emoji} className={className} />
      </span>
      {play && (
        <img
          key={play.id}
          src={play.url}
          alt=""
          aria-hidden="true"
          draggable={false}
          onLoad={() => drawn(play.id)}
          data-show={stage === 'on' ? (play.covered ? 'now' : 'fade') : stage === 'melt' ? 'out' : undefined}
          className="dehub-reaction-clip"
        />
      )}
    </span>
  );
}

/** A reaction count that rolls to its new value instead of swapping in place. */
export function RollingCount({ value, className }: { value: number; className?: string }) {
  const prev = useRef(value);
  const [roll, setRoll] = useState<{ from: number; up: boolean; id: number } | null>(null);
  useLayoutEffect(() => {
    if (prev.current === value) return;
    const from = prev.current;
    prev.current = value;
    if (prefersReducedMotion()) return;
    setRoll({ from, up: value > from, id: Date.now() });
    const t = window.setTimeout(() => setRoll(null), 460);
    return () => clearTimeout(t);
  }, [value]);
  if (!roll) return <span className={className}>{value}</span>;
  return (
    <span key={roll.id} className={cn('dehub-roll relative inline-flex overflow-hidden', className)} data-dir={roll.up ? 'up' : 'down'}>
      <span className="dehub-roll-in">{value}</span>
      <span className="dehub-roll-out absolute inset-0" aria-hidden="true">{roll.from}</span>
    </span>
  );
}
