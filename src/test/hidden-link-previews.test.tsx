import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { textCardOf } from '@/lib/grid-card';

vi.mock('@/lib/api/link-preview', async (orig) => {
  const actual = await orig<typeof import('@/lib/api/link-preview')>();
  return {
    ...actual,
    fetchLinkPreview: vi.fn(async (url: string) => ({ url, title: `Card for ${url}`, description: '', image: '', siteName: '' })),
    peekLinkPreview: vi.fn(() => null),
  };
});
vi.mock('@/lib/miniapp/registry', () => ({ fetchAppByDomain: vi.fn(async () => null) }));

import { FeedLinkPreviews } from '@/components/app/cards/FeedLinkPreviews';
import { fetchLinkPreview } from '@/lib/api/link-preview';

describe('closed link previews', () => {
  it('draw no card in the feed for a link the poster closed', () => {
    const { container } = render(
      <MemoryRouter>
        <FeedLinkPreviews text="look https://example.com/a" hidden={['https://example.com/a']} />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe('');
    expect(fetchLinkPreview).not.toHaveBeenCalled();
  });

  it('still draw the card for the next link when only the first was closed', () => {
    render(
      <MemoryRouter>
        <FeedLinkPreviews text="https://example.com/a and https://example.org/b" hidden={['https://example.com/a']} />
      </MemoryRouter>,
    );
    expect(fetchLinkPreview).toHaveBeenCalledWith('https://example.org/b');
  });

  it('give the profile grid tile no link card', () => {
    expect(textCardOf({ content: 'read https://example.com/a' })).toEqual({ kind: 'link', url: 'https://example.com/a' });
    expect(textCardOf({ content: 'read https://example.com/a', hiddenLinkPreviews: ['https://example.com/a'] })).toBeNull();
  });
});
