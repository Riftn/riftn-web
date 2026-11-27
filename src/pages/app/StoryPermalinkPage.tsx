/**
 * /app/moment/:id — one moment opened from a link (a reply in a chat, a
 * share). Opens it in the story viewer over Home; when the viewer closes, the
 * reader lands on Home. A moment past its 24 hours says so.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { SEOHead } from '@/components/SEOHead';
import { getStory } from '@/lib/api/dehub/stories';
import { useStoriesStore } from '@/store/storiesStore';
import { nameOf } from '@/components/app/stories/story-utils';
import { useAuth } from '@/contexts/AuthContext';
import { useKidsModeLock } from '@/hooks/use-kids-mode';
import { useMatureContent } from '@/hooks/use-mature-content';

export default function StoryPermalinkPage() {
  const { id = '' } = useParams();
  const { walletAddress, isAuthenticated, isLoading } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const openComments = params.get('comments') === '1';
  const liveOnly = params.get('reply') === '1';
  const { showMatureContent } = useMatureContent();
  const kidsMode = useKidsModeLock();
  const canSeeMature = isAuthenticated && showMatureContent && !kidsMode;
  const scope = `${isAuthenticated ? walletAddress?.toLowerCase() : 'guest'}:${canSeeMature}`;
  const viewerKey = openComments ? location.key : liveOnly;
  return <StoryPermalink key={`${id}:${scope}:${openComments}:${viewerKey}`} {...{ id, scope, isAuthenticated, canSeeMature, openComments, liveOnly, authLoading: openComments && isLoading }} />;
}

function StoryPermalink({ id, scope, isAuthenticated, canSeeMature, openComments, liveOnly, authLoading }: {
  id: string;
  scope: string;
  isAuthenticated: boolean;
  canSeeMature: boolean;
  openComments: boolean;
  liveOnly: boolean;
  authLoading: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fromArchive = useLocation().state?.fromMomentArchive === true;
  const openViewer = useStoriesStore(s => s.openViewer);
  const closeViewer = useStoriesStore(s => s.closeViewer);
  const viewer = useStoriesStore(s => s.viewer);
  const [opened, setOpened] = useState(false);
  const result = useQuery({
    queryKey: ['story', id, scope],
    queryFn: () => getStory(id, isAuthenticated),
    gcTime: 0,
    retry: false,
    enabled: !authLoading,
  });
  const item = result.isSuccess ? result.data.item : null;
  const active = item && item.status === 'ready' && !item.expired && Date.parse(item.expiresAt) > Date.now();
  const data = !authLoading && item && (!liveOnly || active) && (!item.isMature || canSeeMature) ? result.data : undefined;

  useEffect(() => {
    if (!data?.author || opened) return;
    openViewer([{ author: data.author, own: false, following: false, seen: false, latestAt: data.item.createdAt, items: [data.item] }], 0, { item: 0, openComments });
    setOpened(true);
  }, [data, opened, openViewer, openComments]);

  useEffect(() => () => closeViewer(), [closeViewer]);

  useEffect(() => {
    if (opened && !viewer) {
      if (fromArchive) navigate(-1);
      else navigate('/app', { replace: true });
    }
  }, [opened, viewer, navigate, fromArchive]);

  const name = data?.author ? nameOf(data.author) : null;
  return (
    <div className="min-h-[60vh] grid place-items-center px-6 text-center">
      <SEOHead
        title={name ? t('stories.metaTitle', { name, defaultValue: "{{name}}'s moment on Riftn" }) : t('stories.metaTitleGeneric', { defaultValue: 'A moment on Riftn' })}
        description={t('stories.metaDescription', { defaultValue: 'Moments are photos and videos that stay up for 24 hours on Riftn.' })}
        image={data?.item.posterUrl ?? undefined}
        noindex
      />
      {!authLoading && !result.isLoading && !data && (
        <div>
          <p className="text-[17px] font-semibold mb-2">{t('stories.ended', { defaultValue: 'This moment has ended' })}</p>
          <p className="text-[14px] opacity-70 mb-5">{t('stories.endedBody', { defaultValue: 'Moments stay up for 24 hours.' })}</p>
          <button type="button" className="px-5 h-11 rounded-full bg-white text-black font-semibold" onClick={() => navigate('/app')}>
            {t('stories.backHome', { defaultValue: 'Go to Home' })}
          </button>
        </div>
      )}
    </div>
  );
}
