import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatReactionSummary } from '@/lib/api/dehub/chat-prefs';
import { InlineEmoji } from '@/components/app/emoji/EmojiText';
import { animatedChatEmojiSrc, loadEmojiClip, paintReactionArrival, prefersReducedMotion, withEmojiClip } from '@/lib/chat-reaction-motion';
import { useChatReactionStyle } from '@/lib/chat-reaction-style';
import { cn } from '@/lib/utils';
import './reaction-arrival.css';

/** A badge that shows up this soon after its row did is what was already waiting, not news. */
const ROW_SETTLE_MS = 700;
const rowSeenAt = new Map<string, number>();
const totalSeen = new Map<string, number>();
/** The moving emoji's box in a row, in px. */
const ART_PX = 20;

let loopIds = 0;

/**
 * One emoji of the badge. The still emoji shows until its moving file is
 * drawn, then the two cross over. `restart` going up starts the loop again
 * from its first frame (a new reaction just landed on it); the loop already
 * showing stays until the new one is drawn, so the swap is never blank.
 */
function RowEmoji({ emoji, src, restart }: { emoji: string; src: string | null; restart: number }) {
  const [loops, setLoops] = useState<Array<{ id: number; url: string }>>([]);
  const [drawn, setDrawn] = useState(0);
  const firstId = useRef(0);
  const urls = useRef(new Set<string>());

  useEffect(() => {
    if (!src) { setLoops([]); return; }
    let live = true;
    void loadEmojiClip(src).then((clip) => {
      if (!live || !clip) return;
      const loop = { id: ++loopIds, url: URL.createObjectURL(clip.loop) };
      urls.current.add(loop.url);
      if (!firstId.current) firstId.current = loop.id;
      setLoops((list) => [...list.slice(-1), loop]);
    });
    return () => { live = false; };
  }, [src, restart]);

  // Free the files no longer on screen.
  useEffect(() => {
    const keep = new Set(loops.map((l) => l.url));
    urls.current.forEach((url) => {
      if (keep.has(url)) return;
      urls.current.delete(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 200);
    });
  }, [loops]);
  useEffect(() => {
    const all = urls.current;
    return () => all.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const showing = loops.some((l) => l.id <= drawn);
  return (
    <>
      <span className="dehub-reaction-still inline-flex items-center" data-covered={showing ? 'fade' : undefined}>
        <InlineEmoji value={emoji} />
      </span>
      {loops.map((l) => (
        <img
          key={l.id}
          src={l.url}
          alt=""
          draggable={false}
          onLoad={() => { setDrawn(l.id); setLoops((list) => list.filter((x) => x.id >= l.id)); }}
          data-show={l.id <= drawn ? (l.id === firstId.current ? 'fade' : 'now') : undefined}
          className="dehub-reaction-clip"
          style={{ width: ART_PX, height: ART_PX }}
        />
      ))}
    </>
  );
}

/**
 * Reactions to your lines that you haven't seen, in the Chat list. No pill:
 * the emojis sit bare where the unread number would be, up to three stacked,
 * with the total when there are several ("❤️😂🔥 12").
 *
 * They move like reactions do inside a chat (Settings > Appearance >
 * "Reactions in chat"): the Noto animated emoji keeps playing while the
 * reaction is unread, and a new one landing while the list is open arrives
 * with the picked motion (fly in by default, pop, burst), its loop starting
 * from the first frame as it lands. Off, or reduced motion, shows still
 * emojis.
 */
export function ReactionAlertBadge({ reactions, className, rowKey }: { reactions?: ChatReactionSummary | null; className?: string; rowKey?: string }) {
  const { t } = useTranslation();
  const style = useChatReactionStyle();
  const ref = useRef<HTMLSpanElement>(null);
  const [restarts, setRestarts] = useState<Record<string, number>>({});
  const shownBefore = useRef<string[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  if (rowKey && !rowSeenAt.has(rowKey)) rowSeenAt.set(rowKey, Date.now());
  const total = reactions?.total ?? 0;
  const lastEmoji = reactions?.last?.emoji ?? reactions?.emojis[0]?.emoji ?? '';

  useLayoutEffect(() => {
    const before = shownBefore.current;
    shownBefore.current = reactions?.emojis.map((e) => e.emoji) ?? [];
    if (!rowKey || !(total > 0)) return;
    const seen = totalSeen.get(rowKey);
    totalSeen.set(rowKey, total);
    const settled = Date.now() - (rowSeenAt.get(rowKey) ?? Date.now()) > ROW_SETTLE_MS;
    const arrived = seen === undefined ? settled : total > seen;
    if (!arrived || !ref.current || style === 'off' || prefersReducedMotion()) return;
    const badge = ref.current;
    const fresh = !before.includes(lastEmoji);
    const flies = style === 'fly';
    let hold: Animation | null = null;
    const now = withEmojiClip(animatedChatEmojiSrc(lastEmoji), (clip) => {
      hold?.cancel();
      if (!mounted.current || !badge.isConnected) return;
      const glyph = (badge.querySelector('[data-reaction-alert-emoji]') as HTMLElement | null) ?? badge;
      const plan = paintReactionArrival({ chip: badge, glyph, emoji: lastEmoji, mine: false, clip, fresh, artPx: ART_PX });
      // The row's own emoji starts its loop over as the flying copy lands on it, so the two line up.
      if (clip) window.setTimeout(() => { if (mounted.current) setRestarts((r) => ({ ...r, [lastEmoji]: (r[lastEmoji] ?? 0) + 1 })); }, Math.max(0, plan.landMs - 50));
    });
    if (!now && fresh && flies) {
      const glyph = (badge.querySelector('[data-reaction-alert-emoji]') as HTMLElement | null) ?? badge;
      hold = glyph.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 400 });
    }
    // Only a change in the waiting total can be an arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKey, total]);

  if (!reactions || !(reactions.total > 0)) return null;
  const moving = style !== 'off' && !prefersReducedMotion();
  // The newest reaction leads the stack.
  const ordered = [...reactions.emojis].sort((a, b) => (a.emoji === lastEmoji ? -1 : b.emoji === lastEmoji ? 1 : 0));
  const shown = ordered.slice(0, 3);
  return (
    <span
      ref={ref}
      data-reaction-alert
      data-reaction-alert-style={moving ? 'moving' : 'still'}
      aria-label={t('chatReactions.badgeLabel', { defaultValue: '{{count}} new reactions', count: reactions.total })}
      className={cn('inline-flex h-[22px] shrink-0 items-center leading-none', className)}
    >
      <span className="flex items-center">
        {shown.map((e, i) => {
          const src = moving ? animatedChatEmojiSrc(e.emoji) : null;
          return (
            <span
              key={e.emoji}
              data-reaction-alert-emoji={e.emoji}
              data-reaction-alert-art={src ?? undefined}
              aria-hidden="true"
              className={cn('relative inline-flex h-[20px] w-[20px] items-center justify-center text-[16px] leading-none', i > 0 && '-ml-1')}
              style={{ zIndex: shown.length - i }}
            >
              <RowEmoji emoji={e.emoji} src={src} restart={restarts[e.emoji] ?? 0} />
            </span>
          );
        })}
      </span>
      {reactions.total > 1 && (
        <span data-reaction-alert-total className="ml-1 text-[12px] font-bold tabular-nums text-white">
          {reactions.total > 99 ? '99+' : reactions.total}
        </span>
      )}
    </span>
  );
}

/** The row's preview line while reactions are waiting. */
export function reactionAlertLine(
  t: (key: string, opts: Record<string, unknown>) => string,
  reactions: ChatReactionSummary,
  { named }: { named: boolean },
): string {
  if (reactions.total > 1 && reactions.emojis.length > 1) {
    return t('chatReactions.many', { defaultValue: '{{count}} reactions to your messages', count: reactions.total });
  }
  const emoji = reactions.last.emoji;
  if (reactions.total > 1) {
    return t('chatReactions.manySame', { defaultValue: '{{emoji}} × {{count}} on your messages', emoji, count: reactions.total });
  }
  if (named && reactions.last.name) {
    return t('chatReactions.oneNamed', { defaultValue: '{{name}} reacted {{emoji}} to your message', name: reactions.last.name, emoji });
  }
  return t('chatReactions.one', { defaultValue: 'Reacted {{emoji}} to your message', emoji });
}
