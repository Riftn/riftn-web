import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OfflineNotice } from './OfflineNotice';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'tr-TR' } }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('shows the selected language during an outage and clears it on reconnect', () => {
  const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
  render(<OfflineNotice />);
  expect(screen.getByRole('status').textContent).toBe('');

  online.mockReturnValue(false);
  act(() => { window.dispatchEvent(new Event('offline')); });
  expect(screen.getByRole('status').textContent).toBe('İnternet Bağlantısı Yok');

  online.mockReturnValue(true);
  act(() => { window.dispatchEvent(new Event('online')); });
  expect(screen.getByRole('status').textContent).toBe('');
});
