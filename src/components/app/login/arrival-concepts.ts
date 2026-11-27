/**
 * The arrivals other than the Rift (Settings → Appearance → After you sign
 * in): Trace, Tune in, Deck and Glass drop. Each is drawn frame by frame here,
 * on the same 0×0 stage as the Rift, with the same timing as the concepts
 * board they were picked from:
 *
 * - Trace: two comets of light chase round the Riftn mark's outline; on
 *   arrival the mark fills, shrinks away and the picture pops out of it.
 * - Tune in: TV static in the frame with lines rolling up; on arrival it
 *   squeezes to a bright line (an old set switching) and snaps open on the
 *   picture.
 * - Deck: the sign-in sheet's clips gather into a fanned deck and shuffle; on
 *   arrival the deck sweeps away and your card drops in back first (the Riftn
 *   mark) and flips to your picture.
 * - Glass drop: a liquid-glass drop wobbles with two droplets orbiting; on
 *   arrival the droplets are pulled in, it settles into the picture's shape
 *   and the picture develops behind the glass, then a sheen crosses it.
 *
 * `open()` is the moment the account is in. Each one ends on the picture
 * exactly where the shared frame (.signin-rift__frame) sits, 120px with a 15px
 * corner, so the frame can take over and fly home (`ARRIVAL_REVEAL_MS`).
 */
import { CONCEPT_REVEAL_MS, type ConceptLook } from './arrival-concept-timing';

export { CONCEPT_LOOKS, CONCEPT_NAME_MS, CONCEPT_REVEAL_MS, type ConceptLook } from './arrival-concept-timing';

/** The Riftn mark (public/brand-icon.svg). */
export const MARK_PATH = 'M868.0 1411.1C865.0 1410.1 850.4 1405.3 835.5 1400.5C805.2 1390.7 783.8 1382.8 771.1 1376.9C717.6 1351.7 677.9 1324.1 639.5 1285.6C609.6 1255.6 590.7 1231.4 568.8 1195.0C551.3 1165.8 533.4 1123.9 523.7 1089.0C515.5 1059.9 511.6 1039.4 508.5 1009.0C507.1 995.1 506.9 967.6 507.2 749.0L507.5 504.5L552.5 504.5C597.0 504.5 597.6 504.5 605.0 506.9C634.6 516.1 654.8 536.7 664.1 567.0L666.4 574.5L667.1 783.0C667.5 910.3 668.2 994.6 668.8 999.5C672.9 1032.5 683.8 1067.8 699.3 1098.5C706.9 1113.5 712.2 1122.1 723.1 1136.9C751.6 1175.7 783.2 1202.4 828.4 1226.0C838.4 1231.2 843.3 1234.6 850.6 1241.2C860.7 1250.5 869.9 1264.7 874.3 1278.0C878.3 1290.1 878.5 1293.7 878.5 1354.0L878.5 1412.5L876.0 1412.7C874.6 1412.9 871.0 1412.1 868.0 1411.1ZM1035.7 1412.3C1035.3 1412.0 1035.0 1385.5 1035.0 1353.6C1035.0 1300.8 1035.2 1294.7 1036.9 1286.4C1040.5 1269.2 1048.7 1254.3 1060.9 1242.7C1068.7 1235.4 1075.0 1231.1 1088.0 1224.2C1136.6 1198.6 1172.6 1165.5 1201.4 1120.1C1225.3 1082.4 1238.4 1044.7 1244.1 997.6C1245.9 982.2 1246.0 972.8 1246.0 780.3C1246.0 585.7 1246.1 578.9 1247.9 571.3C1250.4 561.2 1252.4 555.8 1256.2 549.0C1268.3 527.2 1287.4 512.3 1310.8 506.4C1320.0 504.1 1321.2 504.0 1362.4 504.0C1393.9 504.0 1404.9 504.3 1405.8 505.2C1407.4 506.8 1407.6 962.7 1406.0 988.5C1402.8 1041.2 1392.1 1089.5 1373.0 1137.5C1361.3 1167.0 1335.8 1211.7 1316.3 1237.0C1299.7 1258.6 1293.0 1266.1 1272.6 1286.5C1239.8 1319.1 1206.7 1343.6 1168.0 1363.7C1162.2 1366.8 1155.9 1370.1 1154.0 1371.1C1137.6 1379.8 1121.7 1385.9 1075.6 1401.1C1040.4 1412.7 1037.0 1413.7 1035.7 1412.3ZM883.1 836.6C882.3 835.6 882.0 765.2 882.2 564.9L882.5 294.5L885.5 286.0C892.9 265.5 909.0 250.5 932.5 242.5C944.5 238.4 950.0 238.0 998.1 238.0C1032.9 238.0 1044.9 238.3 1045.8 239.2C1046.7 240.1 1047.0 300.6 1047.0 505.5C1047.0 786.1 1047.1 779.4 1042.6 791.9C1036.3 809.4 1017.8 826.1 997.5 832.8C982.3 837.8 980.0 838.0 930.7 838.0C892.7 838.0 884.0 837.8 883.1 836.6Z';

