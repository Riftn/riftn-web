/**
 * Chats as cards (Settings → Appearance). On: every chat in Messages is its
 * own card. Off: a plain list with a line between chats. Writes lib/chat-cards.
 */
import { useTranslation } from 'react-i18next';
import { LayoutList } from 'lucide-react';

import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { Switch } from '@/components/ui/switch';
import { setChatCards, useChatCards } from '@/lib/chat-cards';

export function ChatCardsSetting() {
  const { t } = useTranslation();
  const cards = useChatCards();

  return (
    <SettingsRow
      icon={<LayoutList />}
      anchor="chat-cards"
      title={t('settings.chatCards', 'Chats as cards')}
      description={t('settings.chatCardsDesc', 'Each chat on its own card. Turn off for a plain list with a line between chats.')}
      action={<Switch checked={cards} onCheckedChange={setChatCards} />}
    />
  );
}
