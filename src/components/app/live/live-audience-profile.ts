import { createContext } from 'react';

/** The live viewer can hand off playback before opening a profile from its audience. */
export const LiveAudienceProfileContext = createContext<((path: string) => void) | null>(null);