/** Four of the sign-in sheet's own clips (public/login-stack), for the Deck. */
const DECK_CARDS = ['1063060687058935045', '1093248878319179369', '547609635960318917', '701717185720155462'];

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------- easing
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const eOut = (x: number) => 1 - Math.pow(1 - x, 3);
const eIn = (x: number) => x * x * x;
const eIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}

/** The picture, or the account's initial when it has none. */
function fillPhoto(parent: HTMLElement, picture: string | undefined, initial: string) {
  parent.replaceChildren();
  if (picture) {
    const img = el('img', '', parent);
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = picture;
  } else {
    el('span', 'signin-rift__initial', parent).textContent = initial;
  }
}

function hexRgb(color: string): [number, number, number] {
  const m = color.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return [255, 255, 255];
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number];
}

interface Ctx {
  root: HTMLElement;
  acc: [string, string];
  /** Marks a box that shows the picture (filled in as soon as it is known). */
  photo: (parent: HTMLElement) => void;
}
interface Concept {
  /** `t`: ms since it went on screen. `a`: ms since open (negative before). */
  render(t: number, a: number): void;
}

// ---------- 1 Trace
function trace({ root, acc, photo }: Ctx): Concept {
  const wrap = el('div', '', root);
  wrap.innerHTML = `<svg class="signin-concept__mark" viewBox="351 223 1210 1210" aria-hidden="true"><defs><filter id="signin-concept-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <path d="${MARK_PATH}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="12"/>
    <path class="fill" d="${MARK_PATH}" fill="#fff" fill-opacity="0"/>
    <path class="c" d="${MARK_PATH}" fill="none" stroke="${acc[0]}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" filter="url(#signin-concept-glow)"/>
    <path class="c" d="${MARK_PATH}" fill="none" stroke="${acc[1]}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" filter="url(#signin-concept-glow)"/></svg>`;
  const svg = wrap.firstElementChild as SVGSVGElement;
  const [c1, c2] = Array.from(svg.querySelectorAll<SVGPathElement>('.c'));
  const fill = svg.querySelector<SVGPathElement>('.fill')!;
  let L = 0;
  try { L = c1.getTotalLength(); } catch { /* not laid out (tests) */ }
  if (!L) L = 7600;
  const seg = L * 0.3;
  for (const p of [c1, c2]) p.setAttribute('stroke-dasharray', `${seg} ${L - seg}`);
  const box = el('div', 'signin-concept__box', root);
  photo(box);
  return {
    render(t, a) {
      const ip = prog(t, 0, 300);
      svg.style.opacity = String(ip * (1 - prog(a, 350, 650)));
      svg.style.transform = `scale(${lerp(0.92, 1, eOut(ip)) * lerp(1, 0.8, eIn(prog(a, 300, 650)))})`;
      const off = -(t / 1800) * L;
      c1.setAttribute('stroke-dashoffset', String(off));
      c2.setAttribute('stroke-dashoffset', String(off + L / 2));
      const comet = String(1 - prog(a, 0, 250));
      c1.style.opacity = comet;
      c2.style.opacity = comet;
      fill.setAttribute('fill-opacity', String(prog(a, 0, 220) * 0.95));
      // the mark becomes the picture
      const bp = prog(a, 330, 700);
      box.style.opacity = String(eOut(bp));
      box.style.transform = `scale(${lerp(0.6, 1, eBack(bp))})`;
    },
  };
}

