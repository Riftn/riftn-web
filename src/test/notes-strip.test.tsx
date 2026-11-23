import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const getNotes = vi.fn();
vi.mock('@/lib/api/dehub/notes', async (orig) => ({ ...(await orig<object>()), getNotes: () => getNotes() }));

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
