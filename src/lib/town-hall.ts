/**
 * Town hall view for group calls: whoever is talking fills the stage and
 * everyone else sits in a strip underneath.
 *
 * The director below decides who is on stage from live voice levels (0..1):
 * - one person talking: they take the stage once the last one has had it a
 *   moment, so a cough does not steal it;
 * - several talking at once: the stage is "contested" and hops between them
 *   every SWAP_MS, loudest first, until it settles back to one voice;
 * - nobody talking: the last speaker keeps the stage;
 * - a pinned person always has the stage.
 */

export type TownHallKey = number; // 0 = you, otherwise the Agora uid
export type TownHallFx = 'glitch' | 'flip' | 'static';
export const TOWN_HALL_FX: TownHallFx[] = ['glitch', 'flip', 'static'];
/** Town hall turns on by itself from this many people in the call (you included). */
export const TOWN_HALL_FROM = 3;

/** A level at or above this is speech. */
export const TALK_LEVEL = 0.08;
/** Keep counting someone as talking this long after their last loud reading (gaps between words). */
const TALK_HANG_MS = 550;
/** Someone new takes a quiet stage only after the current one has had it this long. */
const HOLD_MS = 900;
/** While several talk, the stage hops this often. */
export const SWAP_MS = 640;
/** Contested ends once one voice (or none) has held for this long. */
const SETTLE_MS = 450;

export interface TownHallState {
  stage: TownHallKey | null;
  /** Who is talking now, loudest first. */
  talkers: TownHallKey[];
  /** Two or more talking: the stage is hopping between them. */
  contested: boolean;
  /** Goes up by one on every change of stage, so the view can replay its cut. */
  cut: number;
}

export function createStageDirector() {
  const lastLoud = new Map<TownHallKey, number>();
  const loudness = new Map<TownHallKey, number>();
  let stage: TownHallKey | null = null;
  let stagedAt = 0;
  let cut = 0;
  let contested = false;
  let calmSince = 0;
  let rotation: TownHallKey[] = [];

  const put = (key: TownHallKey, now: number) => {
    if (stage === key) return;
    stage = key;
    stagedAt = now;
    cut += 1;
  };

  return {
    /**
     * Feed the latest levels (everyone in the call, you as 0) and get the stage.
     * `present` is everyone in the call, so someone who left loses the stage.
     */
    update(levels: Map<TownHallKey, number>, present: TownHallKey[], now: number, pinned: TownHallKey | null = null): TownHallState {
      const inCall = new Set(present);
      for (const key of [...lastLoud.keys()]) if (!inCall.has(key)) { lastLoud.delete(key); loudness.delete(key); }
      for (const [key, level] of levels) {
        if (!inCall.has(key)) continue;
        loudness.set(key, level);
        if (level >= TALK_LEVEL) lastLoud.set(key, now);
      }
      const talkers = present
        .filter(key => now - (lastLoud.get(key) ?? -Infinity) <= TALK_HANG_MS)
        .sort((a, b) => (loudness.get(b) ?? 0) - (loudness.get(a) ?? 0));

      if (stage != null && !inCall.has(stage)) { stage = null; }

      if (pinned != null && inCall.has(pinned)) {
        contested = false;
        put(pinned, now);
        return { stage, talkers, contested, cut };
      }

      if (talkers.length >= 2) {
        contested = true;
        calmSince = 0;
        // Hop in turn through everyone talking, loudest first among those not just shown.
        rotation = rotation.filter(key => talkers.includes(key));
        for (const key of talkers) if (!rotation.includes(key)) rotation.push(key);
        if (stage == null || !talkers.includes(stage) || now - stagedAt >= SWAP_MS) {
          const at = stage == null ? -1 : rotation.indexOf(stage);
          const next = rotation[(at + 1) % rotation.length];
          put(next, now);
        }
      } else {
        if (contested) {
          if (!calmSince) calmSince = now;
          if (now - calmSince >= SETTLE_MS) contested = false;
        }
        const only = talkers[0];
        if (only != null && only !== stage && (stage == null || now - stagedAt >= (contested ? SWAP_MS : HOLD_MS))) put(only, now);
      }

      // Nobody has said a word yet: start on the first other person, else you.
      if (stage == null) {
        const first = present.find(key => key !== 0) ?? present[0];
        if (first != null) { stage = first; stagedAt = now; }
      }
      return { stage, talkers, contested, cut };
    },
  };
}

const FX_KEY = 'riftn.townhall.fx';
const MODE_KEY = 'riftn.townhall.mode';

export function readTownHallFx(): TownHallFx {
  try {
    const fromUrl = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('thfx') : null;
    const saved = fromUrl || window.localStorage.getItem(FX_KEY);
    if (saved === 'flip' || saved === 'static' || saved === 'glitch') return saved;
  } catch { /* storage blocked */ }
  return 'glitch';
}

/** 'auto' = town hall from TOWN_HALL_FROM people; 'grid' / 'hall' = the person's own choice. */
export type TownHallMode = 'auto' | 'grid' | 'hall';
export function readTownHallMode(): TownHallMode {
  try {
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === 'grid' || saved === 'hall') return saved;
  } catch { /* storage blocked */ }
  return 'auto';
}
export function saveTownHallMode(mode: TownHallMode) {
  try { window.localStorage.setItem(MODE_KEY, mode); } catch { /* storage blocked */ }
}
