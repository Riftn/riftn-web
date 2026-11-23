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
  const title = `${t('settings.feedSeparatorBento', 'Bento cards')} / ${t('settings.feedSeparatorLine', 'Thin line')}`;

  const options = [
    { value: 'bento', label: t('settings.feedSeparatorBento', 'Bento cards') },
    { value: 'line', label: t('settings.feedSeparatorLine', 'Thin line') },
  ];

  return (
    <SettingsRow
      icon={<Minus />}
      anchor="feed-separator"
      title={title}
      description={`${t('nav.home', 'Home')} · ${t('settings.messages', 'Messages')}`}
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
