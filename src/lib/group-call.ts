/**
 * Group calls
 * ===========
 * A group call is the group's own Agora room, `group-call-<group id>`. Any
 * active member can talk in it (agora-token checks membership), so a call
 * started by one member is the call the rest join: by answering the ring, or
 * from the "Join call" pill while it is going. Riftn's main chat (Public
 * Chat) is the exception: nobody is rung there, people join from the pill.
 *
 * Ringing is the 1:1 machinery fanned out: one ringing `call_sessions` row per
 * member, tagged with the group, so the realtime ping, the push and the
 * incoming screen all work as they do for a direct call.
 *
 * Who is in the room rides a realtime presence channel. It drives the join
 * pill, the room limits and puts names on the tiles in the call.
 */
import { useEffect, useState } from 'react';
import { leaseChannel, type ChannelLease } from '@/lib/realtime-channel-lease';

/**
 * The Public Chat's call room. Public Chat is the Riftn community's chat
 * (RIFTN_COMMUNITY_ID in community-kinds), so its call is that community's
 * group room. Anyone signed in and not banned from it may talk there
 * (is_active_group_member), and nobody is rung: people join from the pill.
 */
export const PUBLIC_CHAT_CALL_ID = '03826b47-f2ff-4707-b76c-818791a9b632';

/** Most people in one call room. The next one sees "Call full". */
export const GROUP_CALL_MAX_PEOPLE = 128;
/** Members one start rings: everyone the room could hold besides the caller. */
export const GROUP_CALL_MAX_RING = GROUP_CALL_MAX_PEOPLE - 1;
/** Most cameras on at once in one call. Past it you join, or stay, with yours off. */
export const GROUP_CALL_MAX_CAMERAS = 17;

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
  /** Their camera is on right now. Older clients leave it out: a video call then counts as on. */
  cam: boolean;
}

export function presenceList(state: Record<string, unknown[]>): GroupCallPresence[] {
  const seen = new Map<number, GroupCallPresence>();
  for (const entries of Object.values(state)) {
    for (const raw of entries as Array<Partial<GroupCallPresence>>) {
      if (typeof raw?.uid !== 'number' || typeof raw.wallet !== 'string') continue;
      const type = raw.type === 'video' ? 'video' : 'audio';
      seen.set(raw.uid, { uid: raw.uid, wallet: raw.wallet.toLowerCase(), type, cam: typeof raw.cam === 'boolean' ? raw.cam : type === 'video' });
    }
  }
  return [...seen.values()];
}

/** How full a room is, for everyone but `me`. */
export function groupCallLoad(roster: GroupCallPresence[], me: string | null | undefined): { people: number; cameras: number; full: boolean; camerasFull: boolean } {
  const others = roster.filter(entry => entry.wallet !== me?.toLowerCase());
  const cameras = others.filter(entry => entry.cam).length;
  return { people: others.length, cameras, full: others.length >= GROUP_CALL_MAX_PEOPLE, camerasFull: cameras >= GROUP_CALL_MAX_CAMERAS };
}

/**
 * Who is in a room, read once before stepping in. A channel some other part
 * of the page already holds answers at once; a fresh one waits for its first
 * presence sync, at most `waitMs`.
 */
export function readGroupCallRoster(groupId: string, waitMs = 1500): Promise<GroupCallPresence[]> {
  return new Promise(resolve => {
    let lease: ChannelLease | null = null;
    let done = false;
    let leasing = true;
    let joinedEarly = false;
    const finish = () => {
      if (done || !lease) return;
      done = true;
      clearTimeout(timer);
      const list = presenceList(lease.channel.presenceState() as Record<string, unknown[]>);
      lease.release();
      resolve(list);
    };
    const timer = setTimeout(() => { if (lease) finish(); else resolve([]); }, waitMs);
    lease = leaseChannel(groupCallPresenceTopic(groupId), {
      listen: [{ type: 'presence', filter: { event: 'sync' }, handler: () => finish() }],
      // Already joined before this lease (onJoin runs inside leaseChannel): its state is current.
      onJoin: () => { if (leasing) joinedEarly = true; },
    });
    leasing = false;
    if (joinedEarly) finish();
  });
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
