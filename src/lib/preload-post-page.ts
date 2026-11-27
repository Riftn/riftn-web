import { warmPostData } from '@/lib/post-warm';

let pending: Promise<typeof import('@/pages/app/SinglePostPage')> | undefined;

export function loadPostPage() {
  return pending ??= import('@/pages/app/SinglePostPage').catch(error => {
    pending = undefined;
    throw error;
  });
}

export function warmPostPage(): void {
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  void loadPostPage().catch(() => {});
}

let pendingInfo: Promise<typeof import('@/pages/app/PostInfoPage')> | undefined;

export function loadPostInfoPage() {
  return pendingInfo ??= import('@/pages/app/PostInfoPage').catch(error => {
    pendingInfo = undefined;
    throw error;
  });
}

/**
 * Open a post's info page: its code and its data both start on the tap, side
 * by side, instead of the data waiting for the code to download and render.
 */
export function openPostInfo(navigate: (to: string) => void, id: string | number): void {
  void loadPostInfoPage().catch(() => {});
  warmPostData(id);
  navigate(`/app/post/${id}/info`);
}
