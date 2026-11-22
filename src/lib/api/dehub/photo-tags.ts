import { apiCall } from './core';

/** A person tagged on a spot of one photo (riftn-backend src/photo-tags). */
export interface PhotoTag {
  address?: string;
  username: string;
  /** Which photo, 0-based. */
  i: number;
  /** 0..1 from the left and from the top. */
  x: number;
  y: number;
}

/** Replace the whole list of people tagged on your post's photos. */
export async function setPhotoTags(tokenId: number, tags: PhotoTag[]): Promise<{ imageTags: PhotoTag[] }> {
  return apiCall('/api/photo_tags', {
    method: 'POST',
    body: { tokenId, tags: tags.map(({ username, i, x, y }) => ({ username, i, x, y })) },
    requiresAuth: true,
  });
}

/** Take your own tag off somebody's post. */
export async function removeMyPhotoTag(tokenId: number): Promise<{ imageTags: PhotoTag[] }> {
  return apiCall('/api/photo_tags/remove_me', { method: 'POST', body: { tokenId }, requiresAuth: true });
}
