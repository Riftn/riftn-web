import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The product was renamed DeHub -> Riftn. English was updated, but older
 * machine translations kept the old name and the old dehub.io domain, so
 * ~500 strings across 80 languages still said DeHub. A translation may only
 * mention DeHub when the English for the same key does (e.g. "formerly called
 * DeHub", the dehub.io login migration line).
 */
const OLD_BRAND = /de\s?hub/i;

type Tree = { [key: string]: unknown };

const flatten = (tree: Tree, prefix = '', out: Record<string, unknown> = {}) => {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value as Tree, path, out);
    else out[path] = value;
  }
  return out;
};

const stale = (en: Record<string, unknown>, locale: Record<string, unknown>) =>
  Object.entries(locale)
    .filter(([key, value]) => OLD_BRAND.test(JSON.stringify(value)) && !OLD_BRAND.test(JSON.stringify(en[key] ?? '')))
    .map(([key]) => key);

describe('translations use the Riftn name', () => {
  it('app strings (src/i18n/locales)', () => {
    const dir = resolve('src/i18n/locales');
    const en = flatten(JSON.parse(readFileSync(resolve(dir, 'en.json'), 'utf8')));
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json') || file === 'en.json') continue;
      const locale = flatten(JSON.parse(readFileSync(resolve(dir, file), 'utf8')));
      offenders.push(...stale(en, locale).map((key) => `${file}: ${key}`));
    }
    expect(offenders).toEqual([]);
  }, 30_000); // reads ~110 large locale files; ~5 s alone, more on a busy runner

  it('docs and marketing bundles (src/i18n/<lang>.ts)', async () => {
    const bundles = import.meta.glob('../i18n/*.ts');
    const { en: enBundle } = (await import('@/i18n/en')) as { en: Tree };
    const en = flatten(enBundle);
    const offenders: string[] = [];
    for (const [file, load] of Object.entries(bundles)) {
      const name = file.split('/').pop()!;
      if (!/^[a-z]{2,3}\.ts$/.test(name) || name === 'en.ts') continue;
      const mod = (await load()) as Record<string, unknown>;
      const tree = Object.values(mod).find((value) => value && typeof value === 'object') as Tree | undefined;
      if (!tree) continue;
      offenders.push(...stale(en, flatten(tree)).map((key) => `${name}: ${key}`));
    }
    expect(offenders).toEqual([]);
  }, 120_000);
});
