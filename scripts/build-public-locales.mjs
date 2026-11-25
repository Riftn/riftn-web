import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { mdToHtml } from './markdown-html.mjs';
import { pruneLocaleVersions } from './locale-retention.mjs';
import { garbled } from './i18n-guards.mjs';
import * as streamerPage from '../src/lib/streamer-page.js';
import * as dehubAppPage from '../src/lib/dehub-app-page.js';

export const PRIORITY_LOCALES = ['ar', 'es', 'fr', 'nl', 'tr'];
// The crawler accepts ISO 639-1 codes. Publish a locale only after a route
// has a complete translation, even if the interface already supports it.
export const EXTRA_LOCALES = fs.readdirSync(path.resolve('src/i18n/locales'))
  .filter(file => /^(?:[a-z]{2}|zh_tw)\.json$/.test(file))
  .map(file => file.slice(0, -5))
  .filter(code => code !== 'en' && !PRIORITY_LOCALES.includes(code))
  .sort();
const MISSING_COPY = / missing (?:translation|HTML text|accessible text): /;
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const decodeHtml = value => value.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&apos;', "'").replaceAll('&rsquo;', '’').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replaceAll('&nbsp;', ' ');
const normalizeCopy = value => decodeHtml(value).replace(/\s+/g, ' ').trim();
const neutralCopy = s=>!/\p{L}/u.test(s)||/^(?:#[a-f0-9]{3,8}|0x[a-f0-9]{40}|bc1[a-z0-9]{25,}|[^\s@]+@[^\s@]+\.[^\s@]+|(?:https?:\/\/)?[a-z0-9-]+\.(?:io|com|net|org)(?:\/\S*)?|Exo (?:Black|Semi-bold|Medium|Light) — \d+)$/i.test(s);
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const fixedImageName = value => /^(?:Mal Jan|Mike Hales|Indi Jay Cammish|Bailey Young|Riftn|DeHub|ChatGPT|Claude)$/i.test(value);
const numbers = value => [...value.replace(/(\d)[\u00a0 ](?=\d{3}(?:\D|$))/g, '$1').matchAll(/\d[\d.,]*/g)].map(match => match[0].replace(/\D/g, ''));
const accessibleText = (source, normalizedDictionary, route, lang) => {
  const suffix = source.endsWith('|avatar') ? '|avatar' : '';
  const plain = normalizeCopy(source.slice(0, source.length - suffix.length));
  if (!plain || neutralCopy(plain) || fixedImageName(plain)) return source;
  const translated = normalizedDictionary[plain];
  if (!translated) throw new Error(`${route}:${lang} missing accessible text: ${plain}`);
  if (JSON.stringify(numbers(plain)) !== JSON.stringify(numbers(translated))) throw new Error(`${route}:${lang} accessible text changed a number: ${plain}`);
  return translated.trim() + suffix;
};
const localizeMarkdownImages = (source, translated, dictionary, route, lang) => {
  const originals = [...source.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
  let position = 0;
  const result = translated.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, _alt, destination) => {
    const original = originals[position++];
    if (!original || original[2] !== destination) throw new Error(`${route}:${lang} image destination changed`);
    return `![${accessibleText(original[1], dictionary, route, lang)}](${destination})`;
  });
  if (position !== originals.length) throw new Error(`${route}:${lang} image count changed`);
  return result;
};
const localizeHtmlImages = (source, translated, dictionary, route, lang) => {
  const pattern = /(<img\b[^>]*?\balt=)(["'])(.*?)\2/gi;
  const originals = [...source.matchAll(pattern)];
  let position = 0;
  const result = translated.replace(pattern, (match, prefix, quote) => {
    const original = originals[position++];
    if (!original) throw new Error(`${route}:${lang} image count changed`);
    return `${prefix}${quote}${escapeHtml(accessibleText(original[3], dictionary, route, lang))}${quote}`;
  });
  if (position !== originals.length) throw new Error(`${route}:${lang} image count changed`);
  return result;
};
const localizeHtmlAttributes = (source, translated, dictionary, route, lang) => {
  const pattern = /(<[^>]*?\b(?:aria-label|title|placeholder)=)(["'])(.*?)\2/gi;
  const originals = [...source.matchAll(pattern)];
  let position = 0;
  const result = translated.replace(pattern, (match, prefix, quote) => {
    const original = originals[position++];
    if (!original) throw new Error(`${route}:${lang} accessibility attribute count changed`);
    return `${prefix}${quote}${escapeHtml(accessibleText(original[3], dictionary, route, lang))}${quote}`;
  });
  if (position !== originals.length) throw new Error(`${route}:${lang} accessibility attribute count changed`);
  return result;
};

/** Read the versioned crawler copy without starting the worker or making requests. */
export function collectPublicSources(root) {
  const source = fs.readFileSync(path.join(root, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');
  const ast = ts.createSourceFile('worker.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declarations = ast.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]);
  const context = { APP_URL: 'https://riftn.com', arcadeGameLd: () => ({}), ...streamerPage, ...dehubAppPage };
  const value = name => {
    const declaration = declarations.find(item => item.name.getText(ast) === name);
    if (!declaration?.initializer) throw new Error(`Missing crawler source: ${name}`);
    const result = vm.runInNewContext(`(${declaration.initializer.getText(ast)})`, context, { timeout: 1000 });
    context[name] = result;
    return result;
  };
  const marketing = value('MARKETING_PAGES'), sections = value('SECTION_PAGES');
  const docs = value('DOCS_PAGES'), guides = value('GUIDE_PAGES');
  for (const name of ['HOME_INTRO_SLIDES', 'HOME_INTRO_LINKS', 'HOME_INTRO_PRESS']) value(name);
  const homeBody = value('HOME_INTRO_HTML').match(/<!--hl-body-->([\s\S]*?)<!--\/hl-body-->/)[1];
  const en = readJson(path.join(root, 'src/i18n/locales/en.json'));
  const manifest = readJson(path.join(root, 'public/blog-manifest.json'));
  const sitemap = fs.readFileSync(path.join(root, 'public/sitemap-static.xml'), 'utf8');
  const routes = [...sitemap.matchAll(/<loc>https:\/\/riftn\.com([^<]*)<\/loc>/g)].map(match => match[1] || '/').filter(route => !route.includes('?'));
  const out = {};
  for (const route of routes) {
    let meta, body = '', md;
    if (route.startsWith('/guides/')) {
      const slug = route.slice(8);
      meta = guides[slug];
      if (meta) body = readJson(path.join(root, `public/guide-content/${slug}.json`)).html;
      else {
        const post = manifest.find(item => item.slug === slug);
        if (post) {
          meta = { title: post.seoTitle || post.title, description: post.seoDescription || post.excerpt, heading: post.title };
          const content = readJson(path.join(root, `public/blog-content/${slug}.json`));
          body = content.html; md = content.md;
        }
      }
    } else if (route.startsWith('/docs/') && route !== '/docs/blog') {
      const slug = route.slice(6);
      meta = docs[slug];
      if (meta) {
        body = readJson(path.join(root, `public/docs-content/${slug.replaceAll('/', '-')}.json`)).html;
        meta = { ...meta, heading: meta.title.replace(/ (?:—|\|) Riftn( Docs)?$/, '') };
      }
    } else {
      meta = marketing[route.slice(1)] || sections[route.slice(1)];
      if (meta) body = meta.bodyHtml || '';
    }
    if (meta) out[route] = { title: meta.title, description: meta.description, h1: meta.heading || meta.title, body, ...(md ? { md } : {}), ...(meta.intro ? { lede: meta.intro } : {}) };
  }
  out['/'] = { title: en.home.seoTitle, description: en.home.seoDescription, h1: 'Riftn | Open Source, User Owned & Censorship Resistant Media', body: homeBody, lede: "riftn.com is open source, user owned and censorship resistant media. Join the future of free speech and reach." };
  out['/docs'] = { title: en.docs.seoTitle, description: en.docs.seoDescription, h1: 'Riftn Documentation', body: '<ul>' + Object.entries(docs).map(([slug, page]) => `<li><a href="https://riftn.com/docs/${slug}">${escapeHtml(page.title.replace(/ (?:—|\|) Riftn( Docs)?$/, ''))}</a><br><small>${escapeHtml(page.description)}</small></li>`).join('') + '</ul>' };
  out['/docs/blog'] = { title: 'Riftn Blog | News, Guides & Product Updates', description: 'News, product updates and Web3 guides from Riftn, the open source, user-owned social platform.', h1: 'Riftn Blog', body: '<ul>' + manifest.map(post => `<li><a href="https://riftn.com/guides/${post.slug}">${escapeHtml(post.title)}</a><br><small>${escapeHtml(post.excerpt || '')}</small></li>`).join('') + '</ul>' };
  for (const route of routes) if (!out[route]?.body) throw new Error(`Public route has no source body: ${route}`);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function pageSegments(page) {
  return page.md
    ? page.md.split(/(\n\s*\n)/).filter(text => text.trim() && !/^\s*```/.test(text))
    : page.body.split(/(?<=<\/(?:p|li|h[1-6]|blockquote|table|div|section)>)/i).filter(text => text.trim());
}


/** Preserve executable markup, destinations, and interpolation while translating prose. */
export function validatePageTranslation(source, translated) {
  const matches = (text, pattern) => [...text.matchAll(pattern)].map(match => match[0]);
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const tags = /<\/?[a-zA-Z][^>]*>/g;
  const placeholders = /\{\{[^}]+\}\}|\{[a-zA-Z_][\w.]*\}|\[TEAM_SECTION_[^\]]+\]/g;
  const links = /https?:\/\/[^\s<>"\)]+/g;
  const stableTag = tag => tag.replace(/\b(alt|aria-label|title|placeholder)=(["']).*?\2/gi, (_, name) => `${name}="<translated>"`);
  if (!equal(matches(source, tags).map(stableTag), matches(translated, tags).map(stableTag))) throw new Error('Translated HTML changed markup');
  const imageDestinations = text => [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]);
  if (!equal(imageDestinations(source), imageDestinations(translated))) throw new Error('Translated Markdown changed an image destination');
  if (!equal(matches(source, placeholders).sort(), matches(translated, placeholders).sort())) throw new Error('Translation changed a placeholder');
  const urls = text => matches(text, links).map(link => link.replace(/[.,;!?]+$/, '')).sort();
  if (!equal(urls(source), urls(translated))) throw new Error('Translation changed a link');
  // Code is never translated, so a segment that is only a code sample comes
  // back unchanged on purpose and must not read as untranslated prose.
  const plain = source.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, '').replace(tags, '').trim();
  if (plain.split(/\s+/).length > 8 && source.trim() === translated.trim() && /\b(the|your|with|this|that|you|from|will|please)\b/i.test(plain)) throw new Error('English prose was left untranslated');
  return translated;
}

// DeHub is now Riftn. Pages and their stored translations moved over at
// different times, so a line may be stored under either name: try both and
// give the translation the same name the source uses.
const toRiftn = text => text.replace(/\bDeHubbers\b/g, 'Riftners').replace(/(?<![A-Za-z0-9_])De[Hh]ub(?![A-Z0-9_])/g, 'Riftn').replace(/(?<![A-Za-z0-9_])DEHUB(?![A-Za-z0-9_])/g, 'RIFTN').replace(/(?<![\w.@-])dehub\.io\b/g, 'riftn.com');
const toDeHub = text => text.replace(/\bRiftners\b/g, 'DeHubbers').replace(/(?<![A-Za-z0-9_])Riftn(?![A-Z0-9_])/g, 'DeHub').replace(/(?<![\w.@-])riftn\.com\b/g, 'dehub.io');
// Long dashes were later swapped for plain punctuation (" | " in titles,
// ", " or ": " in prose). Stored lines may still carry them, so a line also
// matches on its words alone, and the translation gets the same swap.
const looseKey = text => toRiftn(text).replace(/&mdash;/g, '—').replace(/\s*(?:[—–|,:])\s*/g, ' ').replace(/\s+/g, ' ').trim();
export const plainDashes = text => text
  .replace(/&mdash;/g, '—')
  .replace(/[ \t]+—[ \t]+(?=Riftn(?:[ \t]+[A-Z][\w&]*){0,3}[ \t]*$)/g, ' | ')
  .replace(/^Riftn([ \t]+(?:App|Blog|Docs|Guide))?[ \t]+—[ \t]+/, (_, word = '') => `Riftn${word} | `)
  .replace(/[ \t]+[—–][ \t]+/g, ', ')
  .replace(/(?<=\d)—(?=\d)/g, '-')
  .replace(/(?<=\S)—(?=\S)/g, ', ')
  .replace(/[ \t]*—[ \t]*/g, ', ')
  .replace(/,\s*,/g, ',')
  .replace(/,(?=[.!?;:])/g, '');
const looseIndex = new WeakMap();
function lookupLoose(dictionary, key) {
  let index = looseIndex.get(dictionary);
  if (!index) {
    index = new Map();
    for (const stored of Object.keys(dictionary)) if (!index.has(looseKey(stored))) index.set(looseKey(stored), stored);
    looseIndex.set(dictionary, index);
  }
  const stored = index.get(looseKey(key));
  return stored === undefined ? undefined : plainDashes(toRiftn(dictionary[stored]));
}
function lookupBranded(dictionary, key) {
  for (const variant of [key, toRiftn(key), toDeHub(key)]) {
    const found = dictionary[variant];
    if (typeof found !== 'string') continue;
    if (variant === key) return found;
    return /\bRiftn\b|riftn\.com/.test(key) ? toRiftn(found) : toDeHub(found);
  }
  return lookupLoose(dictionary, key);
}
const brandedDictionary = entries => new Proxy(entries, { get: (target, key) => typeof key === 'string' && !(key in Object.prototype) ? lookupBranded(target, key) : target[key] });


/** Return the same segment and accessibility keys the page builder reads. */
export function missingPublicCopy(page, entries) {
  const dictionary = brandedDictionary(Object.fromEntries(Object.entries(entries).map(
    ([source, target]) => [normalizeCopy(source), target],
  )));
  const missing = new Set();
  const add = text => {
    const plain = normalizeCopy(text);
    if (!plain || neutralCopy(plain) || !/[A-Za-z]{2}/.test(plain.replace(/<[^>]*>/g, ''))) return;
    if (!entries[text] && !dictionary[plain]) missing.add(text);
  };
  for (const key of ['title', 'description', 'h1', 'lede']) if (page[key]) add(page[key]);
  for (const part of pageSegments(page)) {
    if (page.md || !/<[a-zA-Z/]/.test(part)) {
      add(part);
    } else if (!entries[part] && !dictionary[normalizeCopy(part)]) {
      for (const section of part.split(/(<code\b[^>]*>[\s\S]*?<\/code>|<[^>]*>)/i)) {
        if (!section.startsWith('<')) add(normalizeCopy(section));
      }
    }
  }
  const body = page.md ? mdToHtml(page.md) : page.body;
  const accessible = [
    ...[...body.matchAll(/<img\b[^>]*?\balt=(["'])(.*?)\1/gi)].map(match => match[2]),
    ...[...body.matchAll(/<[^>]*?\b(?:aria-label|title|placeholder)=(["'])(.*?)\1/gi)].map(match => match[2]),
    ...[...(page.md || '').matchAll(/!\[([^\]]*)\]\([^)]+\)/g)].map(match => match[1]),
  ];
  for (const text of accessible) {
    const plain = normalizeCopy(text.replace(/\|avatar$/, ''));
    if (plain && !neutralCopy(plain) && !fixedImageName(plain) && !dictionary[plain]) missing.add(plain);
  }
  return [...missing];
}


function readDocsCopy(root, language) {
  const file = path.join(root, 'src/i18n', language + '.ts');
  if (!fs.existsSync(file)) return null;
  const translation = fs.readFileSync(file, 'utf8').replace(/^export const \w+\s*=\s*/, '').replace(/;\s*$/, '');
  return vm.runInNewContext('(' + translation + ')', {}, { timeout: 1000 });
}

function checkedDocsCopy(english, copy, keys, language) {
  if (!copy) return false;
  const numberFormat = new Intl.NumberFormat(language.replace("_", "-"), { useGrouping: false });
  const digits = Array.from({ length: 10 }, (_, digit) => numberFormat.format(digit));
  return keys.every(key => {
    const source = english[key];
    const translated = copy[key];
    if (typeof translated !== 'string' || !translated.trim() || normalizeCopy(translated) === normalizeCopy(source) ||
        (source.length > 100 && translated.length < source.length * 0.18) || garbled(source, translated)) return false;
    const normalized = digits.reduce((text, digit, index) => text.replaceAll(digit, String(index)), translated.normalize('NFKC'));
    const expected = numbers(source);
    let position = 0;
    for (const actual of numbers(normalized)) if (actual === expected[position]) position++;
    return position === expected.length;
  });
}

/** Reuse the complete copy that the visible documentation already renders. */
export function buildDocsPageCopy(root, sources) {
  const english = readDocsCopy(root, 'en');
  const overviewKeys = ['title', 'subtitle', 'disclaimerTitle', 'disclaimerText'];
  for (let section = 1; section <= 7; section++) overviewKeys.push('heading' + section, 'paragraph' + section);
  const features = ['featureFast', 'featureSecure', 'featureDevSupport', 'featureCommunity'];
  const homeKeys = ['welcomeTo', 'ourDocs', 'heroDescription', ...features.flatMap(key => [key, key + 'Desc'])];
  const seoKeys = ['indexTitle', 'indexDesc'];
  const result = {};
  for (const language of EXTRA_LOCALES) {
    const docs = readDocsCopy(root, language);
    if (!docs) continue;
    const pages = {};
    const heading = text => '<h2>' + escapeHtml(text) + '</h2>';
    const paragraph = text => '<p>' + escapeHtml(text) + '</p>';
    if (sources['/docs/overview'] && checkedDocsCopy(english.overview, docs.overview, overviewKeys, language)) {
      const copy = docs.overview;
      const body = [paragraph(copy.subtitle)];
      for (let section = 1; section <= 7; section++) body.push(heading(copy['heading' + section]), paragraph(copy['paragraph' + section]));
      body.push(heading(copy.disclaimerTitle), paragraph(copy.disclaimerText));
      pages['/docs/overview'] = { title: copy.title, description: copy.subtitle, h1: copy.title, body: body.join('\n') };
    }
    if (sources['/docs'] && checkedDocsCopy(english.home, docs.home, homeKeys, language) &&
        checkedDocsCopy(english.docsSeo, docs.docsSeo, seoKeys, language)) {
      const { home, docsSeo } = docs;
      const body = [paragraph(home.heroDescription)];
      for (const feature of features) body.push(heading(home[feature]), paragraph(home[feature + 'Desc']));
      if (pages['/docs/overview']) {
        const linkText = escapeHtml(pages['/docs/overview'].h1);
        body.push('<p><a href="https://riftn.com/docs/overview?hl=' + language + '">' + linkText + '</a></p>');
      }
      pages['/docs'] = {
        title: docsSeo.indexTitle, description: docsSeo.indexDesc,
        h1: home.welcomeTo + ' ' + home.ourDocs, body: body.join('\n'),
      };
    }
    if (Object.keys(pages).length) result[language] = pages;
  }
  return result;
}

export function buildPublicLocales(root) {
  const sources = collectPublicSources(root);
  const dictionaryFile = lang => path.join(root, 'scripts/public-page-translations', lang + '.json');
  const editorialFile = lang => path.join(root, 'scripts/public-page-translations/editorial', lang + '.json');
  const docsCopy = buildDocsPageCopy(root, sources);
  const extras = EXTRA_LOCALES.filter(lang => docsCopy[lang] || fs.existsSync(dictionaryFile(lang)) || fs.existsSync(editorialFile(lang)));
  const languages = [...PRIORITY_LOCALES, ...extras];
  const dictionaries = Object.fromEntries(languages.map(lang => [lang, fs.existsSync(dictionaryFile(lang)) ? readJson(dictionaryFile(lang)) : {}]));
  const normalizedDictionaries = Object.fromEntries(languages.map(lang => [lang, Object.fromEntries(Object.entries(dictionaries[lang]).map(([source, target]) => [normalizeCopy(source), target]))]).map(([lang, entries]) => [lang, brandedDictionary(entries)]));
  const editorial = Object.fromEntries(languages.flatMap(lang => {
    const file = editorialFile(lang);
    return fs.existsSync(file) ? [[lang, readJson(file)]] : [];
  }));
  const version = digest({ sources, dictionaries, editorial, docsCopy });
  const table = {}, assets = {}, routes = {};
  for (const [route, source] of Object.entries(sources)) {
    table[route] = { en: { title: source.title, description: source.description, h1: source.h1 } };
    routes[route] = [...PRIORITY_LOCALES];
    for (const lang of languages) {
      const extra = !PRIORITY_LOCALES.includes(lang);
      const docsPage = docsCopy[lang]?.[route];
      if (docsPage) {
        const asset = '/locale-pages/' + version + '/' + lang + route + '.json';
        assets[asset] = docsPage;
        const { title, description, h1 } = docsPage;
        table[route][lang] = { title, description, h1, asset };
        routes[route].push(lang);
        continue;
      }
      const edited = editorial[lang]?.[route];
      if (edited) {
        const { title, description, h1, md } = edited;
        if (!source.md || ![title, description, h1, md].every(value => typeof value === 'string' && value.trim())) {
          throw new Error('Invalid editorial translation for ' + route + ':' + lang);
        }
        const asset = `/locale-pages/${version}/${lang}/${route.slice(1)}.json`;
        assets[asset] = { title, description, h1, md, body: mdToHtml(md) };
        table[route][lang] = { title, description, h1, asset };
        if (extra) routes[route].push(lang);
        continue;
      }
      try {
        const dictionary = dictionaries[lang];
        const translate = text => {
          if (!text || neutralCopy(normalizeCopy(text)) || !/[A-Za-z]{2}/.test(text.replace(/<[^>]*>/g, ''))) return text;
          const translated = dictionary[text] || normalizedDictionaries[lang][normalizeCopy(text)];
          if (typeof translated === 'string' && translated.trim()) return validatePageTranslation(text, translated);
          if (/<[a-zA-Z/]/.test(text)) {
            const body = text.split(/(<code\b[^>]*>[\s\S]*?<\/code>|<[^>]*>)/i).map(part => {
              if (part.startsWith('<')) return part;
              const source = normalizeCopy(part);
              if (!source || neutralCopy(source) || !/[A-Za-z]{2}/.test(source)) return part;
              const target = normalizedDictionaries[lang][source];
              if (!target) throw new Error(route + ':' + lang + ' missing HTML text: ' + source.slice(0,100));
              return part.match(/^\s*/)[0] + escapeHtml(target.trim()) + part.match(/\s*$/)[0];
            }).join('');
            return validatePageTranslation(text, body);
          }
          throw new Error(route + ':' + lang + ' missing translation: ' + text.slice(0,100));
        };
        const translatedMd = source.md?.split(/(\n\s*\n)/).map(text => !text.trim() || /^\s*```/.test(text) ? text : translate(text)).join('');
        const md = translatedMd ? localizeHtmlAttributes(source.md, localizeHtmlImages(source.md, localizeMarkdownImages(source.md, translatedMd, normalizedDictionaries[lang], route, lang), normalizedDictionaries[lang], route, lang), normalizedDictionaries[lang], route, lang) : undefined;
        const untranslatedAltsBody = md ? mdToHtml(md) : source.body.split(/(?<=<\/(?:p|li|h[1-6]|blockquote|table|div|section)>)/i).map(translate).join('');
        const sourceBody = md ? mdToHtml(source.md) : source.body;
        const body = localizeHtmlAttributes(sourceBody, localizeHtmlImages(sourceBody, untranslatedAltsBody, normalizedDictionaries[lang], route, lang), normalizedDictionaries[lang], route, lang);
        const page = { title: translate(source.title), description: translate(source.description), h1: translate(source.h1), body, ...(md ? { md } : {}), ...(source.lede ? { lede: translate(source.lede) } : {}) };
        const bodyHeading = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
        if (bodyHeading) page.h1 = bodyHeading.replace(/<[^>]*>/g, '').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
        const asset = `/locale-pages/${version}/${lang}/${route === '/' ? 'index' : route.slice(1)}.json`;
        assets[asset] = page;
        table[route][lang] = { title: page.title, description: page.description, h1: page.h1, asset };
        if (extra) routes[route].push(lang);
      } catch (error) {
        if (!extra || !MISSING_COPY.test(error.message)) throw error;
      }
    }
  }
  for (const lang of languages) {
    const metadata = {};
    for (const [route, source] of Object.entries(sources)) {
      if (!source.md || !route.startsWith('/guides/') || !table[route][lang]) continue;
      const page = assets[table[route][lang].asset];
      metadata[route.slice(8)] = { title: page.h1, seoTitle: page.title, seoDescription: page.description, excerpt: page.description, bannerImageAlt: page.h1 };
    }
    if (Object.keys(metadata).length || !extras.includes(lang)) assets[`/locale-pages/${version}/${lang}/blog-metadata.json`] = metadata;
  }
  return { manifest: { version, routes }, table, assets };
}

export function writePublicLocales(root, built = buildPublicLocales(root)) {
  const manifestFile = path.join(root, 'src/i18n/public-locales.json');
  let previousVersion;
  try {
    const previous = readJson(manifestFile).version;
    previousVersion = previous !== built.manifest.version ? previous : readJson(path.join(root, 'public/locale-pages/current.json')).previousVersion;
  } catch { /* First generation has no preceding version. */ }
  for (const [asset, page] of Object.entries(built.assets)) {
    const destination = path.join(root, 'public', asset);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(page)}\n`);
  }
  fs.writeFileSync(manifestFile, `${JSON.stringify(built.manifest, null, 2)}\n`);
  pruneLocaleVersions(root, built.manifest.version, previousVersion);
  return built;
}
