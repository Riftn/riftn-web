import { it, expect } from 'vitest';
import { showRouteLoadingShell } from '@/lib/route-loading-shell';

it('never makes the page under the post cover inert (that restyles the whole feed twice per open)', () => {
  const main = document.createElement('main');
  main.setAttribute('data-main-panel', '');
  document.body.appendChild(main);
  const shell = showRouteLoadingShell('Post', 'Back')!;
  shell.cover();
  expect(main.hasAttribute('inert')).toBe(false);
  expect((main as HTMLElement & { inert?: boolean }).inert).not.toBe(true);
  shell.remove();
  expect(document.querySelector('.app-route-loading-shell')).toBeNull();
  main.remove();
});
