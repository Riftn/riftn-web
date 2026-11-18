/**
 * State gallery (?notifs=1): real notification rows, the old way (preview
 * only, as before the server attached the comment) and the new way (the
 * comment whole with Reply / Like / Tip). No network: every row is fixture.
 */
import { useMemo } from 'react';
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

export function NotificationRowsGallery() {
  const enriched = useMemo(() => new Map(), []);
  const sets = useMemo(() => [
    { label: 'Before', items: rows(false) },
    { label: 'After', items: rows(true) },
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
