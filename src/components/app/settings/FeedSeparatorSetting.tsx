/**
 * Post separator (Settings → Appearance → Layout): bento cards around each
 * feed post (default) or one thin line between posts. The look lives in
 * styles/feed-separator.css; the choice in lib/feed-separator.
 */

import { useTranslation } from 'react-i18next';
import Minus from '@/components/ui/cut-icons/minus';

import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { SettingDrawerSelect } from '@/components/app/settings/SettingDrawerSelect';
import { isFeedSeparator, setFeedSeparator, useFeedSeparator } from '@/lib/feed-separator';

export function FeedSeparatorSetting() {
  const { t } = useTranslation();
  const value = useFeedSeparator();
  const title = t('settings.feedSeparator', 'Post separator');

  const options = [
    { value: 'bento', label: t('settings.feedSeparatorBento', 'Bento cards'), description: t('settings.feedSeparatorBentoDesc', 'Each post sits in its own rounded card') },
    { value: 'line', label: t('settings.feedSeparatorLine', 'Thin line'), description: t('settings.feedSeparatorLineDesc', 'No cards. A thin line between posts and a little more room for each post') },
  ];

  return (
    <SettingsRow
      icon={<Minus />}
      anchor="feed-separator"
      title={title}
      description={t('settings.feedSeparatorDesc', 'Cards around each post, or a thin line between them')}
      action={
        <SettingDrawerSelect
          value={value}
          onValueChange={(next) => { if (isFeedSeparator(next)) setFeedSeparator(next); }}
          title={title}
          options={options}
        />
      }
    />
  );
}
