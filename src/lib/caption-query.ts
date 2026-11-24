/**
 * Words from a caption worth searching pictures for: no links, mentions,
 * tags, numbers or short filler, first few that are left.
 */
export function captionQuery(caption: string): string {
  const words = caption
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[@#$]\S+/g, ' ')
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length > 2);
  return words.slice(0, 6).join(' ');
}
