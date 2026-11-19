/**
 * How reactions move when they land in a chat (Settings → Appearance). Fly in
 * is the default; Pop and Burst are the other looks, Off keeps them still.
 * Writes lib/chat-reaction-style.
 */
import { useTranslation } from 'react-i18next';
import { SmilePlus } from 'lucide-react';

import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { SettingDrawerSelect } from '@/components/app/settings/SettingDrawerSelect';
import { isChatReactionStyle, setChatReactionStyle, useChatReactionStyle } from '@/lib/chat-reaction-style';

export function ChatReactionStyleSetting() {
  const { t } = useTranslation();
  const style = useChatReactionStyle();
  const title = t('settings.chatReactionStyle', 'Reactions in chat');

  return (
    <SettingsRow
      icon={<SmilePlus />}
      anchor="chat-reaction-style"
      title={title}
      description={t('settings.chatReactionStyleDesc', 'How a reaction moves when it lands in a chat, yours or someone else’s.')}
      action={
        <SettingDrawerSelect
          value={style}
          onValueChange={(value) => { if (isChatReactionStyle(value)) setChatReactionStyle(value); }}
          title={title}
          options={[
            { value: 'fly', label: t('settings.chatReactionFly', 'Fly in'), description: t('settings.chatReactionFlyDesc', 'The emoji flies onto the message') },
            { value: 'pop', label: t('settings.chatReactionPop', 'Pop'), description: t('settings.chatReactionPopDesc', 'It springs in place, small and calm') },
            { value: 'burst', label: t('settings.chatReactionBurst', 'Burst'), description: t('settings.chatReactionBurstDesc', 'Yours blooms big with sparks') },
            { value: 'off', label: t('settings.chatReactionOff', 'Off'), description: t('settings.chatReactionOffDesc', 'No motion, the number just changes') },
          ]}
        />
      }
    />
  );
}
