import { afterEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { createStory, getStory, type StoryItem } from '@/lib/api/dehub/stories';
import { useStoriesStore } from '@/store/storiesStore';
import { shareMoment } from './story-upload';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/api/dehub/content', () => ({ createDraftVideo: vi.fn() }));
vi.mock('@/lib/api/dehub/stories', () => ({ createStory: vi.fn(), getStory: vi.fn() }));
vi.mock('@/i18n/copy', () => ({ translateCopy: (_key: string, options: { defaultValue: string }) => options.defaultValue }));

afterEach(() => {
  vi.useRealTimers();
  useStoriesStore.getState().setPending(null);
});

it('rechecks the same Short Moment after processing times out', async () => {
  vi.useFakeTimers();
  const processing = { id: 'short-moment', status: 'processing' } as StoryItem;
  vi.mocked(createStory).mockResolvedValue(processing);
  vi.mocked(getStory).mockResolvedValue({ author: null, item: processing });

  shareMoment({ kind: 'video', file: null, preview: '', fields: { type: 'video', audience: 'everyone', postTokenId: 42 } }, vi.fn());
  await vi.advanceTimersByTimeAsync(4 * 60 * 1000);

  expect(toast.success).not.toHaveBeenCalled();
  const pending = useStoriesStore.getState().pending;
  expect(pending?.state).toBe('failed');

  vi.mocked(getStory).mockResolvedValue({ author: null, item: { ...processing, status: 'ready' } });
  pending?.retry?.();
  await vi.advanceTimersByTimeAsync(2000);

  expect(createStory).toHaveBeenCalledTimes(1);
  expect(getStory).toHaveBeenLastCalledWith('short-moment', true);
  expect(useStoriesStore.getState().pending).toBeNull();
  expect(toast.success).toHaveBeenCalledTimes(1);
});
