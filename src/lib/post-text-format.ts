export const POST_TEXT_STYLES = ['b', 'i', 'u'] as const;

export type PostTextStyle = typeof POST_TEXT_STYLES[number];
export type PostTextSelection = { start: number; end: number };

/** The post body stores only these fixed markers. Other text stays literal. */
export function postTextRuns(text: string): { text: string; styles: PostTextStyle[] }[] {
  if (!text.includes('[/')) return [{ text, styles: [] }];
  const markers = [...text.matchAll(/\[(\/?)([biu])\]/g)];
  const stack: typeof markers = [];
  const pairs = new Set<number>();
  for (const marker of markers) {
    if (!marker[1]) {
      stack.push(marker);
    } else if (stack[stack.length - 1]?.[2] === marker[2]) {
      pairs.add(stack.pop()!.index!);
      pairs.add(marker.index!);
    }
  }

  if (!pairs.size) return [{ text, styles: [] }];
  const runs: { text: string; styles: PostTextStyle[] }[] = [];
  const active: Record<PostTextStyle, number> = { b: 0, i: 0, u: 0 };
  const styles = () => POST_TEXT_STYLES.filter(style => active[style] > 0);
  let start = 0;
  for (const marker of markers) {
    const index = marker.index!;
    if (!pairs.has(index)) continue;
    if (index > start) runs.push({ text: text.slice(start, index), styles: styles() });
    active[marker[2] as PostTextStyle] += marker[1] ? -1 : 1;
    start = index + marker[0].length;
  }
  if (start < text.length) runs.push({ text: text.slice(start), styles: styles() });
  return runs;
}

export function stripPostTextStyles(text: string): string {
  return postTextRuns(text).map(run => run.text).join('');
}

export function encodePostText(text: string, styles: readonly PostTextStyle[]): string {
  if (!text) return '';
  return styles.reduceRight((content, style) => '[' + style + ']' + content + '[/' + style + ']', text);
}

export function togglePostTextStyle(
  text: string, selection: PostTextSelection, style: PostTextStyle, limit: number,
): { text: string; selection: PostTextSelection } | null {
  const { start, end } = selection;
  if (start === end || start < 0 || end > text.length) return null;
  const opening = '[' + style + ']';
  const closing = '[/' + style + ']';
  const selected = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);
  if (before.endsWith(opening) && after.startsWith(closing)) {
    return {
      text: before.slice(0, -opening.length) + selected + after.slice(closing.length),
      selection: { start: start - opening.length, end: end - opening.length },
    };
  }
  const inner = selected.slice(opening.length, -closing.length);
  if (selected.startsWith(opening) && selected.endsWith(closing) &&
      !inner.includes(opening) && !inner.includes(closing)) {
    return { text: before + inner + after, selection: { start, end: start + inner.length } };
  }
  // Expanding a selection over just one side of an existing style crosses its
  // markers. Leave the selection intact so the author can select the whole run.
  if (postTextRuns(selected).map(run => run.text).join('').match(/\[\/?[biu]\]/)) return null;
  const next = before + encodePostText(selected, [style]) + after;
  if (next.length > limit) return null;
  return { text: next, selection: { start: start + opening.length, end: end + opening.length } };
}
