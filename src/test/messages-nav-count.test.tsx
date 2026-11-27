import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MessagesNavGlyph } from '@/components/app/navigation/MessagesNavGlyph';
import { setShowMessagesCount, setShowNotificationCount } from '@/lib/notification-count-pref';

describe('Messages number setting', () => {
  beforeEach(() => localStorage.clear());

  it('shows only the glow by default', () => {
    render(<MessagesNavGlyph unread={4} />);
    expect(screen.queryByTestId('messages-nav-count')).toBeNull();
  });

  it('shows the number once turned on, and hides it again', () => {
    render(<MessagesNavGlyph unread={4} />);
    act(() => setShowMessagesCount(true));
    expect(screen.getByTestId('messages-nav-count').textContent).toBe('4');
    act(() => setShowMessagesCount(false));
    expect(screen.queryByTestId('messages-nav-count')).toBeNull();
  });

  it('is its own switch, separate from the bell', () => {
    setShowNotificationCount(true);
    render(<MessagesNavGlyph unread={4} />);
    expect(screen.queryByTestId('messages-nav-count')).toBeNull();
  });

  it('nothing unread, nothing shown; caps at 99+', () => {
    setShowMessagesCount(true);
    const { rerender } = render(<MessagesNavGlyph unread={0} />);
    expect(screen.queryByTestId('messages-nav-count')).toBeNull();
    rerender(<MessagesNavGlyph unread={240} />);
    expect(screen.getByTestId('messages-nav-count').textContent).toBe('99+');
  });
});
