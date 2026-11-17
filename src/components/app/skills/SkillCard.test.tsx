import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillCard } from './SkillCard';
import type { UserSkill } from '@/hooks/use-user-skills';

const auth = vi.hoisted(() => ({ isAuthenticated: true, openLoginModal: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/features/post', () => ({
  PostModal: ({ initialText }: { initialText: string }) => <div role="dialog">{initialText}</div>,
}));

const skill = {
  name: 'The RIFTN Logo', slug: 'the-riftn-logo', description: 'Preserve logo geometry',
  creator_username: 'maker', creator_wallet_address: '0x123456', usage_count: 3,
} as UserSkill;

afterEach(cleanup);
beforeEach(() => { auth.isAuthenticated = true; auth.openLoginModal.mockClear(); });

describe('sharing a skill', () => {
  it('opens a composer with the skill link without activating the skill', async () => {
    const useSkill = vi.fn();
    render(<SkillCard skill={skill} onClick={useSkill} />);
    fireEvent.click(screen.getByRole('button', { name: 'postOptions.share' }));
    expect((await screen.findByRole('dialog')).textContent).toContain('/app/assistant?skill=the-riftn-logo');
    expect(useSkill).not.toHaveBeenCalled();
  });

  it('does not activate the card when a share button receives keyboard input', () => {
    const useSkill = vi.fn();
    render(<SkillCard skill={skill} onClick={useSkill} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'postOptions.share' }), { key: 'Enter' });
    expect(useSkill).not.toHaveBeenCalled();
  });

  it('asks guests to sign in before composing a post', () => {
    auth.isAuthenticated = false;
    render(<SkillCard skill={skill} onClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'postOptions.share' }));
    expect(auth.openLoginModal).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
