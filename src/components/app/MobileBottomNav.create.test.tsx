import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import FeaturesPage from '@/pages/app/FeaturesPage';
import { MobileBottomNav } from './MobileBottomNav';
import { warmPostComposer } from '@/lib/preload-post-composer';

vi.mock('@/contexts/AuthContext', async () => ({ AuthContext: (await import('react')).createContext(null), useAuth: () => ({ isAuthenticated: true }) }));
vi.mock('@/contexts/StageContext', () => ({ useStage: () => ({}) }));
vi.mock('./spaces/StageNavChip', () => ({ StageNavChip: () => null }));
vi.mock('./AuthPrompt', () => ({ AuthPrompt: () => null }));
vi.mock('@/lib/preload-post-composer', () => ({ warmPostComposer: vi.fn() }));
vi.mock('@/features/post/PostModal', () => ({ PostModal: () => <div role="dialog">Post</div> }));
vi.mock('@/hooks/use-nav-order', () => ({ useNavOrderEditor: () => ({ order: [] }) }));
vi.mock('@/hooks/use-drag-reorder', () => ({ useDragReorder: () => ({ order: [], itemProps: vi.fn() }) }));
vi.mock('@/lib/dm-unread-store', () => ({ useDmUnreadCount: () => 0 }));
vi.mock('@/hooks/use-public-chat-unread', () => ({ usePublicChatUnreadCount: () => 0 }));
vi.mock('@/hooks/use-notifications', () => ({ useUnreadNotificationCount: () => ({}) }));
vi.mock('@/hooks/use-custom-notifications', () => ({ useCustomUnreadCount: () => ({}) }));
vi.mock('@/lib/route-preload', () => ({ preloadRoute: vi.fn() }));
vi.mock('@/components/app/war/WarHudIcon', () => ({ ThemedIcon: () => null, BrandIcon: () => null }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});
afterAll(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

function LocationProbe() {
  return <output>{useLocation().search}</output>;
}

it.each(['/features', '/app/features/'])('routes Create to the request composer from %s', path => {
  render(<MemoryRouter initialEntries={[path + '?tab=shipped&id=42']}><MobileBottomNav /><LocationProbe /></MemoryRouter>);
  const create = screen.getByRole('button');
  fireEvent.focus(create);
  fireEvent.click(create);
  expect(screen.getByRole('status')).toHaveTextContent('tab=shipped&id=42&compose=request');
  expect(warmPostComposer).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('opens the post composer on Home', async () => {
  render(<MemoryRouter initialEntries={['/app']}><MobileBottomNav /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Create post' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Post');
});

vi.mock('@/components/SEOHead', () => ({ SEOHead: () => null }));
vi.mock('@/components/app/features/TopBuildersCard', () => ({ TopBuildersCard: () => null }));
vi.mock('@/components/app/cards/ActionBar', () => ({ ActionBar: () => null }));
vi.mock('@/components/app/cards/CardHeader', () => ({ CardHeader: () => null }));
vi.mock('@/components/app/features/FeatureRequestComments', () => ({ FeatureRequestComments: () => null }));
vi.mock('@/components/app/feeds/FeedSwallowMotion', () => ({ FeedSwallowMotion: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/hooks/use-feature-requests', () => ({
  useFeatureRequests: () => ({}), useShippedFeatures: () => ({}), useInProgressFeatures: () => ({}),
  useNotFeasibleFeatures: () => ({}), useFeatureRequest: () => ({}), useUserVotes: () => ({}),
  useVoteFeatureRequest: () => ({}), useFeatureCounts: () => ({}), useSubmitFeatureRequest: () => ({}),
}));

it('takes a queued-board reader to the existing request field on every tap', () => {
  const view = render(<MemoryRouter initialEntries={['/features?tab=queued']}><FeaturesPage /><MobileBottomNav /><LocationProbe /></MemoryRouter>);
  const field = view.container.querySelector('[data-feature-composer] textarea')!;
  expect(field).not.toBeVisible();
  const create = view.container.querySelector('[data-bottom-nav] [data-nav-create]')!.closest('button')!;
  for (let tap = 0; tap < 2; tap++) {
    create.focus();
    fireEvent.click(create);
    expect(field).toBeVisible();
    expect(field).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('?tab=requests');
  }
});
