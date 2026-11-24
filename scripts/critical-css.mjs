/**
 * The part of the main stylesheet that index.html itself needs.
 *
 * index.html carries the boot skeleton and the prerendered welcome card. With
 * the stylesheet render-blocking, neither can paint until all of it (~130 KB
 * compressed) has arrived. This picks out the rules that match an element of
 * that static page, so they can be inlined and the first frame can paint from
 * the HTML alone while the full stylesheet loads beside it.
 *
 * A rule is kept when any of its selectors, with pseudo-classes that depend on
 * state (:hover, ::before, …) removed, matches something in the document as a
 * new visitor gets it: data-theme="system", dark tone. Other looks keep the
 * blocking stylesheet (see inlineCriticalCssPlugin in vite.config.ts), so this
 * never has to guess at them. At-rules that wrap kept rules stay around them,
 * in order, so @layer and @media behave exactly as in the full sheet.
 *
 *   node scripts/critical-css.mjs dist   # print sizes for a built site
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** What the boot script in index.html sets on <html> for a new visitor. */
export const DEFAULT_LOOK = { 'data-theme': 'system', 'data-system-tone': 'dark', 'data-shorts-enabled': 'true', 'data-sidebar-collapsed': 'false', 'data-dim-lights': 'false' };

/**
 * Attributes the boot script sets on <html> by route and load state, not by
 * preference (feed still loading, a route with no welcome card, the chat boot
 * layout). A condition on one of them may be true, so it is ignored.
 */
