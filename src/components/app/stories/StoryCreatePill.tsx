/**
 * The ask bar that takes the shelf's place while nobody has a Moment up.
 *
 * "What's on today?" starts a post, the camera and live buttons go straight
 * to a Moment or a livestream, and + lists all five ways to create: Moment,
 * Post, Live, Stage and Status. Phones get a sheet from the bottom; desktop
 * gets a menu under the +. Every option opens its real flow.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Add from '@/components/ui/cut-icons/add';
import Camera from '@/components/ui/cut-icons/camera';
import Edit from '@/components/ui/cut-icons/edit';
import Live from '@/components/ui/cut-icons/live';
import Mic from '@/components/ui/cut-icons/mic';
import Chat from '@/components/ui/cut-icons/chat';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalDropZone } from '@/hooks/use-global-drop-zone';
import { openStageModal } from '@/contexts/StageContext';
import { useStoriesStore } from '@/store/storiesStore';
import type { StoryAuthor } from '@/lib/api/dehub/stories';
import '@/styles/stories.css';

const PostModal = lazy(() => import('@/features/post/PostModal').then(m => ({ default: m.PostModal })));
const StoryStatusLauncher = lazy(() => import('./StoryStatusLauncher'));

type Kind = 'moment' | 'post' | 'live' | 'stage' | 'status';
type IconType = ComponentType<{ className?: string }>;

const OPTIONS: ReadonlyArray<{ kind: Kind; icon: IconType; label: string; hint: string }> = [
  { kind: 'moment', icon: Camera, label: 'Moment', hint: 'Photo or video for 24 hours' },
  { kind: 'post', icon: Edit, label: 'Post', hint: 'Words, photos or video on your feed' },
  { kind: 'live', icon: Live, label: 'Live', hint: 'Go live with video right now' },
  { kind: 'stage', icon: Mic, label: 'Stage', hint: 'Talk live with voices' },
  { kind: 'status', icon: Chat, label: 'Status', hint: 'A short note your followers see' },
];

/** Exit motion length; the menu stays mounted until it ends. */
const CLOSE_MS = 200;

/**
 * The create menu and every flow it opens, shared by the ask bar (empty row)
 * and the Create tile (row with Moments or lives up).
 */
