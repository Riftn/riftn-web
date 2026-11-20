import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { parseChatMessageLink, setPendingChatLink } from '@/lib/chat-message-link-core';

/**
 * Notes a copied message link the moment it lands, before the page it opens
 * rewrites its own address (see lib/chat-message-link). Renders nothing.
 */
export function ChatLinkCatcher() {
  const { pathname, search, key } = useLocation();
  useEffect(() => {
    const link = parseChatMessageLink(pathname, search);
    if (link) setPendingChatLink(link.target, link.messageId);
  }, [pathname, search, key]);
  return null;
}
