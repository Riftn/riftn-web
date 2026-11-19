/**
 * Catches a misspelled email provider before a sign-in email is sent to an
 * address that cannot receive it (e.g. "name@gmail.coms", "name@gmial.com").
 * The send fails silently for the person: they just never get the email.
 *
 * Returns the corrected address, or null when the domain is a known provider,
 * is not close to one, or is a custom domain we can't judge.
 */

const KNOWN_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'ymail.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it',
  'outlook.com', 'outlook.fr', 'outlook.de', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.de', 'gmx.net', 'web.de', 'mail.com', 'email.com',
  'yandex.com', 'yandex.ru', 'mail.ru', 'qq.com', '163.com', 'naver.com',
];

const KNOWN = new Set(KNOWN_DOMAINS);

/** Edit distance where swapping two neighbouring letters counts as one edit. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

export function suggestEmailFix(raw: string): string | null {
  const email = raw.trim();
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || KNOWN.has(domain)) return null;

  const dot = domain.indexOf('.');
  const name = dot === -1 ? domain : domain.slice(0, dot);
  const tld = dot === -1 ? '' : domain.slice(dot + 1);

  let best: string | null = null;
  let bestDistance = Infinity;
  for (const known of KNOWN_DOMAINS) {
    const kDot = known.indexOf('.');
    const kName = known.slice(0, kDot);
    const kTld = known.slice(kDot + 1);
    let dist: number;
    if (name === kName) {
      // Same provider, different ending. Only a slip on ".com" counts
      // (coms, con, cm, co); hotmail.es or yahoo.co.jp are real addresses.
      if (kTld !== 'com' || distance(tld, 'com') > 1) continue;
      dist = distance(tld, kTld);
    } else {
      // Short names sit close to each other (me.com / mac.com), so only allow
      // one slip there; longer names can take two.
      const allowed = known.length <= 9 ? 1 : 2;
      dist = distance(domain, known);
      if (dist > allowed) continue;
    }
    if (dist < bestDistance) {
      best = known;
      bestDistance = dist;
    }
  }
  return best ? `${local}@${best}` : null;
}
