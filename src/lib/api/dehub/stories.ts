/**
 * Stories API
 * ===========
 * Moments: a photo (5 s) or a video (up to 60 s) that stays up for 24 hours
 * on the Glass Shelf above the home feed. Anyone can watch public moments,
 * signed out too. Moments are not posts: no feed, no allowance, no points.
 *
 * A video moment is uploaded first as a composer draft (createDraftVideo with
 * postType 'short'), then shared with its draftVideoId; the server cuts it
 * to the kept part and the moment turns `ready` a few seconds later.
 *
 * @module lib/api/dehub/stories
 */
import { apiCall, authedUpload } from './core';

export type StoryAudience = 'everyone' | 'followers' | 'selected' | 'except';
export const STORY_LIFETIMES = [6, 12, 24] as const;
export type StoryLifetime = (typeof STORY_LIFETIMES)[number];

export interface StoryMention {
  address: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StorySong {
  title: string;
  artist?: string;
  audioUrl: string;
  artworkUrl?: string;
  startMs: number;
  source?: string;
}

export interface StoryAuthor {
  address: string;
  username: string | null;
  displayName: string | null;
  avatarImageUrl: string | null;
}

export interface StoryItem {
  id: string;
  address: string;
  type: 'photo' | 'video';
  status: 'processing' | 'ready' | 'failed';
  mediaUrl: string | null;
  posterUrl: string | null;
  overlayUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number;
  muted: boolean;
  isMature?: boolean;
  caption: string | null;
  remixSourceId?: string | null;
  shareable?: boolean;
  mentions: StoryMention[];
  song: StorySong | null;
  audience: StoryAudience;
  allowReplies: boolean;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  liked: boolean;
  /** Owner only. */
  viewCount?: number;
  likeCount?: number;
  replyCount?: number;
  hiddenByReports?: boolean;
  error?: string | null;
  expired?: boolean;
}

export interface ShelfEntry {
  author: StoryAuthor;
  own: boolean;
  following: boolean;
  seen: boolean;
  latestAt: string | null;
  items: StoryItem[];
}

export interface StoryViewer extends StoryAuthor {
  liked: boolean;
  viewedAt: string;
}

export function getStoryShelf(liveHosts: string, signedIn: boolean): Promise<{ shelf: ShelfEntry[]; signedIn: boolean; liveHosts?: string[]; supportsCustomLifetime?: boolean; supportsCustomAudience?: boolean }> {
  return apiCall('/api/stories/shelf', { params: { liveHosts: liveHosts || undefined }, requiresAuth: signedIn });
}

export function getStoryRings(addresses: string[]): Promise<{ rings: Record<string, 'unseen' | 'seen'> }> {
  return apiCall('/api/stories/rings', { params: { addresses: addresses.join(',') } });
}

export function getUserStories(address: string): Promise<{ author: StoryAuthor | null; items: StoryItem[] }> {
  return apiCall(`/api/stories/user/${encodeURIComponent(address.toLowerCase())}`);
}

export function getStory(id: string, signedIn = false): Promise<{ author: StoryAuthor | null; item: StoryItem }> {
  return apiCall(`/api/stories/${encodeURIComponent(id)}`, { requiresAuth: signedIn });
}

export function getStoryArchive(cursor?: string): Promise<{ items: StoryItem[]; next: string | null }> {
  return apiCall('/api/stories/archive', { params: { cursor }, requiresAuth: true });
}

export interface CreateStoryFields {
  audience: StoryAudience;
  audienceAddresses?: string[];
  expiresInHours?: StoryLifetime;
  allowReplies?: boolean;
  muted?: boolean;
  caption?: string;
  remixSourceId?: string;
  mentions?: StoryMention[];
  song?: StorySong | null;
  /** Video moments. */
  draftVideoId?: string;
  trimStart?: number;
  trimEnd?: number;
}

/** Share a moment. `photo` for a photo moment; `overlay` (transparent PNG) for a video one. */
export function createStory(
  fields: CreateStoryFields,
  files: { photo?: Blob; overlay?: Blob | null },
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<StoryItem> {
  const form = new FormData();
  form.append('type', fields.draftVideoId ? 'video' : 'photo');
  form.append('audience', fields.audience);
  const customAudience = fields.audience === 'selected' || fields.audience === 'except';
  if (customAudience) form.append('audienceAddresses', JSON.stringify(fields.audienceAddresses ?? []));
  if (fields.expiresInHours != null) form.append('expiresInHours', String(fields.expiresInHours));
  form.append('allowReplies', String(fields.allowReplies !== false));
  form.append('muted', String(!!fields.muted));
  if (fields.caption) form.append('caption', fields.caption);
  if (fields.remixSourceId) form.append('remixSourceId', fields.remixSourceId);
  if (fields.mentions?.length) form.append('mentions', JSON.stringify(fields.mentions));
  if (fields.song) form.append('song', JSON.stringify(fields.song));
  if (fields.draftVideoId) {
    form.append('draftVideoId', fields.draftVideoId);
    if (fields.trimStart != null) form.append('trimStart', String(fields.trimStart));
    if (fields.trimEnd != null) form.append('trimEnd', String(fields.trimEnd));
  }
  if (files.photo) form.append('file', files.photo, 'moment.jpg');
  if (files.overlay) form.append('overlay', files.overlay, 'layer.png');
  return authedUpload<StoryItem>(customAudience ? '/api/stories/custom-audience' : '/api/stories', form, { onProgress: options.onProgress, signal: options.signal, timeoutMs: 3 * 60 * 1000 });
}

export function deleteStory(id: string): Promise<{ ok: boolean }> {
  return apiCall(`/api/stories/${encodeURIComponent(id)}`, { method: 'DELETE', requiresAuth: true });
}

export function updateStory(id: string, body: { audience?: StoryAudience; allowReplies?: boolean }): Promise<StoryItem> {
  return apiCall(`/api/stories/${encodeURIComponent(id)}`, { method: 'PATCH', body, requiresAuth: true });
}

export function markStoryViewed(id: string): Promise<{ ok: boolean }> {
  return apiCall(`/api/stories/${encodeURIComponent(id)}/view`, { method: 'POST', requiresAuth: true });
}

export function likeStory(id: string, liked: boolean): Promise<{ liked: boolean }> {
  return apiCall(`/api/stories/${encodeURIComponent(id)}/like`, { method: 'POST', body: { liked }, requiresAuth: true });
}

export function checkStoryReply(id: string): Promise<{ ok: boolean; to: string }> {
  return apiCall(`/api/stories/${encodeURIComponent(id)}/reply`, { method: 'POST', requiresAuth: true });
}

export function getStoryViewers(id: string, cursor?: string): Promise<{ viewCount: number; likeCount: number; viewers: StoryViewer[]; next: string | null }> {
  return apiCall(`/api/stories/${encodeURIComponent(id)}/viewers`, { params: { cursor }, requiresAuth: true });
}

export function reportStory(id: string, reason: string, additionalInfo?: string): Promise<{ ok: boolean }> {
  return apiCall(`/api/stories/${encodeURIComponent(id)}/report`, { method: 'POST', body: { reason, additionalInfo }, requiresAuth: true });
}
