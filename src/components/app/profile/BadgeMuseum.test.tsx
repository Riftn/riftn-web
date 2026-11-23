import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Milestones } from '@/hooks/use-milestones';
import { badgeMuseumIsShown } from '@/hooks/use-milestones';
import { BadgeMuseumPanel, MilestoneChips } from './BadgeMuseum';

const state = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/hooks/use-milestones', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-milestones')>()),
  useMilestones: () => ({ data: state.data }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));

const step = (id: string, kind: string, rarity: number, earned: boolean) => ({ id, kind, goal: 1, rarity, value: earned ? 1 : 0, earned });

const museum = (over: Partial<Milestones> = {}): Milestones => ({
  address: '0xabc',
  milestones: [
    step('views_1k', 'views', 30, true),
    step('likes_1k', 'likes', 72, true),
    step('followers_1k', 'followers', 80, true),
    step('videos_10', 'videos', 40, true),
    step('videos_200', 'videos', 92, false),
  ] as Milestones['milestones'],
  top: ['followers_1k', 'likes_1k', 'videos_10'],
  earned: 4,
  total: 5,
  hidden: false,
  updatedAt: '2026-11-23T00:00:00Z',
  ...over,
});

it('is off until the owner switches it on', () => {
  expect(badgeMuseumIsShown(undefined)).toBe(false);
  expect(badgeMuseumIsShown({})).toBe(false);
  expect(badgeMuseumIsShown({ badgeMuseumVisibility: 'hidden' })).toBe(false);
  expect(badgeMuseumIsShown({ badgeMuseumVisibility: 'public' })).toBe(true);
});

it('puts the three rarest earned medals on the profile podium when switched on', () => {
  state.data = museum();
  const { container } = render(<BadgeMuseumPanel address="0xabc" />);
  const medals = [...container.querySelectorAll('[data-medal-podium] [data-medal]')].map((el) => el.getAttribute('data-medal'));
  // Second, first, third: the rarest stands in the middle.
  expect(medals).toEqual(['likes_1k', 'followers_1k', 'videos_10']);
  expect(container.querySelector('[data-medal="videos_200"]')).toBeNull();
});

it('renders nothing until a badge is earned', () => {
  state.data = museum({ milestones: [step('videos_200', 'videos', 92, false)] as Milestones['milestones'], top: [], earned: 0 });
  const { container } = render(<BadgeMuseumPanel address="0xabc" />);
  expect(container.innerHTML).toBe('');
});

it('shows nothing on the profile while off, the owner included', () => {
  state.data = museum({ hidden: true });
  const { container } = render(
    <>
      <BadgeMuseumPanel address="0xabc" />
      <MilestoneChips address="0xabc" own />
    </>,
  );
  expect(container.innerHTML).toBe('');
});

it('draws icons, not emoji, on the name chips', () => {
  state.data = museum();
  const { container } = render(<MilestoneChips address="0xabc" />);
  const chips = container.querySelectorAll('[data-milestone-chip]');
  expect(chips).toHaveLength(3);
  for (const chip of chips) {
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(chip.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  }
});
