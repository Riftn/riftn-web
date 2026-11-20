/**
 * Chat Reactors Drawer
 * ====================
 * Who reacted to a chat line, and with what: the phone sheet behind the
 * "reactions" row of the hold menu and behind a tap on the reactions under
 * your own live chat line.
 *
 * Live chat lines page their people in from /api/livechat/reactors; DM,
 * group and community lines already carry the addresses (`local`).
 */

import { useTranslation } from 'react-i18next';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ChatReactorsList, reactorCount } from './ChatReactorsList';

import { formatCount } from '@/lib/format-count';
interface ChatReactorsDrawerProps {
  /** The line to list; null keeps the sheet closed. */
  messageId: string | null;
  onClose: () => void;
  /** The line's reactions as the chat already holds them. */
  reactions?: Record<string, string[]>;
  /** DMs, groups and community rooms: names come from the addresses on the line, not the live chat endpoint. */
  local?: boolean;
  /** Open on one reaction's people. */
  initialEmoji?: string | null;
}

export function ChatReactorsDrawer({ messageId, onClose, reactions, local = false, initialEmoji = null }: ChatReactorsDrawerProps) {
  const { t } = useTranslation();
  const open = !!messageId;
  const peopleCount = reactorCount(reactions);

  return (
    <Drawer open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DrawerContent
        data-chat-reactors-drawer
        column
        className="p-0 gap-0 rounded-t-[28px] overflow-hidden z-[200] flex flex-col max-h-[80dvh]"
      >
        <DrawerHeader className="px-5 pt-4 pb-3 shrink-0">
          <DrawerTitle className="text-base font-semibold text-center">
            {t('reactionInfo.title')}
            {peopleCount > 0 && <span className="opacity-50 font-normal"> · {formatCount(peopleCount)}</span>}
          </DrawerTitle>
        </DrawerHeader>
        {open && (
          <ChatReactorsList
            reactions={reactions}
            remoteMessageId={local ? null : messageId}
            initialEmoji={initialEmoji}
            onNavigate={onClose}
            className="flex-1"
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

export default ChatReactorsDrawer;
