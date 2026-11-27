import { describe, expect, it } from 'vitest';
import { parseBannedWords } from '../manage/AutoModTab';
import { buyAlertExplorer, fmtPrice, isDhbBuyAlert } from '../../chat/BuyAlertCard';

describe('parseBannedWords', () => {
  it('splits on lines and commas, lowercases and drops repeats and blanks', () => {
    expect(parseBannedWords('Scam\nrug pull, SCAM ,, \n  ')).toEqual(['scam', 'rug pull']);
  });

  it('caps the list at 500 words', () => {
    const many = Array.from({ length: 600 }, (_, i) => `w${i}`).join('\n');
    expect(parseBannedWords(many)).toHaveLength(500);
  });
});

describe('buy alerts', () => {
  it('treats old symbol-less alerts and DHB alerts as the platform token', () => {
    expect(isDhbBuyAlert(JSON.stringify({ txHash: '0x1' }))).toBe(true);
    expect(isDhbBuyAlert(JSON.stringify({ txHash: '0x1', symbol: 'dhb' }))).toBe(true);
    expect(isDhbBuyAlert(JSON.stringify({ txHash: '0x1', symbol: 'PEPE' }))).toBe(false);
    expect(isDhbBuyAlert('not json')).toBe(false);
  });

  it('links to the explorer of the token chain', () => {
    expect(buyAlertExplorer(undefined)).toBe('https://basescan.org');
    expect(buyAlertExplorer('ethereum')).toBe('https://etherscan.io');
    expect(buyAlertExplorer('bsc')).toBe('https://bscscan.com');
    expect(buyAlertExplorer('something-else')).toBe('https://basescan.org');
  });

  it('prints tiny prices with real digits', () => {
    expect(fmtPrice(0.00001234)).toBe('$0.00001234');
    expect(fmtPrice(0.5)).toBe('$0.5000');
    expect(fmtPrice(2.5)).toBe('$2.5');
  });
});
