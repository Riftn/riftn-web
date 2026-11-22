/**
 * Settings → Appearance: your own lines in Public Chat on a bubble, like
 * private chats (lib/chat-own-bubble, styles/chat-own-bubble.css).
 */

import { useTranslation } from 'react-i18next';
import MessagesIcon from '@/components/ui/cut-icons/messages';

import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { Switch } from '@/components/ui/switch';
import { setChatOwnBubble, useChatOwnBubble } from '@/lib/chat-own-bubble';

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
