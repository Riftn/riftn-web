/**
 * The stories row at the top of Home: slim pills.
 *
 * A + key first (opens the create menu), your own Moments while you have
 * some, everyone live right now, then people's Moments with watched ones
 * last. Pills share the row's width; with one or two up they also show who
 * is watching or the Moments themselves. A pill opens the full-screen viewer.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Refresh from '@/components/ui/cut-icons/refresh';
import { useBadgeBalance, useBadgeVisual } from '@/hooks/use-badge-balance';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveNowItems, faceUrlOf, type LiveNowItem } from '@/components/app/feeds/LiveNowBar';
import { useStoriesEnabled } from '@/hooks/use-stories-enabled';
import { useStoryShelf } from '@/hooks/use-story-shelf';
import { useMatureContent } from '@/hooks/use-mature-content';
import { useKidsModeLock } from '@/hooks/use-kids-mode';
import { useStoriesStore } from '@/store/storiesStore';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl, deviceWidth } from '@/lib/media-url';
import type { ShelfEntry } from '@/lib/api/dehub/stories';
import { handleOf, localAge, nameOf, playable } from './story-utils';
import { expectedShelfSeat, rememberShelfSeat, type ShelfSeat } from '@/lib/story-shelf-seat';
import { StoryCreatePill, StoryCreateTile } from './StoryCreatePill';
import { useMomentPreviewsBlurred } from '@/lib/moment-preview-blur';
import { formatCount } from '@/lib/format-count';
import { useLiveAudience } from '@/hooks/use-live-audience';
import { setActivityBarHidden, useActivityShelfPreferences } from '@/lib/activity-shelf-preferences';
import { ActivityShelfMenu, type ActivityMenuRequest, type ActivityTarget } from './ActivityShelfMenu';
import '@/styles/stories.css';
import '@/styles/live-ripple.css';


export function StoryShelf() {
  const { t } = useTranslation();
  const { hidden, dismissed } = useActivityShelfPreferences();
  if (hidden) {
    return (
      <div data-stories data-activity-restore>
        <button type="button" onClick={() => setActivityBarHidden(false)}>
          <Eye size={16} aria-hidden />
          {t('stories.activity.showBar', 'Show activity bar')}
        </button>
      </div>
    );
  }
  return <VisibleStoryShelf dismissed={dismissed} />;
}

type OpenActivityMenu = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, target?: ActivityTarget) => void;

function menuEvents(openMenu: OpenActivityMenu) {
  return {
    onContextMenu: (event: MouseEvent<HTMLElement>) => openMenu(event),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openMenu(event);
    },
  };
}

const liveKey = (item: LiveNowItem) => `${item.kind}:${item.id}`;

function VisibleStoryShelf({ dismissed }: { dismissed: string[] }) {
  const { isAuthenticated, walletAddress, user, openLoginModal } = useAuth();
  const { items: live, open: openLive, loading: liveLoading } = useLiveNowItems();
  const { showMatureContent } = useMatureContent();
  const kidsMode = useKidsModeLock();
  const canSeeMature = isAuthenticated && showMatureContent && !kidsMode;
  const liveHosts = [...new Set(live.map(item => (item.wallet || '').toLowerCase()).filter(Boolean))].sort().slice(0, 100).join(',');
  const { storiesEnabled, storiesSettingLoading } = useStoriesEnabled();
  const { data, isLoading, isError } = useStoryShelf(liveHosts, canSeeMature, storiesEnabled || !!liveHosts);
  const eligibleLive = live.filter(item => !dismissed.includes(liveKey(item)) && data?.liveHosts?.includes((item.wallet || '').toLowerCase()));
  const openViewer = useStoriesStore(s => s.openViewer);
  const openCreator = useStoriesStore(s => s.openCreator);
  const pending = useStoriesStore(s => s.pending);
  const [menu, setMenu] = useState<ActivityMenuRequest | null>();
  const closeMenu = useCallback(() => setMenu(null), []);
  const openMenu: OpenActivityMenu = (event, target) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    const anchor = event.target instanceof Element ? event.target.closest('button') ?? event.currentTarget : event.currentTarget;
    const rect = anchor.getBoundingClientRect();
    const point = 'clientX' in event && (event.clientX || event.clientY)
      ? { x: event.clientX, y: event.clientY }
      : { x: rect.left, y: rect.bottom };
    setMenu({ point, target });
  };
  const menuElement = menu !== undefined && <ActivityShelfMenu request={menu} onClose={closeMenu} />;
  const createPill = () => <><div {...menuEvents(openMenu)}><StoryCreatePill /></div>{menuElement}</>;

  const shelf = useMemo(() => data?.shelf ?? [], [data]);
  const own = shelf.find(e => e.own) ?? null;
  // What the viewer can page through: your own day when it has something, then everyone else.
  const watchable = useMemo(
    () => shelf.map(e => ({ ...e, items: playable(e.items).filter(item => !dismissed.includes(`story:${item.id}`) && (canSeeMature || !item.isMature)) })).filter(e => e.items.length > 0),
    [shelf, canSeeMature, dismissed],
  );
  const others = watchable.filter(e => !e.own);
  const ownWatchable = watchable.find(e => e.own) ?? null;

  // Fetch the viewer's code while the shelf is on screen, so the first tap opens at once.
  const hasMoments = watchable.length > 0;
  useEffect(() => {
    if (!storiesEnabled || !hasMoments) return;
    const id = window.setTimeout(() => void import('./StoriesHost'), 1500);
    return () => window.clearTimeout(id);
  }, [storiesEnabled, hasMoments]);

  // Until the Stories setting and the first shelf are in, the seat keeps the
  // shape it had last visit (row of loading tiles, ask bar, or nothing), the
  // same one the boot skeleton drew.
  const waiting = storiesSettingLoading || (isLoading && !data);
  const hidden = (!storiesEnabled || (!isAuthenticated && others.length === 0 && !isLoading)) && eligibleLive.length === 0;
  // Signed in and nobody has a Moment up (yours included): a thin pill that
  // invites you to create takes the row's place instead of a lone tile.
  const hasOwnMoment = !!own?.items.some(item => !dismissed.includes(`story:${item.id}`));
  const bare = storiesEnabled && isAuthenticated && !isLoading && !pending && !hasOwnMoment
    && others.length === 0 && eligibleLive.length === 0;
  const seat: ShelfSeat = hidden ? 'none' : bare ? 'ask' : 'row';
  // Lives arrive a beat after the shelf, and the shelf then checks their
  // hosts again. Until both are in, "nothing up" is not an answer yet.
  const vetting = !!data && !isError && (data.askedHosts ?? '') !== liveHosts;
  const nothingYet = eligibleLive.length === 0 && others.length === 0 && !hasOwnMoment;
  const holding = eligibleLive.length === 0 && (waiting || ((liveLoading || vetting) && nothingYet));
  // The seat on screen stays put while holding: what the last visit (or the
  // last settled answer this visit) had, so the feed under it never moves.
  const heldSeat = useRef<ShelfSeat>(expectedShelfSeat());
  if (!holding) heldSeat.current = seat;
  // The loading skeletons read this to hold the right seat on the next visit.
  useEffect(() => {
    if (!holding) rememberShelfSeat(seat);
  }, [holding, seat]);
  if (holding) {
    const lastSeat = heldSeat.current;
    if (lastSeat === 'none') return null;
    if (lastSeat === 'ask' && isAuthenticated) return createPill();
    if (lastSeat === 'ask') return null;
    return (
      <>
        <div data-stories data-story-shelf data-no-swipe role="list" aria-busy="true" {...menuEvents(openMenu)}>
          {isAuthenticated && <StoryCreateTile />}
          {[0, 1, 2].map(index => <LoadingPill key={index} />)}
        </div>
        {menuElement}
      </>
    );
  }
  if (hidden) return null;
  if (bare) return createPill();

  const openEntry = (entry: ShelfEntry, el: HTMLElement) => {
    const index = watchable.findIndex(e => e.author.address === entry.author.address);
    if (index >= 0) openViewer(watchable, index, { from: el.getBoundingClientRect() });
  };
  const storyTarget = (entry: ShelfEntry, element: HTMLElement): ActivityTarget => ({
    kind: 'story',
    ids: entry.items.map(item => `story:${item.id}`),
    open: () => openEntry(entry, element),
    creator: entry.own ? undefined : { address: entry.author.address, name: nameOf(entry.author) },
  });

  const addMoment = () => (isAuthenticated ? openCreator() : openLoginModal());

  const showMe = storiesEnabled && isAuthenticated && !!(pending || ownWatchable);
  const shownOthers = storiesEnabled ? others : [];
  // How many pills are up: with 1 the pill stretches across the row and
  // shows a little more (who is watching, or the Moments themselves).
  const upCount = isLoading ? 0 : (showMe ? 1 : 0) + eligibleLive.length + shownOthers.length;
  const roomy = upCount >= 1 && upCount <= 2;

  return (
    <>
      <div data-stories data-story-shelf data-no-swipe role="list" data-up={upCount || undefined} {...menuEvents(openMenu)}>
        {storiesEnabled && isAuthenticated && <StoryCreateTile />}
        {showMe && (
          <MeTile
            address={walletAddress ?? ''}
            avatar={user?.avatarImageUrl ?? own?.author.avatarImageUrl ?? null}
            entry={ownWatchable}
            processing={!!own?.items.some(i => i.status === 'processing')}
            pending={pending}
            roomy={roomy}
            onAdd={addMoment}
            onOpen={el => ownWatchable && openEntry(ownWatchable, el)}
            onMenu={ownWatchable && !pending ? event => openMenu(event, storyTarget(ownWatchable, event.currentTarget)) : undefined}
          />
        )}
        {eligibleLive.map(item => (
          <LiveTile key={liveKey(item)} item={item} roomy={roomy} onOpen={() => openLive(item)}
            onMenu={event => openMenu(event, {
              kind: item.kind, ids: [liveKey(item)], open: () => openLive(item),
              creator: { address: item.wallet, name: item.displayName || item.username },
            })} />
        ))}
        {storiesEnabled && isLoading && [0, 1, 2].map(index => <LoadingPill key={index} />)}
        {shownOthers.map(entry => (
          <PersonTile key={entry.author.address} entry={entry} roomy={roomy} onOpen={el => openEntry(entry, el)}
            onMenu={event => openMenu(event, storyTarget(entry, event.currentTarget))} />
        ))}
      </div>
      {menuElement}
    </>
  );
}

function LoadingPill() {
  return (
    <div data-story-tile data-st-loading aria-hidden="true">
      <span data-st-avatar />
      <span data-st-text><span /><span /></span>
    </div>
  );
}

/** Small covers of someone's Moments, for a pill that has the room. */
function MomentCovers({ entry }: { entry: ShelfEntry | null }) {
  const blurred = useMomentPreviewsBlurred();
  if (!entry || blurred) return null;
  const covers = entry.items
    .map(item => item.posterUrl || (item.type === 'photo' ? item.mediaUrl : null))
    .filter((url): url is string => !!url)
    .slice(0, 3);
  if (!covers.length) return null;
  return (
    <span data-st-stack data-covers aria-hidden="true">
      {covers.map(url => <img key={url} src={url} alt="" loading="lazy" />)}
    </span>
  );
}

