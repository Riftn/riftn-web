/**
 * What happens when you delete a chat message (Settings → Appearance). "Ask
 * every time" shows the pop-up; the others are what "Remember my choice" in
 * that pop-up saves. Both write lib/chat-delete-choice.
 */
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';

import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { SettingDrawerSelect } from '@/components/app/settings/SettingDrawerSelect';
import { isChatDeleteChoice, setChatDeleteChoice, useChatDeleteChoice } from '@/lib/chat-delete-choice';

export function ChatDeleteChoiceSetting() {
  const { t } = useTranslation();
  const choice = useChatDeleteChoice();
  const title = t('settings.chatDeleteChoice', 'When you delete a message');

  return (
    <SettingsRow
      icon={<Trash2 />}
      anchor="chat-delete-choice"
      title={title}
      description={t('settings.chatDeleteChoiceDesc', 'Ask every time, or always delete for you only or for everyone in the chat.')}
      action={
        <SettingDrawerSelect
          value={choice}
          onValueChange={(value) => { if (isChatDeleteChoice(value)) setChatDeleteChoice(value); }}
          title={title}
          options={[
            { value: 'ask', label: t('settings.chatDeleteAsk', 'Ask every time') },
            { value: 'me', label: t('settings.chatDeleteMe', 'Delete for me'), description: t('settings.chatDeleteMeDesc', 'Gone from your chat, others still see it') },
            { value: 'everyone', label: t('settings.chatDeleteEveryone', 'Delete for everyone'), description: t('settings.chatDeleteEveryoneDesc', 'When you can. Someone else’s message in a group still goes for you only') },
          ]}
        />
      }
    />
  );
}
