import { apiCall } from './core';

/** A post of yours still waiting for its time (GET /api/scheduled_posts). */
export interface ScheduledPost {
  tokenId: number;
  name?: string;
  description?: string;
  postType?: string;
  imageUrl?: string;
  imageUrls?: string[];
  scheduledAt: string;
}

export async function getMyScheduledPosts(): Promise<ScheduledPost[]> {
  const res = await apiCall<{ result: ScheduledPost[] }>('/api/scheduled_posts', { requiresAuth: true });
  return res?.result || [];
}

/** Move a scheduled post, or pass 'now' to publish it within a minute. */
export async function moveScheduledPost(tokenId: number, at: Date | 'now'): Promise<void> {
  await apiCall(`/api/scheduled_posts/${tokenId}`, {
    method: 'PATCH',
    body: { scheduledAt: at === 'now' ? 'now' : at.toISOString() },
    requiresAuth: true,
  });
}

export async function moveScheduledLive(streamId: string, at: Date): Promise<void> {
  await apiCall(`/api/scheduled_posts/live/${encodeURIComponent(streamId)}`, {
    method: 'PATCH',
    body: { scheduledAt: at.toISOString() },
    requiresAuth: true,
  });
}

export interface FansOnline {
  /** 7 x 24, UTC, Sunday first: distinct people watching in each hour. */
  grid: number[][];
  /** 'everyone' when the account had too few active followers to go on. */
  basis: 'followers' | 'everyone';
  followers: number;
  days: number;
}

export async function getFansOnline(): Promise<FansOnline | null> {
  const res = await apiCall<{ result: FansOnline }>('/api/scheduled_posts/fans_online', { requiresAuth: true });
  return res?.result ?? null;
}

/** "Space my posts": the saved gap and when a post made now would go out. */
export interface PostSpacing {
  /** Saved gap in minutes; 0 is off. */
  gapMinutes: number;
  /** The gap `nextAt` was worked out for (the saved one unless asked). */
  askedGap?: number;
  /** When a post made now goes out with that gap; null is straight away. */
  nextAt: string | null;
  /** Posts still waiting to go out. */
  waiting: number;
}

/** The gaps the server accepts, in minutes. */
export const SPACING_CHOICES = [30, 60, 180, 360, 1440] as const;

export async function getPostSpacing(gap?: number): Promise<PostSpacing> {
  const res = await apiCall<{ result: PostSpacing }>('/api/scheduled_posts/spacing', {
    requiresAuth: true,
    params: gap !== undefined ? { gap } : undefined,
  });
  return res?.result ?? { gapMinutes: 0, nextAt: null, waiting: 0 };
}

export async function savePostSpacing(gapMinutes: number): Promise<PostSpacing> {
  const res = await apiCall<{ result: PostSpacing }>('/api/scheduled_posts/spacing', {
    method: 'PUT',
    body: { gapMinutes },
    requiresAuth: true,
  });
  return res?.result ?? { gapMinutes, nextAt: null, waiting: 0 };
}
