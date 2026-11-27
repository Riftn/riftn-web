import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const apiCall = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock('@/lib/api/dehub/core', () => ({ apiCall: (...a: unknown[]) => apiCall(...a) }));
let encrypted = false;
vi.mock('@/lib/dm-e2ee/encrypt-choice', () => ({ isChatEncrypted: () => encrypted }));

import { setTranslateOutChats, translateOutgoing } from '@/lib/dm-translate-out';

const ON = { conversationId: 'c1', pinnedAt: null, archivedAt: null, mutedUntil: null, markedUnread: false, translateOutAt: '2026-11-22T00:00:00Z' };

describe('translateOutgoing', () => {
  beforeEach(() => {
    invoke.mockReset();
    apiCall.mockReset();
    encrypted = false;
    setTranslateOutChats([ON]);
    apiCall.mockResolvedValue({ result: { language: 'en' } });
  });

  it('sends the line in their language and keeps what was typed', async () => {
    invoke.mockResolvedValue({ data: { translatedText: 'How are you?' }, error: null });
    await expect(translateOutgoing('c1', ' Nasılsın? ')).resolves.toEqual({ content: 'How are you?', original: 'Nasılsın?', lang: 'en' });
    expect(invoke).toHaveBeenCalledWith('translate-text', { body: { text: 'Nasılsın?', targetLang: 'en', purpose: 'chat' } });
  });

  it('does nothing while the switch is off for the chat', async () => {
    setTranslateOutChats([]);
    await expect(translateOutgoing('c1', 'Nasılsın?')).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('leaves encrypted chats alone', async () => {
    encrypted = true;
    await expect(translateOutgoing('c1', 'Nasılsın?')).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sends as typed when already in their language or the translator fails', async () => {
    invoke.mockResolvedValueOnce({ data: { translatedText: 'Hello there', sameLanguage: true }, error: null });
    await expect(translateOutgoing('c1', 'Hello there')).resolves.toBeNull();
    invoke.mockResolvedValueOnce({ data: null, error: new Error('down') });
    await expect(translateOutgoing('c1', 'Nasılsın?')).resolves.toBeNull();
  });

  it('skips emoji-only lines', async () => {
    await expect(translateOutgoing('c1', '👍🔥')).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
