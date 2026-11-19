/**
 * A group, channel or community chat in the Messages list. Tapping it opens
 * its chat. All three are communities underneath and share one row.
 */

import { useTranslation } from 'react-i18next';
import { BellOff, Pin } from 'lucide-react';
import { isMuted } from '@/hooks/use-chat-prefs';
import { useRowLongPress } from '@/hooks/use-row-long-press';
import type { ChatPref, ChatReactionSummary } from '@/lib/api/dehub/chat-prefs';
import { ReactionAlertBadge, reactionAlertLine } from '@/components/app/chat/ReactionAlertBadge';
import Users from '@/components/ui/cut-icons/communities';
import Megaphone from '@/components/ui/cut-icons/advertising';
import Lock from '@/components/ui/cut-icons/privacy';
import type { Community } from '@/hooks/use-communities';
import { communityKindOf, entryPriceOf } from '@/lib/community-kinds';
import { storageImage, deviceWidth } from '@/lib/media-url';
import dehubCoin from '@/assets/dehub-coin.png';

export function GroupChatRow({ community, onClick, pref, reactions, selected, selecting = false, checked = false, onLongPress }: {
  community: Community;
  onClick: () => void;
  pref?: ChatPref;
  /** Reactions to your messages here that you haven't seen yet. */
  reactions?: ChatReactionSummary | null;
  selected?: boolean;
  /** Picking several chats (right-click, Select): the row shows a tick. */
  selecting?: boolean;
  checked?: boolean;
  /** Phones: holding the row starts picking (or toggles it while picking). */
  onLongPress?: () => void;
}) {
  const { t } = useTranslation();
  const hold = useRowLongPress(onLongPress);
  const kind = communityKindOf(community);
  const KindIcon = kind === 'channel' ? Megaphone : Users;
  const price = entryPriceOf(community);
  const members = { count: community.member_count ?? 0, formattedCount: (community.member_count ?? 0).toLocaleString() };
  const subtitle = kind === 'channel'
    ? t('communities.newChat.channelRow', { defaultValue: 'Channel · {{formattedCount}} members', ...members })
    : kind === 'group'
      ? t('communities.newChat.groupRow', { defaultValue: 'Group · {{formattedCount}} members', ...members })
      : t('communities.newChat.communityRow', { defaultValue: 'Community · {{formattedCount}} members', ...members });

  return (
    <button
      data-chat-list-row
      type="button"
      onClick={() => { if (hold.consumeClick()) return; onClick(); }}
      {...hold.handlers}
      data-group-chat-row={kind}
      data-room-chat-id={community.id}
      data-selected={selected ? '' : undefined}
      data-bulk-checked={selecting ? (checked ? 'true' : 'false') : undefined}
      aria-pressed={selecting ? checked : undefined}
      className={`w-full flex items-center gap-3 p-4 border-t border-white/[0.07] hover:bg-white/[0.04] transition-colors text-left ${(selecting ? checked : selected) ? 'bg-white/[0.06]' : ''}`}
    >
      {selecting && (
        <span
          data-bulk-tick
          aria-hidden="true"
          style={checked ? { background: 'hsl(var(--foreground))', borderColor: 'hsl(var(--foreground))' } : { borderColor: 'hsl(var(--foreground) / 0.35)' }}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
            checked ? '' : 'border-white/30 text-transparent'
          }`}
        >
          {checked && <span className="block h-[6px] w-[10px] -translate-y-px -rotate-45 border-b-2 border-l-2" style={{ borderColor: 'hsl(var(--background))' }} />}
        </span>
      )}
      <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-white/[0.08] flex items-center justify-center">
        {community.avatar_url
          ? <img src={storageImage(community.avatar_url, deviceWidth(48))} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          : <KindIcon className="w-6 h-6 text-white/80" />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 font-semibold text-white truncate">
          <KindIcon className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
          <span className="truncate">{community.name}</span>
          {community.is_private && <Lock className="w-3 h-3 shrink-0 text-zinc-500" />}
          {isMuted(pref) && <BellOff data-chat-row-muted aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-500" />}
          {pref?.pinnedAt && <Pin data-chat-row-pinned aria-hidden="true" className={`${isMuted(pref) ? '' : 'ml-auto'} h-3.5 w-3.5 shrink-0 rotate-45 text-zinc-500`} />}
          {pref?.markedUnread && !reactions && (
            <span data-count-badge data-chat-row-marked-unread aria-label="Unread" className={`${pref?.pinnedAt || isMuted(pref) ? 'ml-1' : 'ml-auto'} h-2.5 w-2.5 shrink-0 rounded-[3px] bg-white`} />
          )}
          <ReactionAlertBadge reactions={reactions} className={pref?.pinnedAt || isMuted(pref) ? 'ml-1' : 'ml-auto'} />
        </span>
        {reactions ? (
          <p data-reaction-alert-line className="text-white font-bold text-sm truncate">{reactionAlertLine(t, reactions, { named: true })}</p>
        ) : (
        <p className="text-zinc-500 text-sm truncate flex items-center gap-1">
          {subtitle}
          {price > 0 && (
            <span className="inline-flex items-center gap-0.5">
              {' · '}<img src={dehubCoin} alt="" className="w-3 h-3" />{price.toLocaleString()}
            </span>
          )}
        </p>
        )}
      </div>
    </button>
  );
}
