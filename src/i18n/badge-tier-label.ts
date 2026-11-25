import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { canonicalTierName } from '@/lib/staking-badge-rules';
import labels from './badge-tier-labels.json';

const translations: Readonly<Record<string, readonly string[]>> = labels;

export function badgeTierLabel(tier: string, language?: string): string {
  const index = labels.en.indexOf(canonicalTierName(tier));
  if (index < 0) return tier;

  const locale = language?.toLowerCase().replaceAll('-', '_') ?? 'en';
  const base = locale.split('_')[0];
  return translations[locale]?.[index] ?? translations[base]?.[index] ?? labels.en[index];
}

export function useBadgeTierLabel() {
  const { i18n } = useTranslation();
  const language = i18n?.language;
  return useCallback((tier: string) => badgeTierLabel(tier, language), [language]);
}
