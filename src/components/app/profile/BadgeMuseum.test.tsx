import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Milestones } from '@/hooks/use-milestones';
import { BadgeMuseumPanel, MilestoneChips } from './BadgeMuseum';

const state = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/hooks/use-milestones', () => ({ useMilestones: () => ({ data: state.data }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));

const step = (id: string, kind: string, rarity: number, earned: boolean) => ({ id, kind, goal: 1, rarity, value: earned ? 1 : 0, earned });

const museum = (over: Partial<Milestones> = {}): Milestones => ({
  address: '0xabc',
  milestones: [
    step('views_1k', 'views', 30, true),
    step('likes_1k', 'likes', 72, true),
    step('videos_200', 'videos', 92, false),
  ] as Milestones['milestones'],
  top: ['likes_1k', 'views_1k'],
  earned: 2,
  total: 3,
  hidden: false,
  updatedAt: '2026-11-23T00:00:00Z',
  ...over,
});

it('shows only earned badges, rarest first, in the profile panel', () => {
  state.data = museum();
  const { container } = render(<BadgeMuseumPanel address="0xabc" />);
  const tiles = [...container.querySelectorAll('[data-milestone-tile]')].map((el) => el.getAttribute('data-milestone-tile'));
  expect(tiles).toEqual(['likes_1k', 'views_1k']);
  expect(screen.queryByText('badgeMuseum.hiddenNote')).toBeNull();
});

it('renders nothing until a badge is earned', () => {
  state.data = museum({ milestones: [step('videos_200', 'videos', 92, false)] as Milestones['milestones'], top: [], earned: 0 });
  const { container } = render(<BadgeMuseumPanel address="0xabc" own />);
  expect(container.innerHTML).toBe('');
});

it('keeps a hidden museum to its owner, with a note', () => {
  state.data = museum({ hidden: true });
  const visitor = render(<><BadgeMuseumPanel address="0xabc" /><MilestoneChips address="0xabc" /></>);
  expect(visitor.container.querySelector('[data-badge-museum-panel]')).toBeNull();
  expect(visitor.container.querySelector('[data-milestone-chip]')).toBeNull();
  visitor.unmount();

  const owner = render(<BadgeMuseumPanel address="0xabc" own />);
  expect(owner.container.querySelectorAll('[data-milestone-tile]')).toHaveLength(2);
  expect(screen.getByText('badgeMuseum.hiddenNote')).toBeTruthy();
});
