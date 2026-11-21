import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderTextWithLinks } from '../TranslatableText';
import { clientNavigate } from '@/lib/client-navigate';

vi.mock('@/lib/client-navigate', () => ({ clientNavigate: vi.fn() }));

it('opens the mentioned profile without passing sentence punctuation or starting a row gesture', () => {
  const pressed = vi.fn();
  const { container } = render(<p onPointerDown={pressed}>{renderTextWithLinks('Ask @araf. Or @first.last-name!')}</p>);
  const first = screen.getByRole('link', { name: '@araf' });
  expect(first.getAttribute('href')).toBe('/araf');
  expect(screen.getByRole('link', { name: '@first.last-name' }).getAttribute('href')).toBe('/first.last-name');
  fireEvent.pointerDown(first);
  fireEvent.click(first);
  expect(pressed).not.toHaveBeenCalled();
  expect(clientNavigate).toHaveBeenCalledWith('/araf');
  expect(container.textContent).toBe('Ask @araf. Or @first.last-name!');
});
