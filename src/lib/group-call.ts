/**
 * Group calls
 * ===========
 * A group call is the group's own Agora room, `group-call-<group id>`. Any
 * active member can talk in it (agora-token checks membership), so a call
 * started by one member is the call the rest join: by answering the ring, or
 * from the "Join call" bar while it is going.
 *
 * Ringing is the 1:1 machinery fanned out: one ringing `call_sessions` row per
 * member, tagged with the group, so the realtime ping, the push and the
 * incoming screen all work as they do for a direct call.
 *
 * Who is in the room rides a realtime presence channel. It drives the join bar
 * in the group chat and puts names on the tiles in the call.
 */
import { useEffect, useState } from 'react';
import { leaseChannel } from '@/lib/realtime-channel-lease';

/** Most members one start rings. The room itself takes more; a bigger group joins from the bar. */
export const GROUP_CALL_MAX_RING = 31;

export function groupCallChannel(groupId: string): string {
  return `group-call-${groupId}`;
}

export function groupCallPresenceTopic(groupId: string): string {
  return `group-call:${groupId}`;
}

/**
 * The Agora uid a wallet uses in a group room. A function of the wallet, so
 * every tile can be named without a lookup. Same derivation as co-streams.
 */
export function groupCallUid(wallet: string): number {
  return (parseInt(wallet.slice(2, 10), 16) >>> 1) || 1;
}

export interface GroupCallPresence {
  uid: number;
  wallet: string;
  type: 'audio' | 'video';
}

export function presenceList(state: Record<string, unknown[]>): GroupCallPresence[] {
  const seen = new Map<number, GroupCallPresence>();
  for (const entries of Object.values(state)) {
    for (const raw of entries as Array<Partial<GroupCallPresence>>) {
      if (typeof raw?.uid !== 'number' || typeof raw.wallet !== 'string') continue;
      seen.set(raw.uid, { uid: raw.uid, wallet: raw.wallet.toLowerCase(), type: raw.type === 'video' ? 'video' : 'audio' });
    }
  }
  return [...seen.values()];
}

/** Who is in a group's call right now, for the join bar. */
export function useGroupCallRoster(groupId: string | null | undefined): GroupCallPresence[] {
  const [roster, setRoster] = useState<GroupCallPresence[]>([]);
  useEffect(() => {
    setRoster([]);
    if (!groupId) return;
    const lease = leaseChannel(groupCallPresenceTopic(groupId), {
      listen: [{
        type: 'presence',
        filter: { event: 'sync' },
        handler: (_payload, channel) => setRoster(presenceList(channel.presenceState() as Record<string, unknown[]>)),
      }],
    });
    return () => lease.release();
  }, [groupId]);
  return roster;
}