/** A few faces of who is watching a live, and how many more. */
function LiveWatchers({ streamId }: { streamId: string }) {
  const { data } = useLiveAudience(streamId);
  const here = (data?.here ?? []).slice(0, 4);
  if (!here.length) return null;
  const more = Math.max(0, (data?.watching ?? 0) - here.length);
  return (
    <span data-st-stack aria-hidden="true">
      {here.map(a => (
        <img
          key={a.address}
          src={a.avatarImageUrl ? buildAvatarUrl(a.address, a.avatarImageUrl, deviceWidth(24)) : buildAvatarCdnFallbackUrl(a.address, undefined)}
          alt=""
          loading="lazy"
        />
      ))}
      {more > 0 && <b>+{formatCount(more)}</b>}
    </span>
  );
}

function ShelfAvatar({ src }: { src?: string | null }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  return src && brokenSrc !== src ? (
    <img data-st-avatar src={src} alt="" onError={() => setBrokenSrc(src)} />
  ) : (
    <span data-st-avatar aria-hidden="true" />
  );
}

function momentsLine(t: TFunction, count: number) {
  return count === 1
    ? t('stories.spot.oneMoment', { defaultValue: '1 Moment' })
    : t('stories.spot.moments', { n: formatCount(count), defaultValue: '{{n}} Moments' });
}

