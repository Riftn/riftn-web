// Vite's public/ copy may run before buildStart generators finish. Publish the
// sitemap and table generated during this build, regardless of hook timing.
import { copyFileSync, cpSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['seo-i18n.json', 'sitemap-static.xml']) {
  copyFileSync(resolve(root, 'public', file), resolve(root, 'dist', file));
}
// Publish the matching pointer and bounded locale generations together, even
// when Vite copied public/ before the locale generator completed.
const localeOutput = resolve(root, 'dist/locale-pages');
if (dirname(localeOutput) !== resolve(root, 'dist')) throw new Error('Invalid locale output path');
rmSync(localeOutput, { recursive: true, force: true });
cpSync(resolve(root, 'public/locale-pages'), localeOutput, { recursive: true });

// llms-full.txt: llms.txt plus the full text of the FAQ and every guide it
// links, so answer engines can read Riftn's own words in one request. Built
// here from committed sources, so it can never drift from llms.txt.
{
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
  const llms = readFileSync(resolve(root, 'public/llms.txt'), 'utf8');
  const text = (html) => html
    .replace(/<\/(p|h[1-6]|li|tr)>/g, '\n').replace(/<br\s*\/?>/g, '\n')
    .replace(/<h([1-6])[^>]*>/g, (_, n) => '#'.repeat(Number(n) + 1) + ' ')
    .replace(/<li[^>]*>/g, '- ').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
  const parts = [llms.trim(), '', '---', '', '# Full text', ''];
  const faq = resolve(root, 'public/docs-content/faq.json');
  if (existsSync(faq)) {
    parts.push('## Riftn FAQ', 'Source: https://riftn.com/docs/faq', '', text(JSON.parse(readFileSync(faq, 'utf8')).html), '');
  }
  const slugs = [...new Set([...llms.matchAll(/https:\/\/riftn\.com\/guides\/([a-z0-9-]+)/g)].map((m) => m[1]))];
  for (const slug of slugs) {
    const file = resolve(root, 'public/blog-content', `${slug}.json`);
    if (!existsSync(file)) continue;
    const post = JSON.parse(readFileSync(file, 'utf8'));
    parts.push(`## ${post.title}`, `Source: https://riftn.com/guides/${slug}`, '', (post.md || text(post.html || '')).trim().replace(/^(#{1,5}) /gm, '#$1 ').replace(/\]\(\//g, '](https://riftn.com/'), '');
  }
  writeFileSync(resolve(root, 'dist/llms-full.txt'), parts.join('\n') + '\n');
}
