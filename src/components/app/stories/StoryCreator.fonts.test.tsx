import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { StoryCreator } from './StoryCreator';
import { composePhoto, measureText } from './story-compose';
import { shareMoment } from './story-upload';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, opts: { defaultValue: string }) => opts.defaultValue }) }));
vi.mock('@/hooks/use-story-shelf', () => ({ useRefreshStoryShelf: () => vi.fn() }));
vi.mock('@/features/post/components/SoundPicker', () => ({ SoundPicker: () => null }));
vi.mock('@/lib/api/dehub/stories', () => ({ getStoryShelf: async () => ({ supportsCustomLifetime: true, supportsPhotoDuration: true }), STORY_LIFETIMES: [6, 12, 24] }));
vi.mock('./story-compose', async importOriginal => ({
  ...await importOriginal<typeof import('./story-compose')>(),
  mentionBoxes: () => [],
  composePhoto: vi.fn(async () => new Blob(['photo'])),
}));
vi.mock('./story-upload', () => ({ shareMoment: vi.fn() }));

it('renders the selected caption face and size and exports the same settings', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><StoryCreator onClose={vi.fn()} /></QueryClientProvider>);
  const file = new File(['photo'], 'test.jpg', { type: 'image/jpeg' });
  const original = URL.createObjectURL;
  URL.createObjectURL = () => 'blob:moment';
  try {
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Text' }));
    fireEvent.change(screen.getByPlaceholderText('Type something'), { target: { value: 'Hello' } });
    const picker = screen.getByRole('combobox', { name: 'Caption font' });
    expect(picker.querySelectorAll('option')).toHaveLength(12);
    fireEvent.change(picker, { target: { value: 'typewriter' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Text size' }), { target: { value: '0.1' } });
    expect(document.querySelector('[data-sc-text]')).toHaveStyle({ fontStyle: 'italic', fontFamily: 'Courier, "Courier New", monospace' });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    for (const image of document.querySelectorAll('img[src="blob:moment"]')) Object.defineProperty(image, 'complete', { value: true });
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(shareMoment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'photo' }),
      expect.any(Function),
    ));
    const layer = vi.mocked(composePhoto).mock.calls[0][2][0];
    expect(layer).toMatchObject({ text: 'Hello', font: 'typewriter', size: 0.1 });
    const context = { font: '', measureText: () => ({ width: 10 }) };
    measureText(context as unknown as CanvasRenderingContext2D, layer);
    expect(context.font).toBe('italic 400 108px Courier, "Courier New", monospace');
  } finally {
    URL.createObjectURL = original;
    view.unmount();
    client.clear();
    vi.unstubAllGlobals();
  }
});
