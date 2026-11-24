/**
 * Arcade Share menu
 * =================
 * The Share button on an arcade game. Two ways to post the game to your feed,
 * plus the plain link:
 *
 *  - Post your score card: the game's link naming you (`?by=<you>`), which the
 *    feed draws as the game's art with your name and best score on it.
 *  - Post a snapshot: a picture of the game as it is right now (your board,
 *    your run), attached to the post with the link under it (`&snap=1`, so the
 *    card under the picture is one compact row).
 *  - Share link: the phone's own share sheet, or copy on desktop.
 */
import { lazy, Suspense, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Camera, Link2, Share2, Trophy } from 'lucide-react';
import { AuthContext } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { arcadeShareUrl } from '@/lib/api/dehub/arcade-card';

const PostModal = lazy(() => import('@/features/post').then((m) => ({ default: m.PostModal })));

function filesOf(file: File): FileList {
  const dt = new DataTransfer();
  dt.items.add(file);
  return dt.files;
}

interface ArcadeShareMenuProps {
  slug: string;
  title: string;
  /** Draws the game as it stands right now. Leave out for games with no board to picture. */
  snapshot?: () => Promise<File | null>;
  className?: string;
}

export function ArcadeShareMenu({ slug, title, snapshot, className }: ArcadeShareMenuProps) {
  const { t } = useTranslation();
  // useContext rather than useAuth: the state gallery renders without an AuthProvider.
  const auth = useContext(AuthContext);
  const username = auth?.isAuthenticated ? auth.user?.username?.replace(/^@+/, '') || auth.walletAddress || null : null;
  const [composer, setComposer] = useState<{ text: string; files: FileList | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const plainUrl = arcadeShareUrl(slug);
  const cardUrl = arcadeShareUrl(slug, username);

  const signedIn = (then: () => void) => {
    if (!auth?.isAuthenticated) {
      auth?.openLoginModal();
      return;
    }
    then();
  };

  const postCard = () => signedIn(() => setComposer({ text: cardUrl, files: null }));

  const postSnapshot = () => signedIn(() => {
    if (!snapshot || busy) return;
    setBusy(true);
    void snapshot().catch(() => null).then((file) => {
      setBusy(false);
      if (!file) {
        toast.error(t('arcadeShare.snapshotFailed', { defaultValue: 'Couldn’t take a snapshot. Try again.' }));
        return;
      }
      setComposer({ text: username ? `${cardUrl}&snap=1` : plainUrl, files: filesOf(file) });
    });
  });

  const shareLink = () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share && window.matchMedia?.('(hover: none)').matches) {
      void nav.share({ url: plainUrl, title }).catch(() => undefined);
      return;
    }
    void navigator.clipboard?.writeText(plainUrl).then(() => toast.success(t('games.linkCopied', { defaultValue: 'Link copied' })));
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('games.share', { defaultValue: 'Share' })}
            data-arcade-share
            className={className ?? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 [@media(hover:hover)]:hover:text-white'}
          >
            <Share2 className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-60">
          <DropdownMenuItem onSelect={postCard} className="gap-3 py-2.5">
            <Trophy className="h-4 w-4 shrink-0" />
            <span>{t('arcadeShare.postCard', { defaultValue: 'Post your score card' })}</span>
          </DropdownMenuItem>
          {snapshot ? (
            <DropdownMenuItem onSelect={postSnapshot} disabled={busy} className="gap-3 py-2.5">
              <Camera className="h-4 w-4 shrink-0" />
              <span>{t('arcadeShare.postSnapshot', { defaultValue: 'Post a snapshot' })}</span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={shareLink} className="gap-3 py-2.5">
            <Link2 className="h-4 w-4 shrink-0" />
            <span>{t('arcadeShare.shareLink', { defaultValue: 'Share link' })}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {composer ? (
        <Suspense fallback={null}>
          <PostModal
            isOpen
            onClose={() => setComposer(null)}
            initialText={composer.text}
            initialFiles={composer.files}
          />
        </Suspense>
      ) : null}
    </>
  );
}
