import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DmMessage } from '@/lib/api/dehub';
import { DmUndecryptableMessages } from './DmLockedState';

vi.mock('@/components/app/AppState', () => ({ AppState: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { resolvedLanguage: 'en' },
  }),
}));

afterEach(cleanup);

function locked(id: string, name: string): DmMessage {
  return {
    _id: id, sender: { displayName: name }, createdAt: '2026-11-21T10:04:09Z',
    content: 'e2e:fixture-private-envelope', undecryptable: true,
  } as DmMessage;
}

it('opens only the chosen run and selects the individual original message', () => {
  const onDelete = vi.fn();
  const rows = [locked('one', 'First sender'), locked('two', 'Second sender')];
  const other = [locked('three', 'Third sender'), locked('four', 'Fourth sender')];
  const { container } = render(<>
    <DmUndecryptableMessages messages={rows} onDelete={onDelete} />
    <DmUndecryptableMessages messages={other} onDelete={onDelete} />
  </>);
  const [first, second] = screen.getAllByRole('button');
  fireEvent.click(first);
  expect(first.getAttribute('aria-expanded')).toBe('true');
  expect(second.getAttribute('aria-expanded')).toBe('false');
  expect(onDelete).not.toHaveBeenCalled();
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(2);
  expect(items[1].textContent).toContain('Second sender');
  fireEvent.click(within(items[1]).getByRole('button', { name: 'Delete' }));
  expect(onDelete.mock.calls).toEqual([[rows[1]]]);
  expect(container.textContent).not.toContain('e2e:');
  fireEvent.click(first);
  expect(screen.queryByRole('listitem')).toBeNull();
});

it('lets a singleton choose its existing delete action immediately', () => {
  const row = locked('only', 'Peer');
  const onDelete = vi.fn();
  render(<DmUndecryptableMessages messages={[row]} onDelete={onDelete} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onDelete).toHaveBeenCalledWith(row);
});
