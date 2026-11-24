/**
 * `**words**` shows as bold words.
 *
 * Runs over the parts the text renderers build (strings plus link, mention,
 * tag and emoji elements), so a bold run can hold a mention or a link and the
 * stars never leak into a URL. Nothing here makes HTML from text: bold is a
 * <strong> around the same parts. <strong> is `font-weight: bolder`, so it
 * still stands out inside text that is already semibold or heavier.
 *
 * A pair only counts when it hugs words: `**` opens before a non-space and
 * closes after one, is not glued to a letter or digit on the outside, and
 * stays on one line. Anything else (`2**3`, `** loose **`, a single `**`) is
 * left exactly as typed.
 */
import { Fragment, type ReactNode } from 'react';

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'mark' }
  | { kind: 'node'; node: ReactNode };

const WORD = /[\p{L}\p{N}]/u;
const SPACE = /\s/u;

function tokenize(parts: readonly ReactNode[]): Token[] {
  const tokens: Token[] = [];
  let pending = '';
  const flush = () => {
    if (!pending) return;
    pending.split('**').forEach((chunk, index) => {
      if (index > 0) tokens.push({ kind: 'mark' });
      if (chunk) tokens.push({ kind: 'text', text: chunk });
    });
    pending = '';
  };
  for (const part of parts) {
    if (typeof part === 'string') pending += part;
    else if (typeof part === 'number') pending += String(part);
    else {
      flush();
      tokens.push({ kind: 'node', node: part });
    }
  }
  flush();
  return tokens;
}

/** The character beside token `i` on one side: '' at the edge, a neutral mark for an element. */
function neighbour(tokens: Token[], i: number, step: 1 | -1): string {
  const t = tokens[i + step];
  if (!t) return '';
  if (t.kind === 'node') return '\u0001';
  if (t.kind === 'mark') return '*';
  return step === 1 ? t.text[0] : t.text[t.text.length - 1];
}

function canOpen(tokens: Token[], i: number) {
  const after = neighbour(tokens, i, 1);
  const before = neighbour(tokens, i, -1);
  return !!after && !SPACE.test(after) && after !== '*' && !WORD.test(before);
}

function canClose(tokens: Token[], i: number) {
  const before = neighbour(tokens, i, -1);
  const after = neighbour(tokens, i, 1);
  return !!before && !SPACE.test(before) && before !== '*' && !WORD.test(after);
}

/** Index of the mark that closes the one at `open`, or -1. */
function findClose(tokens: Token[], open: number): number {
  for (let j = open + 1; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.kind === 'text' && t.text.includes('\n')) return -1;
    if (t.kind === 'mark' && j > open + 1 && canClose(tokens, j)) return j;
  }
  return -1;
}

type Run = { bold: boolean; tokens: Token[] };

function runs(tokens: Token[]): Run[] {
  const out: Run[] = [];
  const plain = (t: Token) => {
    const last = out[out.length - 1];
    if (last && !last.bold) last.tokens.push(t);
    else out.push({ bold: false, tokens: [t] });
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== 'mark') { plain(t); continue; }
    const close = canOpen(tokens, i) ? findClose(tokens, i) : -1;
    if (close < 0) { plain({ kind: 'text', text: '**' }); continue; }
    out.push({ bold: true, tokens: tokens.slice(i + 1, close).map((x) => (x.kind === 'mark' ? { kind: 'text', text: '**' } : x)) });
    i = close;
  }
  return out;
}

function toNodes(tokens: Token[]): ReactNode[] {
  const out: ReactNode[] = [];
  for (const t of tokens) {
    const text = t.kind === 'mark' ? '**' : t.kind === 'text' ? t.text : null;
    if (text === null) out.push((t as { node: ReactNode }).node);
    else if (typeof out[out.length - 1] === 'string') out[out.length - 1] = `${out[out.length - 1]}${text}`;
    else out.push(text);
  }
  return out;
}

/** True when the text might hold a bold pair; a cheap check before any work. */
export function mayContainBold(text: string | null | undefined): boolean {
  return !!text && text.indexOf('**') !== text.lastIndexOf('**');
}

/** Turn paired `**` in the string parts into <strong>, leaving everything else as is. */
export function applyBold(parts: readonly ReactNode[]): ReactNode[] {
  const joined = parts.filter((p): p is string => typeof p === 'string').join('');
  if (!mayContainBold(joined)) return [...parts];
  const result = runs(tokenize(parts));
  if (!result.some((r) => r.bold)) return [...parts];
  return result.flatMap((r, i) =>
    r.bold
      ? [<strong key={`bold-${i}`}>{toNodes(r.tokens).map((n, k) => <Fragment key={k}>{n}</Fragment>)}</strong>]
      : toNodes(r.tokens),
  );
}

/** Plain text with paired `**` removed, for one-line previews, titles and pushes. */
export function stripBold(text: string): string;
export function stripBold(text: string | null | undefined): string | null | undefined;
export function stripBold(text: string | null | undefined) {
  if (!text || !mayContainBold(text)) return text;
  return runs(tokenize([text]))
    .map((r) => r.tokens.map((t) => (t.kind === 'text' ? t.text : t.kind === 'mark' ? '**' : '')).join(''))
    .join('');
}

/** A plain string with its bold pairs drawn bold; for surfaces with no links. */
export function BoldText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <>{applyBold([text])}</>;
}
