import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
describe('feature language packs', () => {
  it('loads an English feature only when its strings are used', async () => {
    vi.resetModules();
    localStorage.clear();
    const fetchPack = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ editor: { packProbe: 'Editor loaded' } }) });
    vi.stubGlobal('fetch', fetchPack);
    const { default: i18n } = await import('./index');
    expect(fetchPack).not.toHaveBeenCalled();
    i18n.t('editor.packProbe');
    await vi.waitFor(() => expect(i18n.getResource('en', 'translation', 'editor.packProbe')).toBe('Editor loaded'));
    expect(fetchPack).toHaveBeenCalledTimes(1);
    expect(fetchPack.mock.calls[0][0]).toMatch(/\/locale-packs\/web\/[^/]+\/en\/creator.json$/);
    expect(i18n.t('editor.packProbe')).toBe('Editor loaded');
    expect(fetchPack).toHaveBeenCalledTimes(1);
  });

  it('keeps cached selected-language packs usable offline', async () => {
    vi.resetModules();
    const manifest = (await import('./locale-manifest.json')).default;
    localStorage.setItem(`locale-pack:${manifest.version}:fr:core`, JSON.stringify({ common: { offlineProbe: 'Hors ligne' } }));
    const fetchPack = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchPack);
    const { default: i18n, loadLanguage } = await import('./index');
    expect(await loadLanguage('fr')).toBe(true);
    expect(i18n.getResource('fr', 'translation', 'common.offlineProbe')).toBe('Hors ligne');
    expect(fetchPack.mock.calls.every(([url]) => !String(url).endsWith('/core.json'))).toBe(true);
  });

  it('uses the previous build’s language pack when an update starts offline', async () => {
    vi.resetModules();
    const oldKey = 'locale-pack:previous-build:fr:core';
    localStorage.setItem(oldKey, JSON.stringify({ common: { offlineProbe: 'Hors ligne' } }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const { default: i18n, loadLanguage } = await import('./index');
    expect(await loadLanguage('fr')).toBe(true);
    expect(await loadLanguage('fr')).toBe(true);
    expect(i18n.getResource('fr', 'translation', 'common.offlineProbe')).toBe('Hors ligne');
    expect(localStorage.getItem(oldKey)).not.toBeNull();
  });

  it('starts in the saved language while the replacement core pack is still downloading', async () => {
    vi.resetModules();
    const manifest = (await import('./locale-manifest.json')).default;
    const oldKey = 'locale-pack:previous-build:tr:core';
    const currentKey = `locale-pack:${manifest.version}:tr:core`;
    localStorage.setItem('user-preferred-language', 'tr');
    localStorage.setItem(oldKey, JSON.stringify({ common: { offlineProbe: 'Çevrimdışı' } }));
    let finishDownload!: (response: Response) => void;
    const download = new Promise<Response>(resolve => { finishDownload = resolve; });
    const fetchPack = vi.fn().mockReturnValue(download);
    vi.stubGlobal('fetch', fetchPack);

    const { default: i18n } = await import('./index');
    expect(i18n.language).toBe('tr');
    expect(document.documentElement.lang).toBe('tr');
    expect(i18n.t('common.offlineProbe')).toBe('Çevrimdışı');
    expect(fetchPack).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(oldKey)).not.toBeNull();

    finishDownload(new Response(JSON.stringify({ common: { offlineProbe: 'Güncel' } })));
    await vi.waitFor(() => expect(i18n.t('common.offlineProbe')).toBe('Güncel'));
    expect(localStorage.getItem(currentKey)).not.toBeNull();
    expect(localStorage.getItem(oldKey)).toBeNull();
    expect(localStorage.getItem('user-preferred-language')).toBe('tr');
  });
});
