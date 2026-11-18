import type { QueryClient } from '@tanstack/react-query';
import { updateProfile } from '@/lib/api/dehub/users';
import { bumpProfileImageVersion, cdnImageSource } from '@/lib/media-url';
import type { ProfileData } from '@/hooks/use-dehub-profile';

/**
 * Profile picture and banner from the clipboard, and back onto it.
 * Shared by the profile header and Settings > Profile.
 */
export type ProfileImageKind = 'avatar' | 'cover';

/** Same caps Settings has always enforced on a picked file. */
export const PROFILE_IMAGE_MAX_BYTES: Record<ProfileImageKind, number> = {
  avatar: 5 * 1024 * 1024,
  cover: 10 * 1024 * 1024,
};

/**
 * Longest side a pasted or dropped image is sent at. A 4K screenshot pasted
 * as PNG is easily 8 MB; the server sizes both down anyway (avatar to 1080,
 * banner to 1500 wide), so anything past this is wasted upload.
 */
const MAX_SIDE: Record<ProfileImageKind, number> = { avatar: 2160, cover: 3000 };

const isEditable = (el: Element | null) =>
  !!el && !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

/** True when a paste or key event belongs to a text field and must be left alone. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && isEditable(target);
}

/** The first image on a paste event: a copied picture, or a copied image file. */
export function imageFromPasteEvent(event: ClipboardEvent): File | null {
  const data = event.clipboardData;
  if (!data) return null;
  for (const file of Array.from(data.files || [])) {
    if (file.type.startsWith('image/')) return file;
  }
  for (const item of Array.from(data.items || [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

export class ClipboardReadError extends Error {
  constructor(public reason: 'unsupported' | 'denied' | 'empty') {
    super(reason);
  }
}

/**
 * Read an image off the system clipboard from a menu click. Needs the async
 * clipboard API (Chrome, Edge, Safari, Firefox 127+); Safari shows its own
 * small "Paste" bubble first.
 */
export async function readClipboardImage(): Promise<File> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.read) throw new ClipboardReadError('unsupported');
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new ClipboardReadError('denied');
  }
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    const blob = await item.getType(type);
    const ext = type.split('/')[1]?.split('+')[0] || 'png';
    return new File([blob], `pasted.${ext}`, { type });
  }
  throw new ClipboardReadError('empty');
}

/**
 * Shrink a pasted image that is bigger than it needs to be, so a full-screen
 * screenshot never trips the size cap. GIFs pass through untouched (a canvas
 * keeps only the first frame). Anything that cannot be decoded is sent as is.
 */
export async function prepareProfileImage(file: File, kind: ProfileImageKind): Promise<File> {
  if (file.type === 'image/gif') return file;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const max = MAX_SIDE[kind];
  const longest = Math.max(bitmap.width, bitmap.height);
  const oversized = longest > max;
  const heavy = file.size > PROFILE_IMAGE_MAX_BYTES[kind] * 0.6;
  if (!oversized && !heavy) {
    bitmap.close();
    return file;
  }
  const scale = oversized ? max / longest : 1;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); return file; }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) return file;
  return new File([blob], `${kind}.jpg`, { type: 'image/jpeg' });
}

async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('encode failed');
  return png;
}

/**
 * Put the picture itself on the clipboard (PNG, the one image type every
 * browser accepts there). The item is built synchronously with a promise so
 * Safari still counts it as part of the click. Falls back to copying the
 * link when the browser refuses images.
 */
export async function copyImageToClipboard(url: string): Promise<'image' | 'link'> {
  const source = cdnImageSource(url) || url;
  const absolute = new URL(source, window.location.href).toString();
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const png = fetch(absolute, { mode: 'cors', credentials: 'omit' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then(toPng);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      return 'image';
    } catch {
      /* fall through to the link */
    }
  }
  await navigator.clipboard.writeText(absolute);
  return 'link';
}

export interface OwnProfileImageContext {
  address: string;
  queryClient: QueryClient;
  refreshUser: () => Promise<unknown> | unknown;
  patchUser: (patch: Record<string, unknown>) => void;
}

/**
 * Save a new profile picture / banner (or clear it, with `file` null) straight
 * from the profile page, and show it everywhere at once: the profile query
 * and the signed-in user carry a local preview until the CDN catches up.
 */
export async function saveOwnProfileImage(kind: ProfileImageKind, file: File | null, ctx: OwnProfileImageContext) {
  const { address, queryClient, refreshUser, patchUser } = ctx;
  const own = address.toLowerCase();
  await updateProfile(
    kind === 'avatar'
      ? (file ? { avatarImg: file } : { removeAvatar: true })
      : (file ? { coverImg: file } : { removeCover: true }),
  );
  bumpProfileImageVersion(address);
  const preview = file ? URL.createObjectURL(file) : undefined;
  const field = kind === 'avatar' ? 'avatarUrl' : 'coverUrl';
  const userField = kind === 'avatar' ? 'avatarImageUrl' : 'coverImageUrl';
  const applyPreview = () =>
    queryClient.setQueriesData<ProfileData>({ queryKey: ['dehub-profile'] }, (old) => {
      if (!old || old.walletAddress?.toLowerCase() !== own) return old;
      return { ...old, [field]: preview };
    });
  applyPreview();
  queryClient.invalidateQueries({ queryKey: ['settings-profile', address], refetchType: 'none' });
  if (kind === 'avatar') queryClient.invalidateQueries({ queryKey: ['profile-avatar'] });
  await refreshUser();
  patchUser({ [userField]: preview ?? '' });
  applyPreview();
  // The CDN copy takes a few seconds to land; read the real one after that.
  setTimeout(() => queryClient.invalidateQueries({ queryKey: ['dehub-profile'] }), file ? 15_000 : 1_000);
}
