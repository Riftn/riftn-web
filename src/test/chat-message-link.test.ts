import { describe, expect, it } from 'vitest';
import { chatMessageLink, parseChatMessageLink, canLinkMessage, publicChatMentionPath } from '@/lib/chat-message-link';
import { buildChatMessageLinkHtml, chatMessageLinkOf } from '../../CLOUDFLARE_WORKER_SEO.js';

const split = (url: string) => {
  const u = new URL(url);
  return parseChatMessageLink(u.pathname, u.search);
};

describe('chat message links', () => {
  it('round-trips every kind of chat', () => {
    expect(split(chatMessageLink({ kind: 'public', roomId: 'global' }, 'abc123'))).toMatchObject({ key: 'public', messageId: 'abc123', target: { kind: 'public', roomId: 'global' } });
    expect(split(chatMessageLink({ kind: 'stream', tokenId: 42 }, 'm1'))).toMatchObject({ key: 'stream:42', messageId: 'm1' });
    expect(split(chatMessageLink({ kind: 'community', slug: 'Riftn' }, 'u-1'))).toMatchObject({ key: 'community:riftn', messageId: 'u-1' });
    expect(split(chatMessageLink({ kind: 'dm', conversationId: '6b00695d11fe8f64d793ad29' }, 'x'))).toMatchObject({ key: 'dm:6b00695d11fe8f64d793ad29' });
  });

  it('opens public chat mentions through the history-aware message link', () => {
    const path = publicChatMentionPath({ mentionContext: 'public_chat', roomId: 'topic-a', chatMessageId: 'm1' });
    expect(path).toBe('/app/messages?chat=public&room=topic-a&msg=m1');
    expect(split(`https://dehub.io${path}`)).toMatchObject({ target: { kind: 'public', roomId: 'topic-a' }, messageId: 'm1' });
    expect(publicChatMentionPath({ deepLink: '/chat?chatMessage=m2' })).toBe('/app/messages?chat=public&room=global&msg=m2');
    expect(publicChatMentionPath({ mentionContext: 'public_chat' })).toBe('/app/messages?chat=public&room=global');
    expect(publicChatMentionPath({ mentionContext: 'comment' })).toBeNull();
    expect(split('https://dehub.io/chat?chatMessage=m2')).toMatchObject({ key: 'public', messageId: 'm2' });
  });

  it('opens on riftn.com', () => {
    expect(chatMessageLink({ kind: 'dm', conversationId: 'c1' }, 'm1')).toBe('https://riftn.com/app/messages?conversation=c1&msg=m1');
    expect(chatMessageLink({ kind: 'community', slug: 'riftn' }, 'm1')).toBe('https://riftn.com/communities/riftn?tab=chat&msg=m1');
  });

  it('ignores other links and lines still sending', () => {
    expect(parseChatMessageLink('/app/messages', '?chat=public')).toBeNull();
    expect(parseChatMessageLink('/communities/join/abcd', '?msg=1')).toBeNull();
    expect(parseChatMessageLink('/app/wallet', '?msg=1')).toBeNull();
    expect(canLinkMessage('temp-123')).toBe(false);
    expect(canLinkMessage('6b00695d11fe8f64d793ad29')).toBe(true);
  });

  it('unfurls a private chat without its words', () => {
    const link = chatMessageLinkOf(new URL('https://riftn.com/app/messages?conversation=c1&msg=m1'));
    expect(link).toMatchObject({ kind: 'dm' });
    const html = buildChatMessageLinkHtml(link, null);
    expect(html).toContain('A message in a private chat on Riftn');
    expect(html).toContain('noindex');
  });

  it('unfurls a public chat line as who said what', () => {
    const link = chatMessageLinkOf(new URL('https://riftn.com/app/messages?chat=public&msg=m1'));
    const html = buildChatMessageLinkHtml(link, { id: 'm1', content: 'gm everyone', messageType: 'text', sender: { username: 'mal', displayName: 'Mal' } });
    expect(html).toContain('Mal in Riftn Public Chat');
    expect(html).toContain('gm everyone');
    expect(html).toContain('/_og/profile/');
  });
});