function MeTile({ address, avatar, entry, processing, pending, roomy, onAdd, onOpen, onMenu }: {
  address: string;
  avatar: string | null;
  entry: ShelfEntry | null;
  processing: boolean;
  pending: ReturnType<typeof useStoriesStore.getState>['pending'];
  roomy: boolean;
  onAdd: () => void;
  onOpen: (el: HTMLElement) => void;
  onMenu?: OpenActivityMenu;
}) {
  const { t } = useTranslation();
  const face = avatar ? buildAvatarUrl(address, avatar, deviceWidth(36)) : buildAvatarCdnFallbackUrl(address, undefined);
  const busy = pending && pending.state !== 'failed';
  const failed = pending?.state === 'failed';
  const fill = busy ? `${Math.max(6, pending.state === 'processing' ? 100 : pending.progress)}%` : undefined;
  const you = t('stories.you', { defaultValue: 'You' });

  return (
    <button
      type="button"
      role="listitem"
      data-story-tile
      data-kind="me"
      aria-label={you}
      {...(onMenu && menuEvents(onMenu))}
      onClick={e => (entry && !pending ? onOpen(e.currentTarget) : !busy ? (pending?.retry ? pending.retry() : onAdd()) : undefined)}
    >
      {failed ? <span data-st-avatar className="grid place-items-center"><Refresh className="w-5 h-5" /></span> : <ShelfAvatar src={face} />}
      <span data-st-text>
        <span data-st-label><span data-st-name>{you}</span></span>
        <span data-st-line>
          {failed
            ? t('stories.tapToRetry', { defaultValue: 'Tap to retry' })
            : busy || processing
              ? t('stories.posting', { defaultValue: 'Posting…' })
              : momentsLine(t, entry?.items.length ?? 0)}
        </span>
      </span>
      {roomy && !pending && <MomentCovers entry={entry} />}
      {fill && <span data-st-fill style={{ '--st-upload-progress': fill } as CSSProperties} />}
    </button>
  );
}

