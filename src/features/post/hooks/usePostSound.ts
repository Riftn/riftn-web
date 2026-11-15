/**
 * Post Sound Hook
 * ================
 * Manages the attached sound state for post creation.
 */

import { useState, useCallback } from 'react';

export interface AttachedSound {
  url: string;
  title: string;
  creator: string;
  creatorAvatar?: string;
  /** "0" for songs from outside libraries. */
  tokenId: string;
  duration?: number;
  /** Which library the song came from. */
  source?: 'audius' | 'riftn' | 'commons';
}

export function usePostSound() {
  const [attachedSound, setAttachedSound] = useState<AttachedSound | null>(null);

  const selectSound = useCallback((sound: AttachedSound) => {
    setAttachedSound(sound);
  }, []);

  const clearSound = useCallback(() => {
    setAttachedSound(null);
  }, []);

  return {
    attachedSound,
    selectSound,
    clearSound,
  };
}
