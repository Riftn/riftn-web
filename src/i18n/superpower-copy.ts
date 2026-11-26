import type { SuperPowerInfo, SuperPowerKey } from '@/lib/api/dehub/superpowers';
import copy from './superpower-copy.json';

type PowerCopy = Partial<Pick<SuperPowerInfo, 'label' | 'summary'>>;
const translations: Readonly<Record<string, Partial<Record<SuperPowerKey, PowerCopy>>>> = copy;

export function localizeSuperPower(power: SuperPowerInfo, language?: string): SuperPowerInfo {
  const locale = language?.toLowerCase().replaceAll('-', '_') ?? 'en';
  const base = locale.split('_')[0];
  const local = translations[locale]?.[power.key];
  const fallback = translations[base]?.[power.key];

  return {
    ...power,
    label: local?.label ?? fallback?.label ?? power.label,
    summary: local?.summary ?? fallback?.summary ?? power.summary,
  };
}
