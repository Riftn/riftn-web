/**
 * Feature Request Link Embed
 * ==========================
 * A Requests board link (riftn.com/features?feature=<id>) as a card: the
 * request's status, title, first lines, first picture, votes and comments,
 * read live so a shipped request shows as shipped. A tap opens the request on
 * the board.
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ThumbsUp, MessageCircle } from 'lucide-react';
import FeatureRequests from '@/components/ui/cut-icons/feature-requests';
import { useFeatureRequest, STATUS_LABELS, type FeatureStatus } from '@/hooks/use-feature-requests';
import { featureAttachments } from '@/lib/feature-attachments';
import { storageImage, buildAvatarUrl } from '@/lib/media-url';

import { formatCount } from '@/lib/format-count';
// Statuses worth naming on a link card; open adds nothing. Plain words, no
// status hues (same as the board's Asked > In progress > Shipped track).
const SHOWN_STATUSES: FeatureStatus[] = ['under_review', 'planned', 'in_progress', 'completed', 'shipped', 'declined'];

interface FeatureRequestLinkEmbedProps {
  featureRequestId: string;
  path: string;
  fallback?: ReactNode;
}

export function FeatureRequestLinkEmbed({ featureRequestId, path, fallback = null }: FeatureRequestLinkEmbedProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: feature, isLoading } = useFeatureRequest(featureRequestId);

  if (isLoading) return <div className="mt-2 h-24 rounded-xl theme-skeleton animate-pulse" />;
  if (!feature) return <>{fallback}</>;

  const image = featureAttachments(feature).find((url) => !/\.(mp4|webm|mov)(\?|$)/i.test(url)) ?? null;
  const showStatus = SHOWN_STATUSES.includes(feature.status);
  const author = feature.author_username ? `@${feature.author_username}` : null;
  const avatar = feature.author_avatar ? buildAvatarUrl(feature.author_wallet_address, feature.author_avatar) : null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(path);
      }}
      data-no-navigate
      data-glass-embed
      data-feature-request-embed
      className="mt-2 block w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 text-left transition-colors hover:bg-white/[0.08]"
    >
      <div className="flex gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
            <FeatureRequests className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">{t('nav.featureRequests', 'Requests')}</span>
            {showStatus && (
              <span className="flex items-center gap-1.5 font-medium text-zinc-300">
                <span aria-hidden>·</span>
                {feature.status === 'in_progress' ? t('features.track.inProgress', 'In progress') : STATUS_LABELS[feature.status]}
              </span>
            )}
          </div>
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">{feature.title}</p>
          {feature.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">{feature.description}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
            {author && (
              <span className="flex min-w-0 items-center gap-1.5">
                {avatar && <img src={avatar} alt="" className="h-4 w-4 rounded-full object-cover" />}
                <span className="truncate">{author}</span>
              </span>
            )}
            <span className="flex shrink-0 items-center gap-1">
              <ThumbsUp className="h-3 w-3" />
              {formatCount(feature.like_count ?? 0)}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              {formatCount(feature.comment_count ?? 0)}
            </span>
          </div>
        </div>
        {image && (
          <img
            src={storageImage(image, 240)}
            onError={(e) => { if (e.currentTarget.src !== image) e.currentTarget.src = image; }}
            alt=""
            loading="lazy"
            className="h-16 w-16 shrink-0 self-center rounded-lg object-cover bg-black/30"
          />
        )}
      </div>
    </button>
  );
}
