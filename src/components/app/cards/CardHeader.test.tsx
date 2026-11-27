import type { ReactNode } from 'react';
import { fireEvent, render, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { CardHeader } from './CardHeader';

const { navigate, openMoment } = vi.hoisted(() => ({
  navigate: vi.fn(),
  openMoment: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: null }) }));
vi.mock('@/components/app/BadgeIcon', () => ({ BadgeIcon: () => null }));
vi.mock('@/components/app/NewMemberChip', () => ({ NewMemberChip: () => null }));
vi.mock('@/components/app/ProfileHoverCard', () => ({ ProfileHoverCard: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/lib/route-preload', () => ({ preloadRoute: vi.fn() }));
vi.mock('@/lib/api/dehub/post-stats', () => ({ reportPostEvent: vi.fn() }));
vi.mock('@/components/app/LiveRipple', () => ({
  LiveRipple: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/app/stories/MomentFace', () => ({
  MomentFace: ({ children }: { children: ReactNode }) => (
    <span onClickCapture={event => { event.stopPropagation(); openMoment(); }}>{children}</span>
  ),
}));

it('opens the author from a post detail avatar and keeps the Moment shortcut in the feed', () => {
  const client = new QueryClient();
  const header = (postPage: boolean) => (
    <QueryClientProvider client={client}>
      <CardHeader username="Araf" creatorUsername="araf" avatarSeed="" contentType="post" postPage={postPage} />
    </QueryClientProvider>
  );
  const view = render(header(true));
  const tapAvatar = () => fireEvent.click(within(view.getByRole('button', { name: 'feed.viewProfile' })).getByText('A'));

  tapAvatar();
  expect(navigate).toHaveBeenCalledExactlyOnceWith('/araf');
  expect(openMoment).not.toHaveBeenCalled();

  navigate.mockClear();
  view.rerender(header(false));
  tapAvatar();
  expect(openMoment).toHaveBeenCalledOnce();
  expect(navigate).not.toHaveBeenCalled();
});
