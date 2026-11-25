import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMomentPreviewSetting, useMomentPreviewsBlurred } from './moment-preview-blur';

const auth = vi.hoisted(() => ({ isAuthenticated: true, walletAddress: 'first', isLoading: false }));
vi.mock('@/contexts/AuthContext', async () => {
  const { createContext } = await import('react');
  return { AuthContext: createContext(auth) };
});

afterEach(() => {
  localStorage.clear();
  Object.assign(auth, { isAuthenticated: true, walletAddress: 'first', isLoading: false });
});

it('preserves the saved choice when the settings remount and the same account returns', () => {
  const settings = renderHook(useMomentPreviewSetting);
  act(() => settings.result.current.setBlurred(true));
  expect(settings.result.current.blurred).toBe(true);
  settings.unmount();

  const previews = renderHook(useMomentPreviewsBlurred);
  expect(previews.result.current).toBe(true);
  auth.isAuthenticated = false;
  previews.rerender();
  expect(previews.result.current).toBe(false);
  auth.isAuthenticated = true;
  auth.walletAddress = 'second';
  previews.rerender();
  expect(previews.result.current).toBe(false);
  auth.walletAddress = 'FIRST';
  previews.rerender();
  expect(previews.result.current).toBe(true);
});

it('keeps previews covered while restoring a session and honours the existing device setting', () => {
  auth.isLoading = true;
  auth.isAuthenticated = false;
  const previews = renderHook(useMomentPreviewsBlurred);
  expect(previews.result.current).toBe(true);
  localStorage.setItem('riftn.blurMomentPreviews', '1');
  auth.isLoading = false;
  auth.isAuthenticated = true;
  previews.rerender();
  expect(previews.result.current).toBe(true);
  const settings = renderHook(useMomentPreviewSetting);
  act(() => settings.result.current.setBlurred(false));
  expect(previews.result.current).toBe(false);
});
