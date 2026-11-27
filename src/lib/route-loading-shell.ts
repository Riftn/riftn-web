import { MORE_DOT_PATHS } from '@/components/ui/cut-icons/more-paths';
import '@/styles/quiet-post-loading.css';

export interface RouteLoadingShell {
  cover(): void;
  reveal(): void;
  remove(): void;
}

export const ROUTE_CONTENT_READY = 'dehub:route-content-ready';

export function notifyRouteContentReady(key: string): void {
  window.dispatchEvent(new CustomEvent(ROUTE_CONTENT_READY, { detail: key }));
}

/** Longest entrance in app-route-motion.css (220ms), plus a frame or two. */
const ENTRANCE_MS = 260;

/** A small, independent layer can composite while the destination renders. */
export function showRouteLoadingShell(title: string, backLabel: string, backwards = false): RouteLoadingShell | null {
  const main = document.querySelector<HTMLElement>('[data-main-panel]');
  if (!main) return null;
  const rect = main.getBoundingClientRect();
  const node = document.createElement('section');
  node.className = 'app-route-loading-shell';
  node.dataset.direction = backwards ? 'back' : 'forward';
  node.setAttribute('aria-busy', 'true');
  const style = getComputedStyle(main);
  node.style.left = `${rect.left}px`;
  node.style.width = `${rect.width}px`;
  node.style.color = style.color;
  node.style.backgroundColor = style.backgroundColor;
  node.innerHTML = '<header><button type="button"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 5-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><strong class="sr-only"></strong></header><div class="post-quiet-loader" aria-hidden="true"></div>';
  const dots = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  dots.setAttribute('viewBox', '0 0 32 32');
  for (const path of MORE_DOT_PATHS) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    dot.setAttribute('d', path);
    dot.setAttribute('fill', 'currentColor');
    dot.setAttribute('fill-rule', 'evenodd');
    dots.appendChild(dot);
  }
  node.querySelector('.post-quiet-loader')!.appendChild(dots);
  const button = node.querySelector('button')!;
  button.setAttribute('aria-label', backLabel);
  button.onclick = () => window.history.back();
  node.querySelector('strong')!.textContent = title;
  document.body.appendChild(node);
  // When the shell first reached a frame, so reveal() knows if its entrance
  // has finished without asking the browser.
  let firstFrameAt = 0;
  requestAnimationFrame((at) => { firstFrameAt = at; });
  // The shell sits over the page and takes every pointer on its own. It used
  // to also make the page underneath `inert` on computers, for the keyboard.
  // Switching `inert` makes the browser restyle every element under it, once
  // on the way in and once on the way out: on a home feed that was ~0.3 s
  // each, spent while the post was trying to draw. The cover is up for well
  // under a second, so the page is left alone.
  let removed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const remove = () => {
    if (removed) return;
    removed = true;
    clearTimeout(timer);
    node.remove();
  };
  // A lost route or error must never leave the feed hidden behind a shell.
  timer = setTimeout(remove, 5000);
  return {
    cover() {},
    reveal() {
      if (removed) return;
      clearTimeout(timer);
      if (document.documentElement.classList.contains('reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        remove();
        return;
      }
      button.disabled = true;
      // Leave from where the entrance got to. Once the entrance is over that
      // is simply "fully shown"; reading it back from the browser would lay
      // out the page that just landed underneath one more time.
      const entered = firstFrameAt > 0 && performance.now() - firstFrameAt > ENTRANCE_MS;
      if (!entered) {
        const current = getComputedStyle(node);
        node.style.opacity = current.opacity;
        node.style.transform = current.transform;
      }
      node.dataset.leaving = '';
      timer = setTimeout(remove, 120);
    },
    remove,
  };
}
