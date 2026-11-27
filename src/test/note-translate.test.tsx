/**
 * Notes in another language read in the reader's language: translated as soon
 * as they show, with "See original" on the open note. Same-language notes and
 * your own note send nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup, act } from '@testing-library/react';

const invoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

vi.mock('@/i18n', () => ({
  default: { language: 'en', changeLanguage: vi.fn() },
  loadLanguage: vi.fn().mockResolvedValue(true),
}));

const TRANSLATED = 'What a beautiful day today';

beforeEach(() => {
  vi.resetModules();
  invoke.mockReset();
  localStorage.clear();
  localStorage.setItem('user-preferred-language', 'en');
  invoke.mockResolvedValue({ data: { translatedText: TRANSLATED, detectedLanguage: { language: 'tr' } }, error: null });
});

afterEach(cleanup);

async function hook(text: string, own = false) {
  const { useNoteWords } = await import('@/components/app/chat/note-translate');
  return renderHook(() => useNoteWords(text, own));
}

describe('note translation', () => {
  it('translates a note in another language on sight, and flips back to the original', async () => {
    const { result } = await hook('Bugün ne güzel bir gün');
    await waitFor(() => expect(result.current.shown).toBe(TRANSLATED));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body).toEqual({ text: 'Bugün ne güzel bir gün', targetLang: 'en' });
    expect(result.current.offer).toBe(true);
    act(() => result.current.showOriginal());
    expect(result.current.shown).toBe('Bugün ne güzel bir gün');
    expect(result.current.offer).toBe(true);
    act(() => result.current.translate());
    await waitFor(() => expect(result.current.shown).toBe(TRANSLATED));
  });

  it('sends nothing for a note already in the reader\'s language', async () => {
    const { result } = await hook('going to the beach with the kids today');
    await new Promise(r => setTimeout(r, 0));
    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.offer).toBe(false);
  });

  it('never translates your own note', async () => {
    const { result } = await hook('Bugün çok yorgunum ama mutluyum', true);
    await new Promise(r => setTimeout(r, 0));
    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.offer).toBe(false);
  });

  it('waits for a tap when auto-translate is off', async () => {
    const { setAutoTranslateEnabled } = await import('@/lib/auto-translate-setting');
    setAutoTranslateEnabled(false);
    const { result } = await hook('Yarın sinemaya gidiyoruz');
    await new Promise(r => setTimeout(r, 0));
    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.offer).toBe(true);
    act(() => result.current.translate());
    await waitFor(() => expect(result.current.shown).toBe(TRANSLATED));
  });
});
