import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatReactionSummary } from '@/lib/api/dehub/chat-prefs';
import { InlineEmoji } from '@/components/app/emoji/EmojiText';
import { animatedChatEmojiSrc, paintReactionArrival, prefersReducedMotion } from '@/lib/chat-reaction-motion';
import { useChatReactionStyle } from '@/lib/chat-reaction-style';
import { cn } from '@/lib/utils';

/** A badge that shows up this soon after its row did is what was already waiting, not news. */
const ROW_SETTLE_MS = 700;
const rowSeenAt = new Map<string, number>();
const totalSeen = new Map<string, number>();

/**
 * Reactions to your lines that you haven't seen, in the Chat list. No pill:
 * the emojis sit bare where the unread number would be, up to three stacked,
 * with the total when there are several ("❤️😂🔥 12").
 *
 * They move like reactions do inside a chat (Settings > Appearance >
 * "Reactions in chat"): the Noto animated emoji keeps playing while the
 * reaction is unread, and a new one landing while the list is open arrives
 * with the picked motion (fly in by default, pop, burst). Off, or reduced
 * motion, shows still emojis.
 */
export function ReactionAlertBadge({ reactions, className, rowKey }: { reactions?: ChatReactionSummary | null; className?: string; rowKey?: string }) {
  const { t } = useTranslation();
  const style = useChatReactionStyle();
  const ref = useRef<HTMLSpanElement>(null);
  if (rowKey && !rowSeenAt.has(rowKey)) rowSeenAt.set(rowKey, Date.now());
  const total = reactions?.total ?? 0;
  const lastEmoji = reactions?.last?.emoji ?? reactions?.emojis[0]?.emoji ?? '';

  useLayoutEffect(() => {
    if (!rowKey || !(total > 0)) return;
    const seen = totalSeen.get(rowKey);
    totalSeen.set(rowKey, total);
    const settled = Date.now() - (rowSeenAt.get(rowKey) ?? Date.now()) > ROW_SETTLE_MS;
    const arrived = seen === undefined ? settled : total > seen;
    if (!arrived || !ref.current || style === 'off' || prefersReducedMotion()) return;
    const glyph = (ref.current.querySelector('[data-reaction-alert-emoji]') as HTMLElement | null) ?? ref.current;
    paintReactionArrival({ chip: ref.current, glyph, emoji: lastEmoji, mine: false, src: animatedChatEmojiSrc(lastEmoji) });
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
              aria-hidden="true"
              className={cn('relative inline-flex h-[20px] w-[20px] items-center justify-center text-[16px] leading-none', i > 0 && '-ml-1')}
              style={{ zIndex: shown.length - i }}
            >
              {src ? (
                <img src={src} alt="" draggable={false} className="pointer-events-none h-[20px] w-[20px] max-w-none select-none object-contain" />
              ) : (
                <InlineEmoji value={e.emoji} />
              )}
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
