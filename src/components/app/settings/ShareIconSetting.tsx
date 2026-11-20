/**
 * Share icon (Settings → Appearance → Layout): the usual share glyph on the
 * post Share button (default) or the "distribute" glyph. The choice lives in
 * lib/share-icon-style.
 */

import { useTranslation } from 'react-i18next';
import PostShareIcon from '@/components/ui/cut-icons/postshare';

import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { SettingDrawerSelect } from '@/components/app/settings/SettingDrawerSelect';
import { isShareIconStyle, setShareIconStyle, useShareIconStyle } from '@/lib/share-icon-style';

export function ShareIconSetting() {
  const { t } = useTranslation();
  const value = useShareIconStyle();
  const title = t('settings.shareIcon', 'Share icon');

  const options = [
    { value: 'classic', label: t('settings.shareIconClassic', 'Classic'), description: t('settings.shareIconClassicDesc', 'Three linked dots') },
    { value: 'distribute', label: t('settings.shareIconDistribute', 'Distribute'), description: t('settings.shareIconDistributeDesc', 'A person in a circle with arrows pointing out') },
  ];

  return (
    <SettingsRow
      icon={<PostShareIcon />}
      anchor="share-icon"
      title={title}
      description={t('settings.shareIconDesc', 'The icon on the Share button under posts')}
      action={
        <SettingDrawerSelect
          value={value}
          onValueChange={(next) => { if (isShareIconStyle(next)) setShareIconStyle(next); }}
          title={title}
          options={options}
        />
      }
    />
  );
}
