/**
 * Chat language hint
 * ==================
 * Whether a short Latin-script chat line plainly reads as a language other than
 * the reader's, judged on the device with no request.
 *
 * Chat lines are too short for a translator to guess the language from, and
 * slang ("hiya bashmo bro") comes back as a confident sentence nobody wrote. So
 * chat only auto-translates a Latin line when it carries words that belong to
 * one language: greetings and the small function words every sentence uses.
 * "bom dia galera" and "hola a todos" qualify; "gm", "lets goooo" and names do
 * not, and keep their Translate option in the hold menu.
 *
 * Words that are also everyday English ("no", "me", "come", "a") are left out
 * of the other languages so an English line never reads as foreign.
 *
 * Kept in step with dehub-mobile/libs/chat-language-hint.ts.
 */

const MARKERS: Record<string, string> = {
  en: 'the and is are was were of to it that this with for you your on be have has not but what will my we they just from at so if can do about there their been would should some every works yes hello hi hey thanks thank good morning evening night everyone guys all welcome happy',
  es: 'el la los las que y es por una para con se del al lo como más pero su muy está hay ser yo mi tu esto esta hola buenos buenas días dias gracias todos amigos noche tarde qué cómo bien hermano',
  pt: 'o os as que e do da dos das em um uma para com não é se na no mais mas seu sua muito está isso eu você bom boa dia noite tarde obrigado obrigada galera pessoal tudo bem irmão olá oi',
  fr: 'le la les des et est une du que pour dans pas qui sur avec ce il je vous nous sont mais très cette au aux bonjour bonsoir merci salut tout monde tous ça oui',
  de: 'der die das und ist nicht ich du zu mit den ein eine es auf für von sich auch dem wir sie sind aber noch hallo guten morgen danke abend leute',
  it: 'il lo gli le di che è una per con non sono del della mi ma anche questo come più io tu ci ciao buongiorno buonasera grazie tutti',
  id: 'yang dan di ini itu dengan untuk tidak ada saya kamu aku kita kami apa akan sudah bisa juga dari selamat pagi siang malam semua terima kasih teman',
  nl: 'de het een en van ik je niet dat zijn op te met voor er maar ook wat goedemorgen hallo dank allemaal',
  tr: 've bir bu da de için çok ne var ben sen merhaba günaydın teşekkürler teşekkür ederim iyi akşamlar geceler herkese selam selamlar naber nasılsın nasılsınız evet hayır tamam sağol sağolun kardeşim abi kanka güzel değil ama gibi daha şey yok olan oldu lütfen hoş geldin geldiniz',
  tl: 'ang ng mga sa na ako ka ikaw siya kayo tayo hindi salamat po magandang umaga gabi lahat',
};

const COMMON_ENGLISH = new Set(
  'a i no me come so be on in is he we as at to do go up an or us it if by my oh hi ok yes con die art men car tag den ten pas mi tu da van after over all bank mine sure tour son'.split(' '),
);

const SETS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(MARKERS).map(([lang, words]) => [
    lang,
    new Set(words.split(' ').filter((w) => lang === 'en' || !COMMON_ENGLISH.has(w))),
  ]),
);

/**
 * Letters only one marker language writes. Turkish chat skips most small words
 * ("selam nasılsın kanka"), but a word with ğ or dotless ı is Turkish wherever
 * it appears, so each such word counts as a Turkish marker.
 */
const LETTER_HINTS: Record<string, RegExp> = {
  tr: /[ğı]/u,
};

function base(lang: string): string {
  return lang.toLowerCase().split(/[-_]/)[0];
}

function chatWords(text: string): string[] {
  return text
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/[@#$][\p{L}\p{N}_.-]+/gu, ' ')
    .toLowerCase()
    .match(/\p{L}+/gu) ?? [];
}

function languageFromWords(tokens: string[]): string | null {
  if (tokens.length < 2) return null;
  let best: string | null = null;
  let bestHits = 0;
  let runnerUp = 0;
  for (const [lang, set] of Object.entries(SETS)) {
    const letters = LETTER_HINTS[lang];
    const hits = tokens.filter((t) => set.has(t) || (!!letters && letters.test(t))).length;
    if (hits > bestHits) { runnerUp = bestHits; bestHits = hits; best = lang; }
    else if (hits > runnerUp) runnerUp = hits;
  }
  // Two words of the same language, and clearly more than any other language.
  if (bestHits < 2 || bestHits <= runnerUp) return null;
  return best;
}

/** The language a Latin chat line clearly reads as, or null when it does not say. */
export function chatLineLanguage(text: string): string | null {
  return languageFromWords(chatWords(text));
}

/** A local hint for classifying an unchanged translation response. */
export function chatLineMatchesLanguage(text: string, language: string): boolean {
  const words = chatWords(text);
  return words.every(word => /^\p{Script=Latin}+$/u.test(word))
    && languageFromWords([...new Set(words)]) === base(language);
}

/** True when the line plainly reads as a language other than the reader's. */
export function chatLineIsForeign(text: string, readerLang: string): boolean {
  const lang = chatLineLanguage(text);
  return !!lang && lang !== base(readerLang);
}
