import { create } from 'zustand';
import type { ShelfEntry } from '@/lib/api/dehub/stories';

/**
 * Who is being watched in the story viewer, whether the creator is open, and
 * the moment being shared right now (its tile shows the upload filling).
 * The viewer and creator mount on first use (StoriesHost in AppLayout).
 */
export interface PendingMoment {
  key: string;
  preview: string;
  progress: number;
  state: 'uploading' | 'processing' | 'failed';
  error?: string;
  retry?: () => void;
}

export interface StoryRemixSource {
  id: string;
  name: string;
}

interface StoriesState {
  mounted: boolean;
  viewer: { entries: ShelfEntry[]; author: number; item: number; openComments: boolean; from?: DOMRect | null } | null;
  creator: { remixSource?: StoryRemixSource; postTokenId?: number } | null;
  pending: PendingMoment | null;
  openViewer: (entries: ShelfEntry[], author: number, opts?: { item?: number; openComments?: boolean; from?: DOMRect | null }) => void;
  closeViewer: () => void;
  openCreator: (remixSource?: StoryRemixSource) => void;
  /** "Share to Moment": the creator opens on one of your own posts. */
  openPostMoment: (postTokenId: number) => void;
  closeCreator: () => void;
  setPending: (pending: PendingMoment | null | ((p: PendingMoment | null) => PendingMoment | null)) => void;
}

export const useStoriesStore = create<StoriesState>((set) => ({
  mounted: false,
  viewer: null,
  creator: null,
  pending: null,
  openViewer: (entries, author, opts = {}) =>
    set({ mounted: true, viewer: { entries, author, item: opts.item ?? -1, openComments: opts.openComments ?? false, from: opts.from ?? null } }),
  closeViewer: () => set({ viewer: null }),
  openCreator: (remixSource) => set({ mounted: true, creator: { remixSource } }),
  openPostMoment: (postTokenId) => set({ mounted: true, viewer: null, creator: { postTokenId } }),
  closeCreator: () => set({ creator: null }),
  setPending: (pending) => set((s) => ({ pending: typeof pending === 'function' ? pending(s.pending) : pending })),
}));
