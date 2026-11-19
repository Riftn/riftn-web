import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');

// Opening a page must never open the wallet. Balance and address reads use the
// silent session address; only Pay / Send / Create may ask for an unlock.
describe('no wallet prompt just for opening a page', () => {
  it('the paywall balance read (mounted on Creator and Editor) never unlocks', () => {
    const src = read('lib/ai-payment.ts');
    const hook = src.slice(src.indexOf('export function useSpendableDhb'), src.indexOf('export async function payForJob'));
    expect(hook).not.toMatch(/getWalletAddress\(\)/);
    expect(hook).toContain('getWalletAddress({ silent: true })');
  });

  it('the paid-DM balance check does not switch chains or unlock', () => {
    const src = read('components/app/chat/NewConversationModal.tsx');
    const check = src.slice(src.indexOf('const checkBalance'), src.indexOf('const handlePay'));
    expect(check).not.toContain('switchChain(');
    expect(check).toContain('getWalletAddress({ silent: true })');
  });

  it('following someone does not ask the wallet to sign', () => {
    const src = read('lib/follow-graph.ts');
    const fn = src.slice(src.indexOf('export function signFollow'), src.indexOf('export function syncFollowSignatures'));
    expect(fn).toContain('run(false)');
  });
});
