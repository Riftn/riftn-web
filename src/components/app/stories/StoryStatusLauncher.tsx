/**
 * Opens the status writer from Home's ask bar. Loaded only when Status is
 * picked, so the status sheet never weighs on Home's first paint. Where a
 * sheet host already exists (Messages), it opens that one; otherwise it
 * mounts its own and keeps it.
 */
import { useEffect, useState } from 'react';
import { NotesSheetHost, openNotesSheet, useNotesSheetAvailable } from '@/components/app/chat/NotesRow';
import { openDmDock } from '@/hooks/use-dm-dock';
import type { StoryAuthor } from '@/lib/api/dehub/stories';

export default function StoryStatusLauncher({ me, nonce }: { me: StoryAuthor; nonce: number }) {
  const available = useNotesSheetAvailable();
  const [ownHost] = useState(() => !available);
  // Runs after the host below has registered (child effects run first).
  useEffect(() => { if (nonce > 0) openNotesSheet(); }, [nonce]);
  if (!ownHost) return null;
  return (
    <NotesSheetHost
      me={me}
      onMessage={(author, reply) => openDmDock({
        address: author.address,
        username: author.username ?? undefined,
        displayName: author.displayName ?? undefined,
        autoSendBody: reply,
      })}
    />
  );
}
