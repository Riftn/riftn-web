import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { LiveFeedPreview } from '@/components/app/cards/LiveFeedPreview';
import type { PreviewAudienceHandoff } from '@/components/app/live/live-audience-profile';
import { closeLiveMini, getLiveMini } from '@/lib/live-mini';

vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/app' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, walletAddress: 'viewer' }) }));
vi.mock('@/hooks/use-video-fullscreen', () => ({
  useVideoFullscreen: () => ({ isFullscreen: false, toggleFullscreen: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { closeLiveMini(); cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const urls = ['https://live.dehub.io/example/index.m3u8'];

describe('live feed controls', () => {
  it('hands off a playing preview when opening a profile and leaves a paused preview alone', async () => {
    const handoff = createRef<PreviewAudienceHandoff>();
    const live = { path: '/app/post/123', title: 'Live set', host: 'Host' };
    const { container } = render(<LiveFeedPreview urls={urls} streamId="stream-123" isOwner audienceHandoff={handoff} />);
    await handoff.current?.(live);
    expect(getLiveMini()).toBeNull();

    Object.defineProperty(container.querySelector('video'), 'paused', { configurable: true, value: false });
    await handoff.current?.(live);
    expect(getLiveMini()).toMatchObject({ ...live, streamId: 'stream-123', urls, mode: 'video' });
  });

  it('controls the actual live video and reflects playback events without a scrubber', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const { container } = render(<LiveFeedPreview urls={urls} controlsVisible />);
    const video = container.querySelector('video')!;
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(play.mock.instances[0]).toBe(video);
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    fireEvent.playing(video);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(pause.mock.instances[0]).toBe(video);
    fireEvent.pause(video);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(video.controls).toBe(false);
  });

  it('has one sound control that changes the live element and disappears with the row', () => {
    function Card({ controlsVisible }: { controlsVisible: boolean }) {
      const [muted, setMuted] = useState(true);
      return <LiveFeedPreview urls={urls} controlsVisible={controlsVisible} muted={muted} onToggleMute={() => setMuted(value => !value)} />;
    }
    const { container, rerender } = render(<Card controlsVisible />);
    const video = container.querySelector('video')!;
    expect(video.muted).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Unmute' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(video.muted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(video.muted).toBe(true);
    rerender(<Card controlsVisible={false} />);
    expect(screen.queryByRole('button', { name: 'Unmute' })).toBeNull();
  });
});
