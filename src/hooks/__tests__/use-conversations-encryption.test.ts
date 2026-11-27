import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  decryptFromPeer: vi.fn(),
  loadIdentity: vi.fn(),
  getConversation: vi.fn(),
  decryptMessageInPlace: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('react-router-dom', () => ({ useLocation: vi.fn() }));
vi.mock('@/lib/api/dehub', () => ({ getConversation: mocks.getConversation }));
vi.mock('@/lib/api/dehub/dm-socket', () => ({}));
vi.mock('@/lib/dm-e2ee/crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dm-e2ee/crypto')>()),
  isEncryptedContent: (content: unknown) => typeof content === 'string' && content.startsWith('e2e:'),
}));
vi.mock('@/lib/dm-e2ee/keys', () => ({
  decryptFromPeer: mocks.decryptFromPeer,
  decryptMessageInPlace: mocks.decryptMessageInPlace,
  hasIdentityFor: () => true,
  loadIdentity: mocks.loadIdentity,
  onIdentityChange: vi.fn(),
  prepareOutgoing: vi.fn(),
}));

import { QueryClient } from '@tanstack/react-query';
import { decryptThread, decryptConversationPreviews } from '@/hooks/use-messages';
import { encodeMediaDescriptor } from '@/lib/dm-e2ee/media';

describe('encrypted conversation previews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptFromPeer.mockResolvedValue('Decrypted preview');
  });

  it('loads the stored identity before decrypting the conversation row', async () => {
    const result = await decryptConversationPreviews([{
      id: 'conversation-1',
      otherUser: { address: '0x2222222222222222222222222222222222222222' },
      participants: [],
      unreadCount: 0,
      lastMessage: {
        content: 'e2e:1:nonce:ciphertext',
        createdAt: '2026-09-06T20:00:00.000Z',
      },
    } as never], '0x1111111111111111111111111111111111111111');

    expect(result[0].lastMessage?.content).toBe('Decrypted preview');
    expect(result[0].lastMessage?.undecryptable).toBe(false);
    expect(mocks.loadIdentity).toHaveBeenCalledWith('0x1111111111111111111111111111111111111111');
    expect(mocks.decryptFromPeer).toHaveBeenCalledWith(
      '0x2222222222222222222222222222222222222222',
      'e2e:1:nonce:ciphertext',
    );
    expect(mocks.loadIdentity.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.decryptFromPeer.mock.invocationCallOrder[0]);
  });

  it('labels an encrypted attachment instead of showing its descriptor', async () => {
    const descriptor = { k: btoa(String.fromCharCode(...new Uint8Array(32))), kind: 'audio' as const, mime: 'audio/webm', size: 10, dur: 3 };
    mocks.decryptFromPeer.mockResolvedValue(encodeMediaDescriptor(descriptor));
    const result = await decryptConversationPreviews([{
      id: 'conversation-1',
      otherUser: { address: '0x2222222222222222222222222222222222222222' },
      participants: [],
      unreadCount: 0,
      lastMessage: { content: 'e2e:1:nonce:ciphertext', createdAt: '2026-09-06T20:00:00.000Z' },
    } as never], '0x1111111111111111111111111111111111111111');

    expect(result[0].lastMessage?.content).toBe('');
    expect(result[0].lastMessage?.encMedia).toEqual(descriptor);
    expect(result[0].lastMessage?.undecryptable).toBe(false);
  });
});

it('resolves the peer once for an encrypted outgoing-only page opened by direct link', async () => {
  const me = '0x1111111111111111111111111111111111111111';
  const peer = '0x2222222222222222222222222222222222222222';
  const id = 'abcdefabcdefabcdefabcdef';
  const message = { sender: { address: me }, content: 'e2e:1:nonce:ciphertext' };
  const client = new QueryClient();
  mocks.getConversation.mockResolvedValue({ otherUser: { address: peer } });
  await decryptThread(client, id, me, [message as never]);
  await decryptThread(client, id, me, [message as never]);
  expect(mocks.getConversation).toHaveBeenCalledTimes(1);
  expect(mocks.getConversation).toHaveBeenCalledWith(id, me);
  expect(mocks.decryptMessageInPlace).toHaveBeenCalledWith(message, peer);
  client.clear();
});
