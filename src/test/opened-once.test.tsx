import { renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { useOpenedOnce } from '@/hooks/use-opened-once';

it('stays false while closed, turns true on first open and stays true after closing', () => {
  const { result, rerender } = renderHook(({ open }) => useOpenedOnce(open), { initialProps: { open: false } });
  expect(result.current).toBe(false);
  rerender({ open: false });
  expect(result.current).toBe(false);
  rerender({ open: true });
  expect(result.current).toBe(true);
  rerender({ open: false });
  expect(result.current).toBe(true);
});

it('keeps the per-card tip and delete sheets unbuilt until opened', () => {
  for (const file of ['src/components/app/modals/TipModal.tsx', 'src/components/app/modals/DeletePostModal.tsx']) {
    expect(readFileSync(file, 'utf8')).toMatch(/useOpenedOnce\(props\.open\) \? </);
  }
});

it('does not ask the browser for the page width while a post opens on a phone', () => {
  const page = readFileSync('src/pages/app/SinglePostPage.tsx', 'utf8');
  expect(page).toContain("window.matchMedia('(min-width: 1024px)').matches");
  expect(page).not.toMatch(/const desktopView = .*innerWidth/);
});
