/**
 * Sending in a live chat: your words leave the box and fly into their own
 * line in the chat, landing exactly where the line sits. The real line stays
 * hidden until the copy lands on it, so nothing is drawn twice.
 *
 * The copy rides a layer inside `host` (absolute, so a transformed parent,
 * like a swipe slide, can't throw it off), and follows the line every frame:
 * the list scrolls smoothly to the newest line while the copy is in the air.
 */
const DURATION = 440;

// cubic-bezier(0.45, 0, 0.1, 1): the house travel curve.
function travel(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0;
  let hi = 1;
  let t = 0.5;
  for (let i = 0; i < 24; i += 1) {
    t = (lo + hi) / 2;
    const cx = 3 * 0.45 * t * (1 - t) * (1 - t) + 3 * 0.1 * t * t * (1 - t) + t * t * t;
    if (cx < x) lo = t; else hi = t;
  }
  return 3 * 1 * t * t * (1 - t) + t * t * t;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export interface FlyFrom {
  /** Where the words started in the box, in viewport pixels. */
  x: number;
  y: number;
}

/**
 * Flies a copy of `row` from `from` to the row. `words` is the element in the
 * row holding the message text (the copy is placed so its words start where
 * the box's words were). `list` is the scroller: the copy never lands below
 * its visible bottom. Returns a cancel function.
 */
export function flyChatLine({ row, host, list, from, words, styleFrom }: {
  row: HTMLElement;
  host: HTMLElement;
  list: HTMLElement | null;
  from: FlyFrom;
  words: HTMLElement | null;
  /** Copied onto the layer so the line keeps its type and shadow (the list's classes and data-keep-dark). */
  styleFrom: HTMLElement | null;
}): () => void {
  if (prefersReducedMotion()) return () => {};
  const layer = document.createElement('div');
  if (styleFrom) {
    layer.className = styleFrom.className;
    if (styleFrom.hasAttribute('data-keep-dark')) layer.setAttribute('data-keep-dark', '');
  }
  layer.classList.add('live-chat-fly-layer');
  // The list's own scroll, mask and height must not apply to the layer.
  Object.assign(layer.style, { overflow: 'visible', maxHeight: 'none', height: 'auto', margin: '0', padding: '0', maskImage: 'none', webkitMaskImage: 'none' } as Partial<CSSStyleDeclaration>);
  const copy = row.cloneNode(true) as HTMLElement;
  copy.removeAttribute('id');
  copy.removeAttribute('data-live-msg');
  copy.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  copy.classList.remove('dh-chat-land', 'dh-sent-text-glow');
  copy.setAttribute('aria-hidden', 'true');
  const rowBox = row.getBoundingClientRect();
  copy.style.width = `${rowBox.width}px`;
  copy.style.opacity = '0';
  layer.appendChild(copy);
  host.appendChild(layer);

  // Where the words sit inside the line, so they start where the box's were.
  const wordBox = words?.getBoundingClientRect();
  const dx = wordBox ? wordBox.left - rowBox.left : 32;
  const dy = wordBox ? wordBox.top - rowBox.top : 18;
  // Face and name arrive with the words, not before them.
  const lead = copy.firstElementChild as HTMLElement | null;
  const face = lead?.firstElementChild as HTMLElement | null;
  const nameRow = (lead?.children[1]?.querySelector(':scope > .flex.items-baseline') as HTMLElement | null) ?? null;

  row.style.visibility = 'hidden';
  const startX = from.x - dx;
  const startY = from.y - dy;
  const begin = performance.now();
  let frame = 0;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    row.style.visibility = '';
    layer.remove();
  };
  const step = (now: number) => {
    if (!row.isConnected || !host.isConnected) { finish(); return; }
    const p = Math.min(1, (now - begin) / DURATION);
    const q = travel(p);
    const hostBox = host.getBoundingClientRect();
    const target = row.getBoundingClientRect();
    let endY = target.top;
    if (list) {
      const lb = list.getBoundingClientRect();
      endY = Math.min(endY, lb.bottom - target.height);
    }
    const x = startX + (target.left - startX) * q - hostBox.left;
    const y = startY + (endY - startY) * q - hostBox.top;
    copy.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    copy.style.opacity = String(Math.min(1, 0.35 + p * 6.5));
    const lead2 = Math.max(0, Math.min(1, (q - 0.3) / 0.45));
    if (face) face.style.opacity = String(lead2);
    if (nameRow) nameRow.style.opacity = String(lead2);
    if (p >= 1) { finish(); return; }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return finish;
}
