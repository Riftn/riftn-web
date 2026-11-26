import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DhbListingSoonCard } from './DhbListingSoonCard';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_: string, value: string) => value }) }));
vi.mock('@/components/app/token-launch/TokenLaunchNotify', () => ({
  TokenLaunchNotify: () => <button type="button">Notify me</button>,
}));

describe('RIFT ticker', () => {
  it('shows the reference price and opens each launch action', () => {
    render(<DhbListingSoonCard />);
    expect(screen.getByText('$RIFT')).toBeTruthy();
    expect(screen.getByText('$0.001')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Info' }));
    expect(screen.getByRole('status').textContent).toBe('Coming soon');
    fireEvent.click(screen.getByRole('button', { name: 'Contract address' }));
    expect(screen.getByRole('status').textContent).toBe('To be confirmed');
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(screen.getByRole('button', { name: 'Notify me' })).toBeTruthy();
  });
});
