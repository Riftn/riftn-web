import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { StoryCreator } from './StoryCreator';
import { shareMoment } from './story-upload';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, opts: { defaultValue: string }) => opts.defaultValue }) }));
vi.mock('@/hooks/use-story-shelf', () => ({ useRefreshStoryShelf: () => vi.fn() }));
vi.mock('@/features/post/components/SoundPicker', () => ({ SoundPicker: () => null }));
vi.mock('@/lib/api/dehub/stories', () => ({ getStoryShelf: async () => ({ supportsCustomLifetime: true, supportsPhotoDuration: true }), STORY_LIFETIMES: [6, 12, 24] }));
vi.mock('./story-compose', async importOriginal => ({
  ...await importOriginal<typeof import('./story-compose')>(),
  mentionBoxes: () => [],
  composePhoto: async () => new Blob(['photo']),
}));
vi.mock('./story-upload', () => ({ shareMoment: vi.fn() }));

it('sends the selected photo timer from the Moment editor independently of shelf expiry', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><StoryCreator onClose={vi.fn()} /></QueryClientProvider>);
  const file = new File(['photo'], 'test.jpg', { type: 'image/jpeg' });
  const original = URL.createObjectURL;
  URL.createObjectURL = () => 'blob:moment';
  try {
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Seconds on screen' }));
    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('5');
    expect(slider).toHaveAttribute('max', '60');
    fireEvent.change(slider, { target: { value: '37' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    for (const image of document.querySelectorAll('img[src="blob:moment"]')) Object.defineProperty(image, 'complete', { value: true });
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(shareMoment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'photo', fields: expect.objectContaining({ photoDurationSeconds: 37, expiresInHours: 24 }) }),
      expect.any(Function),
    ));
  } finally {
    URL.createObjectURL = original;
    view.unmount();
    client.clear();
    vi.unstubAllGlobals();
  }
});
