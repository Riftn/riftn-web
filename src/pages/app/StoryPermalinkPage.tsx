/**
 * /app/moment/:id — one moment opened from a link (a reply in a chat, a
 * share). Opens it in the story viewer over Home; when the viewer closes, the
 * reader lands on Home. A moment past its 24 hours says so.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { SEOHead } from '@/components/SEOHead';
import { getStory } from '@/lib/api/dehub/stories';
import { useStoriesStore } from '@/store/storiesStore';
import { nameOf } from '@/components/app/stories/story-utils';

export default function StoryPermalinkPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openViewer = useStoriesStore(s => s.openViewer);
  const viewer = useStoriesStore(s => s.viewer);
  const [opened, setOpened] = useState(false);
  const { data, isError, isLoading } = useQuery({ queryKey: ['story', id], queryFn: () => getStory(id), retry: false });

  useEffect(() => {
    if (!data?.author || opened) return;
    openViewer([{ author: data.author, own: false, following: false, seen: false, latestAt: data.item.createdAt, items: [data.item] }], 0, { item: 0 });
    setOpened(true);
  }, [data, opened, openViewer]);

  useEffect(() => {
    if (opened && !viewer) navigate('/app', { replace: true });
  }, [opened, viewer, navigate]);

  const name = data?.author ? nameOf(data.author) : null;
  return (
    <div className="min-h-[60vh] grid place-items-center px-6 text-center">
      <SEOHead
        title={name ? t('stories.metaTitle', { name, defaultValue: "{{name}}'s moment on Riftn" }) : t('stories.metaTitleGeneric', { defaultValue: 'A moment on Riftn' })}
        description={t('stories.metaDescription', { defaultValue: 'Moments are photos and videos that stay up for 24 hours on Riftn.' })}
        image={data?.item.posterUrl ?? undefined}
        noindex
      />
      {(isError || (!isLoading && !data)) && (
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
