export const STAGE_TOPICS = ['general', 'crypto', 'sports', 'gaming', 'technology'] as const;
export type StageTopic = typeof STAGE_TOPICS[number];

export function matchesStageSearch(
  space: { title: string; description?: string | null; host_username?: string | null },
  term: string,
  language: string,
) {
  if (!term.trim()) return true;
  const locale = language.split(/[-_]/)[0] || 'en';
  const query = term.trim().replace(/^@/, '').toLocaleLowerCase(locale);
  return [space.title, space.description, space.host_username]
    .some((value) => value?.toLocaleLowerCase(locale).includes(query));
}
