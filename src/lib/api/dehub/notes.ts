/**
 * Notes API
 * =========
 * A note is a short line (60 characters) with an optional song, GIF or place,
 * shown in the row at the top of Messages for 24 hours. One per person; a new
 * one replaces the old. The API returns your own note and eligible active
 * notes from people you follow, regardless of how long ago you followed them.
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
  /** Full-screen backdrop: 'photo' (their photo, blurred) or a colour. */
  background?: string | null;
  postedAt: string;
  expiresAt: string;
  /** Hearts on it, and whether you gave one. */
  likeCount?: number;
  liked?: boolean;
}

export interface NoteEntry {
  author: StoryAuthor;
  note: Note;
  /** Your own note only: who hearted it, newest first. */
  likers?: StoryAuthor[];
}

export interface NoteInput {
  text?: string;
  gifUrl?: string;
  song?: StorySong;
  location?: string;
  background?: string;
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

/** Heart (or un-heart) someone's note. */
export function likeNote(id: string, liked: boolean): Promise<{ liked: boolean; likeCount: number }> {
  return apiCall(`/api/notes/${encodeURIComponent(id)}/like`, { method: 'POST', body: { liked }, requiresAuth: true });
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
