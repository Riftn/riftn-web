import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { toast } from '@/components/ui/sonner';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import titles from '@/i18n/offline-connection-titles.json';
import { resolveLanguage } from '@/lib/user-language-store';
import { OfflineConnectionToast } from './OfflineConnectionToast';

vi.mock('@/components/ui/sonner', () => ({ toast: { message: vi.fn(), dismiss: vi.fn() } }));
vi.mock('@/lib/user-language-store', () => ({ resolveLanguage: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

it('bundles a title for every language in the selector', () => {
  expect(Object.keys(titles).sort()).toEqual(SUPPORTED_LANGUAGES.map(({ code }) => code).sort());
  expect(Object.values(titles).every(title => title.trim().length > 0)).toBe(true);
});

it.each([
  ['tr', 'İnternet Bağlantısı Yok', 'ltr'],
  ['ar', 'لا يوجد اتصال بالإنترنت', 'rtl'],
])('uses the saved %s language and direction when the page starts offline', (code, title, direction) => {
  vi.mocked(resolveLanguage).mockReturnValue(code);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  render(<MemoryRouter><OfflineConnectionToast /></MemoryRouter>);
  expect(toast.message).toHaveBeenCalledTimes(1);
  const [renderTitle, options] = vi.mocked(toast.message).mock.calls[0];
  if (typeof renderTitle !== 'function') throw new Error('The notice must use the shared toast title layout');
  render(<>{renderTitle()}</>);
  expect(screen.getByText(title).getAttribute('lang')).toBe(code);
  expect(options?.style?.direction).toBe(direction);
});

it('skips a brief disconnect and clears the notice on reconnection', () => {
  vi.useFakeTimers();
  vi.mocked(resolveLanguage).mockReturnValue('en');
  const link = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  render(<MemoryRouter><OfflineConnectionToast /></MemoryRouter>);

  link.mockReturnValue(false);
  window.dispatchEvent(new Event('offline'));
  act(() => vi.advanceTimersByTime(2000));
  link.mockReturnValue(true);
  window.dispatchEvent(new Event('online'));
  act(() => vi.advanceTimersByTime(5000));
  expect(toast.message).not.toHaveBeenCalled();

  link.mockReturnValue(false);
  window.dispatchEvent(new Event('offline'));
  act(() => vi.advanceTimersByTime(4000));
  expect(toast.message).toHaveBeenCalledTimes(1);
  link.mockReturnValue(true);
  window.dispatchEvent(new Event('online'));
  expect(toast.dismiss).toHaveBeenLastCalledWith('offline-connection');
});