// ---------- 2 Tune in
function tune({ root, acc, photo }: Ctx): Concept {
  const tv = el('div', 'signin-concept__tv', root);
  tv.style.boxShadow = `0 0 0 1.5px rgba(255,255,255,.14),0 0 40px ${acc[0]}33,0 18px 50px rgba(0,0,0,.6)`;
  const cv = el('canvas', '', tv);
  cv.width = 60;
  cv.height = 60;
  const ph = el('div', 'signin-concept__ph', tv);
  photo(ph);
  const lines = el('div', 'signin-concept__lines', tv);
  const bar = el('div', 'signin-concept__bar', tv);
  el('div', 'signin-concept__vig', tv);
  const line = el('div', 'signin-concept__line', root);
  line.style.boxShadow = `0 0 18px 4px ${acc[0]}`;
  const ctx = cv.getContext('2d');
  const img = ctx?.createImageData(60, 60);
  const tint = hexRgb(acc[0]).map((v) => 0.75 + (0.25 * v) / 255);
  let field = -1;
  return {
    render(t, a) {
      const ip = prog(t, 0, 280);
      // static, a new field every 2 frames
      const f = Math.floor(t / 66);
      if (ctx && img && f !== field && !(a >= 420)) {
        field = f;
        const r = rng(f + 7);
        for (let i = 0; i < 3600; i++) {
          const v = r();
          const g = v * v * 200;
          img.data[i * 4] = g * tint[0];
          img.data[i * 4 + 1] = g * tint[1];
          img.data[i * 4 + 2] = g * tint[2];
          img.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }
      // lines roll up non-stop
      lines.style.backgroundPosition = `0 ${-(t / 1000) * 18}px`;
      bar.style.top = `${120 - ((t / 2200) % 1) * 160}px`;
      // CRT snap: squeeze to a line, then open on the picture
      const sq = prog(a, 0, 200), op = prog(a, 260, 560);
      let sy = 1, sx = 1;
      if (a >= 0 && a < 200) { sy = lerp(1, 0.02, eIn(sq)); sx = lerp(1, 1.12, sq); }
      else if (a >= 200 && a < 260) { sy = 0.02; sx = 1.12; }
      else if (a >= 260) { sy = lerp(0.02, 1, eOut(op)); sx = lerp(1.12, 1, eOut(op)); }
      const s = lerp(0.9, 1, ip);
      tv.style.opacity = String(ip);
      tv.style.transform = `scale(${sx * s}, ${sy * s})`;
      tv.style.filter = a >= 0 && a < 260 ? `brightness(${1 + 3 * sq})` : 'none';
      ph.style.opacity = a >= 260 ? '1' : '0';
      cv.style.opacity = String(a >= 260 ? 1 - prog(a, 260, 420) : 1);
      lines.style.opacity = String(a >= 260 ? 1 - prog(a, 500, 900) : 1);
      bar.style.opacity = String(a >= 260 ? 1 - prog(a, 300, 600) : 1);
      line.style.opacity = String(a >= 150 && a < 320 ? (a < 260 ? 1 : 1 - prog(a, 260, 320)) : 0);
      line.style.transform = `scaleX(${a < 260 ? lerp(0.6, 1, prog(a, 150, 260)) : lerp(1, 0.2, prog(a, 260, 320))})`;
    },
  };
}

// ---------- 4 Deck
function deck({ root, acc, photo }: Ctx): Concept {
  const cards = DECK_CARDS.map((id) => {
    const c = el('div', 'signin-concept__card', root);
    const img = el('img', '', c);
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = `/login-stack/${id}.jpg`;
    return c;
  });
  const pc = el('div', 'signin-concept__pcard', root);
  const front = el('div', 'signin-concept__face', pc);
  photo(front);
  const back = el('div', 'signin-concept__face signin-concept__back', pc);
  back.innerHTML = `<svg viewBox="351 223 1210 1210" aria-hidden="true"><path d="${MARK_PATH}" fill="#fff"/></svg>`;
  back.style.boxShadow = `0 14px 40px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.2),0 0 30px ${acc[0]}55`;
  const N = cards.length, P = 620; // one shuffle every 620ms
  const fan: Array<[number, number]> = [[-9, -14], [-3, -5], [3, 4], [9, 13]]; // rot, x by depth (0 = back)
  return {
    render(w, a) {
      const step = Math.max(0, Math.floor(w / P)), sp = w > 0 ? (w % P) / P : 0;
      cards.forEach((c, i) => {
        const depth = (((i - step) % N) + N) % N; // 0 back .. N-1 top
        const g = eOut(prog(w, i * 70, i * 70 + 380));
        let [rot, x] = fan[depth];
        let y = 0, z = depth;
        if (depth === N - 1 && sp > 0.35) {
          // the top card slips out to the right and tucks in at the back
          const q = prog(sp, 0.35, 1), out = Math.sin(q * Math.PI);
          x = lerp(fan[N - 1][1], fan[0][1], eIO(q)) + out * 70;
          rot = lerp(fan[N - 1][0], fan[0][0], eIO(q)) + out * 14;
          y = -out * 10;
          z = q > 0.5 ? -1 : N;
        } else if (sp > 0.35) {
          const q = eIO(prog(sp, 0.35, 1));
          const nd = depth + 1;
          rot = lerp(fan[depth][0], fan[nd][0], q);
          x = lerp(fan[depth][1], fan[nd][1], q);
        }
        // arrival: the deck sweeps away to the sides
        let o = g;
        if (a >= 0) {
          const q = eIn(prog(a, 250, 650));
          const side = depth % 2 ? 1 : -1;
          x += side * q * (120 + depth * 30);
          rot += side * q * 25;
          o *= 1 - q;
        }
        c.style.opacity = String(o);
        c.style.zIndex = String(z + 5);
        c.style.transform = `translate(${x}px, ${y + lerp(30, 0, g)}px) rotate(${rot}deg) scale(${lerp(0.8, 1, g)})`;
      });
      // your card drops onto the deck back first and flips
      const dp = prog(a, 0, 260), fp = prog(a, 220, 620);
      pc.style.opacity = a >= 0 ? '1' : '0';
      pc.style.transform = `translateY(${lerp(-160, 0, eOut(dp))}px) rotateY(${lerp(180, 0, eBack(fp))}deg) scale(${lerp(0.9, 1, dp)})`;
    },
  };
}

// ---------- 5 Glass drop
function glass({ root, acc, photo }: Ctx): Concept {
  const d1 = el('div', 'signin-concept__drop', root);
  const d2 = el('div', 'signin-concept__drop', root);
  const g = el('div', 'signin-concept__glass', root);
  const k1 = el('div', 'signin-concept__caustic', g);
  const k2 = el('div', 'signin-concept__caustic', g);
  const ph = el('div', 'signin-concept__ph', g);
  photo(ph);
  const sh = el('div', 'signin-concept__sheen', g);
  k1.style.background = acc[0];
  k2.style.background = acc[1];
  return {
    render(w, a) {
      const s = w / 1000;
      const ip = eBack(prog(w, 0, 450));
      const settle = eOut(prog(a, 0, 450));
      const blob = (k: number) => 50 + 12 * Math.sin(s * 2.1 + k) * (1 - settle);
      const r = [blob(0), blob(1.7)], r2 = [blob(2.3), blob(5.2)];
      const sq = (v: number) => lerp(v, 12.9, settle); // % -> 15px of 116
      g.style.borderRadius = `${sq(r[0])}% ${sq(100 - r[0])}% ${sq(r[1])}% ${sq(100 - r[1])}% / ${sq(r2[0])}% ${sq(r2[1])}% ${sq(100 - r2[1])}% ${sq(100 - r2[0])}%`;
      const wob = 1 + 0.04 * Math.sin(s * 3.3) * (1 - settle);
      const size = lerp(1, 120 / 116, settle);
      g.style.opacity = String(prog(w, 0, 200));
      g.style.transform = `scale(${ip * wob * size}, ${ip * (2 - wob) * size}) rotate(${Math.sin(s * 0.9) * 8 * (1 - settle)}deg)`;
      // light moving inside
      k1.style.left = `${58 + Math.cos(s * 1.6) * 30}px`;
      k1.style.top = `${58 + Math.sin(s * 1.6) * 30}px`;
      k1.style.opacity = String(0.55 * (1 - prog(a, 100, 450)));
      k2.style.left = `${58 + Math.cos(s * 1.6 + 3.1) * 26}px`;
      k2.style.top = `${58 + Math.sin(s * 1.6 + 3.1) * 26}px`;
      k2.style.opacity = String(0.45 * (1 - prog(a, 100, 450)));
      // droplets orbit, and are pulled back in on arrival
      for (const [d, k, size2] of [[d1, 0, 22], [d2, Math.PI, 14]] as Array<[HTMLElement, number, number]>) {
        const ang = s * 2.2 + k;
        const rad = lerp(84 + 8 * Math.sin(s * 1.3 + k), 0, eIn(prog(a, 0, 300)));
        d.style.left = `${Math.cos(ang) * rad - size2 / 2}px`;
        d.style.top = `${Math.sin(ang) * rad * 0.8 - size2 / 2}px`;
        d.style.width = `${size2}px`;
        d.style.height = `${size2}px`;
        d.style.opacity = String(prog(w, 250, 600) * (1 - prog(a, 200, 300)));
      }
      // the picture develops behind the glass, then the glass clears
      const pp = prog(a, 150, 650);
      ph.style.opacity = String(eOut(pp));
      ph.style.filter = pp >= 1 ? 'none' : `blur(${lerp(12, 0, eOut(pp))}px) saturate(${lerp(1.6, 1, pp)})`;
      const shp = prog(a, 380, 820);
      sh.style.opacity = shp > 0 && shp < 1 ? '1' : '0';
      sh.style.left = `${lerp(-50, 130, eIO(shp))}%`;
    },
  };
}

const BUILD: Record<ConceptLook, (ctx: Ctx) => Concept> = { trace, tune, deck, glass };

export interface ConceptHandle {
  /** The account is known: its picture (or initial when it has none). */
  setPicture(picture: string | undefined, initial: string): void;
  open(): void;
  /** Stand still (off screen) or carry on. */
  play(on: boolean): void;
  stop(): void;
}

/**
 * Draw one arrival into `root` (an empty 0×0 box at the frame's middle).
 * `keepPicture`: stay on the picture after the reveal (the Settings
 * previews); otherwise it clears once the shared frame has taken over.
 */
export function mountConcept(
  root: HTMLElement,
  look: ConceptLook,
  { picture, initial, keepPicture = false, reduced = false }: { picture?: string; initial: string; keepPicture?: boolean; reduced?: boolean },
): ConceptHandle {
  const css = getComputedStyle(root);
  const acc: [string, string] = [
    css.getPropertyValue('--rift-a').trim() || '#ffffff',
    css.getPropertyValue('--rift-b').trim() || '#c9d2e3',
  ];
  const photos: HTMLElement[] = [];
  let shown = '';
  const setPicture = (pic: string | undefined, init: string) => {
    const key = `${pic || ''}|${init}`;
    if (key === shown) return;
    shown = key;
    for (const p of photos) fillPhoto(p, pic, init);
  };
  const concept = BUILD[look]({ root, acc, photo: (p) => { photos.push(p); } });
  setPicture(picture, initial);
  const reveal = CONCEPT_REVEAL_MS[look];
  // Reduced motion: hold one still frame, then cut to the picture.
  const STILL_T = 1300;
  let start = performance.now();
  let pausedAt = 0;
  let openAt = -1;
  let raf = 0;
  let running = !reduced;
  const frame = () => {
    raf = 0;
    const now = performance.now();
    const t = reduced ? STILL_T : now - start;
    const a = openAt < 0 ? -1 : reduced ? reveal : now - openAt;
    concept.render(t, a);
    const done = a >= reveal;
    root.style.opacity = done && !keepPicture ? '0' : '1';
    if (running && !(done && !keepPicture) && !(done && reduced)) raf = requestAnimationFrame(frame);
  };
  frame();
  return {
    setPicture,
    open() {
      if (openAt >= 0) return;
      openAt = performance.now();
      if (!raf) frame();
    },
    play(on) {
      if (reduced || on === running) return;
      running = on;
      if (!on) { pausedAt = performance.now(); if (raf) cancelAnimationFrame(raf); raf = 0; return; }
      const gap = performance.now() - pausedAt;
      start += gap;
      if (openAt >= 0) openAt += gap;
      frame();
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      root.replaceChildren();
    },
  };
}
