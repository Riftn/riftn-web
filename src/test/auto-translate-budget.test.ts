import { beforeEach, describe, expect, it } from 'vitest';
import { AUTO_TRANSLATE_HOURLY_BUDGET, takeAutoTranslateSlot, __resetAutoTranslateBudget } from '@/lib/auto-translate-budget';

describe('auto-translate budget', () => {
  beforeEach(() => __resetAutoTranslateBudget());

  it('stops automatic translations once the hourly budget is spent', () => {
    const now = 1_000_000_000_000;
    for (let i = 0; i < AUTO_TRANSLATE_HOURLY_BUDGET; i++) expect(takeAutoTranslateSlot(now + i)).toBe(true);
    expect(takeAutoTranslateSlot(now + AUTO_TRANSLATE_HOURLY_BUDGET)).toBe(false);
  });

  it('frees slots as the hour rolls over', () => {
    const now = 1_000_000_000_000;
    for (let i = 0; i < AUTO_TRANSLATE_HOURLY_BUDGET; i++) takeAutoTranslateSlot(now);
    expect(takeAutoTranslateSlot(now + 30 * 60 * 1000)).toBe(false);
    expect(takeAutoTranslateSlot(now + 60 * 60 * 1000 + 1)).toBe(true);
  });
});
