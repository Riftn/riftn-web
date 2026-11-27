import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Shorts video audio ownership', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/app/cards/VideoSlide.tsx'),
    'utf8',
  );

  it('pauses ordinary slides during cleanup, preserves PiP, and rejects stale play events', () => {
    expect(source).toMatch(/return \(\) => \{\s*[\s\S]*?releaseAfterPictureInPicture\(video, \(\) => video\.pause\(\)\);\s*\};/);
    expect(source).toContain('if (!isActiveRef.current && !video?.dataset.shortsPeek && !isVideoInPictureInPicture(video)) video?.pause();');
  });

  it('keeps a short started by the drag peek playing as it becomes active', () => {
    // Only the hand-over from inactive to active skips the cleanup pause.
    expect(source).toContain('if (!isActive && video.dataset.shortsPeek) return;');
    expect(source).toContain('delete video.dataset.shortsPeek;');
    expect(source).toContain('video.muted = isMutedRef.current;');
    expect(source).toContain('if (playing) handlePlay()');
  });
});
