/**
 * Word-level change marks between two versions of a post's text, for the edit
 * history viewer: what was added, what was removed, what stayed.
 */
export interface DiffPart {
  type: 'same' | 'add' | 'del';
  text: string;
}

/** Past this many words on either side the table gets too big; show a plain swap. */
const MAX_WORDS = 1500;

const words = (text: string): string[] => text.split(/(\s+|[.,!?;:]+)/).filter(Boolean);

function push(parts: DiffPart[], type: DiffPart['type'], text: string) {
  const last = parts[parts.length - 1];
  if (last && last.type === type) last.text += text;
  else parts.push({ type, text });
}

export function diffWords(before: string, after: string): DiffPart[] {
  if (before === after) return after ? [{ type: 'same', text: after }] : [];
  const a = words(before);
  const b = words(after);
  if (!a.length) return [{ type: 'add', text: after }];
  if (!b.length) return [{ type: 'del', text: before }];
  if (a.length > MAX_WORDS || b.length > MAX_WORDS) {
    return [{ type: 'del', text: before }, { type: 'add', text: after }];
  }

  // Longest common subsequence, filled from the end so the walk reads forwards.
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push(parts, 'same', a[i]); i++; j++; }
    else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) { push(parts, 'del', a[i]); i++; }
    else { push(parts, 'add', b[j]); j++; }
  }
  while (i < a.length) push(parts, 'del', a[i++]);
  while (j < b.length) push(parts, 'add', b[j++]);
  return parts;
}
