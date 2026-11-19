/**
 * State gallery (?notifs=1): real notification rows, the old way (preview
 * only, as before the server attached the comment) and the new way (the
 * comment whole with Reply / Like / Tip). No network: every row is fixture.
 */
import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RequestCommentView, RequestView } from '@/lib/notification-request';
import { AuthContext, type AuthContextType } from '@/contexts/AuthContext';
import { NotificationItem, type BundledNotification } from '@/pages/app/NotificationsPage';
import type { DeHubNotification } from '@/lib/api/dehub/notifications';

const VIEWER = '0x00000000000000000000000000000000000000aa';
const AUTH = { isAuthenticated: true, walletAddress: VIEWER, user: null, openLoginModal: () => {} } as unknown as AuthContextType;
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function rows(withComment: boolean): DeHubNotification[] {
  const base = (id: string, extra: Partial<DeHubNotification>): DeHubNotification => ({
    id, address: VIEWER, category: 'engagement', read: false, createdAt: ago(4), updatedAt: ago(4),
    content: '', ...extra,
  } as DeHubNotification);
  const reply = 'Honestly this is the cleanest edit you have posted all year. The colour on the second half is unreal, how long did the grade take? I want to try the same look on my next trip clip.';
  const comment = 'Saving this for later. The bit at 0:42 where the light hits the water, chef\'s kiss.';
  return [
    base('g-1', {
      type: 'comment_reply', actorAddress: '0x1111111111111111111111111111111111111111', actorUsername: 'ada',
      content: 'ada replied to your comment', tokenId: 2008, tokenTitle: 'Golden hour in Lisbon', commentId: 783,
      commentPreview: reply.slice(0, 150),
      ...(withComment ? { comment: { id: 783, tokenId: 2008, address: '0x1111111111111111111111111111111111111111', content: reply, likeCount: 4, replyCount: 2, myReaction: null } } : {}),
    }),
    base('g-2', {
      type: 'comment', actorAddress: '0x2222222222222222222222222222222222222222', actorUsername: 'noor',
      content: 'noor commented on your post', tokenId: 2008, tokenTitle: 'Golden hour in Lisbon', commentId: 790,
      commentPreview: comment, createdAt: ago(38), updatedAt: ago(38),
      ...(withComment ? { comment: { id: 790, tokenId: 2008, address: '0x2222222222222222222222222222222222222222', content: comment, imageUrl: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=640&q=70', likeCount: 12, replyCount: 0, myReaction: 'like', isLiked: true } } : {}),
    }),
    base('g-3', {
      type: 'like', read: true, actorAddress: '0x3333333333333333333333333333333333333333', actorUsername: 'kai',
      content: 'kai liked your post', tokenId: 2008, tokenTitle: 'Golden hour in Lisbon', createdAt: ago(120), updatedAt: ago(120),
    }),
  ];
}

/** Requests board, follows, lives and likes: every kind that got its own controls. */
function moreRows(): DeHubNotification[] {
  const base = (id: string, extra: Partial<DeHubNotification> & Record<string, unknown>): DeHubNotification => ({
    id, address: VIEWER, category: 'engagement', read: false, createdAt: ago(6), updatedAt: ago(6),
    content: '', ...extra,
  } as DeHubNotification);
  return [
    base('custom_m-1', {
      type: 'feature_request_comment' as DeHubNotification['type'], actorAddress: '0x4444444444444444444444444444444444444444', actorUsername: 'araf',
      tokenTitle: 'Dark mode for the wallet', _customReferenceId: 'req-1', _customReferenceTitle: 'Dark mode for the wallet', _customCommentId: 'rc-1',
    }),
    base('custom_m-2', {
      type: 'feature_request_new' as DeHubNotification['type'], actorAddress: '0x5555555555555555555555555555555555555555', actorUsername: 'mira',
      tokenTitle: 'Pin a comment on my own post', _customReferenceId: 'req-2', _customReferenceTitle: 'Pin a comment on my own post', createdAt: ago(25), updatedAt: ago(25),
    }),
    base('m-3', {
      type: 'following', actorAddress: '0x6666666666666666666666666666666666666666', actorUsername: 'jonas', createdAt: ago(50), updatedAt: ago(50),
      actor: { address: '0x6666666666666666666666666666666666666666', username: 'jonas', isFollowing: false, followsYou: true },
    }),
    base('m-4', {
      type: 'livestream_start' as DeHubNotification['type'], actorAddress: '0x7777777777777777777777777777777777777777', actorUsername: 'clips',
      tokenId: 2100, tokenTitle: 'Late night build stream', createdAt: ago(3), updatedAt: ago(3),
    }),
    base('m-5', {
      type: 'like', read: true, actorAddress: '0x3333333333333333333333333333333333333333', actorUsername: 'kai',
      tokenId: 2008, tokenTitle: 'Golden hour in Lisbon', tokenThumbnail: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=640&q=70',
      createdAt: ago(120), updatedAt: ago(120),
    }),
  ];
}

const REQUEST_COMMENT: RequestCommentView = {
  id: 'rc-1', featureRequestId: 'req-1', walletAddress: '0x4444444444444444444444444444444444444444', username: 'araf',
  content: 'Yes please. The wallet is the only screen still blinding me at night, everything else follows the theme now. Even a plain black version would do.',
  mediaUrl: null, mediaType: null, likeCount: 3, myReaction: null,
};
const REQUEST: RequestView = {
  id: 'req-2', title: 'Pin a comment on my own post',
  description: 'Let me pin one comment to the top of my own post, so the answer to the question everyone asks stays first instead of getting buried under 200 replies.',
  imageUrl: null, authorAddress: '0x5555555555555555555555555555555555555555', voteCount: 7, commentCount: 2,
};

export function NotificationRowsGallery() {
  const enriched = useMemo(() => new Map(), []);
  const queryClient = useQueryClient();
  useMemo(() => {
    queryClient.setQueryData(['notification-request-comment', 'rc-1', VIEWER], REQUEST_COMMENT);
    queryClient.setQueryData(['notification-request', 'req-2'], REQUEST);
    queryClient.setQueryData(['feature-request-votes', VIEWER], {});
  }, [queryClient]);
  const sets = useMemo(() => [
    { label: 'Before', items: rows(false) },
    { label: 'After', items: rows(true) },
    { label: 'More kinds', items: moreRows() },
  ], []);
  return (
    <AuthContext.Provider value={AUTH}>
      <div className="mb-5 grid max-w-4xl gap-4 md:grid-cols-2">
        {sets.map((set) => (
          <section key={set.label} data-notif-gallery={set.label.toLowerCase()} data-notifications-page className="rounded-xl border border-white/[0.12] p-2">
            <p className="px-3 pb-1 text-xs uppercase tracking-wider opacity-60">{set.label}</p>
            <div data-notification-list>
              {set.items.map((n) => {
                const bundle: BundledNotification = {
                  primary: n, allIds: [n.id], allNotifications: [n], postCount: 1,
                  actorNames: [n.actorUsername || ''], actorCount: 1, bundleType: 'single',
                };
                return (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    bundle={bundle}
                    onMarkAsRead={() => {}}
                    isMarkingAsRead={false}
                    enrichedAvatars={enriched}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </AuthContext.Provider>
  );
}