function useCreateMenu() {
  const { t } = useTranslation();
  const { walletAddress, user } = useAuth();
  const { openPostModal } = useGlobalDropZone();
  const openCreator = useStoriesStore(s => s.openCreator);
  const [menu, setMenu] = useState<'closed' | 'open' | 'closing'>('closed');
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveMounted, setLiveMounted] = useState(false);
  // Bumped on each Status pick; the launcher mounts on the first and stays.
  const [statusNonce, setStatusNonce] = useState(0);
  const [anchor, setAnchor] = useState<{ top: number; right?: number; left?: number } | null>(null);

  const closeMenu = () => setMenu(m => (m === 'open' ? 'closing' : m));
  useEffect(() => {
    if (menu !== 'closing') return;
    const id = window.setTimeout(() => setMenu('closed'), CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [menu]);
  useEffect(() => {
    if (menu !== 'open') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', closeMenu);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menu]);

  const me = useMemo<StoryAuthor | null>(() => {
    if (!walletAddress) return null;
    const u = user as { username?: string; displayName?: string; avatarImageUrl?: string; avatarUrl?: string } | null;
    return { address: walletAddress, username: u?.username ?? null, displayName: u?.displayName ?? null, avatarImageUrl: u?.avatarImageUrl || u?.avatarUrl || null };
  }, [walletAddress, user]);
  const firstName = (me?.displayName || me?.username || '').trim().split(/\s+/)[0] || '';

  const pick = (kind: Kind) => {
    closeMenu();
    if (kind === 'moment') openCreator();
    else if (kind === 'post') openPostModal();
    else if (kind === 'live') { setLiveMounted(true); setLiveOpen(true); }
    else if (kind === 'stage') openStageModal('create');
    else if (kind === 'status') setStatusNonce(n => n + 1);
  };

  // Desktop drops the menu under the button that opened it.
  const openMenu = (from: HTMLElement | null, align: 'left' | 'right' = 'right') => {
    const r = from?.getBoundingClientRect();
    if (r) setAnchor(align === 'right'
      ? { top: r.bottom + 8, right: Math.max(12, window.innerWidth - r.right) }
      : { top: r.bottom + 8, left: Math.max(12, r.left) });
    setMenu('open');
  };
  const toggle = (from: HTMLElement | null, align: 'left' | 'right' = 'right') => (menu === 'open' ? closeMenu() : openMenu(from, align));

  const label = (kind: Kind, fallback: string) => t(`stories.ask.${kind}`, { defaultValue: fallback });
  const createLabel = t('stories.ask.create', { defaultValue: 'Create' });

  const elements = (
    <>
      {menu !== 'closed' && createPortal(
        <div data-stories data-ask-layer data-state={menu}>
          <div data-ask-scrim onClick={closeMenu} />
          <div
            data-ask-menu
            role="menu"
            aria-label={createLabel}
            style={anchor ? ({
              '--ask-top': `${anchor.top}px`,
              ...(anchor.right != null ? { '--ask-right': `${anchor.right}px` } : { '--ask-left': `${anchor.left}px`, '--ask-right': 'auto' }),
            } as unknown as CSSProperties) : undefined}
          >
            <span data-ask-grab aria-hidden="true" />
            <div data-ask-title>{createLabel}</div>
            {OPTIONS.map(({ kind, icon: Icon, label: fallback, hint }) => (
              <button key={kind} type="button" role="menuitem" data-ask-row={kind} onClick={() => pick(kind)}>
                <span data-ask-row-icon><Icon className="h-5 w-5" /></span>
                <span data-ask-row-text>
                  <b>{label(kind, fallback)}</b>
                  <span>{t(`stories.ask.${kind}Hint`, { defaultValue: hint })}</span>
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
      {liveMounted && (
        <Suspense fallback={null}>
          <PostModal isOpen={liveOpen} onClose={() => setLiveOpen(false)} initialLiveMode="video" />
        </Suspense>
      )}
      {statusNonce > 0 && me && (
        <Suspense fallback={null}>
          <StoryStatusLauncher me={me} nonce={statusNonce} />
        </Suspense>
      )}
    </>
  );

  return { menuOpen: menu === 'open', toggle, pick, label, createLabel, firstName, elements };
}


/** The ask bar that stands in for the row while nobody has a Moment up. */
export function StoryCreatePill() {
  const { t } = useTranslation();
  const { menuOpen, toggle, pick, label, createLabel, firstName, elements } = useCreateMenu();
  const addRef = useRef<HTMLButtonElement>(null);

  return (
    <div data-stories data-create-ask>
      <div data-ask-bar>
        <button type="button" data-ask-prompt onClick={() => pick('post')}>
          {firstName
            ? t('stories.ask.promptNamed', { name: firstName, defaultValue: "What's on today, {{name}}?" })
            : t('stories.ask.prompt', { defaultValue: "What's on today?" })}
        </button>
        <button type="button" data-ask-icon aria-label={label('moment', 'Moment')} onClick={() => pick('moment')}>
          <Camera className="h-5 w-5" />
        </button>
        <button type="button" data-ask-icon aria-label={label('live', 'Live')} onClick={() => pick('live')}>
          <Live className="h-5 w-5" />
        </button>
        <button
          ref={addRef}
          type="button"
          data-ask-add
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={createLabel}
          onClick={() => toggle(addRef.current)}
        >
          <span data-ask-key><Add className="h-4 w-4" /></span>
        </button>
      </div>
      {elements}
    </div>
  );
}

/** First tile of the row while Moments or lives are up: a centred + that opens the same menu. */
export function StoryCreateTile() {
  const { menuOpen, toggle, createLabel, elements } = useCreateMenu();
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        role="listitem"
        data-story-tile
        data-kind="create"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={createLabel}
        onClick={() => toggle(ref.current, 'left')}
      >
        <span data-create-key><Add className="h-[18px] w-[18px]" /></span>
        <span data-create-label>{createLabel}</span>
      </button>
      {elements}
    </>
  );
}
