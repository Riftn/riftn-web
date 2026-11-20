import { toast } from 'sonner';
import { createDraftVideo } from '@/lib/api/dehub/content';
import { createStory, getStory, type CreateStoryFields } from '@/lib/api/dehub/stories';
import { useStoriesStore } from '@/store/storiesStore';
import { translateCopy } from '@/i18n/copy';

export interface MomentToShare {
  kind: 'photo' | 'video';
  /** Photo: the flattened JPEG. Video: the clip as picked or recorded. */
  file: Blob;
  overlay?: Blob | null;
  preview: string;
  fields: Omit<CreateStoryFields, 'draftVideoId'>;
}

const POLL_MS = 2000;
const POLL_LIMIT_MS = 4 * 60 * 1000;

/**
 * Share a moment in the background: the creator closes at once and your own
 * tile on the shelf fills as it uploads. A failure leaves the tile with a
 * retry, so nothing typed or drawn is lost.
 */
export function shareMoment(moment: MomentToShare, onDone: () => void) {
  const { setPending } = useStoriesStore.getState();
  const key = `${Date.now()}`;
  const update = (patch: Partial<NonNullable<ReturnType<typeof useStoriesStore.getState>['pending']>>) =>
    setPending(p => (p && p.key === key ? { ...p, ...patch } : p));

  const run = async () => {
    setPending({ key, preview: moment.preview, progress: 2, state: 'uploading' });
    try {
      let created;
      if (moment.kind === 'photo') {
        created = await createStory(moment.fields, { photo: moment.file }, { onProgress: p => update({ progress: Math.max(2, p) }) });
      } else {
        const file = moment.file instanceof File ? moment.file : new File([moment.file], `moment.${moment.file.type.includes('mp4') ? 'mp4' : 'webm'}`, { type: moment.file.type || 'video/webm' });
        const draft = await createDraftVideo(file, 'short', { onProgress: p => update({ progress: Math.max(2, Math.round(p * 0.92)) }) });
        created = await createStory({ ...moment.fields, draftVideoId: draft.draftId }, { overlay: moment.overlay ?? null });
        update({ state: 'processing', progress: 100 });
        const started = Date.now();
        while (created.status === 'processing' && Date.now() - started < POLL_LIMIT_MS) {
          await new Promise(r => setTimeout(r, POLL_MS));
          created = (await getStory(created.id).catch(() => ({ item: created }))).item;
        }
        if (created.status === 'failed') throw new Error(created.error || 'failed');
      }
      setPending(p => (p && p.key === key ? null : p));
      onDone();
      toast.success(translateCopy('stories.momentUp', { defaultValue: 'Your moment is up for 24 hours' }));
    } catch (err) {
      const e = err as { status?: number; message?: string } | null;
      const message = e?.status === 413 || /413|too large/i.test(String(e?.message))
        ? translateCopy('stories.tooLarge', { defaultValue: 'That file is too large.' })
        : translateCopy('stories.shareFailed', { defaultValue: "Your moment didn't go up. Tap your tile to try again." });
      update({ state: 'failed', error: message, retry: () => void run() });
      toast.error(message);
      onDone();
    }
  };
  void run();
}
