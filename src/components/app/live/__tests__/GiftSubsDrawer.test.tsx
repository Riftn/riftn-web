import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  quote: vi.fn(), confirm: vi.fn(), remember: vi.fn(), clear: vi.fn(), reconcile: vi.fn(), send: vi.fn(), toastTxError: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/use-subscriptions', () => ({
  useCreatorPlans: () => ({ isLoading: false, plans: [{ id: 'plan1', name: 'Fan', price: 10, isPublished: true }] }),
}));
vi.mock('@/lib/api/dehub/live-hype', () => ({
  quoteSubscriptionGift: mocks.quote, confirmSubscriptionGift: mocks.confirm,
  rememberPendingGift: mocks.remember, clearPendingGift: mocks.clear, reconcilePendingGifts: mocks.reconcile,
}));
vi.mock('@/lib/wallet/send', () => ({ sendERC20Token: mocks.send }));
vi.mock('@/lib/tx-error-toast', () => ({ toastTxError: mocks.toastTxError }));
vi.mock('@/lib/contracts', () => ({ BASE_CHAIN_ID: 8453 }));

import { GiftSubsDrawer } from '../GiftSubsDrawer';

function open() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GiftSubsDrawer open onOpenChange={() => {}} creatorAddress="0xcreator" streamId="stream1" />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText('liveHype.gift.send'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reconcile.mockResolvedValue(undefined);
  mocks.quote.mockResolvedValue({
    giftId: 'g1', mode: 'random', count: 5, requested: 5, chainId: 8453,
    dhbToken: '0xdhb', treasuryAddress: '0xtreasury', dhbAmountWei: '1000000000000000000',
  });
  mocks.confirm.mockResolvedValue({ giftId: 'g1', status: 'granted', count: 5, granted: 5, recipients: [] });
});

describe('GiftSubsDrawer payment safety', () => {
  it('finishes earlier paid gifts when it opens', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GiftSubsDrawer open onOpenChange={() => {}} creatorAddress="0xcreator" streamId="stream1" />
      </QueryClientProvider>,
    );
    expect(mocks.reconcile).toHaveBeenCalledOnce();
  });

  it('remembers the payment before waiting on its receipt', async () => {
    mocks.send.mockResolvedValue({ hash: '0xpaid', wait: () => Promise.reject(Object.assign(new Error('slow'), { code: 'TRANSACTION_CONFIRMATION_PENDING' })) });
    open();
    await waitFor(() => expect(mocks.toastTxError).toHaveBeenCalled());
    expect(mocks.remember).toHaveBeenCalledWith({ giftId: 'g1', hash: '0xpaid', chainId: 8453 });
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('does not confirm or keep a reverted transfer', async () => {
    mocks.send.mockResolvedValue({ hash: '0xbad', wait: () => Promise.resolve({ status: 0, hash: '0xbad' }) });
    open();
    await waitFor(() => expect(mocks.toastTxError).toHaveBeenCalled());
    expect(mocks.clear).toHaveBeenCalledWith('g1');
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('confirms and clears a paid gift', async () => {
    mocks.send.mockResolvedValue({ hash: '0xok', wait: () => Promise.resolve({ status: 1, hash: '0xok' }) });
    open();
    await waitFor(() => expect(mocks.clear).toHaveBeenCalledWith('g1'));
    expect(mocks.confirm).toHaveBeenCalledWith('g1', '0xok', 8453);
    expect(mocks.toastTxError).not.toHaveBeenCalled();
  });
});
