import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';
import { LiveStudio } from '@/components/app/live/studio/LiveStudio';
import { STUDIO_GROUPS, jumpToStudioGroup, useStudioScrollSpy, type StudioGroupId } from '@/components/app/live/studio/studio-groups';

/**
 * Live Studio — a creator's alerts and widgets for their live streams.
 */
export default function LiveStudioPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  // One column of grouped sections; the tabs jump to a group and follow the scroll.
  const [group, setGroup] = useState<StudioGroupId>('stream');
  useStudioScrollSpy(setGroup);
  // The tabs are how people get around this long page, so on phones the pill
  // stays on screen when the rest of the chrome slides away (as Explore's does).
  const islandHostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    islandHostRef.current?.querySelector('[data-feed-nav-outer]')?.setAttribute('data-nav-hide', 'pin');
  });
  const groupLabel: Record<StudioGroupId, string> = {
    stream: t('liveStudio.groups.stream'),
    overlay: t('liveStudio.groups.overlay'),
    viewers: t('liveStudio.groups.viewers'),
    chat: t('liveStudio.groups.chat'),
    replays: t('liveStudio.groups.replaysTab'),
  };

  const seo = (
    <SEOHead
      title={t('liveStudio.seoTitle')}
      description={t('liveStudio.seoDescription')}
      url="https://riftn.com/live-studio"
      image="https://riftn.com/og/live-studio.jpg"
      jsonLd={{
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: t('liveStudio.title'),
        url: 'https://riftn.com/live-studio',
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web, Android, iOS',
        description: t('liveStudio.seoDescription'),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      }}
    />
  );

  if (!isAuthenticated) {
    return (
      <>
        {seo}
        <AuthGate description={t('liveStudio.signIn')} />
      </>
    );
  }

  return (
    <div data-live-studio-page className="min-h-screen">
      {seo}
      <h1 className="sr-only">{t('liveStudio.h1')}</h1>
      <div ref={islandHostRef} className="contents">
      <PageIsland
        icon="live"
        title={t('liveStudio.title')}
        subtitle={t('liveStudio.subtitle')}
        back
        backFallback="/app/settings"
        tabs={
          <PageTabs
            value={group}
            onChange={(id) => {
              setGroup(id);
              jumpToStudioGroup(id);
            }}
            tabs={STUDIO_GROUPS.map((id) => ({ id, label: groupLabel[id] }))}
          />
        }
      />
      </div>
      <PageBody>
        <LiveStudio />
      </PageBody>
    </div>
  );
}
