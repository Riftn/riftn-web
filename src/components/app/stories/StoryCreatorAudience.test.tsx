import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StoryCreator } from './StoryCreator';
import { shareMoment } from './story-upload';

const address = '0x0000000000000000000000000000000000000001';
vi.mock('@/lib/api/dehub/dm', () => ({ searchUsersForDM: async () => ({ items: [{ username: 'alice', address }] }) }));
vi.mock('@/lib/api/dehub/stories', () => ({ getStoryShelf: async () => ({ supportsCustomAudience: true }), STORY_LIFETIMES: [24] }));
vi.mock('@/hooks/use-story-shelf', () => ({ useRefreshStoryShelf: () => vi.fn() }));
vi.mock('@/features/post/components/SoundPicker', () => ({ SoundPicker: () => null }));
vi.mock('./story-compose', () => ({ composePhoto: async () => new Blob(), mentionBoxes: () => [], TEXT_COLORS: ['#fff'], OUT_H: 1920, OUT_W: 1080, PHOTO_LOOKS: { none: 'none' }, PHOTO_BACKDROPS: { blur: null }, backdropCss: () => null }));
vi.mock('./story-upload', () => ({ shareMoment: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }) }));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:photo' });
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  vi.mocked(shareMoment).mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([['Only selected people', 'selected'], ['Hide from selected people', 'except']])('posts with %s from the web editor', async (label, mode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = render(<QueryClientProvider client={client}><StoryCreator onClose={vi.fn()} /></QueryClientProvider>);
  fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] } });
  fireEvent.click(await screen.findByRole('button', { name: 'Everyone' }));
  fireEvent.click(await screen.findByRole('button', { name: label }));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: '@ali' } });
  fireEvent.click(await screen.findByRole('button', { name: '@alice' }));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  await waitFor(() => expect(shareMoment).toHaveBeenCalledWith(expect.objectContaining({
    fields: expect.objectContaining({ audience: mode, audienceAddresses: [address] }),
  }), expect.any(Function)));
  view.unmount();
  client.clear();
});
