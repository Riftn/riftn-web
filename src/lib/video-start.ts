import { recoveryForVideo, rewindEndedVideo } from './browser-playback-recovery';
import { reloadVideoSource } from './hls-vod';

export function cancelVideoPlayback(player: HTMLVideoElement | null): void {
  if (player) recoveryForVideo(player)?.stop();
}

/** A new user play request can recover a media element after a network error. */
export function requestVideoPlayback(
  player: Pick<HTMLVideoElement, 'error' | 'load' | 'play'> & Partial<Pick<HTMLVideoElement, 'ended' | 'currentTime'>>,
): Promise<void> {
  const recovery = recoveryForVideo(player);
  if (recovery) {
    if (recovery.start()) return Promise.resolve();
    return Promise.reject(new DOMException('Playback is no longer allowed', 'AbortError'));
  }
  if (player.error) reloadVideoSource(player);
  else rewindEndedVideo(player);
  return player.play();
}
