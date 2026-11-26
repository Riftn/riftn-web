import { createContext, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LiveMini } from '@/lib/live-mini';

/** The live viewer can hand off playback before opening a profile from its audience. */
export const LiveAudienceProfileContext = createContext<((path: string) => void) | null>(null);

export type PreviewAudienceHandoff = (live: Pick<LiveMini, 'path' | 'title' | 'host' | 'avatar'>) => Promise<void>;

/** Feed chat can hand off only the preview mounted inside its media gate. */
export function usePreviewAudienceProfile(tokenId: string, title: string, host: string, avatar?: string) {
  const navigate = useNavigate();
  const previewHandoff = useRef<PreviewAudienceHandoff>(null);
  const openAudienceProfile = useCallback(async (profile: string) => {
    const location = window.location.href;
    await previewHandoff.current?.({ path: `/app/post/${tokenId}`, title, host, avatar });
    if (window.location.href === location) navigate(profile);
  }, [navigate, tokenId, title, host, avatar]);
  return { previewHandoff, openAudienceProfile };
}
