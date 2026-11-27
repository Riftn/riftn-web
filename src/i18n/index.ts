import { applyDateLocale } from './date-locale';
import manifest from './locale-manifest.json';
/**
 * i18n Configuration
 * ==================
 * Only English is bundled. All other languages are lazy-loaded on demand.
 * Syncs with useUserLanguage hook for language preference.
 */

import i18n, { type FormatterModule } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './core-en.json';
import { humanizeTranslationKey } from './missing-key-fallback';
import { fillMissingPluralForms } from './plural-fallback';
import { shortenCounterPlaceholder } from './counter-placeholders';

const STORAGE_KEY = 'user-preferred-language';

// Read cached language (same key as useUserLanguage hook)
const savedLang = (() => {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
})();
// Taiwan, Hong Kong, Macau and zh-Hant browsers read Traditional Chinese.
const browserLang = /^zh-(tw|hk|mo)\b|^zh-hant/i.test(navigator.language || '')
  ? 'zh_tw'
  : navigator.language?.split('-')[0] || 'en';
const deviceLang = savedLang || browserLang;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'dcc', name: 'Deccan', nativeName: 'دکنی' },
  { code: 'dyu', name: 'Jula', nativeName: 'Julakan' },
  { code: 'om', name: 'Oromo', nativeName: 'Afaan Oromoo' },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'acm', name: 'Arabic, Mesopotamian Spoken', nativeName: 'عراقي' },
  { code: 'acw', name: 'Arabic, Hijazi Spoken', nativeName: 'حجازي' },
  { code: 'aec', name: "Arabic, Sa'idi Spoken", nativeName: 'صعيدي' },
  { code: 'ajp', name: 'Arabic, South Levantine Spoken', nativeName: 'شامي' },
  { code: 'ayn', name: 'Arabic, Sanaani Spoken', nativeName: 'صنعاني' },
  { code: 'apd', name: 'Arabic, Sudanese Spoken', nativeName: 'عربي سوداني' },
  { code: 'bho', name: 'Bhojpuri', nativeName: 'भोजपुरी' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာ' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'zh_tw', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { code: 'cjy', name: 'Chinese, Jinyu', nativeName: '晋语' },
  { code: 'mnp', name: 'Chinese, Min Bei', nativeName: '闽北语' },
  { code: 'ctg', name: 'Chittagonian', nativeName: 'চাটগাঁইয়া' },
  { code: 'hne', name: 'Chhattisgarhi', nativeName: 'छत्तीसगढ़ी' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'arz', name: 'Egyptian Arabic', nativeName: 'مصرى' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'gsw', name: 'Swiss German', nativeName: 'Schwyzerdütsch' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша' },
  { code: 'ku', name: 'Kurdish', nativeName: 'Kurdî' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ' },
  { code: 'mag', name: 'Magahi', nativeName: 'मगही' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол' },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy' },
  { code: 'yue', name: 'Cantonese', nativeName: '廣東話' },
  { code: 'wuu', name: 'Wu Chinese', nativeName: '吴语' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'ary', name: 'Moroccan Arabic', nativeName: 'الدارجة' },
  { code: 'km', name: 'Khmer', nativeName: 'ខ្មែរ' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'pcm', name: 'Nigerian Pidgin', nativeName: 'Naijá' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'wes', name: 'Pidgin, Cameroon', nativeName: 'Kamtok' },
  { code: 'pbt', name: 'Pashto, Southern', nativeName: 'پښتو' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'qu', name: 'Quechua', nativeName: 'Runasimi' },
  { code: 'rkt', name: 'Rangpuri', nativeName: 'রংপুরী' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'sdr', name: 'Sadri', nativeName: 'सादरी' },
  { code: 'skr', name: 'Saraiki', nativeName: 'سرائیکی' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල' },
  { code: 'so', name: 'Somali', nativeName: 'Soomaali' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  { code: 'syl', name: 'Sylheti', nativeName: 'ꠍꠤꠟꠐꠤ' },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'tts', name: 'Thai, Northeastern', nativeName: 'อีสาน' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbek' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu' },
  { code: 'ti', name: 'Tigrinya', nativeName: 'ትግርኛ' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  { code: 'mi', name: 'Maori', nativeName: 'Māori' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
  { code: 'ug', name: 'Uyghur', nativeName: 'ئۇيغۇرچە' },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ' },
  { code: 'tk', name: 'Turkmen', nativeName: 'Türkmen' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն' },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча' },
];

// ?hl=<code> is the URL a localised search result (or a shared link) lands on:
// the crawler is served that page in that language with an hreflang cluster
// (see CLOUDFLARE_WORKER_SEO.js). It picks the language for this visit only.
// It is NOT saved as the reader's preference: a link someone else shared must
// not change the language every later visit opens in. Only an explicit pick in
// a language menu saves one.
const urlLang = (() => {
  try {
    const raw = (new URLSearchParams(window.location.search).get('hl') || '').toLowerCase();
    return SUPPORTED_LANGUAGES.some((l) => l.code === raw) ? raw : '';
  } catch {
    return '';
  }
})();
const defaultLang = urlLang || deviceLang;

// Dynamic import map for lazy loading locale files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Languages written right-to-left. Keep in sync with SUPPORTED_LANGUAGES.
export const RTL_LANGUAGES = new Set([
  'ar', 'acm', 'acw', 'aec', 'ajp', 'ayn', 'apd', 'ary', 'arz', // Arabic + dialects
  'he', 'fa', 'ur', 'pbt', 'sd', 'skr', 'ug', 'dcc',
]);

export function applyDocumentDirection(lang: string): void {
  document.documentElement.lang = lang.replace('_', '-');
  document.documentElement.dir = RTL_LANGUAGES.has(lang) ? 'rtl' : 'ltr';
}

export const preferredLanguage = defaultLang;

function readPackCache(key: string): Record<string, unknown> | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch { /* A corrupt or unavailable entry can be fetched again. */ }
}

function previousPackKeys(lang: string, group: string): string[] {
  try {
    const current = `locale-pack:${manifest.version}:${lang}:${group}`;
    return Object.keys(localStorage).filter(key =>
      key.startsWith('locale-pack:') && key.endsWith(`:${lang}:${group}`) && key !== current,
    );
  } catch { return []; }
}

function previousPack(lang: string, group: string) {
  for (const key of previousPackKeys(lang, group).reverse()) {
    const bundle = readPackCache(key);
    if (bundle) return bundle;
  }
}

const loadedPacks = new Set<string>([`${manifest.version}:en:core`]);
const offlinePacks = new Set<string>();
const retryAfter = new Map<string, number>();
const pendingPacks = new Map<string, Promise<boolean>>();

function applyPack(lang: string, group: string, data: Record<string, unknown>, current: boolean) {
  const key = `${manifest.version}:${lang}:${group}`;
  if (current) {
    loadedPacks.add(key);
    offlinePacks.delete(key);
  } else {
    offlinePacks.add(key);
  }
  i18n.addResourceBundle(lang, 'translation', data, true, current);
  fillMissingPluralForms(i18n, lang);
}

async function loadPack(lang: string, group: string, trigger = 'language-selection'): Promise<boolean> {
  if (!manifest.languages.includes(lang)) return false;
  const key = `${manifest.version}:${lang}:${group}`;
  if (loadedPacks.has(key)) return true;
  // Feature strings can request a pack during render. Emit resource events
  // after that render, including when the bundle comes from local storage.
  await Promise.resolve();
  if (loadedPacks.has(key)) return true;
  if ((retryAfter.get(key) || 0) > Date.now()) return offlinePacks.has(key);
  const existing = pendingPacks.get(key);
  if (existing) return offlinePacks.has(key) || existing;

  const storageKey = `locale-pack:${key}`;
  const cached = readPackCache(storageKey);
  if (cached) {
    applyPack(lang, group, cached, true);
    return true;
  }
  const fallback = offlinePacks.has(key) ? undefined : previousPack(lang, group);

  // Record only the first attempt for a pack, so startup audits can identify
  // the translation caller without recording user text or repeated renders.
  globalThis.performance?.mark?.('locale-pack-request', { detail: { language: lang, group, trigger } });
  const pending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`/locale-packs/web/${manifest.version}/${lang}/${group}.json`, { signal: controller.signal });
      if (!response.ok) throw new Error('Locale pack unavailable');
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid locale pack');
      try {
        const value = JSON.stringify(data);
        localStorage.setItem(storageKey, value);
        if (localStorage.getItem(storageKey) === value) {
          for (const previousKey of previousPackKeys(lang, group)) localStorage.removeItem(previousKey);
        }
      } catch { /* The in-memory resources still work. */ }
      applyPack(lang, group, data, true);
      return true;
    } catch {
      retryAfter.set(key, Date.now() + 30_000);
      return offlinePacks.has(key);
    } finally {
      clearTimeout(timeout);
      pendingPacks.delete(key);
    }
  })();
  pendingPacks.set(key, pending);
  if (fallback) applyPack(lang, group, fallback, false);
  return offlinePacks.has(key) || pending;
}
/**
 * Copy packs a render asked for that have not landed yet. A page rendered
 * before its pack arrives shows stand-in text ("Bdm Title", "Hero Title") and
 * then reflows when the real copy lands; PersistentPageCache's CopyGate reads
 * this to hold a freshly mounted page behind its skeleton for that moment.
 */
