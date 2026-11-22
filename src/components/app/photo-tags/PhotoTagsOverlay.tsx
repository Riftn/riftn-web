import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import type { PhotoTag } from '@/lib/api/dehub';
import { profilePath } from '@/lib/profile-path';
import { cn } from '@/lib/utils';

/**
 * The people tagged on one photo. A small person button sits in the corner;
 * tapping it (or the photo's own tap, when the host passes `shown`) shows the
 * names where they were placed. Tapping a name opens that profile.
 */
export function PhotoTagsOverlay({ tags, index, className }: { tags?: PhotoTag[] | null; index: number; className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [shown, setShown] = useState(false);
  const here = (tags ?? []).filter((tag) => tag.i === index);
  if (!here.length) return null;
  return (
    <div data-photo-tags className={cn('pointer-events-none absolute inset-0 z-[2]', className)}>
      {shown && here.map((tag) => (
        <button
          key={tag.username}
          type="button"
          data-no-navigate
          style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }}
          onClick={(e) => { e.stopPropagation(); navigate(profilePath(tag.username)); }}
          className="pointer-events-auto absolute -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur animate-in fade-in zoom-in-95"
        >
          @{tag.username}
        </button>
      ))}
      <button
        type="button"
        data-no-navigate
        aria-label={shown ? t('photoTags.hideTags', 'Hide tags') : t('photoTags.showTags', 'Show who is tagged')}
        aria-pressed={shown}
        onClick={(e) => { e.stopPropagation(); setShown((v) => !v); }}
        className="pointer-events-auto absolute bottom-2 left-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur"
      >
        <UserRound className="h-4 w-4" />
      </button>
    </div>
  );
}
