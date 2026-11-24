import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { orderedTranslateLanguages, rememberTranslateLang, rememberedTranslateLang, translateDraft } from '@/features/post/post-translate';

describe('post draft translate', () => {
  beforeEach(() => {
    invoke.mockReset();
    localStorage.clear();
  });

  it('sends the draft as private text and returns the translation with its language', async () => {
    invoke.mockResolvedValue({ data: { translatedText: 'We are covering a year of road in a day', detectedLanguage: { language: 'TR' } }, error: null });
    const out = await translateDraft('  Bir günde bir yıllık yol ilerliyoruz ', 'en');
    expect(invoke).toHaveBeenCalledWith('translate-text', { body: { text: 'Bir günde bir yıllık yol ilerliyoruz', targetLang: 'en' } });
    expect(out).toEqual({ text: 'We are covering a year of road in a day', from: 'tr', same: false });
  });

  it('says when the draft is already in that language', async () => {
    invoke.mockResolvedValue({ data: { translatedText: 'Hello there', sameLanguage: true }, error: null });
    expect((await translateDraft('Hello there', 'en')).same).toBe(true);
  });

  it('throws when the translator fails, so the draft is left alone', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('down') });
    await expect(translateDraft('Merhaba', 'en')).rejects.toThrow();
  });

  it('remembers the last language and lists it first, then English and the app language', () => {
    expect(rememberedTranslateLang()).toBe('en');
    rememberTranslateLang('de');
    const names = { en: 'English', de: 'German', tr: 'Turkish', ar: 'Arabic', fr: 'French' };
    expect(orderedTranslateLanguages(names, 'tr', rememberedTranslateLang())).toEqual(['de', 'en', 'tr', 'ar', 'fr']);
  });
});
