import { apiCall } from './core';
import { acquireStreamSocket, releaseStreamSocket, type StreamPresence } from './stream-presence';

/**
 * Stream pets on the stream API. A creator hatches one in Live Studio; it eats
 * a snack for every five minutes they stream, grows with what it ate, falls
 * asleep after a hungry day and never dies. While they are live, viewers can
 * buy it a snack with their channel points.
 */

function unwrap<T>(res: T | { result: T }): T {
  return res && typeof res === 'object' && 'result' in (res as object) ? (res as { result: T }).result : (res as T);
}

export const PET_NAME_MAX = 20;
export const PET_COLORS = ['violet', 'pink', 'mint', 'sky', 'sun', 'coral'] as const;
export type PetColor = (typeof PET_COLORS)[number];
export const PET_STAGES = ['egg', 'baby', 'kid', 'teen', 'grown', 'legend'] as const;
export type PetStage = (typeof PET_STAGES)[number];
export type PetMood = 'egg' | 'happy' | 'hungry' | 'asleep';
export const FEED_COST_MIN = 10;
export const FEED_COST_MAX = 10_000;

/** Body, belly and outline colours for each pet colour. */
export const PET_PALETTE: Record<PetColor, { body: string; belly: string; shade: string }> = {
  violet: { body: '#a391fc', belly: '#d9d0ff', shade: '#7b67e0' },
  pink: { body: '#f39bff', belly: '#fbd6ff', shade: '#cf6fe0' },
  mint: { body: '#7fe3c4', belly: '#d2f8ec', shade: '#4fbf9e' },
  sky: { body: '#7fc8ff', belly: '#d4ecff', shade: '#4f9fe0' },
  sun: { body: '#ffd36f', belly: '#fff0c8', shade: '#e0ad3f' },
  coral: { body: '#ff8a7a', belly: '#ffd3cc', shade: '#e0604f' },
};

export interface StreamPet {
  owner: string;
  name: string;
  color: PetColor;
  hatchedAt: string;
  stage: PetStage;
  stageIndex: number;
  food: number;
  streamFood: number;
  viewerFood: number;
  stageFood: number;
  nextStageFood: number | null;
  progress: number;
  mood: PetMood;
  lastFedAt: string | null;
  sleepsAt: string | null;
  streamingNow: boolean;
  streamedMinutes: number;
  showOnProfile: boolean;
  showOnStream: boolean;
  feeding: { enabled: boolean; cost: number };
}

export interface PetFeeder {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  snacks?: number;
}

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

export function parsePet(raw: any): StreamPet | null {
  if (!raw || typeof raw !== 'object' || !raw.owner) return null;
  const stage = (PET_STAGES as readonly string[]).includes(raw.stage) ? (raw.stage as PetStage) : 'egg';
  const mood = (['egg', 'happy', 'hungry', 'asleep'] as const).includes(raw.mood) ? (raw.mood as PetMood) : 'happy';
  return {
    owner: String(raw.owner),
    name: String(raw.name || ''),
    color: (PET_COLORS as readonly string[]).includes(raw.color) ? (raw.color as PetColor) : 'violet',
    hatchedAt: String(raw.hatchedAt || ''),
    stage,
    stageIndex: num(raw.stageIndex),
    food: num(raw.food),
    streamFood: num(raw.streamFood),
    viewerFood: num(raw.viewerFood),
    stageFood: num(raw.stageFood),
    nextStageFood: raw.nextStageFood == null ? null : num(raw.nextStageFood),
    progress: Math.min(1, Math.max(0, num(raw.progress))),
    mood,
    lastFedAt: str(raw.lastFedAt),
    sleepsAt: str(raw.sleepsAt),
    streamingNow: !!raw.streamingNow,
    streamedMinutes: num(raw.streamedMinutes),
    showOnProfile: raw.showOnProfile !== false,
    showOnStream: raw.showOnStream !== false,
    feeding: { enabled: raw.feeding?.enabled !== false, cost: num(raw.feeding?.cost, 100) },
  };
}