const pendingCopy = new Set<Promise<boolean>>();
export function takePendingCopy(): Promise<unknown> | null {
  if (!pendingCopy.size) return null;
  return Promise.all([...pendingCopy]);
}
const trackCopy = (lang: string, group: string, trigger: string) => {
  const key = `${manifest.version}:${lang}:${group}`;
  if (loadedPacks.has(key)) return;
  const pending = loadPack(lang, group, trigger);
  if (loadedPacks.has(key) || offlinePacks.has(key)) return;
  if (pendingCopy.has(pending)) return;
  pendingCopy.add(pending);
  void pending.finally(() => pendingCopy.delete(pending));
};
const requestedGroups = new Set<string>(['core']);
const groupForKey = (key: string) => (manifest.groups as Record<string, string>)[key.split('.')[0]];
i18n.use({
  type: 'postProcessor', name: 'featurePacks',
  process(value: string, keys: string[], options: { defaultValue?: unknown; lng?: unknown }) {
    const group = groupForKey(keys[0] || '');
    if (group) {
      requestedGroups.add(group);
      const lang = typeof options.lng === 'string' ? options.lng : i18n.language || 'en';
      // Inline English is already the fallback. Fetching its entire optional
      // dictionary duplicates that copy and interrupts the first feed render.
      const inlineEnglish = typeof options.defaultValue === 'string' && options.defaultValue.length > 0;
      if (lang !== 'en' || !inlineEnglish) trackCopy(lang, group, keys[0]);
      if (lang !== 'en' && !inlineEnglish) trackCopy('en', group, keys[0]);
    }
    return value;
  },
});
export async function loadLanguage(lang: string): Promise<boolean> {
  const groups = ['ar', 'es', 'fr', 'nl', 'tr'].includes(lang)
    ? [...new Set(Object.values(manifest.groups))]
    : [...requestedGroups];
  if (!await loadPack(lang, 'core')) return false;
  for (const group of groups) {
    if (group !== 'core') void loadPack(lang, group);
  }
  return true;
}
const counterFormatter = {
  type: 'formatter',
  format: (value, format, lng, options) => shortenCounterPlaceholder(value, format, lng, options) as string,
} satisfies Pick<FormatterModule, 'type' | 'format'>;

