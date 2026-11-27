import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { PostMomentDetails } from './post-moment';

export const SHARED_MOMENT_CARD_FRACTION = 0.78;

export function SharedMomentCard({ children, details, expanded, onToggle, inline, pending, fallback }: {
  children?: ReactNode;
  details?: PostMomentDetails | null;
  expanded: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  inline?: boolean;
  pending?: boolean;
  fallback?: PostMomentDetails;
}) {
  const { t } = useTranslation();
  const name = details?.authorName || fallback?.authorName;
  const avatar = details?.avatarUrl || fallback?.avatarUrl;
  return (
    <div data-sm-card data-inline={inline ? '' : undefined}>
      {children}
      <button type="button" data-sm-toggle onClick={onToggle} aria-expanded={expanded} aria-description={name}
        aria-label={expanded
          ? t('stories.hidePostDetails', { defaultValue: 'Hide post details' })
          : t('stories.showPostDetails', { defaultValue: 'Show post details' })}>
        <span data-sm-credit>
          <Avatar className="size-7 shrink-0">
            {avatar && <AvatarImage src={avatar} alt="" className="object-cover" />}
            <AvatarFallback className="bg-white/15 text-xs text-white">
              {name ? name.slice(0, 1).toUpperCase() : <UserRound className="size-4" />}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate" dir="auto">{name || t('stories.fromAPost', { defaultValue: 'From a post' })}</span>
          <ChevronDown data-sm-chevron aria-hidden className="size-4 shrink-0" />
        </span>
      </button>
      {expanded && (
        <div data-sm-details aria-live="polite">
          {details?.title && <strong dir="auto">{details.title}</strong>}
          {details?.description && <span dir="auto">{details.description}</span>}
          {!details?.title && !details?.description && (
            <span>{pending ? t('common.loading', { defaultValue: 'Loading' })
              : details ? t('stories.noPostDetails', { defaultValue: 'No title or description' })
              : t('stories.postDetailsUnavailable', { defaultValue: 'Post details unavailable' })}</span>
          )}
        </div>
      )}
    </div>
  );
}
