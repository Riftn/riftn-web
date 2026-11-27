type VolumePlayer = { volume: number };
const mixes = new WeakMap<VolumePlayer, number>();
/** A post's song can turn the video's own sound down (see use-synced-audio). */
const songMixes = new WeakMap<VolumePlayer, number>();

export function setSongMixGain(player: VolumePlayer, gain: number | null): void {
  if (gain == null) songMixes.delete(player);
  else songMixes.set(player, gain);
}

export function setDubMixActive(player: VolumePlayer, active: boolean, gain: number): void {
  if (active) mixes.set(player, gain);
  else mixes.delete(player);
}

/** Playback controls preserve the active dub's original-audio gain. */
export function applyVideoVolume(player: VolumePlayer, master: number): void {
  const target = Math.max(0, Math.min(1, master)) * (mixes.get(player) ?? 1) * (songMixes.get(player) ?? 1);
  if (target === 0 ? player.volume !== 0 : Math.abs(player.volume - target) > 0.000001) player.volume = target;
}