const initialLanguage = manifest.languages.includes(defaultLang) ? defaultLang : 'en';
const initialCoreKey = `${manifest.version}:${initialLanguage}:core`;
const currentCore = initialLanguage === 'en' ? undefined : readPackCache(`locale-pack:${initialCoreKey}`);
const cachedCore = currentCore || (initialLanguage === 'en' ? undefined : previousPack(initialLanguage, 'core'));
if (currentCore) loadedPacks.add(initialCoreKey);
else if (cachedCore) offlinePacks.add(initialCoreKey);

i18n.use(counterFormatter).use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ...(cachedCore && { [initialLanguage]: { translation: cachedCore } }),
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  postProcess: ['featurePacks'],
  react: { bindI18nStore: 'added' },
  parseMissingKeyHandler: humanizeTranslationKey,
  interpolation: {
    escapeValue: false,
    // Counters in copy ({{count}} listens, {{views}} views...) read short, 1.2K
    // not 1200, the same as everywhere else on the site.
    alwaysFormat: true,
  },
});

applyDateLocale(i18n.language || 'en');
i18n.on('languageChanged', applyDateLocale);

// English needs one pass too: governance.proposalCount and postInfo.owner ship
// only an _other, so t(key, { count: 1 }) resolved to nothing and rendered the
// humanised key.
fillMissingPluralForms(i18n, 'en');
if (cachedCore) fillMissingPluralForms(i18n, initialLanguage);

// Keep <html dir> in sync so RTL languages (Arabic & dialects, Hebrew,
// Persian, Urdu, ...) actually lay out right-to-left in the app. The docs'
// LanguageContext manages dir independently on /docs routes.
i18n.on('languageChanged', applyDocumentDirection);
applyDocumentDirection(initialLanguage);

// Languages whose locale file is not filled in fall back to Google's translate
// widget rather than to English. Loaded lazily and only when one of those
// languages is actually selected — a viewer on a translated language never
// fetches it, never contacts Google, and never gets its DOM patch.
const syncTranslateWidget = (lang: string) => {
  import('./translate-widget-fallback')
    .then((m) => m.syncTranslateWidget(lang))
    .catch(() => undefined);
};
i18n.on('languageChanged', syncTranslateWidget);

// Start with local copy. Refresh the core in the background and let visible
// features request their own packs.
if (initialLanguage !== 'en') {
  syncTranslateWidget(initialLanguage);
  void loadPack(initialLanguage, 'core', 'startup');
}

window.addEventListener('online', () => {
  retryAfter.clear();
  void loadLanguage(i18n.language);
});

// Staking / community / auth-toast bundles are merged per-language inside
// loadLanguage() above — no static import, so they stay off the entry chunk.

export default i18n;
