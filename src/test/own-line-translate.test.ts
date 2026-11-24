import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@/hooks/use-user-language', () => ({ useUserLanguage: () => ({ language: 'en' }) }));
vi.mock('@/hooks/use-compose-translate', () => ({ translateTarget: () => 'en' }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { translateOwnLine } from '@/components/app/chat/own-line-translate';

describe('Translate on your own sent line', () => {
  beforeEach(() => invoke.mockReset());

  it('goes into your language, privately', async () => {
    invoke.mockResolvedValue({ data: { translatedText: 'See you tomorrow' }, error: null });
    await expect(translateOwnLine('Yarın görüşürüz', 'en', 'en')).resolves.toEqual({ text: 'See you tomorrow', lang: 'en' });
    expect(invoke).toHaveBeenCalledWith('translate-text', { body: { text: 'Yarın görüşürüz', targetLang: 'en' } });
  });

  it('uses your composer language when the line is already in yours', async () => {
    invoke
      .mockResolvedValueOnce({ data: { translatedText: 'see you tomorrow', sameLanguage: true }, error: null })
      .mockResolvedValueOnce({ data: { translatedText: 'Yarın görüşürüz' }, error: null });
    await expect(translateOwnLine('see you tomorrow', 'en', 'tr')).resolves.toEqual({ text: 'Yarın görüşürüz', lang: 'tr' });
    expect(invoke).toHaveBeenLastCalledWith('translate-text', { body: { text: 'see you tomorrow', targetLang: 'tr' } });
  });

  it('says so when both languages already match, and fails quietly on errors', async () => {
    invoke.mockResolvedValue({ data: { translatedText: 'hello there', sameLanguage: true }, error: null });
    await expect(translateOwnLine('hello there', 'en', 'en')).resolves.toBe('same');
    expect(invoke).toHaveBeenCalledTimes(1);
    invoke.mockResolvedValue({ data: null, error: new Error('down') });
    await expect(translateOwnLine('bonjour', 'en', 'en')).resolves.toBeNull();
    await expect(translateOwnLine('👍🔥', 'en', 'tr')).resolves.toBe('same');
  });
});
