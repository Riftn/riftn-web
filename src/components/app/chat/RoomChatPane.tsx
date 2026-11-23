/**
 * A group, channel or community chat opened inside Chat, beside DMs and the
 * public chat. The message list and composer are the community chat itself
 * (CommunityChat), so the chat tab on the community page and this pane are
 * one piece of code: a change to one is a change to both.
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import ArrowLeft from '@/components/ui/cut-icons/back';
import Users from '@/components/ui/cut-icons/communities';
import Megaphone from '@/components/ui/cut-icons/advertising';
import { CommunityChat } from '@/components/app/communities/CommunityChat';
import { useIsCommunityMember, isMembershipLoading, type Community } from '@/hooks/use-communities';
import { isEffectivelyActive } from '@/hooks/use-community-admin';
import { communityKindOf } from '@/lib/community-kinds';
import { storageImage, deviceWidth } from '@/lib/media-url';

import { formatCount } from '@/lib/format-count';
export function RoomChatPane({ community, onBack }: { community: Community; onBack: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const membershipQuery = useIsCommunityMember(community.id);
  const membership = membershipQuery.data;
  const isMember = isEffectivelyActive(membership);
  const kind = communityKindOf(community);
  const KindIcon = kind === 'channel' ? Megaphone : Users;
  const pageUrl = `/app/communities/${community.slug}`;

  return (
    <div data-room-chat-pane={kind} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('common.back', 'Back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => navigate(pageUrl)}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 py-0.5 text-left hover:bg-white/[0.04]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.08]">
            {community.avatar_url
              ? <img src={storageImage(community.avatar_url, deviceWidth(36))} alt="" className="h-full w-full object-cover" />
              : <KindIcon className="h-5 w-5 text-white/80" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-white">{community.name}</span>
            <span className="block truncate text-xs text-zinc-500">
              {t('communities.chat.paneMembers', { defaultValue: '{{formattedCount}} members', count: community.member_count ?? 0, formattedCount: formatCount(community.member_count ?? 0) })}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate(pageUrl)}
          title={t('communities.chat.openPage', 'Open the community page')}
          aria-label={t('communities.chat.openPage', 'Open the community page')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <CommunityChat
          key={community.id}
          fill
          communityId={community.id}
          community={community}
          membership={membership}
          isMember={isMember}
          membershipLoading={isMembershipLoading(membershipQuery)}
          onJoin={() => navigate(`${pageUrl}?tab=chat`)}
        />
      </div>
    </div>
  );
}
