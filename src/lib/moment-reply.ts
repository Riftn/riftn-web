// Replies are ordinary DM text so older clients can read them. Current senders
// flag the permalink; older senders used one of these localized prefixes.
const legacyHeaders = new Set([
  'Replied to your moment', 'A répondu à votre moment', 'Anına yanıt verdi',
  'Reageerde op je moment', 'Respondió a tu momento', 'ردّ على لحظتك',
]);

export function parseMomentReply(content?: string | null, localOrigin?: string) {
  if (!content?.includes('/moment/')) return null;
  const match = /^([^:\n]{1,100}):[ \t]*([\s\S]*?)\r?\n(https?:\/\/[^\s]+)$/i.exec(content.trim());
  if (!match) return null;
  try {
    const url = new URL(match[3]);
    if (url.username || url.password || (url.origin !== localOrigin
      && !/^https?:\/\/(?:www\.)?(?:riftn\.com|dehub\.io)$/i.test(url.origin))) return null;
    const path = /^\/(?:app\/)?moment\/([a-f0-9]{24})\/?$/i.exec(url.pathname);
    if (!path || (url.searchParams.get('reply') !== '1' && !legacyHeaders.has(match[1].trim()))) return null;
    return { id: path[1], text: match[2].trim() };
  } catch {
    return null;
  }
}
