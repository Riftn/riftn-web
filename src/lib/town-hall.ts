/**
 * Town hall view for group calls: whoever is talking fills the stage and
 * everyone else sits in a strip underneath. It is the default layout for
 * every group call.
 *
 * The director below decides who is on stage from live voice levels (0..1):
 * - the loudest voice takes the stage once the current one has had it a
 *   moment (HOLD_MS), so a cough or a quick "yeah" does not steal it;
 * - several talking at once: the loudest of them keeps the stage (levels are
 *   smoothed so two similar voices do not flip it back and forth);
 * - nobody talking: the last speaker keeps the stage;
 * - a pinned person always has the stage.
 */

export type TownHallKey = number; // 0 = you, otherwise the Agora uid
/** Town hall is the default for every group call with someone else in it (you included). */
export const TOWN_HALL_FROM = 2;

/** A level at or above this is speech. */
export const TALK_LEVEL = 0.08;
/** Keep counting someone as talking this long after their last loud reading (gaps between words). */
const TALK_HANG_MS = 550;
/** Someone new takes the stage only after the current one has had it this long. */
export const HOLD_MS = 900;
/** While the person on stage is still talking, another voice must be this much louder to take it. */
const LOUDER_BY = 1.25;

export interface TownHallState {
  stage: TownHallKey | null;
  /** Who is talking now, loudest first. */
  talkers: TownHallKey[];
  /** Goes up by one on every change of stage, so the view can fade the new person in. */
  cut: number;
}

export function createStageDirector() {
  const lastLoud = new Map<TownHallKey, number>();
  const loudness = new Map<TownHallKey, number>();
  let stage: TownHallKey | null = null;
  let stagedAt = 0;
  let cut = 0;

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
      for (const key of [...loudness.keys()]) if (!inCall.has(key)) { lastLoud.delete(key); loudness.delete(key); }
      for (const [key, level] of levels) {
        if (!inCall.has(key)) continue;
        // Smoothed, so the loudest is who has been loudest lately, not in one reading.
        loudness.set(key, (loudness.get(key) ?? level) * 0.6 + level * 0.4);
        if (level >= TALK_LEVEL) lastLoud.set(key, now);
      }
      const talking = (key: TownHallKey) => now - (lastLoud.get(key) ?? -Infinity) <= TALK_HANG_MS;
      const talkers = present.filter(talking).sort((a, b) => (loudness.get(b) ?? 0) - (loudness.get(a) ?? 0));

      if (stage != null && !inCall.has(stage)) stage = null;

      if (pinned != null && inCall.has(pinned)) {
        put(pinned, now);
        return { stage, talkers, cut };
      }

      const loudest = talkers[0];
      if (loudest != null && loudest !== stage) {
        const held = stage == null || now - stagedAt >= HOLD_MS;
        const stageStillTalking = stage != null && talking(stage);
        const clearlyLouder = !stageStillTalking || (loudness.get(loudest) ?? 0) >= (loudness.get(stage!) ?? 0) * LOUDER_BY;
        if (held && clearlyLouder) put(loudest, now);
      }

      // Nobody has said a word yet: start on the first other person, else you.
      if (stage == null) {
        const first = present.find(key => key !== 0) ?? present[0];
        if (first != null) { stage = first; stagedAt = now; }
      }
      return { stage, talkers, cut };
    },
  };
}

const MODE_KEY = 'riftn.townhall.layout';

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
