import { useTranslation } from 'react-i18next';
import type { ChatReactionSummary } from '@/lib/api/dehub/chat-prefs';
import { cn } from '@/lib/utils';

/**
 * Reactions to your lines that you haven't seen, in the Chat list. One
 * reaction shows the emoji itself where the unread number would be; several
 * show up to three emojis stacked with the total, like "❤️😂🔥 12".
 */
export function ReactionAlertBadge({ reactions, className }: { reactions?: ChatReactionSummary | null; className?: string }) {
  const { t } = useTranslation();
  if (!reactions || !(reactions.total > 0)) return null;
  const shown = reactions.emojis.slice(0, 3);
  return (
    <span
      data-reaction-alert
      data-count-badge
      aria-label={t('chatReactions.badgeLabel', { defaultValue: '{{count}} new reactions', count: reactions.total })}
      className={cn('inline-flex h-[20px] shrink-0 items-center rounded-[6px] bg-white pl-1 pr-1 leading-none', className)}
    >
      <span className="flex items-center">
        {shown.map((e, i) => (
          <span
            key={e.emoji}
            aria-hidden="true"
            className={cn('text-[13px] leading-none', i > 0 && '-ml-1')}
            style={{ zIndex: shown.length - i, filter: i > 0 ? 'drop-shadow(-1px 0 0 #fff)' : undefined }}
          >
            {e.emoji}
          </span>
        ))}
      </span>
      {reactions.total > 1 && (
        <span className="ml-1 text-[10px] font-bold tabular-nums text-zinc-950">
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
