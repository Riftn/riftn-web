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

it('keeps :has() off selectors that end in a bare utility class', () => {
  const css = readFileSync('src/index.css', 'utf8');
  // Each of these put `.absolute` / `.fixed` in the page-wide :has() restyle
  // set, so every DOM change anywhere restyled all of them.
  expect(css).not.toContain(':has([data-audio-studio-placeholder]) > .absolute');
  expect(css).not.toContain('body:has(#app-root[data-fullscreen-chat])');
  expect(css).toContain('[data-audio-backdrop] > .absolute:has(> [data-audio-studio-placeholder])');
  expect(css).toContain('body[data-fullscreen-chat-up] > ');
});
