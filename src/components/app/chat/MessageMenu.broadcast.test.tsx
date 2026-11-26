import { useRef, useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { MessageMenu } from './MessageMenu';

afterEach(() => vi.unstubAllGlobals());

it('keeps reactions and Escape inside the broadcaster drawer', () => {
  const react = vi.fn();
  const requestEnd = vi.fn();
  let onResize: () => void;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { onResize = callback; }
    observe() {}
    disconnect() {}
  });

  function Broadcast() {
    const drawer = useRef<HTMLDivElement>(null);
    const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

    return (
      <Drawer open onOpenChange={requestEnd}>
        <DrawerContent ref={drawer} hideClose aria-describedby={undefined}>
          <DrawerTitle>Broadcast</DrawerTitle>
          <button type="button" onClick={() => setPoint({ x: 820, y: 330 })}>Message options trigger</button>
          <button type="button" onClick={requestEnd}>End Stream</button>
          {point && (
            <MessageMenu
              point={point}
              container={drawer.current ?? undefined}
              onClose={() => setPoint(null)}
              quickReactions={['👍']}
              onReact={react}
              actions={[]}
              allowMore={false}
            />
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  render(<Broadcast />);
  const drawer = screen.getByRole('dialog');
  const openMenu = within(drawer).getByRole('button', { name: 'Message options trigger' });
  Object.defineProperties(drawer, {
    clientWidth: { value: 600 },
    clientHeight: { value: 400 },
  });
  vi.spyOn(drawer, 'getBoundingClientRect').mockReturnValue({
    ...drawer.getBoundingClientRect(),
    left: 250,
    top: 200,
  });

  openMenu.focus();
  fireEvent.click(openMenu);
  const menu = within(drawer).getByRole('menu');
  expect(menu).toHaveStyle({ position: 'absolute', left: '322px', top: '30px' });
  expect(menu).toHaveFocus();
  // The expanded picker can grow asynchronously as emoji data arrives.
  Object.defineProperty(menu, 'offsetHeight', { value: 380 });
  act(() => onResize());
  expect(menu).toHaveStyle({ top: '10px' });
  const reaction = within(menu).getByRole('button', { name: '👍' });
  fireEvent.pointerDown(reaction, { pointerType: 'mouse' });
  fireEvent.pointerUp(reaction, { pointerType: 'mouse' });
  fireEvent.click(reaction);
  expect(react).toHaveBeenCalledExactlyOnceWith('👍');
  expect(openMenu).toHaveFocus();
  expect(requestEnd).not.toHaveBeenCalled();

  fireEvent.click(openMenu);
  fireEvent.keyDown(within(drawer).getByRole('menu'), { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(openMenu).toHaveFocus();
  expect(requestEnd).not.toHaveBeenCalled();

  fireEvent.click(within(drawer).getByRole('button', { name: 'End Stream' }));
  expect(requestEnd).toHaveBeenCalledTimes(1);
});
