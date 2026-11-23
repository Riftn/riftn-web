/**
 * Settings → Appearance: your own lines in Public Chat on a bubble, like
 * private chats (lib/chat-own-bubble, styles/chat-own-bubble.css).
 */

import { useTranslation } from 'react-i18next';
import MessagesIcon from '@/components/ui/cut-icons/messages';

import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { Switch } from '@/components/ui/switch';
import { setChatOwnBubble, useChatOwnBubble } from '@/lib/chat-own-bubble';
import { setMessagesPills, useMessagesPills } from '@/lib/messages-pills';

export function ChatOwnBubbleSetting() {
  const { t } = useTranslation();
  const on = useChatOwnBubble();
  return (
    <SettingsRow
      as="label"
      className="cursor-pointer"
      icon={<MessagesIcon />}
      anchor="chat-own-bubble"
      title={t('settings.chatOwnBubble', 'Bubbles for my messages in Public Chat')}
      description={t('settings.chatOwnBubbleDesc', 'Your own messages sit in a bubble, like in private chats')}
      action={<Switch checked={on} onCheckedChange={setChatOwnBubble} />}
    />
  );
}

/** Settings → Appearance: Messages tabs as filled pills (lib/messages-pills). */
export function MessagesPillsSetting() {
  const { t } = useTranslation();
  const on = useMessagesPills();
  return (
    <SettingsRow
      as="label"
      className="cursor-pointer"
      icon={<MessagesIcon />}
      anchor="messages-pills"
      title={t('settings.messagesPills', 'Pill tabs in Messages')}
      description={t('settings.messagesPillsDesc', 'The open tab is a filled pill and unread counts are round')}
      action={<Switch checked={on} onCheckedChange={setMessagesPills} />}
    />
  );
}