const VARIES = /\[data-(?:feed-loading|home-intro|boot-shelf|boot-chat)(?:[*^$~|]?="[^"]*")?\]/g;

/** Pseudo-classes and elements that say nothing about whether the element exists. */
const STATE = /::?(?:before|after|placeholder|selection|backdrop|marker|file-selector-button|first-letter|first-line|-webkit-[\w-]+|-moz-[\w-]+|hover|focus-visible|focus-within|focus|active|visited|link|any-link|target|checked|disabled|enabled|required|optional|invalid|valid|indeterminate|default|read-only|read-write|placeholder-shown|autofill|open|popover-open|fullscreen|modal|user-invalid|user-valid|in-range|out-of-range)\b(?!\()/g;

/** `a:is(b:not(c)) d` -> `a d`: every functional pseudo-class removed, nesting and all. */
function dropFunctions(selector) {
  let out = '';
  for (let i = 0; i < selector.length; i++) {
    if (selector[i] === ':') {
      const m = /^::?[\w-]+\(/.exec(selector.slice(i));
      if (m) {
        let depth = 1;
        let j = i + m[0].length;
        for (; j < selector.length && depth; j++) {
          if (selector[j] === '(') depth++;
          else if (selector[j] === ')') depth--;
        }
        i = j - 1;
        continue;
      }
    }
    out += selector[i];
  }
  // A compound left empty ("html  > " or a leading combinator) means "anything".
  return out.replace(/(^|[\s>+~,])(?=\s*([>+~,]|$))/g, '$1*').trim();
}

export async function extractCriticalCss(html, css) {
  const [{ JSDOM }, { default: postcss }] = await Promise.all([import('jsdom'), import('postcss')]);
  const dom = new JSDOM(html.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style\b[\s\S]*?<\/style>/g, ''));
  const doc = dom.window.document;
  for (const [k, v] of Object.entries(DEFAULT_LOOK)) doc.documentElement.setAttribute(k, v);
  // Class names, ids and tags on the page: a selector naming any other class
  // cannot match, which settles most of the sheet without a query.
  const classes = new Set();
  const tags = new Set();
  for (const el of doc.querySelectorAll('*')) {
    tags.add(el.localName);
    for (const c of el.classList) classes.add(c);
  }
  const cache = new Map();
  const matches = (selector) => {
    let hit = cache.get(selector);
    if (hit !== undefined) return hit;
    const bare = selector
      // The build writes :is() a second time as :-webkit-any()/:-moz-any().
      .replace(/:-(?:webkit|moz)-any\(/g, ':is(')
      // [class*=bg-white\/] -> [class*="bg-white/"], which every parser reads.
      .replace(/\[([\w-]+)([*^$~|]?=)([^\]"']+)\]/g, (_, a, op, v) => `[${a}${op}"${v.replace(/\\(.)/g, '$1')}"]`)
      .replace(VARIES, '')
      .replace(STATE, '').replace(/:(?:is|where|not)\(\s*\)/g, '').trim();
    hit = false;
    if (bare) {
      // Top-level class tokens (outside :not()/:is()/:has()) must all exist.
      const top = bare.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '');
      let possible = true;
      for (const m of top.matchAll(/\.((?:\\.|[\w-])+)/g)) {
        if (!classes.has(m[1].replace(/\\(.)/g, '$1'))) { possible = false; break; }
      }
      if (possible) {
        // The parser here mis-answers (not just fails on) functions nested in
        // functions, so those go straight to the loose form.
        const nested = /:[\w-]+\((?:[^()]*\()/.test(bare);
        try { hit = !!doc.querySelector(nested ? dropFunctions(bare) || '*' : bare); } catch {
          // The parser here gives up on nested :is()/:not(). Ask again without
          // those conditions: that can only keep a rule too many, and a rule
          // too many is harmless (the browser still applies the real selector).
          const loose = dropFunctions(bare);
          try { hit = !loose || !!doc.querySelector(loose); } catch { hit = true; }
        }
      }
    } else hit = true; // a bare ::selection, ::backdrop and the like
    cache.set(selector, hit);
    return hit;
  };

  const root = postcss.parse(css);
  const usedKeyframes = new Set();
  const usedFonts = new Set();
  const keep = (node) => {
    if (node.type === 'rule') {
      // Inside @keyframes the "selectors" are percentages.
      if (node.parent?.type === 'atrule' && /keyframes$/.test(node.parent.name)) return true;
      const selectors = node.selectors.filter(matches);
      if (!selectors.length) return false;
      node.selectors = selectors;
      // A nested rule (CSS nesting) is judged on its own.
      node.each((child) => { if ((child.type === 'rule' || child.type === 'atrule') && !keep(child)) child.remove(); });
      node.walkDecls((d) => {
        if (/^animation(-name)?$/.test(d.prop)) for (const w of d.value.split(/[\s,]+/)) usedKeyframes.add(w);
        if (/^font(-family)?$/.test(d.prop)) usedFonts.add(d.value);
      });
      return true;
    }
    if (node.type === 'atrule') {
      const name = node.name.toLowerCase();
      if (name === 'charset' || name === 'import') return false;
      if (name === 'property' || (name === 'layer' && !node.nodes)) return true;
      if (/keyframes$/.test(name) || name === 'font-face') return 'later';
      if (!node.nodes) return false;
      node.each((child) => { const k = keep(child); if (!k) child.remove(); });
      return node.nodes.length > 0;
    }
    return node.type === 'decl';
  };
  const later = [];
  root.each((node) => {
    const k = keep(node);
    if (!k) node.remove();
  });
  // Keyframes and font faces: only the ones a kept rule names.
  root.walkAtRules((at) => {
    const name = at.name.toLowerCase();
    if (/keyframes$/.test(name)) { if (!usedKeyframes.has(at.params.trim())) later.push(at); }
    else if (name === 'font-face') {
      let family = '';
      at.walkDecls('font-family', (d) => { family = d.value.replace(/["']/g, '').trim(); });
      if (![...usedFonts].some((f) => f.includes(family))) later.push(at);
    }
  });
  later.forEach((at) => at.remove());
  // Wrappers emptied by that.
  root.walkAtRules((at) => { if (at.nodes && at.nodes.length === 0) at.remove(); });
  dom.window.close();
  return root.toString();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const dist = process.argv[2] || 'dist';
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const file = readdirSync(join(dist, 'assets')).find((f) => /^index-.*\.css$/.test(f));
  const css = readFileSync(join(dist, 'assets', file), 'utf8');
  const t0 = Date.now();
  const critical = await extractCriticalCss(html, css);
  console.log(`${file}: ${css.length} -> ${critical.length} bytes in ${Date.now() - t0} ms`);
  if (process.argv[3]) (await import('node:fs')).writeFileSync(process.argv[3], critical);
}
