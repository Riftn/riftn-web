import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Share from '@/components/ui/cut-icons/share';
import { useAuth } from '@/contexts/AuthContext';
import { dehubLinkFor } from '@/lib/dehub-links';

const PostModal = lazy(() => import('@/features/post').then(m => ({ default: m.PostModal })));

export function SkillShareButton({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div data-no-navigate onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <button
        type="button"
        className="flex items-center justify-center gap-1.5 h-9 px-3 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg"
        onClick={() => { if (!isAuthenticated) { openLoginModal(); return; } setOpen(true); }}
        aria-label={t('postOptions.share')}
      >
        <Share className="w-3.5 h-3.5" />
        {t('postOptions.share')}
      </button>
      {open && <Suspense fallback={null}>
        <PostModal isOpen={open} onClose={() => setOpen(false)} initialText={dehubLinkFor.skill(slug)} />
      </Suspense>}
    </div>
  );
}
