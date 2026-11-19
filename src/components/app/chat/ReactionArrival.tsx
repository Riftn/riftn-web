/**
 * Live reaction arrival
 * =====================
 * A reaction landing on a chat line, yours or somebody else's, used to change
 * a number and nothing else. Every chat chip (live chat, the side panel, DMs,
 * groups, community rooms) now draws its emoji through `ReactionGlyph`, which
 * notices the moment a reaction arrives and plays it:
 *
 *   - the emoji itself moves once (Noto animated emoji, the flame flickers,
 *     the heart beats) and then settles back to the still glyph;
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

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { InlineEmoji } from '@/components/app/emoji/EmojiText';
import {
  animatedChatEmojiMs,
  animatedChatEmojiSrc,
  freshPlayUrl,
  paintReactionArrival,
  prefersReducedMotion,
  reactionMotionStyle,
} from '@/lib/chat-reaction-motion';
import './reaction-arrival.css';

/** The longest the moving emoji plays before it hands back to the still glyph. */
const PLAY_CAP_MS = 2600;
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
  const [playing, setPlaying] = useState<string | null>(null);
  const playToken = useRef(0);
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
    if (!arrived || !ref.current || prefersReducedMotion() || reactionMotionStyle() === 'off') return;

    const el = ref.current;
    const chip = (el.closest('[data-chat-reaction-chip]') as HTMLElement | null) ?? el;
    const src = animatedChatEmojiSrc(emoji);
    const play = ++playToken.current;
    paintReactionArrival({ chip, glyph: el, emoji, mine, src });
    if (!src) return;
    void freshPlayUrl(src).then((url) => {
      if (!url) return;
      if (!mounted.current || play !== playToken.current) { URL.revokeObjectURL(url); return; }
      setPlaying(url);
      window.setTimeout(() => {
        if (mounted.current && play === playToken.current) setPlaying(null);
        window.setTimeout(() => URL.revokeObjectURL(url), 100);
      }, Math.min(PLAY_CAP_MS, animatedChatEmojiMs(src)));
    });
    // Only a change in who reacted can be an arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses]);

  return (
    <span ref={ref} data-reaction-glyph className="relative inline-flex items-center">
      <span className={cn('inline-flex items-center', playing && 'opacity-0')}>
        <InlineEmoji value={emoji} className={className} />
      </span>
      {playing && (
        <img
          src={playing}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="dehub-reaction-playing pointer-events-none absolute left-1/2 top-1/2 h-[1.35em] w-[1.35em] max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
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
