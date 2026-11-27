import { readdirSync } from 'node:fs';

const seen = new Map();
for (const file of readdirSync(new URL('../supabase/migrations/', import.meta.url))) {
  if (!file.endsWith('.sql')) continue;
  const version = file.split('_')[0];
  if (seen.has(version)) throw new Error(`Duplicate migration version in ${seen.get(version)} and ${file}`);
  seen.set(version, file);
}
console.log(`Checked ${seen.size} unique migration versions.`);
