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

interface StoriesState {
  mounted: boolean;
  viewer: { entries: ShelfEntry[]; author: number; item: number; from?: DOMRect | null } | null;
  creatorOpen: boolean;
  pending: PendingMoment | null;
  openViewer: (entries: ShelfEntry[], author: number, opts?: { item?: number; from?: DOMRect | null }) => void;
  closeViewer: () => void;
  openCreator: () => void;
  closeCreator: () => void;
  setPending: (pending: PendingMoment | null | ((p: PendingMoment | null) => PendingMoment | null)) => void;
}

export const useStoriesStore = create<StoriesState>((set) => ({
  mounted: false,
  viewer: null,
  creatorOpen: false,
  pending: null,
  openViewer: (entries, author, opts = {}) =>
    set({ mounted: true, viewer: { entries, author, item: opts.item ?? -1, from: opts.from ?? null } }),
  closeViewer: () => set({ viewer: null }),
  openCreator: () => set({ mounted: true, creatorOpen: true }),
  closeCreator: () => set({ creatorOpen: false }),
  setPending: (pending) => set((s) => ({ pending: typeof pending === 'function' ? pending(s.pending) : pending })),
}));
