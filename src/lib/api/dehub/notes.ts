/**
 * Notes API
 * =========
 * A note is a short line (60 characters) with an optional song, GIF or place,
 * shown in the row at the top of Messages for 24 hours. One per person; a new
 * one replaces the old. You see your own and the notes of people you follow.
 *
 * @module lib/api/dehub/notes
 */
import { apiCall } from './core';
import type { StoryAuthor, StorySong } from './stories';

export const NOTE_TEXT_MAX = 60;
export const NOTE_LOCATION_MAX = 40;

export interface Note {
  id: string;
  text: string | null;
  gifUrl: string | null;
  song: StorySong | null;
  location: string | null;
  postedAt: string;
  expiresAt: string;
}

export interface NoteEntry {
  author: StoryAuthor;
  note: Note;
}

export interface NoteInput {
  text?: string;
  gifUrl?: string;
  song?: StorySong;
  location?: string;
}

export function getNotes(): Promise<{ mine: NoteEntry | null; notes: NoteEntry[] }> {
  return apiCall('/api/notes', { requiresAuth: true });
}

export function putNote(input: NoteInput): Promise<{ note: Note }> {
  return apiCall('/api/notes', { method: 'POST', body: input as Record<string, unknown>, requiresAuth: true });
}

export function deleteNote(): Promise<{ ok: boolean }> {
  return apiCall('/api/notes', { method: 'DELETE', requiresAuth: true });
}

/** The GIF hosts a note accepts. */
export function isNoteGif(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)giphy\.com$|(^|\.)tenor\.com$|(^|\.)googleusercontent\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}