function TileIdentity({ address, username, displayName, live }: {
  address: string;
  username: string | null;
  displayName?: string | null;
  live?: LiveNowItem;
}) {
  const account = useBadgeBalance(address, live?.badgeBalance);
  const badge = useBadgeVisual({
    badgeBalance: live?.badgeBalance ?? account.badgeBalance,
    badgeLock: live?.badgeLock ?? account.badgeLock,
    username: username ?? account.username,
    lookupId: address,
  });
  const label = displayName?.trim() || account.displayName?.trim() || handleOf({ address, username });
  return (
    <span data-st-label>
      <span data-st-name>{label}</span>
      {badge.url && !live?.hideBadgeAndBalance && !account.hideBadgeAndBalance && (
        <img data-st-badge src={badge.url} alt={badge.name ?? ''} />
      )}
    </span>
  );
}

function LiveTile({ item, roomy, onOpen, onMenu }: { item: LiveNowItem; roomy: boolean; onOpen: () => void; onMenu: OpenActivityMenu }) {
  const { t } = useTranslation();
  const face = faceUrlOf(item);
  const line = item.kind === 'stage'
    ? [item.count && t('stories.spot.listening', { n: item.count, defaultValue: '{{n}} listening' })]
    : [
        item.count && t('stories.spot.watching', { n: item.count, defaultValue: '{{n}} watching' }),
        item.views != null ? t('stories.spot.views', { n: formatCount(item.views), defaultValue: '{{n}} views' }) : '',
      ];
  return (
    <button type="button" role="listitem" data-story-tile data-kind="live" onClick={onOpen} aria-label={item.title} {...menuEvents(onMenu)}>
      <span data-live-orbit="shelf" role="img" aria-label={t('stages.liveBadge', { defaultValue: 'LIVE' })}>
        <span data-live-orbit-ring aria-hidden />
        <ShelfAvatar src={face} />
      </span>
      <span data-st-text>
        <TileIdentity address={item.wallet} username={item.username} displayName={item.displayName} live={item} />
        <span data-st-line>{line.filter(Boolean).join(' · ') || item.title}</span>
      </span>
      {roomy && item.kind === 'stream' && <LiveWatchers streamId={item.id} />}
    </button>
  );
}

function PersonTile({ entry, roomy, onOpen, onMenu }: { entry: ShelfEntry; roomy: boolean; onOpen: (el: HTMLElement) => void; onMenu: OpenActivityMenu }) {
  const { t, i18n } = useTranslation();
  const a = entry.author;
  const face = a.avatarImageUrl ? buildAvatarUrl(a.address, a.avatarImageUrl, deviceWidth(36)) : buildAvatarCdnFallbackUrl(a.address, undefined);
  return (
    <button
      type="button"
      role="listitem"
      data-story-tile
      data-kind="person"
      data-seen={entry.seen ? 'true' : 'false'}
      data-close-friends={entry.closeFriends && !entry.own ? '' : undefined}
      onClick={e => onOpen(e.currentTarget)}
      {...menuEvents(onMenu)}
      aria-label={nameOf(a)}
    >
      <ShelfAvatar src={face} />
      <span data-st-text>
        <TileIdentity address={a.address} username={a.username} displayName={a.displayName} />
        <span data-st-line>
          {[localAge(entry.latestAt, i18n.language), momentsLine(t, entry.items.length)].filter(Boolean).join(' · ')}
        </span>
      </span>
      {roomy && <MomentCovers entry={entry} />}
    </button>
  );
}
