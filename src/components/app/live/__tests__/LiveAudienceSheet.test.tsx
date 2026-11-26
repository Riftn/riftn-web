import type { PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveAudienceSheet } from '../LiveAudienceSheet';
import { LiveAudienceProfileContext } from '../live-audience-profile';
import type { LiveAudience } from '@/lib/api/dehub/livestream';

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children, open }: PropsWithChildren<{ open: boolean }>) => open ? <>{children}</> : null,
  DrawerContent: ({ children }: PropsWithChildren) => <>{children}</>,
  DrawerTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));
vi.mock('@/components/app/BadgeIcon', () => ({ BadgeIcon: () => null }));

const audience: LiveAudience = {
  host: null,
  watching: 3,
  topTippers: [],
  mostActive: [],
  here: [
    { address: '0x1234', username: '@attendee', displayName: 'Attendee', joinedAt: new Date().toISOString() },
    { address: '0x9876', displayName: 'Wallet only', joinedAt: new Date().toISOString() },
    { address: '', displayName: 'Unknown person', joinedAt: new Date().toISOString() },
  ],
};

function Location() {
  const { pathname, search } = useLocation();
  return <output>{pathname}{search}</output>;
}

afterEach(cleanup);

describe('live audience profile navigation', () => {
  it('closes the audience sheet and gives the viewer the profile destination', () => {
    const actions: string[] = [];
    render(
      <MemoryRouter>
        <LiveAudienceProfileContext.Provider value={(path) => actions.push(path)}>
          <LiveAudienceSheet open onOpenChange={(open) => actions.push(String(open))} audience={audience} loading={false} />
        </LiveAudienceProfileContext.Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Attendee/i }));
    expect(actions).toEqual(['false', '/attendee']);
    const unknown = screen.getByRole<HTMLButtonElement>('button', { name: /Unknown person/i });
    expect(unknown.disabled).toBe(true);
  });

  it('opens an address-only profile normally outside a live viewer', () => {
    render(
      <MemoryRouter>
        <Location />
        <LiveAudienceSheet open onOpenChange={vi.fn()} audience={audience} loading={false} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Wallet only/i }));
    expect(screen.getByRole('status').textContent).toBe('/app/profile?id=0x9876');
  });
});
