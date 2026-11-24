/**
 * The backend's "the live list changed" ping.
 *
 * Someone went live, paused, came back or ended. The ping carries no list:
 * the caller re-reads `/api/live`, the same request the Moments row, the Live
 * now chip, the Livestreams row and the Live tab already share.
 *
 * Rides the root-namespace socket stream presence uses (one per tab), so
 * watching a live adds no second connection. A reconnect also counts as a
 * change: a ping sent while the socket was down is simply gone.
 *
 * Loaded on demand (see use-live-list-realtime) so socket.io-client stays off
 * the boot path.
 */
import { acquireStreamSocket, releaseStreamSocket } from './stream-presence';

/** Matches LIVE_LIST_CHANGED on the backend. The string is the contract. */
export const LIVE_LIST_CHANGED = 'live.list.changed';

export interface LiveListChange {
  streamId?: string;
  address?: string | null;
  status?: string;
}

export function watchLiveList(onChange: (change: LiveListChange | null) => void): () => void {
  const conn = acquireStreamSocket();
  const socket = conn.socket;
  let connectedBefore = socket.connected;
  const onPing = (change: LiveListChange | undefined) => onChange(change ?? null);
  const onConnect = () => {
    if (connectedBefore) onChange(null);
    connectedBefore = true;
  };
  socket.on(LIVE_LIST_CHANGED, onPing);
  socket.on('connect', onConnect);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    socket.off(LIVE_LIST_CHANGED, onPing);
    socket.off('connect', onConnect);
    releaseStreamSocket(conn);
  };
}
