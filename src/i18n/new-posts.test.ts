import { afterEach, expect, it, vi } from 'vitest';
import tr from './locales/tr.json';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('uses the Turkish core pack for new-post counts after a language switch', async () => {
  vi.resetModules();
  localStorage.setItem('user-preferred-language', 'en');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: url.endsWith('/tr/core.json'),
    json: async () => ({ feed: tr.feed }),
  })));

  const { default: i18n, loadLanguage } = await import('./index');
  const label = (count: number) => i18n.t('feed.newPosts', { count, defaultValue: '{{count}} new posts' });
  expect(label(1)).toBe('1 new post');
  expect(await loadLanguage('tr')).toBe(true);
  await i18n.changeLanguage('tr');
  expect(label(1)).toBe('1 yeni gönderi');
  expect(label(3)).toBe('3 yeni gönderi');
});
