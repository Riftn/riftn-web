import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { expect, it } from 'vitest';

// The new-posts drawer's frost is a backdrop-filter inside it. A filter,
// opacity, mask or clip-path on the drawer itself makes it a backdrop root,
// and the frost then blurs nothing: the drawer turns see-through.
it('the new-posts drawer never puts a filter or fade on itself', () => {
  const files = ['src/styles/glass-surfaces.css', 'src/styles/glass.css', 'src/styles/system-light.css', 'src/index.css'];
  for (const file of files) {
    postcss.parse(readFileSync(file, 'utf8')).walkRules(rule => {
      const targetsDrawer = postcss.list.comma(rule.selector).some(sel => /\[data-feed-new-posts-chip\](:[a-z-]+)*\s*$/.test(sel.trim()) && !sel.includes('::'));
      if (!targetsDrawer) return;
      rule.walkDecls(decl => {
        if (['filter', 'opacity', 'mask', 'mask-image', 'clip-path', '-webkit-mask-image'].includes(decl.prop)) {
          expect(decl.value, `${file}: ${rule.selector} { ${decl.prop} }`).toMatch(/^(none|1)(\s*!important)?$/);
        }
      });
    });
  }
});
