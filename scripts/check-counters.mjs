#!/usr/bin/env node
/**
 * Every counter on screen (views, listens, likes, followers, members, votes,
 * points...) shows short: 1.2K, 3.4M. This check fails when a counter is put on
 * screen as a raw number, so "1200 listens" can't come back.
 *
 * Use formatCount() from src/lib/format-count.ts. Translated copy is already
 * covered: {{count}} and the other counter placeholders are shortened by i18n.
 *
 * A number that really must stay exact (money, a form field, an id) can opt
 * out with a `// exact-number` comment on the same line or the line above.
 *
 *   node scripts/check-counters.mjs          check src/
 *   node scripts/check-counters.mjs --list   print every hit, never fail
 *   node scripts/check-counters.mjs --fix    wrap every hit in formatCount()
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const LIST = process.argv.includes('--list');
const FIX = process.argv.includes('--fix');

const COUNTER = /(?:^|_|[a-z])(?:count|views|likes|listens|listeners|followers|following|attended|subscribers|members|viewers|watchers|plays|reposts|shares|upvotes|votes|points|reactions|replies|going|interested|holders|downloads|impressions|clicks|saves|bookmarks|heads|attendees)$/i;
const SKIP_NAME = /^(?:is|has|should|can|show|use|set|get|format|update|resolve|on|max|min|limit)[A-Z_]/;
const PATH = String.raw`[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*`;
const TAIL = String.raw`(?:\s*(?:\?\?|\|\|)\s*0)?`;

const RULES = [
  // JSX child: <span>{post.views}</span>, {count ?? 0}
  { name: 'raw counter in JSX', re: new RegExp(String.raw`(?<![{$=\w'"])\{\s*(${PATH})${TAIL}\s*\}(?!\})`, 'g'), jsx: true, child: true, fix: 'jsx' },
  // Template string: `${views} views`
  { name: 'raw counter in a template string', re: new RegExp(String.raw`\$\{\s*(${PATH})${TAIL}\s*\}`, 'g'), jsx: true, fix: 'tpl' },
  // views.toLocaleString() -> 1,200 instead of 1.2K
  { name: 'counter shown with toLocaleString', re: new RegExp(String.raw`(?<![\w$.)])(${PATH})\??\.toLocaleString\(`, 'g'), fix: 'loc' },
  { name: 'counter shown with toLocaleString', re: new RegExp(String.raw`\(\s*(${PATH})\s*(?:\?\?|\|\|)\s*0\s*\)\s*\.toLocaleString\(`, 'g'), fix: 'loc' },
];

function isCounter(path) {
  const last = path.split(/\??\./).pop();
  return COUNTER.test(last) && !SKIP_NAME.test(last);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__' || name === 'test') continue;
      walk(p, out);
    } else if (/\.(tsx|ts)$/.test(name) && !/\.(test|spec|d)\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const hits = [];
for (const file of walk(SRC)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const isTsx = file.endsWith('.tsx');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (/exact-number/.test(line) || /exact-number/.test(lines[i - 1] ?? '')) return;
    if (/^(import|export \{|export type)/.test(trimmed)) return;
    for (const rule of RULES) {
      if (rule.jsx && !isTsx) continue;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line))) {
        if (!isCounter(m[1])) continue;
        if (rule.child) {
          const before = line.slice(0, m.index).trimEnd();
          const after = line.slice(m.index + m[0].length).trimStart();
          // Object literals and destructuring ({ count }), not JSX children.
          if (/(?:[,(=:?[]|return|=>)$/.test(before) || /^[),;:=]/.test(after) || before === '' && /^[,)]/.test(after)) continue;
          if (before === '' && after === '' && !/^\s*\{/.test(line)) continue;
        }
        hits.push({ abs: file, file: relative(ROOT, file), line: i + 1, rule: rule.name, fix: rule.fix, index: m.index, match: m[0], expr: m[1], text: trimmed.slice(0, 160) });
      }
    }
  });
}

if (FIX) {
  const byFile = new Map();
  for (const h of hits) byFile.set(h.abs, [...(byFile.get(h.abs) ?? []), h]);
  for (const [file, list] of byFile) {
    const lines = readFileSync(file, 'utf8').split('\n');
    // Right to left so earlier indexes stay valid.
    list.sort((a, b) => b.line - a.line || b.index - a.index);
    const seen = new Set();
    for (const h of list) {
      const key = `${h.line}:${h.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = lines[h.line - 1];
      const inner = h.match.replace(/^\$?\{\s*|\s*\}$/g, '');
      let next = line;
      if (h.fix === 'jsx') next = line.slice(0, h.index) + `{formatCount(${inner})}` + line.slice(h.index + h.match.length);
      else if (h.fix === 'tpl') next = line.slice(0, h.index) + `\${formatCount(${inner})}` + line.slice(h.index + h.match.length);
      else {
        // expr.toLocaleString(args) or (expr ?? 0).toLocaleString(args)
        const start = h.index;
        let depth = 0, end = start + h.match.length - 1; // at the "(" of toLocaleString(
        for (let j = end; j < line.length; j++) {
          if (line[j] === '(') depth++;
          else if (line[j] === ')' && --depth === 0) { end = j; break; }
        }
        const head = line.slice(start, start + h.match.length).replace(/\??\.toLocaleString\($/, '').replace(/^\(\s*|\s*\)$/g, '');
        next = line.slice(0, start) + `formatCount(${head.trim()})` + line.slice(end + 1);
      }
      lines[h.line - 1] = next;
    }
    let text = lines.join('\n');
    if (!/import\s*\{[^}]*\bformatCount\b[^}]*\}\s*from/.test(text)) {
      const imports = [...text.matchAll(/^import[^;]*;\s*$/gm)];
      const at = imports.length ? imports[imports.length - 1].index + imports[imports.length - 1][0].length : 0;
      text = text.slice(0, at) + `${at ? '\n' : ''}import { formatCount } from '@/lib/format-count';${at ? '' : '\n'}` + text.slice(at);
    }
    writeFileSync(file, text);
  }
  console.log(`Wrapped ${hits.length} counter(s) in formatCount().`);
  process.exit(0);
}

for (const h of hits) console.log(`${h.file}:${h.line}  ${h.rule}: ${h.expr}\n    ${h.text}`);
if (hits.length && !LIST) {
  console.error(`\n${hits.length} counter(s) shown as a raw number. Wrap them in formatCount() from src/lib/format-count.ts (1.2K, 3.4M).`);
  console.error('If a number must stay exact (money, a form field), add `// exact-number` on that line or the line above.');
  process.exit(1);
}
if (!hits.length) console.log('Counters: every one is shortened.');
