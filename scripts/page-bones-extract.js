/**
 * Runs inside a loaded page (Playwright evaluate). Reads the real layout of
 * one cached page and returns its "bones": a grey bar for each line of text,
 * a block for each picture, video, icon and control, and a faint panel for
 * each card, all placed relative to the page's own box.
 *
 * Kept as plain browser JavaScript with no imports: scripts/page-bones.mjs
 * reads this file and passes it to the browser as text.
 */
(function extractPageBones(key, maxY) {
  const root = document.querySelector('[data-cached-page="' + key + '"]');
  if (!root) return null;
  const R = root.getBoundingClientRect();
  if (R.width < 50) return null;
  const W = R.width;
  const bones = [];
  let pill = false;
  const alpha = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return 0;
    const p = m[1].split(/[ ,/]+/).filter(Boolean);
    return p.length > 3 ? parseFloat(p[3]) : 1;
  };
  const push = (r, radius, kind) => {
    const x = Math.max(0, r.left - R.left);
    const right = Math.min(W, r.right - R.left);
    const y = r.top - R.top;
    const w = right - x;
    if (w < 3 || r.height < 3 || y > maxY || y + r.height < 0) return;
    const h = Math.min(r.height, maxY + 80 - y);
    bones.push([Math.round((x / W) * 1000), Math.round(y), Math.round((w / W) * 1000), Math.round(h),
      Math.round(Math.min(radius || 0, h / 2, w / 2)), kind]);
  };
  const clipOf = (el) => {
    // The nearest scroll/clip box: bones never draw outside what the page shows.
    let box = null;
    for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const r = p.getBoundingClientRect();
        box = box ? { left: Math.max(box.left, r.left), right: Math.min(box.right, r.right), top: Math.max(box.top, r.top), bottom: Math.min(box.bottom, r.bottom) } : { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }
    }
    return box;
  };
  const clipped = (r, box) => {
    if (!box) return r;
    const left = Math.max(r.left, box.left), right = Math.min(r.right, box.right);
    const top = Math.max(r.top, box.top), bottom = Math.min(r.bottom, box.bottom);
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  };
  const walk = (el, depthRadius) => {
    if (el.nodeType !== 1) return;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return;
    if (cs.position === 'fixed') return;
    // Phones: the page's top pill is drawn as the real, empty pill.
    if (el.hasAttribute('data-kit-pill-outer') || el.hasAttribute('data-feed-nav-outer')) {
      const pr = el.getBoundingClientRect();
      if (pr.top - R.top < 120 && pr.height < 90) { pill = true; return; }
    }
    const r0 = el.getBoundingClientRect();
    const contents = cs.display === 'contents';
    if (!contents) {
      if (r0.top - R.top > maxY || r0.bottom < R.top - 4) return;
      if (r0.width < 2 && r0.height < 2 && cs.overflow !== 'visible') return;
    }
    const box = clipOf(el);
    const r = clipped(r0, box);
    if (!contents && (r.width <= 0 || r.height <= 0)) return;
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    const media = tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'IFRAME' || tag === 'svg' || tag === 'SVG' || tag === 'PICTURE';
    if (media) {
      // An icon keeps a soft corner; a picture keeps its own or its frame's.
      const small = r.width <= 28 && r.height <= 28;
      push(r, small ? Math.min(6, r.width / 3) : (radius || depthRadius), small ? 'i' : 'b');
      return;
    }
    const hasBgImage = cs.backgroundImage && cs.backgroundImage.includes('url(');
    const bgA = alpha(cs.backgroundColor);
    const borderA = parseFloat(cs.borderTopWidth) > 0 ? alpha(cs.borderTopColor) : 0;
    const control = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (hasBgImage && !el.children.length) { push(r, radius, 'b'); return; }
    if (control) { push(r, radius, 's'); return; }
    let nextRadius = depthRadius;
    if (!contents && (bgA > 0.02 || borderA > 0.04) && r.height >= 16 && r.width >= 16 && r.width < W * 1.01) {
      const panel = el.hasAttribute('data-page-bento') || el.hasAttribute('data-kit-pill') || el.hasAttribute('data-feed-nav');
      // A solid, bright fill (a white button, a badge) reads as a block; a
      // quiet fill or an outline reads as a panel.
      const solid = bgA > 0.6 && r.height <= 64 && r.width <= W * 0.7 && !panel && (() => {
        const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor); const p = m ? m[1].split(/[ ,/]+/).map(parseFloat) : [0, 0, 0];
        const lum = (p[0] * 299 + p[1] * 587 + p[2] * 114) / 1000; return lum > 150;
      })();
      push(r, radius, solid ? 'b' : panel ? 'p' : 's');
      if (solid) return;
      if (cs.overflow !== 'visible') nextRadius = radius;
    }
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        if (!node.nodeValue || !node.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const fs = parseFloat(cs.fontSize) || 14;
        const barH = Math.max(6, Math.min(22, Math.round(fs * 0.66)));
        const lines = [];
        for (const lr of range.getClientRects()) {
          if (lr.width < 2) continue;
          const last = lines[lines.length - 1];
          if (last && Math.abs(last.top - lr.top) < 3) { last.right = Math.max(last.right, lr.right); last.left = Math.min(last.left, lr.left); }
          else lines.push({ left: lr.left, right: lr.right, top: lr.top, bottom: lr.bottom });
        }
        for (const l of lines) {
          const mid = (l.top + l.bottom) / 2;
          const bar = clipped({ left: l.left, right: l.right, top: mid - barH / 2, bottom: mid + barH / 2 }, box);
          bar.width = bar.right - bar.left; bar.height = bar.bottom - bar.top;
          if (bar.height < barH - 1) continue;
          push(bar, Math.min(barH / 2, 5), 't');
        }
      } else walk(node, nextRadius);
    }
  };
  walk(root, 0);
  // Text on the same line inside one parent run reads as one bar.
  bones.sort((a, b) => (a[5] === 'p' ? 0 : a[5] === 's' ? 1 : 2) - (b[5] === 'p' ? 0 : b[5] === 's' ? 1 : 2) || a[1] - b[1] || a[0] - b[0]);
  const merged = [];
  for (const b of bones) {
    const last = merged[merged.length - 1];
    if (b[5] === 't' && last && last[5] === 't' && Math.abs(last[1] - b[1]) <= 2 && Math.abs(last[3] - b[3]) <= 2 && b[0] - (last[0] + last[2]) <= 8 && b[0] >= last[0]) {
      last[2] = Math.max(last[0] + last[2], b[0] + b[2]) - last[0];
      continue;
    }
    // A panel exactly on top of the one before adds nothing.
    if ((b[5] === 'p' || b[5] === 's') && merged.some((m) => (m[5] === 'p' || m[5] === 's') && Math.abs(m[0] - b[0]) <= 3 && Math.abs(m[1] - b[1]) <= 2 && Math.abs(m[2] - b[2]) <= 6 && Math.abs(m[3] - b[3]) <= 4)) continue;
    merged.push(b);
  }
  const height = Math.min(maxY + 80, merged.reduce((m, b) => Math.max(m, b[1] + b[3]), 0));
  return { w: Math.round(W), h: Math.round(height), pill, bones: merged };
})
