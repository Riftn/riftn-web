import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const getNotes = vi.fn();
vi.mock('@/lib/api/dehub/notes', async (orig) => ({ ...(await orig<object>()), getNotes: () => getNotes() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, walletAddress: '0xdef' }) }));
vi.mock('@/hooks/use-block-author', () => ({ useBlockAuthor: () => ({ blockAuthor: vi.fn() }) }));
vi.mock('@/hooks/use-mute-author', () => ({ useMuteAuthor: () => ({ muteAuthor: vi.fn() }) }));

const author = { address: '0xabc', username: 'araf', displayName: 'Araf', avatarImageUrl: null };
const note = { id: 'n1', text: 'hello', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600_000).toISOString() };

describe('NotesStrip', () => {
  beforeEach(() => { vi.resetModules(); getNotes.mockReset(); });

  it('shows nothing to someone with no note and no notes from people they follow', async () => {
    getNotes.mockResolvedValue({ mine: null, notes: [] });
    const { NotesStrip } = await import('@/components/app/chat/NotesRow');
    const { container } = render(<NotesStrip />);
    await waitFor(() => expect(getNotes).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 0));
    expect(container.querySelector('[data-notes-row]')).toBeNull();
  });

  it('shows the strip once there is a note to see', async () => {
    getNotes.mockResolvedValue({ mine: null, notes: [{ author, note }] });
    const { NotesStrip } = await import('@/components/app/chat/NotesRow');
    const { container } = render(<NotesStrip />);
    await waitFor(() => expect(container.querySelector('[data-notes-row]')).not.toBeNull());
  });
});

describe('StatusRow', () => {
  beforeEach(() => { vi.resetModules(); getNotes.mockReset(); });

  it('shows a followed account returned by Notes without a matching conversation', async () => {
    getNotes.mockResolvedValue({ mine: null, notes: [{ author, note }] });
    const { StatusRow } = await import('@/components/app/chat/NotesRow');
    render(<StatusRow me={{ ...author, address: '0xdef', username: 'viewer', displayName: 'Viewer' }} />);

    const status = await screen.findByRole('button', { name: /araf/i });
    expect(within(status).getByText('hello')).toBeTruthy();
  });

  it('hides one status or collapses and restores the Messages row independently', async () => {
    const other = { ...author, address: '0x123', displayName: 'Sam' };
    getNotes.mockResolvedValue({ mine: null, notes: [{ author, note }, { author: other, note: { ...note, id: 'n2' } }] });
    const { StatusRow } = await import('@/components/app/chat/NotesRow');
    const { getActivityShelfPreferences, setActivityBarHidden, setActivityItemsHidden } = await import('@/lib/activity-shelf-preferences');
    const view = render(<StatusRow me={{ ...author, address: '0xdef' }} />);
    try {
      fireEvent.contextMenu(await screen.findByRole('button', { name: /araf/i }));
      expect(await screen.findByRole('menuitem', { name: 'View status' })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: 'Mute creator' })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: 'Block creator' })).toBeTruthy();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Hide status' }));
      expect(screen.queryByRole('button', { name: /araf/i })).toBeNull();
      fireEvent.contextMenu(screen.getByRole('button', { name: /sam/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Hide status bar' }));
      expect(getActivityShelfPreferences().hidden).toBe(false);
      expect(screen.queryByRole('button', { name: /sam/i })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Show status bar' }));
      expect(screen.getByRole('button', { name: /sam/i })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /araf/i })).toBeNull();
    } finally {
      view.unmount();
      setActivityBarHidden(false, 'status');
      setActivityItemsHidden(['status:n1'], false);
    }
  });
});
