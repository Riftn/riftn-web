import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  buildDocsPageCopy, collectPublicSources, EXTRA_LOCALES, missingPublicCopy, validatePageTranslation,
} from './build-public-locales.mjs';

const { values } = parseArgs({ options: {
  locales: { type: 'string' },
  routes: { type: 'string' },
  'max-characters': { type: 'string' },
} });
const root = fileURLToPath(new URL('../', import.meta.url));
const translations = path.join(root, 'scripts/public-page-translations');
const readJson = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const sources = collectPublicSources(root);
const docsCopy = buildDocsPageCopy(root, sources);
const routes = values.routes ? values.routes.split(',').map(route => route.trim()) :
  Object.keys(sources).filter(route => /^\/(?:docs(?:\/|$)|guides\/)/.test(route));
const locales = values.locales ? values.locales.split(',').map(locale => locale.trim()) : EXTRA_LOCALES;
const uniqueLocales = [...new Set(locales)];
const apply = values['max-characters'] !== undefined;
const budget = Number(values['max-characters']);
const apiKey = process.env.RIFTN_CLOUD_TRANSLATION_KEY;

for (const route of routes) if (!Object.hasOwn(sources, route)) throw new Error('Unknown route: ' + route);
for (const locale of uniqueLocales) if (!EXTRA_LOCALES.includes(locale)) throw new Error('Unknown optional locale: ' + locale);
if (apply && (!values.locales || !Number.isSafeInteger(budget) || budget <= 0 || !apiKey)) {
  throw new Error('Translation requires --locales, a positive --max-characters, and RIFTN_CLOUD_TRANSLATION_KEY.');
}

const length = text => [...text].length;
let sent = 0;
for (const locale of uniqueLocales) {
  const filename = path.join(translations, locale + '.json');
  const dictionary = readJson(filename);
  const editorial = readJson(path.join(translations, 'editorial', locale + '.json'));
  const keys = new Set();
  for (const route of routes) {
    if (editorial[route] || docsCopy[locale]?.[route]) continue;
    for (const text of missingPublicCopy(sources[route], dictionary)) keys.add(text);
  }
  const inputs = [...keys].filter(text => /\p{L}/u.test(text));
  const characters = inputs.reduce((sum, text) => sum + length(text), 0);
  console.log(locale + ': ' + inputs.length + ' missing strings (' + characters + ' source characters)');
  if (!apply) continue;

  let batch = [];
  let size = 0;
  for (const source of inputs) {
    const prepared = protect(source);
    const count = length(prepared.text);
    if (batch.length && (size + count > 5000 || batch.length === 128)) await translateBatch();
    if (sent + size + count > budget) {
      if (batch.length) await translateBatch();
      console.log('Stopped at the requested character limit after sending ' + sent + ' characters.');
      process.exit(0);
    }
    batch.push({ source, ...prepared });
    size += count;
  }
  if (batch.length) await translateBatch();

  async function translateBatch() {
    const response = await fetch('https://translation.googleapis.com/language/translate/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        q: batch.map(item => item.text), format: 'text', source: 'en', target: locale,
      }),
      signal: AbortSignal.timeout(60000),
    });
    sent += size;
    if (!response.ok) throw new Error('Translation API returned HTTP ' + response.status + ' for ' + locale);
    const results = (await response.json()).data?.translations;
    if (results?.length !== batch.length) throw new Error('Translation API returned an incomplete batch');

    let saved = 0;
    for (const [index, { source, restore }] of batch.entries()) {
      try {
        const translation = restore(results[index].translatedText);
        if (!translation?.trim()) throw new Error('Empty translation');
        dictionary[source] = validatePageTranslation(source, translation);
        saved++;
      } catch {
        console.warn(locale + ': skipped an invalid translation for ' + JSON.stringify(source.slice(0, 80)));
      }
    }
    fs.writeFileSync(filename + '.tmp', JSON.stringify(dictionary, null, 2) + '\n');
    fs.renameSync(filename + '.tmp', filename);
    console.log(locale + ': saved ' + saved + ' of ' + batch.length + ' strings');
    batch = [];
    size = 0;
  }
}

// Preserve rich text delimiters and destinations while translating the copy.
function protect(source) {
  const pieces = [];
  const text = source.replace(/<[^>]+>|`[^`\n]+`|\]\([^)\n]+\)|https?:\/\/[^\s<>)]+|\[TEAM_SECTION_[^\]]+\]|\{\{?[\w.]+\}?\}|^\s{0,3}(?:#{1,6}|[-+*]|\d+\.) +|\*{1,3}|_{1,3}/gm, match => {
    pieces.push(match);
    return 'RIFTNPROTECT' + (pieces.length - 1) + 'TOKEN';
  });
  return { text, restore(output) {
    if (typeof output !== 'string') throw new Error('Invalid translation');
    let count = 0;
    const restored = output.replace(/RIFTNPROTECT(\d+)TOKEN/g, (token, index) => {
      if (Number(index) !== count || count >= pieces.length) throw new Error('Changed protected text order');
      return pieces[count++];
    });
    if (count !== pieces.length) throw new Error('Missing protected text');
    return restored;
  } };
}

