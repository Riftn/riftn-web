import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./overlay-exit-ghost', () => ({ isOverlayExiting: vi.fn(() => false) }));

import { installOverlayClickGuard } from './overlay-click-guard';
import { isOverlayExiting } from './overlay-exit-ghost';

const exiting = isOverlayExiting as unknown as ReturnType<typeof vi.fn>;

function press(el: Element) {
  el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  el.dispatchEvent(new Event('pointerup', { bubbles: true }));
}
function click(el: Element) {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

describe('overlay click guard', () => {
  let uninstall: () => void;
  let button: HTMLButtonElement;
  let onButton: ReturnType<typeof vi.fn<(e: Event) => void>>;
  let scrim: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"><button id="b">Follow</button></div><div id="overlay-root"><div data-vaul-overlay></div><div role="dialog"><button id="inside">Save</button></div></div>';
    button = document.getElementById('b') as HTMLButtonElement;
    scrim = document.querySelector('[data-vaul-overlay]') as HTMLDivElement;
    onButton = vi.fn<(e: Event) => void>();
    button.addEventListener('click', onButton);
    exiting.mockReturnValue(false);
    uninstall = installOverlayClickGuard();
  });
  afterEach(() => uninstall());

  it('leaves ordinary page clicks alone', () => {
    press(button);
    click(button);
    expect(onButton).toHaveBeenCalledTimes(1);
  });

  it('withholds the click that lands on the page after a backdrop press', () => {
    press(scrim);
    scrim.remove();
    const e = click(button);
    expect(onButton).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it('still lets a layer waiting on that click dismiss', () => {
    const waiting = vi.fn<(e: Event) => void>();
    document.addEventListener('click', waiting, { once: true });
    press(scrim);
    scrim.remove();
    click(button);
    expect(waiting).toHaveBeenCalledTimes(1);
    expect(onButton).not.toHaveBeenCalled();
  });

  it('only withholds one click per press', () => {
    press(scrim);
    scrim.remove();
    click(button);
    press(button);
    click(button);
    expect(onButton).toHaveBeenCalledTimes(1);
  });

  it('withholds page clicks while a closed overlay is still sliding away', () => {
    exiting.mockReturnValue(true);
    press(button);
    click(button);
    expect(onButton).not.toHaveBeenCalled();
  });

  it('never touches clicks inside an overlay', () => {
    exiting.mockReturnValue(true);
    const inside = document.getElementById('inside') as HTMLButtonElement;
    const onInside = vi.fn<(e: Event) => void>();
    inside.addEventListener('click', onInside);
    press(inside);
    click(inside);
    expect(onInside).toHaveBeenCalledTimes(1);
  });

  it('closes a menu whose clear backdrop was pressed when nothing else did', async () => {
    document.getElementById('overlay-root')!.insertAdjacentHTML(
      'beforeend',
      '<div data-radix-popper-content-wrapper id="wrap"><div data-modal-shield data-state="open" role="menu"></div></div>',
    );
    const wrap = document.getElementById('wrap')!;
    const escapes = vi.fn<(e: Event) => void>();
    document.addEventListener('keydown', escapes);
    press(wrap);
    await new Promise((r) => setTimeout(r, 5));
    expect(escapes).toHaveBeenCalledTimes(1);
    expect((escapes.mock.calls[0][0] as KeyboardEvent).key).toBe('Escape');
    // The click that follows the press, once the menu is gone, still does not reach the page.
    wrap.remove();
    click(button);
    expect(onButton).not.toHaveBeenCalled();
    document.removeEventListener('keydown', escapes);
  });

  it('leaves a menu alone once it has already closed', async () => {
    document.getElementById('overlay-root')!.insertAdjacentHTML(
      'beforeend',
      '<div data-radix-popper-content-wrapper id="wrap"><div data-modal-shield data-state="open" role="menu"></div></div>',
    );
    const wrap = document.getElementById('wrap')!;
    const escapes = vi.fn<(e: Event) => void>();
    document.addEventListener('keydown', escapes);
    press(wrap);
    wrap.firstElementChild!.setAttribute('data-state', 'closed');
    await new Promise((r) => setTimeout(r, 5));
    expect(escapes).not.toHaveBeenCalled();
    document.removeEventListener('keydown', escapes);
  });

  it('does not eat a keyboard click after a backdrop press that produced none', () => {
    press(scrim);
    window.dispatchEvent(new Event('keydown'));
    click(button);
    expect(onButton).toHaveBeenCalledTimes(1);
  });
});
