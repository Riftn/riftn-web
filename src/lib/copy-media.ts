/**
 * "Copy media" in the chat menus.
 *
 * A photo goes on the clipboard as a picture (PNG, the one image type every
 * browser's clipboard takes), so it pastes straight into another chat, a doc
 * or an image editor. A GIF goes on as the image tag plus its link: turning it
 * into a PNG would freeze it, and apps that paste rich text keep it moving.
 * Videos can't sit on a clipboard anywhere, so their link is copied.
 * Anything the browser refuses falls back to the link.
 */
export type CopyMediaKind = 'image' | 'gif' | 'video';
export type CopyMediaResult = 'image' | 'link';

function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return Promise.resolve(blob);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('encode failed'))), 'image/png');
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

async function fetchPng(source: string): Promise<Blob> {
  const response = await fetch(source, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`fetch failed (${response.status})`);
  return toPng(await response.blob());
}

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function copyLink(source: string): Promise<CopyMediaResult> {
  await navigator.clipboard.writeText(source);
  return 'link';
}

export async function copyMedia(source: string, kind: CopyMediaKind): Promise<CopyMediaResult> {
  const canWriteItems = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
  if (kind === 'image' && canWriteItems) {
    try {
      // The item is built before any await: Safari only allows a clipboard
      // write that starts inside the click, and takes the picture as a promise.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': fetchPng(source) })]);
      return 'image';
    } catch {
      return copyLink(source);
    }
  }
  if (kind === 'gif' && canWriteItems) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([`<img src="${escapeAttr(source)}" alt="GIF">`], { type: 'text/html' }),
        'text/plain': new Blob([source], { type: 'text/plain' }),
      })]);
      return 'image';
    } catch {
      return copyLink(source);
    }
  }
  return copyLink(source);
}

/** A message's media URL, only when it is a real web address the clipboard can carry. */
export function copyableMediaUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : null;
}
