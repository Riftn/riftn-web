/**
 * The follow-card rail's pictures must survive a failing image transform:
 * dehub.io's resizer answered 503 for a run of avatars whose files were fine,
 * and the card had no second URL to try.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render as rtlRender } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FollowCoverCard } from '@/components/app/FollowCoverCard';
import type { SuggestedAccount } from '@/lib/api/dehub';

const WALLET = '0xAbC0000000000000000000000000000000000001';
const MUTUAL = '0xDeF0000000000000000000000000000000000002';

const user = {
  address: WALLET,
  username: 'mal',
  displayName: 'Mal',
  avatarImageUrl: 'avatars/0xabc-1234.webp',
  followers: 12,
  mutualConnections: [{ address: MUTUAL, username: 'erica', avatarImageUrl: 'avatars/0xdef-5678.webp' }],
} as unknown as SuggestedAccount;

const noop = () => {};

const render = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
};

describe('FollowCoverCard avatars', () => {
  it('falls back to the untransformed file when the resizer fails', () => {
    const { container } = render(<FollowCoverCard user={user} onOpen={noop} onFollow={noop} />);
    const avatar = container.querySelector('[data-fc-avatar] img') as HTMLImageElement;
    expect(avatar.getAttribute('src')).toContain('/cdn-cgi/image/');

    fireEvent.error(avatar);
    const retried = container.querySelector('[data-fc-avatar] img') as HTMLImageElement;
    expect(retried.getAttribute('src')).not.toContain('/cdn-cgi/image/');
    expect(retried.getAttribute('src')).toContain('avatars/0xabc-1234.webp');
  });

  it('gives the mutuals row the same ladder instead of an empty tile', () => {
    const { container } = render(<FollowCoverCard user={user} onOpen={noop} onFollow={noop} />);
    const mutual = container.querySelector('[data-fc-mutuals] img') as HTMLImageElement;
    expect(mutual.getAttribute('src')).toContain('/cdn-cgi/image/');

    fireEvent.error(mutual);
    expect(container.querySelector('[data-fc-mutuals] img')!.getAttribute('src')).not.toContain('/cdn-cgi/image/');
  });
});
