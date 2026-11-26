import { useContext, useRef, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AuthContext } from '@/contexts/AuthContext';
import { useMomentPeek, refreshMomentPeeks } from '@/hooks/use-moment-peek';
import { useStoriesEnabled } from '@/hooks/use-stories-enabled';
import { getUserStories, type MomentPeek } from '@/lib/api/dehub/stories';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';
import { useStoriesStore } from '@/store/storiesStore';
import { playable } from './story-utils';
import '@/styles/moment-face.css';

/** A press held this long is a hold (the row's or picture's own menu), not a tap. */
const HOLD_MS = 450;

/** Fetch someone's Moments and open the viewer on the first one not yet watched, growing out of `from`. */
export function useOpenMoments(address: string | null | undefined) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const isAuthenticated = !!auth?.isAuthenticated;
  const walletAddress = auth?.walletAddress ?? null;
  const openViewer = useStoriesStore(s => s.openViewer);
  const busy = useRef(false);
  return async (from: HTMLElement | null) => {
    if (!address || busy.current) return;
    busy.current = true;
    const rect = from?.getBoundingClientRect() ?? null;
    try {
      const { author, items } = await getUserStories(address, isAuthenticated);
      const ready = playable(items);
      if (!author || !ready.length) {
        refreshMomentPeeks([address]);
        toast(t('stories.momentEnded', { defaultValue: 'That Moment has ended' }));
        return;
      }
      const own = !!walletAddress && walletAddress.toLowerCase() === author.address.toLowerCase();
      openViewer(
        [{ author, own, following: false, seen: ready.every(i => i.viewed), latestAt: ready[ready.length - 1].createdAt, items: ready }],
        0,
        { from: rect },
      );
    } catch {
      toast.error(t('stories.momentOpenFailed', { defaultValue: "Couldn't open that Moment" }));
    } finally {
      busy.current = false;
    }
  };
}

/** The Moment mark on one face, for callers that draw the face themselves. */
export function useFaceMoment(address: string | null | undefined): MomentPeek | null {
  const { storiesEnabled } = useStoriesEnabled();
  return useMomentPeek(storiesEnabled ? address : null);
}

interface MomentFaceProps {
  /** Wallet address of the person in the avatar. */
  address: string | null | undefined;
  /** The face's drawn size in px: the Moment badge is sized from it. */
  size: number;
  children: ReactNode;
  className?: string;
  /** Profile-sized face: a bigger badge and a count when there are several. */
  big?: boolean;
  /** Name for the button label. */
  name?: string;
  /** Outline the avatar itself on profile and chat surfaces. */
  outline?: boolean;
}

/**
 * A tap on the avatar opens the person's active Moments. Profiles and chats
 * outline the avatar, while feed avatars can show a corner badge.
 */
export function MomentFace({ address, size, children, className, big, name, outline }: MomentFaceProps) {
  const { t } = useTranslation();
  const peek = useFaceMoment(address);
  const open = useOpenMoments(address);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const faceRef = useRef<HTMLSpanElement>(null);
  const downAt = useRef(0);
  const held = useRef(false);

  const onClickCapture = (event: MouseEvent) => {
    // A long press belongs to the row's or the picture's own hold menu.
    if (held.current) { held.current = false; return; }
    event.preventDefault();
    event.stopPropagation();
    void open(thumbRef.current ?? faceRef.current);
  };

  const w = Math.max(12, Math.round(size * (big ? 0.34 : 0.42)));
  const h = Math.round(w * 1.25);
  return (
    <span
      ref={faceRef}
      data-moment-face={peek ? peek.state : undefined}
      data-big={big ? '' : undefined}
      onPointerDown={peek ? () => { downAt.current = Date.now(); held.current = false; } : undefined}
      onPointerUp={peek ? () => { held.current = Date.now() - downAt.current > HOLD_MS; } : undefined}
      onClickCapture={peek ? onClickCapture : undefined}
      aria-label={peek ? t('stories.watchMomentsOf', { defaultValue: "Watch {{name}}'s Moments", name: name || '' }) : undefined}
      className={cn('relative inline-flex shrink-0 align-top', peek && 'cursor-pointer', className)}
    >
      {children}
      {peek && outline && <span aria-hidden data-moment-outline data-close-friends={peek.closeFriends ? '' : undefined} />}
      {peek && !outline && (
        <span
          ref={thumbRef}
          aria-hidden
          data-moment-peek={peek.state}
          data-close-friends={peek.closeFriends ? '' : undefined}
          style={{ width: w, height: h, borderRadius: Math.max(4, Math.round(w * 0.26)), right: big ? -6 : -4, bottom: big ? -6 : -4 }}
        />
      )}
      {peek && !outline && big && peek.count > 1 && (
        <span aria-hidden data-moment-count style={{ right: (big ? -6 : -4) - 9, bottom: (big ? -6 : -4) + h - 12 }}>
          {formatCount(peek.count)}
        </span>
      )}
    </span>
  );
}
