import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InPlaceEditField } from './InPlaceEdit';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

let n = 0;
const key = () => `test:edit:${++n}`;

it('saves a moment after typing stops and stays open', async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  const onDone = vi.fn();
  render(<InPlaceEditField draftKey={key()} text="hello" onSave={onSave} onDone={onDone} />);
  const field = screen.getByRole('textbox');
  expect(document.activeElement).toBe(field);
  fireEvent.change(field, { target: { value: 'hello there' } });
  expect(onSave).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(1600); });
  expect(onSave).toHaveBeenCalledWith('hello there');
  expect(onDone).not.toHaveBeenCalled();
});

it('Enter saves and closes', async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  const onDone = vi.fn();
  render(<InPlaceEditField draftKey={key()} text="hello" onSave={onSave} onDone={onDone} />);
  const field = screen.getByRole('textbox');
  fireEvent.change(field, { target: { value: 'bye' } });
  await act(async () => { fireEvent.keyDown(field, { key: 'Enter' }); fireEvent.blur(field); });
  expect(onSave).toHaveBeenCalledWith('bye');
  expect(onDone).toHaveBeenCalled();
});

it('a failed save keeps the field open', async () => {
  const onSave = vi.fn().mockResolvedValue(false);
  const onDone = vi.fn();
  render(<InPlaceEditField draftKey={key()} text="hello" onSave={onSave} onDone={onDone} />);
  const field = screen.getByRole('textbox');
  fireEvent.change(field, { target: { value: 'oops' } });
  await act(async () => { fireEvent.blur(field); });
  expect(onSave).toHaveBeenCalled();
  expect(onDone).not.toHaveBeenCalled();
});

it('emptied out puts the old words back without saving', async () => {
  const onSave = vi.fn();
  const onDone = vi.fn();
  render(<InPlaceEditField draftKey={key()} text="hello" onSave={onSave} onDone={onDone} />);
  const field = screen.getByRole('textbox');
  fireEvent.change(field, { target: { value: '  ' } });
  await act(async () => { fireEvent.blur(field); });
  expect(onSave).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalled();
});

it('puts the caret where the words were clicked', () => {
  render(<InPlaceEditField draftKey={key()} text="hello world" caret={5} onSave={vi.fn()} onDone={vi.fn()} />);
  const field = screen.getByRole('textbox') as HTMLTextAreaElement;
  expect(field.selectionStart).toBe(5);
});