const parseFeeder = (r: any): PetFeeder => ({
  address: String(r?.address || ''),
  username: r?.username || undefined,
  displayName: r?.displayName || undefined,
  avatarImageUrl: r?.avatarImageUrl || undefined,
  snacks: r?.snacks == null ? undefined : num(r.snacks),
});

export async function getMyPet(): Promise<{ pet: StreamPet | null; feeders: PetFeeder[] }> {
  const res: any = unwrap(await apiCall('/api/live-overlay/mine/pet', { requiresAuth: true }));
  return { pet: parsePet(res?.pet), feeders: Array.isArray(res?.feeders) ? res.feeders.map(parseFeeder) : [] };
}

export async function hatchPet(name: string, color: PetColor): Promise<StreamPet | null> {
  const res: any = unwrap(await apiCall('/api/live-overlay/mine/pet/hatch', { method: 'POST', body: { name, color }, requiresAuth: true }));
  return parsePet(res?.pet);
}

export interface PetSettings {
  name?: string;
  color?: PetColor;
  showOnProfile?: boolean;
  showOnStream?: boolean;
  feeding?: { enabled?: boolean; cost?: number };
}

export async function saveMyPet(settings: PetSettings): Promise<StreamPet | null> {
  const res: any = unwrap(await apiCall('/api/live-overlay/mine/pet', { method: 'PUT', body: { ...settings }, requiresAuth: true }));
  return parsePet(res?.pet);
}

/** A creator's pet for their profile; null when they have none or hid it. */
export async function getCreatorPet(creator: string): Promise<StreamPet | null> {
  if (!creator) return null;
  const res: any = unwrap(await apiCall(`/api/live-overlay/creator/${encodeURIComponent(creator)}/pet`));
  return parsePet(res?.pet);
}

export async function getStreamPet(streamId: string): Promise<StreamPet | null> {
  if (!streamId) return null;
  const res: any = unwrap(await apiCall(`/api/live-overlay/stream/${encodeURIComponent(streamId)}/pet`));
  return parsePet(res?.pet);
}

export async function feedStreamPet(streamId: string): Promise<{ pet: StreamPet | null; balance: number; fedToday: number }> {
  const res: any = unwrap(
    await apiCall(`/api/live-overlay/stream/${encodeURIComponent(streamId)}/pet/feed`, { method: 'POST', requiresAuth: true }),
  );
  return { pet: parsePet(res?.pet), balance: num(res?.balance), fedToday: num(res?.fedToday) };
}

export function feedErrorKey(err: unknown): string {
  const message = String((err as Error)?.message || '');
  if (/not enough points/i.test(message)) return 'streamPet.errors.notEnough';
  if (/while the stream is live/i.test(message)) return 'streamPet.errors.notLive';
  if (/few seconds/i.test(message)) return 'streamPet.errors.tooFast';
  if (/enough snacks/i.test(message)) return 'streamPet.errors.daily';
  if (/feeding is off/i.test(message)) return 'streamPet.errors.off';
  return 'streamPet.errors.failed';
}

export interface PetUpdate {
  pet: StreamPet | null;
  fed?: { by: PetFeeder; cost: number };
}

/** The pet changing or being fed: `stream.pet` in the stream's room. */
export function watchStreamPet(streamId: string, onUpdate: (update: PetUpdate) => void): StreamPresence {
  if (!streamId) return { leave: () => undefined };
  const conn = acquireStreamSocket();
  const s = conn.socket;
  let left = false;
  const join = () => {
    if (!left) s.emit('stream.join.room', { streamId });
  };
  const onEvent = (data: any) => {
    if (String(data?.streamId ?? '') !== streamId) return;
    onUpdate({
      pet: parsePet(data?.pet),
      fed: data?.fed?.by ? { by: parseFeeder(data.fed.by), cost: num(data.fed.cost) } : undefined,
    });
  };
  s.on('connect', join);
  s.on('stream.pet', onEvent);
  if (s.connected) join();
  return {
    leave: () => {
      if (left) return;
      left = true;
      s.off('connect', join);
      s.off('stream.pet', onEvent);
      releaseStreamSocket(conn);
    },
  };
}
