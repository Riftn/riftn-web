import { describe, it, expect, afterEach } from 'vitest';
import { watchShortsEngagement, SHORTS_READING_QUIET_MS } from '@/lib/shorts-engaged';

function viewer() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div data-shorts-panel data-shorts-scrollable>
      <div class="list">comments</div>
      <textarea></textarea>
    </div>
    <button>like</button>`;
  document.body.appendChild(root);
  return root;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('shorts engagement (no auto-advance while typing or reading)', () => {
  it('is idle when nothing is happening', () => {
    const root = viewer();
    expect(watchShortsEngagement(root).isEngaged()).toBe(false);
  });

  it('holds while the comment box has focus', () => {
    const root = viewer();
    const watch = watchShortsEngagement(root);
    root.querySelector('textarea')!.focus();
    expect(watch.isEngaged()).toBe(true);
  });

  it('holds while the comment box has unsent text, even after blur', () => {
    const root = viewer();
    const watch = watchShortsEngagement(root);
    const box = root.querySelector('textarea')!;
    box.value = 'half a reply';
    box.blur();
    expect(watch.isEngaged()).toBe(true);
  });

  it('ignores a focused box outside the viewer (e.g. the search bar)', () => {
    const root = viewer();
    const search = document.createElement('input');
    document.body.appendChild(search);
    const watch = watchShortsEngagement(root);
    search.focus();
    expect(watch.isEngaged()).toBe(false);
  });

  it('holds for a few seconds after scrolling the comments, then lets go', () => {
    const root = viewer();
    let t = 1000;
    const watch = watchShortsEngagement(root, () => t);
    root.querySelector('.list')!.dispatchEvent(new Event('scroll'));
    expect(watch.isEngaged()).toBe(true);
    t += SHORTS_READING_QUIET_MS + 1;
    expect(watch.isEngaged()).toBe(false);
  });

  it('a click outside the comments does not count as reading', () => {
    const root = viewer();
    const watch = watchShortsEngagement(root);
    root.querySelector('button')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(watch.isEngaged()).toBe(false);
  });
});
