// The scroll journey, variant v3-precision (Thu 8 Oct 2026), on round 8's engine: seven scenes, one sphere, one bird,
// and the sphere's own axis.
//
// What this variant changes
//   The framing: the sphere is oversized and offset, bleeding off the screen's edge opposite one very large headline
//   (frames come from the viewport and the words' own ink, not from art boxes). Where the sphere bleeds, the bird may
//   leave the frame and come back; every reading position is chosen so the bird is on screen (the loop's clock below).
//   Scene 2 is an exploded view: each band lit in turn with its callout on a hairline leader. The close's line is on
//   screen from the close's first frame and the footer lives inside the close, so the page ends on the mark.
// How it is driven
//   The page's scroll position, smoothed by a light ScrollTrigger scrub (0.3 s), is the story's only clock. From it we
//   find the scene and its progress p (0..1) and build one pose: where the sphere sits, the camera, its brightness and
//   speed, and the journey's looks (bands, pillar, embers, other spheres, the mark). Between two scenes the two settled
//   poses blend, eased, over the screen of scroll where the stages hand over: the sphere glides and transforms, never
//   fades out and back in. hero.js draws the pose in the same frame (driven from gsap.ticker), so the spine, the words
//   and the sphere never drift apart. Pinned scenes are CSS sticky stages inside tall sections (lengths in svh). The
//   words in each stage run on a paused GSAP timeline whose progress is p.
// The axis (M33, Tim 8 Oct ~13:05: "make the spire stay with the sphere")
//   The pillar's line of light in an SVG layer above the canvas is the sphere's axis and nothing else: pole to pole,
//   carried a few pixels past each pole like an engineering centre line. It moves, turns and scales with the sphere,
//   opens with the five bands, carries the sparks and the rebirth's pulse, and becomes the mark's own line at the close.
//   No line grows from the header mark or runs down the page. Near words it fades out over 160 px (v3-r3), never cut.
//
// v3-r5 integration (Fri 9 Oct 2026, on v3-r5-live's fixes): camera.js, close-ups on the phoenix between the wide
// shots (M38); the W3 Glint carries the Hairline name in at the close (B62) and the tagline (C15) follows it; T2
// Catalogue type (U35); the fh8 bird (bird.js); the Google Cloud logo (B63); a second theme switch in the footer.
//
// Test hooks: ?scene=<1..7>&p=<0..1> jumps to that scene's progress (no smoothing) · ?t=<s> holds the hero's loop ·
// &calm=1 or &bright=1 pins the stillness level · &reduced=1 · &nofield=1 · &q=0..4 · &bench=1 then __bench(n) ·
// __story() reports the scene, p and the frame time · __goto(n, p) jumps · __hero.birdState the bird's loop time.
import { createHero } from './hero.js';
import { BIRD } from './bird.js';
import { createCamera } from './camera.js';

const Q = new URLSearchParams(location.search);
const reduced = Q.get('reduced') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const still = Q.has('t') ? parseFloat(Q.get('t')) : null;
const wideMQ = matchMedia('(min-width: 960px)');
const { gsap, ScrollTrigger } = window;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a)*t;
const smooth = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const bump = (x, a, b, c, d) => smooth(a, b, x)*(1 - smooth(c, d, x));
const HOME_YAW = 0.35, HOME_PITCH = 0.12, R = 1.6, PERIOD = 16;
const BAND_Y = [1.376, 0.8, 0, -0.8, -1.376], BAND_W = [1.11, 1.536, 1.6, 1.536, 1.11], GAP = 0.62;
// round 6 (U40, Yuan, approved by Tim Fri 9 Oct): the five layers as a tight stack, BAND_G apart, that opens BAND_O round
// the active band (the bands either side move apart), so its line fits under its name, short laptop screens included.
// A: how active each band is (0..1); a band above the active one moves up, one below it moves down
const BAND_G = 0.16, BAND_O = 0.38, BAND_REACH = 1.6 + 2*BAND_G + BAND_O;   // the stack's half height at its widest (sphere units)
const bandOffs = A => [0, 1, 2, 3, 4].map(k => { let o = (2 - k)*BAND_G; for (let j = 0; j < 5; j++) o += BAND_O*A[j]*(j > k ? 1 : j < k ? -1 : 0); return o; });
const bandY = (pose, k) => BAND_Y[k] + (pose.bandOff ? pose.bandOff[k] : (2 - k)*GAP)*pose.spread;

if (reduced) document.documentElement.classList.add('reduced');
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- the facts' sources: one tap away ----------
for (const b of $$('.fact')) b.addEventListener('click', () => {
  const open = b.getAttribute('aria-expanded') !== 'true', src = document.getElementById(b.getAttribute('aria-controls'));
  b.setAttribute('aria-expanded', String(open)); src.hidden = !open;
});

// ---------- the mark: one file (page.css --mark-src, the thin spine) for the crisp mark and the particle targets ----------
const MARK = { vb: [0, 0, 256, 256], ink: [0, 0, 256, 256], line: [127, 0, 2, 256], rects: [] };
const markSrc = (() => { const v = getComputedStyle(document.documentElement).getPropertyValue('--mark-src'); const m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(v); return m ? m[1] : 'mark.svg'; })();
const markReady = fetch(markSrc).then(r => r.text()).then(txt => {
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml'), root = doc.documentElement;
  const vb = (root.getAttribute('viewBox') || '0 0 256 256').trim().split(/[\s,]+/).map(Number);
  const rects = [...doc.querySelectorAll('rect')].map(r => ({ x: +r.getAttribute('x') || 0, y: +r.getAttribute('y') || 0,
    w: +r.getAttribute('width'), h: +r.getAttribute('height'), rx: +(r.getAttribute('rx') || r.getAttribute('ry') || 0) }));
  if (!rects.length) throw new Error('no rects in ' + markSrc);
  const x0 = Math.min(...rects.map(r => r.x)), x1 = Math.max(...rects.map(r => r.x + r.w));
  const y0 = Math.min(...rects.map(r => r.y)), y1 = Math.max(...rects.map(r => r.y + r.h));
  const thin = rects.filter(r => r.w < r.h*0.2).sort((a, b) => b.h - a.h)[0];
  Object.assign(MARK, { vb, ink: [x0, y0, x1 - x0, y1 - y0], rects,
    line: thin ? [thin.x, thin.y, thin.w, thin.h] : [(x0 + x1)/2 - 1, y0, 2, y1 - y0] });
}).catch(e => console.warn('mark:', e.message));

// ---------- the theme and the scheme ----------
const root = document.documentElement;
const theme = () => root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
const scheme = () => root.getAttribute('data-scheme') || 'plasma';
const ALLOY = [0.906, 0.898, 0.882],   /* v3-r5: the rice paper #E7E5E1 (U35) */ GRAPHITE = [0.0824, 0.0902, 0.1020];
function hex(h){ return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)/255); }
const SCHEMES = {
  plasma: { ink: [0.55, 0.70, 1.0], ink2: [0.80, 0.62, 1.0], tint: [0.86, 0.91, 1.0], pillar: [0.82, 0.88, 1.0], spark: [1.0, 0.97, 0.9],
    peak: [201/255, 199/255, 217/255], halo: [0.975, 0.983, 1.0], haloK: 0.55, signal: hex('#7F8CFF') },
  mono: { ink: [0.80, 0.82, 0.85], ink2: [0.88, 0.88, 0.90], tint: [0.93, 0.94, 0.95], pillar: [0.92, 0.93, 0.94], spark: [0.98, 0.98, 0.98],
    peak: [201/255, 203/255, 206/255], halo: [0.965, 0.969, 0.965], haloK: 0.4, signal: hex('#15171A') },   // v3-r3: the light pillar in Graphite (at 75%, hero.js)
  coral: { ink: [0.80, 0.82, 0.85], ink2: [0.88, 0.88, 0.90], tint: [0.93, 0.94, 0.95], pillar: [1.0, 0.67, 0.65], spark: [1.0, 0.79, 0.76],
    peak: [214/255, 202/255, 204/255], halo: [0.965, 0.969, 0.965], haloK: 0.4, axisK: 0.9, signal: hex('#B5384F') },
};
const lookOf = () => ({ axisK: 0, ...SCHEMES[scheme()] || SCHEMES.plasma, day: theme() === 'light' ? 1 : 0,
  bgC: [0.0824, 0.0902, 0.1020], bgE: [0.0742, 0.0812, 0.0918], dayBg: ALLOY, dayInk: GRAPHITE, inkMax: 0.8 });
const metaTheme = $('meta[name="theme-color"]');
function store(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
// v3-r5 (review finding 6, U30): the switch is in the header and again in the footer row, beside the email
const modeBtn = $('#mode'), modeBtns = $$('.mode');
function syncMode(){
  const t = theme(); metaTheme && metaTheme.setAttribute('content', t === 'light' ? '#E7E5E1' : '#15171A');
  for (const b of modeBtns) { b.setAttribute('aria-pressed', String(t === 'dark')); b.setAttribute('title', t === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'); }
}
let onLook = () => {};
function setTheme(t, how = 'fade'){
  if (t === theme()) return;
  const flip = () => { root.setAttribute('data-theme', t);
    if (root.hasAttribute('data-scheme-auto')) root.setAttribute('data-scheme', t === 'light' ? 'mono' : 'plasma');
    syncMode(); onLook(how === 'cut'); };
  const vt = how === 'fade' && document.startViewTransition && Q.get('vt') !== '0';
  if (vt) { document.startViewTransition(flip); return; }
  if (how === 'fade') { root.classList.add('theme-fade'); clearTimeout(setTheme.t); setTheme.t = setTimeout(() => root.classList.remove('theme-fade'), 360); }
  flip();
}
syncMode();
// A choice is remembered only while it differs from the system's: toggling back to what the system
// prefers forgets it, so the page follows the system again (Tim, 9 Oct; ported from v3-r5-live 9c19c15a).
const systemTheme = () => (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
for (const b of modeBtns) b.addEventListener('click', () => {
  const t = theme() === 'dark' ? 'light' : 'dark';
  if (t === systemTheme()) { try { localStorage.removeItem('hhl-theme'); } catch (e) {} } else store('hhl-theme', t);
  setTheme(t);
});
{ let chosen = Q.has('theme'); try { chosen = chosen || !!localStorage.getItem('hhl-theme'); } catch (e) {}
  // Kept on window: a MediaQueryList nothing references can be collected with its listener.
  const mq = (window.__hhlSystemTheme = matchMedia('(prefers-color-scheme: light)'));
  mq.addEventListener && mq.addEventListener('change', e => { if (!chosen) setTheme(e.matches ? 'light' : 'dark'); });
  for (const b of modeBtns) b.addEventListener('click', () => { try { chosen = !!localStorage.getItem('hhl-theme'); } catch (e) { chosen = true; } }); }
window.__theme = (t, how) => setTheme(t, how);

// ---------- the engine ----------
// The hero's loop starts as the flame phoenix crosses the front of the sphere (tau 0.42), so the first seconds show the
// bird in front of the art, then its dive into the bottom pole and the rebirth as the fenghuang at the top
const canvas = $('#field'), orbit = $('#orbit'), hint = $('#orbitHint');
let hero = null;
try {
  hero = createHero(canvas, {
    field: Q.get('field') || 'sphere', still, reduced, nofield: Q.get('nofield') === '1', forceHalf: Q.has('nofloat32'), orbit,
    quality: Q.has('q') ? parseInt(Q.get('q'), 10) : undefined, external: !reduced, look: lookOf(), startT: 0.42*PERIOD,
  });
} catch (e) { console.warn('hero:', e.message); hero = null; }
if (!hero) document.documentElement.classList.add('no-gl');
else if (!reduced) orbit.hidden = false;
if (hero) markReady.then(() => MARK.rects.length && hero.setMarkRects(MARK.rects));
const camera = createCamera({ hero, query: Q });
window.__camera = () => camera.state;
onLook = cut => { if (!hero) return; hero.setLook(lookOf(), cut || reduced); if (reduced) renderStills(); };

// ---------- the scenes ----------
const SC = $$('.scene').map(el => ({ el, n: +el.dataset.scene, pinned: el.classList.contains('pinned'),
  stage: $('.stage', el), art: $('.art', el), words: $('.words', el) }));
const S = n => SC[n - 1];
const heroWords = $('.hero-words'), slot = $('.sphere-slot'), header = $('.top');
let wide = wideMQ.matches, vh = innerHeight, vw = innerWidth, segs = [], maxY = 1, safeT = 0;

function measure(){
  wide = wideMQ.matches; vw = innerWidth;
  vh = S(2).stage.getBoundingClientRect().height || innerHeight;   // one stage is 100svh
  const st = $('.safe-top'); safeT = st ? st.getBoundingClientRect().height : 0;
  const y0 = scrollY;
  for (const s of SC) { const r = s.el.getBoundingClientRect(); s.top = r.top + y0; s.h = r.height; }
  segs = [];
  for (let i = 0; i < SC.length; i++) {
    const s = SC[i], next = SC[i + 1];
    const holdFrom = i === 0 ? 0 : s.top;
    const holdTo = next ? next.top - vh : s.top + Math.max(0, s.h - vh);
    segs.push({ kind: 'hold', a: s.n, from: holdFrom, to: Math.max(holdFrom + 1, holdTo) });
    if (next) segs.push({ kind: 'blend', a: s.n, b: next.n, from: Math.max(holdFrom + 1, holdTo), to: next.top });
  }
  maxY = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  { const h = segs.find(x => x.kind === 'hold' && x.a === 7); h7 = h ? Math.max(0.2, (h.to - h.from)/vh) : 0.9; CLOSE_IN = (0.42*0.9 + CLOSE_HOLD)/h7; CLOSE_OUT = CLOSE_IN - 0.04; }
  inkCache.clear();
  // scene 2's callouts carry each layer's line under its name only where the exploded bands are tall enough for it
  root.setAttribute('data-callouts', 'lines');   // round 6 (U40): the active layer's line sits under its name on every desktop, short laptops included
  centreClose();
}
// round 7 (review top fix 1): the close's lockup group (the mark, the wordmark, the line, the tagline and the actions)
// sits with its centre at 46% of the screen's height, the optical centre, never into the footer or under the header.
// A transform on .close-in (page.css --close-dy), so nothing else in the stage moves
const CLOSE_AT = 0.46;
function centreClose(){
  const ci = $('.close-in'), st = S(7) && S(7).stage; if (!ci || !st || reduced) return;
  ci.style.setProperty('--close-dy', '0px');
  const s0 = rel(st).top, parts = ['.final', '.close .line', '.close .tagline', '.close .actions'].map(q => $(q)).filter(Boolean).map(rel);
  if (!parts.length) return;
  const top = Math.min(...parts.map(r => r.top)) - s0, bot = Math.max(...parts.map(r => r.bottom)) - s0;
  let dy = vh*CLOSE_AT - (top + bot)/2;
  const ft = $('.foot'); if (ft) dy = Math.min(dy, rel(ft).top - s0 - 24 - bot);
  dy = Math.max(dy, safeT + rel(header).height + 16 - top);
  ci.style.setProperty('--close-dy', dy.toFixed(1) + 'px');
}
function where(y){
  for (const g of segs) if (y <= g.to) return { g, t: clamp((y - g.from)/Math.max(1, g.to - g.from), 0, 1) };
  const g = segs[segs.length - 1]; return { g, t: 1 };
}
const rel = el => el.getBoundingClientRect();

// ---------- where the words' ink sits, settled ----------
// The actual extent of a scene's text (its line boxes, not its grid area), as it sits once the stage has stuck, so the
// sphere can be framed against the words themselves. Cached per layout (cleared on measure).
const INK = 'h1, h2, .standfirst, .body, .facts, .actions, .text-link, .platform h3, .gc-products, .certs, .steps';
const inkCache = new Map();
function inkOf(n){
  if (inkCache.has(n)) return inkCache.get(n);
  const s = S(n), host = n === 1 ? heroWords : s.words; if (!host) return null;
  const dy = (n === 1 ? rel(s.el).top : (s.stage ? rel(s.stage).top : 0)) + ((s.words && s.words._dy) || 0);   // v3-r5: less the drift
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const take = q => { if (!q.width || !q.height) return; x0 = Math.min(x0, q.left); x1 = Math.max(x1, q.right); y0 = Math.min(y0, q.top - dy); y1 = Math.max(y1, q.bottom - dy); };
  for (const el of host.querySelectorAll(INK)) {
    if (el.closest('.layers') || el.closest('.vh')) continue;
    if (el.matches('.facts, .actions, .text-link, .steps')) { take(rel(el)); continue; }
    const r = document.createRange(); r.selectNodeContents(el); for (const q of r.getClientRects()) take(q);
  }
  const box = x1 > x0 ? { x0, y0, x1, y1 } : null;
  inkCache.set(n, box); return box;
}

// ---------- the framing (v3-precision) ----------
// The sphere is oversized and offset: on a desktop its radius is up to 0.38 of the screen's height, its centre placed so
// a share of it runs off the edge away from the words; on a phone it fills the space above the words and runs off the
// right edge. The poles always stay on screen (the fall and the rebirth happen there).
const baseR = () => Math.min(vh*0.38, vw*0.27);
// bleed k: the share of the radius past the edge (0.42 means the centre sits 0.58 R inside it)
function bleedRight(k, gapFrom){ const R = Math.min(baseR(), (vw - gapFrom)/(2 - k)); return [vw - (1 - k)*R, vh*0.52, R]; }
function bleedLeft(k, gapTo){ const R = Math.min(baseR(), gapTo/(2 - k)); return [(1 - k)*R, vh*0.52, R]; }
// a scene's art box as it sits when its stage has settled (phones: the space above the words)
function artBox(n){ const r = rel(S(n).art), dy = S(n).stage ? rel(S(n).stage).top : 0;
  return { x: r.left, y: r.top - dy, w: r.width, h: r.height, cx: r.left + r.width/2, cy: r.top - dy + r.height/2 }; }
// phones (v3-r2, the composition grafted from v1-renewal): the art owns the top 60% of the screen and the words are
// anchored to the foot of the stage. The sphere is centred on the page's axis, 300 px across or more where the space
// allows (up to the screen less two 24 px gutters), its top pole about a sixth of the art space below the top, so the
// reborn bird has room above it
function phoneArt(n){
  const ink = inkOf(n), top = safeT + 16, floor = Math.min(vh*0.62, (ink ? ink.y0 : vh*0.6) - 24);
  return { top, floor, h: Math.max(120, floor - top) };
}
function phoneFrame(n){
  const a = phoneArt(n), R = Math.min((vw - 48)/2, Math.max(156, a.h*0.42));
  return [vw/2, Math.min(a.floor - R + 8, a.top + a.h*0.56), R];
}
function fitHero(){
  const dy = rel(S(1).el).top;
  if (wide) {
    const ink = inkOf(1), x1 = ink ? ink.x1 : vw*0.45;
    const f = bleedRight(0.42, x1 + 72);
    return { frame: [f[0], f[1] + dy, f[2]] };
  }
  const r = rel(slot);
  const Rp = Math.max(Math.min(150, r.height*0.46), Math.min((vw - 48)/2, r.height*0.43));
  return { frame: [vw/2, r.top + r.height*0.53, Rp] };
}
// ---------- the poses ----------
const BASE = { cam: { yaw: HOME_YAW, pitch: HOME_PITCH, roll: 0, dist: 1 }, dim: 1, speed: 1, bird: 1, birdScale: 1, lift: 0, spread: 0,
  lit: [0, 0, 0, 0, 0], bandOff: bandOffs([0, 0, 0, 0, 0]), bandFloor: 0.30, pillar: 0, ember: 0, others: 0, morph: 0, white: 0, exit: 0, loopT: null,
  steady: 0, behind: 0, feather: 40, axisOff: 0,
  route: { grow: 1, vis: 1, ticks: 0, sparks: 0, dark: 0, pulse: -1, mark: 0 } };
const P = o => ({ ...BASE, ...o, cam: { ...BASE.cam, ...(o.cam || {}) }, route: { ...BASE.route, ...(o.route || {}) } });
let heroCam = { ...BASE.cam }, clock = 0;

// The bird's clock through the story. One 32 s two-life cycle (bird.js): loop 0 is life A, the flame phoenix; loop 1
// is life B, the fenghuang. The hero runs free; from scene 2 the scroll holds the loop, each scene's end the next one's
// start. Values are in loops (x 16 s). Chosen for this variant's framing, so that wherever a reader rests the bird is on
// screen: the front pass (tau 0.42 to 0.58) at the end of scene 3; the fall on the open left side in scene 4, the rebirth
// at the top pole and the fenghuang fully formed above it (bird.js turns the new life over by tau 0.14) by the end of
// scene 4; the fenghuang sweeping across the face of the oversized sphere as scene 5 holds.
const LT = { s2a: 0.10, s2b: 0.38, s3b: 0.55, s4: [0.55, 0.90, 0.94, 1.08, 1.15], s5m: 1.40, s5b: 1.50, s6b: 1.58, s7b: 1.66 };
let anchorT = LT.s2a*PERIOD;
function takeAnchor(simT){
  const loop = Math.floor(simT/PERIOD), tau = simT/PERIOD - loop;
  anchorT = ((loop % 2) + 2) % 2 === 0 && tau > 0.03 && tau < 0.30 ? tau*PERIOD : LT.s2a*PERIOD;
}
// scene 2's exploded view on a desktop: the bands between the words' ink and the callouts' column
const CALLOUT_W = 300;
function bandsFrame(t){
  if (!wide) {
    const A = artBox(2), rBase = Math.min(A.h/2.3, A.w*0.36), rBands = Math.min(A.h/2/(BAND_REACH/1.6*1.1), A.w*0.25);   // round 6: the tight stack
    const r = lerp(rBase, rBands, t);
    return [Math.max(A.x + A.w*0.28, r + 16), A.y + A.h*0.5, r];   // v3-r2: never cut by the left edge as it opens
  }
  const ink = inkOf(2), m = parseFloat(getComputedStyle(header).paddingLeft) || 64;
  const xL = (ink ? ink.x1 : vw*0.42) + 64, xR = vw - m - CALLOUT_W - 40;
  const rBands = Math.max(80, Math.min(vh*0.5/(BAND_REACH/1.6*1.1), (xR - xL)/2.04)), cx = (xL + xR)/2;   // round 6: sized to the tight stack at its widest
  // v3-r4: the whole sphere at the scene's start stays 40 px clear of the headline's ink (it touched "One system.":
  // review finding 7, and the clear-sweep's desktop hits)
  const rBase = Math.max(rBands, Math.min(baseR(), rBands*1.35, (cx - (ink ? ink.x1 : vw*0.42) - 40)/SIL_K));
  return [cx, vh*0.5, lerp(rBase, rBands, t)];
}
// round 7 (review High 1; M33, M19, M38): the stack section has no room under the art. On a desktop, while it passes, the
// sphere sits right of its column: centre at 78% of the width, the silhouette's radius 30% of the height (20% of the width
// at most), on the screen's middle; the column ends 64 px short of that rim (page.css, the same formula). Scene 3's words
// leave first (its timeline), then the sphere glides over, from 0.94 of scene 3's pinned span to 0.22 of a screen after
// its stage starts to move, before the stack's heading comes up beside it
const STACK_CX = 0.78, STACK_R = 0.30, STACK_RW = 0.20, STACK_GAP = 64;
const stackFrame = () => [vw*STACK_CX, vh*0.5, Math.min(vh*STACK_R, vw*STACK_RW)/silK];   // silK: the silhouette over the frame, measured each frame
function stackGo(p){
  const h3 = segs.find(x => x.kind === 'hold' && x.a === 3); if (!h3 || !wide) return 0;
  return smooth(0.94*pf3, pf3 + 0.22*vh/Math.max(1, h3.to - h3.from), p);
}
const POSES = {
  1(p){   // the promise: the sphere bleeding off the right edge, the phoenix flying its lap; the axis draws out from the
    // sphere's centre to both poles as the page opens
    const f = fitHero();
    return P({ frame: f.frame, cam: heroCam, route: { grow: smooth(0.15, 0.95, intro) } });
  },
  2(p){   // five layers: the sphere opens into five bands, an exploded view; each lights as its callout is read
    const t = smooth(0.0, 0.22, p);
    // round 6 (U40): the active band and its name at full light; every other band, those already passed included,
    // dimmed right down (the floor 0.10); before the first layer lights, all five rest evenly
    const act = [0, 1, 2, 3, 4].map(i => { const c = 0.30 + 0.15*i; return bump(p, c - 0.075, c - 0.04, c + 0.07, i === 4 ? 9 : c + 0.1); });
    const rest = 1 - smooth(0.225, 0.265, p), lit = act.map(a => Math.max(a, 0.32*rest));
    return P({ frame: bandsFrame(t), cam: { yaw: HOME_YAW + 0.25*t, pitch: HOME_PITCH + 0.34*t }, bird: lerp(0.9, 0.3, t), lift: t, spread: t, lit,
      bandOff: bandOffs(act), bandFloor: 0.10,
      loopT: lerp(anchorT, LT.s2b*PERIOD, p),
      dim: 0.92, route: { ticks: t } });
  },
  3(p){   // security in every layer: the bands close; the pillar becomes a line with sparks; the phoenix crosses in front of it
    const close = smooth(0.0, 0.32, p);
    let fr;
    if (wide) { const ink = inkOf(3); fr = bleedLeft(0.3, (ink ? ink.x0 : vw*0.58) - 72); }
    else fr = phoneFrame(3);
    // the bands arrive here during the hand-over at their own size (fully on screen), then close into the sphere,
    // which grows until it runs off the edge
    const rb = Math.min(bandsFrame(1)[2], fr[2]), cx0 = wide ? Math.max(fr[0], rb*1.15) : fr[0];
    const f3 = [lerp(cx0, fr[0], close), fr[1], Math.exp(lerp(Math.log(rb), Math.log(fr[2]), close))], go = stackGo(p);   // round 7: then right of the stack
    return P({ frame: go > 0 ? mixFrame(f3, stackFrame(), go) : f3,
      cam: { yaw: HOME_YAW + 0.25*(1 - close) - 0.12*smooth(0.3, 1, p), pitch: HOME_PITCH + 0.34*(1 - close) + 0.06*close },
      bird: lerp(0.3, 0.85, smooth(0.1, 0.6, p)), lift: 1 - close, spread: 1 - close, lit: [0, 0, 0, 0, 1 - close],
      bandOff: bandOffs([0, 0, 0, 0, 1]), bandFloor: lerp(0.10, 0.30, close),   // round 6: scene 2's last state, closing
      loopT: lerp(LT.s2b, LT.s3b, p)*PERIOD,
      pillar: smooth(0.12, 0.45, p), dim: 0.88,
      route: { ticks: 1 - close, sparks: smooth(0.3, 0.5, p) } });
  },
  4(p){   // the fall and the rebirth: embers, the phoenix falls into the bottom pole; a beat; the fenghuang is born at the top
    let fr;
    if (wide) { const ink = inkOf(4); fr = bleedRight(0.22, (ink ? ink.x1 : vw*0.42) + 72); }
    else fr = phoneFrame(4);
    // the fall (p 0 to 0.34), a beat of near stillness (to 0.42), the rebirth as its words arrive (to 0.72), the
    // fenghuang rising whole above the top pole (to the end)
    const k = LT.s4;
    const tau = p < 0.34 ? lerp(k[0], k[1], smooth(0, 0.34, p)) : p < 0.42 ? lerp(k[1], k[2], (p - 0.34)/0.08)
      : p < 0.72 ? lerp(k[2], k[3], (p - 0.42)/0.30) : lerp(k[3], k[4], (p - 0.72)/0.28);
    const ember = smooth(0.04, 0.30, p)*(1 - smooth(0.46, 0.70, p));
    const relight = smooth(0.46, 0.68, p);
    return P({ frame: fr, cam: { yaw: HOME_YAW - 0.12*(1 - smooth(0.42, 0.85, p)), pitch: HOME_PITCH + 0.05 },
      bird: 1, loopT: tau*PERIOD, ember, speed: lerp(1, 0.1, ember), dim: 1 - 0.45*ember,
      route: { dark: ember*(1 - relight), pulse: p > 0.40 && p < 0.66 ? (p - 0.40)/0.26 : -1 } });
  },
  5(p){   // any size: out until the sphere is one bright point among many, then back in, larger than the screen, and it
    // holds there beside its words (Yuan: the hold)
    let base, fill;
    if (wide) {
      const ink = inkOf(5), gapTo = (ink ? ink.x0 : vw*0.58) - 64;
      base = bleedLeft(0.3, gapTo - 8);
      const Rf = Math.min(vh*0.7, gapTo*0.7);
      fill = [gapTo - Rf - 120, vh*0.5, Rf];   // v3-r5 (REVIEW-t2c finding 3, M19): 120 px left, so the rim never crosses the headline
    } else {
      const A = artBox(5); base = phoneFrame(5);
      const ink5 = inkOf(5), Rf = Math.min(vw*0.7, A.h*0.66);
      fill = [vw*0.6, Math.min(A.y + A.h - 12 - Rf, (ink5 ? ink5.y0 : A.y + A.h) - 24 - Rf*1.04*1.06), Rf];   // v3-r5 (calm check): 24 px clear of the words, glow included
    }
    const out = smooth(0.0, 0.26, p), inn = smooth(0.3, 0.56, p);
    // v3-r4 (review finding 3, B52): the farthest the view pulls back still leaves the sphere 96 px across on a phone and
    // 160 px on a desktop, alone: the scattered far-off spheres are gone (they read as dust on the screen)
    const rFar = (wide ? 160 : 96)/2 + 1;   // the silhouette is the frame at this size (no perspective to speak of)
    const lr = lerp(lerp(Math.log(base[2]), Math.log(rFar), out), Math.log(fill[2]), inn);
    return P({ frame: [lerp(base[0], fill[0], inn), lerp(base[1], fill[1], inn), Math.exp(lr)], cam: { yaw: HOME_YAW + 0.4*out - 0.2*inn, pitch: HOME_PITCH + 0.1*out },
      others: 0, dim: lerp(1, 0.86, inn), bird: 1,
      // the fenghuang goes round the far side while the sphere is small, then crosses slowly in front of the oversized
      // sphere through the hold, at about the hero's size
      loopT: (p < 0.56 ? lerp(LT.s4[4], LT.s5m, smooth(0, 0.56, p)) : lerp(LT.s5m, LT.s5b, (p - 0.56)/0.44))*PERIOD,
      birdScale: lerp(1, clamp(base[2]/fill[2], 0.5, 1), inn),
      route: { vis: 1 - 0.5*out*(1 - inn) } });
  },
  6(p){   // how we work. Desktop: the words on the left, the sphere bleeding off the RIGHT edge beside the steps (v3-r2:
    // the pose follows the markup's words-left; the old bleedLeft against left-hand words gave the 40 px chip), the
    // fenghuang carrying on its lap. Phone: below
    if (wide) { const ink = inkOf(6), fr = bleedRight(0.3, (ink ? ink.x1 : vw*0.42) + 72);
      return P({ frame: fr, cam: { yaw: HOME_YAW + 0.15*p, pitch: HOME_PITCH + 0.06 }, bird: 1, dim: 0.95,
        loopT: lerp(LT.s5b, LT.s6b, p)*PERIOD }); }
    // v3-r3 (review top fix 1): the phone's words sit at the top of the screen and the sphere fills the lower half: 300 px
    // across, centred at y 640 of 874 (both scaled with the screen's height), at 55% strength with the fenghuang flying
    // its lap and the axis on. Never closer than 40 px under the words, never off the foot of the screen
    const ink = inkOf(6), k = vh/874, Rr = 150*k;
    const cy = clamp(640*k, (ink ? ink.y1 : 0) + 40 + Rr, vh - Rr - 16);
    return P({ frame: [vw/2, cy, Rr], cam: { yaw: HOME_YAW + 0.15*p, pitch: HOME_PITCH + 0.06 }, bird: 1, dim: 0.55,
      loopT: lerp(LT.s5b, LT.s6b, p)*PERIOD, route: { vis: 0.55 } });
  },
  7(p){   // fortune: the fenghuang's last pass into the top pole; every particle streams into the mark above the line,
    // glowing with a faint spectrum, then white; the crisp mark and the wordmark come in exactly on top
    const m = markBox(), A = { cx: m.cx, cy: m.cy };
    const rMark = hero ? hero.radiusForUnitPx(m.k*28/(2*R)) : 40;
    // v3-r5 (review finding 3): the sphere becomes the mark over the same scroll as before (its timings are in v3-r4's
    // desktop p, u, where the hold was 0.9 of a screen); then the glowing mark holds for CLOSE_HOLD (40vh) of scroll
    // before the wordmark arrives, and the glow decays to the flat mark over 600 ms after it (glow.k, closeText)
    p = p*h7/0.9;
    const cond = smooth(0.08, 0.36, p), sk = smooth(0.02, 0.34, p);
    let fr, fr0r = 1;
    {
      // v3-r4 (review High 1, M33): on a desktop the close's sphere starts centred on the page's axis with its bottom pole
      // CLOSE_GAP (64) px above the cap height of "Every layer, renewed.", sized to the space above the line, then shrinks
      // and slides into the lockup's mark. At every p its bottom pole (and the axis's tip, SIL_K) stays above that line
      // On a phone the stacked close already sits the sphere over the line; the same rule, with 32 px, keeps the axis's tip
      // clear of the capitals there too (it touched them: review finding 6, the clear-sweep's one phone hit)
      const gap = wide ? CLOSE_GAP : 32, capT = closeCapTop(), room = capT - gap - (safeT + (wide ? 40 : 16));
      const r0 = Math.max(rMark, Math.min(vh*0.24, vw*0.3, room/(2*SIL_K)));
      const r = Math.exp(lerp(Math.log(r0), Math.log(rMark), sk)); fr0r = r0;
      const x0 = wide ? vw/2 : A.cx, y0 = wide ? capT - gap - SIL_K*r0 : A.cy;
      const x = lerp(x0, A.cx, sk), y = Math.min(lerp(y0, A.cy, sk), capT - gap - SIL_K*r);
      fr = [x, y, r];
    }
    return P({ frame: fr,
      cam: { yaw: lerp(HOME_YAW, 0, smooth(0, 0.32, p)), pitch: lerp(HOME_PITCH, 0, smooth(0, 0.32, p)) },
      // round 6 (U42, M40): the fenghuang is not drawn into the pole any more; it keeps flying round the sphere as it
      // becomes the mark (kept nearer its own size as the sphere shrinks), and flies out of the mark once it has formed
      bird: 1, exit: 0, birdScale: Math.sqrt(fr0r/Math.max(1, fr[2])), loopT: lerp(LT.s6b, LT.s7b, smooth(0, 0.24, p))*PERIOD, morph: cond,
      shimmer: 0.9*bump(p, 0.12, 0.2, 0.26, 0.4),   // v3-r2 (from v2-rise): one spectral flash, then white
      white: smooth(0.3, 0.6, p), dim: lerp(1, 0.42, cond)*lerp(1, 0.34, 1 - glow.k), speed: lerp(1, 0.4, cond),
      // the axis lands on the mark's own line as the particles condense, then hands over to the crisp mark
      route: { vis: glow.k, mark: cond } });
  },
};
// v3-r4: the silhouette's radius on screen against the frame's (perspective: 150 px frame, 155 px silhouette) and the
// close's clearance between the sphere's bottom pole and the line's cap height
const SIL_K = 1.04, CLOSE_GAP = 64;
let capK = null;
function closeCapTop(){
  const el = $('.close .line'); if (!el) return vh*0.6;
  const dy = reduced ? 0 : Math.max(0, rel(S(7).stage).top);
  const r = document.createRange(); r.selectNodeContents(el); const q = r.getClientRects()[0] || rel(el);
  if (capK === null || capK.font !== getComputedStyle(el).font) {   // the content box's top to the capitals' top, from the face's own metrics
    const cs = getComputedStyle(el), c = document.createElement('canvas').getContext('2d'); c.font = cs.font;
    const mE = c.measureText('E'), fs = parseFloat(cs.fontSize);
    capK = { font: cs.font, off: (mE.fontBoundingBoxAscent ?? fs*0.95) - (mE.actualBoundingBoxAscent ?? fs*0.7) };
  }
  return q.top - dy + capK.off;
}
function markBox(live = false){
  const r = rel($('.final .mark')), sc = r.width/MARK.vb[2], [ix, iy, iw, ih] = MARK.ink, [lx, ly, lw, lh] = MARK.line;
  const dy = live || reduced ? 0 : Math.max(0, rel(S(7).stage).top);
  const X = v => r.left + (v - MARK.vb[0])*sc, Y = v => r.top - dy + (v - MARK.vb[1])*sc;
  return { cx: X(ix + iw/2), cy: Y(iy + ih/2), k: iw*sc/28, top: Y(iy), bottom: Y(iy + ih), lx: X(lx + lw/2), lt: Y(ly), lb: Y(ly + lh) };
}
const BLEND = { std: t => t*t*(3 - 2*t), 5: t => smooth(0.0, 0.62, t) };
// v3-r5 (M25, the wordless stretch): on a desktop the sphere crosses from one side to the other in the hand-overs out of
// scenes 3 and 4, against the words; it now waits for the leaving words to go, then crosses over 0.35 of a screen, so
// the arriving words (drifting in) are clear of it sooner
const BLEND_D = { 3: t => smooth(0.2, 0.55, t), 4: t => smooth(0.2, 0.55, t) };
function mix(a, b, t){
  const o = {};
  for (const k in a) {
    const x = a[k], y = b[k];
    if (k === 'loopT') o[k] = x === null && y === null ? null : (x === null ? (t > 0 ? y : null) : y === null ? (t < 1 ? x : null) : lerp(x, y, t));
    else if (k === 'frame') o[k] = [lerp(x[0], y[0], t), lerp(x[1], y[1], t), Math.exp(lerp(Math.log(x[2]), Math.log(y[2]), t))];
    else if (Array.isArray(x)) o[k] = x.map((v, i) => lerp(v, y[i], t));
    else if (typeof x === 'object' && x) o[k] = mix(x, { ...x, ...y }, t);
    else if (typeof x === 'number') o[k] = lerp(x, y ?? x, t);
    else o[k] = t < 0.5 ? x : y;
  }
  for (const k in b) if (!(k in o)) o[k] = typeof b[k] === 'number' ? b[k]*t : b[k];
  return o;
}

// ---------- the words in each stage: paused timelines, progress = p ----------
const TL = {};
let pf3 = 1;   // round 6: scene 3's pinned share of its hold
function buildTimelines(){
  for (const k in TL) { TL[k].progress(0); TL[k].kill(); delete TL[k]; }
  if (reduced || !gsap) return;
  const tl = n => (TL[n] = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } }));
  { // scene 2. Phone: the line, then each layer in its place as its band lights. Desktop: the line stays; the callouts
    // beside the bands carry the layers
    const t = tl(2), el = S(2).el, a = $('.layer-swap .beat-a', el), lis = $$('.layers li', el);
    gsap.set([a, ...lis], { clearProps: 'opacity,transform' });
    if (!wide || root.getAttribute('data-callouts') === 'names') {
      gsap.set(lis, { opacity: 0, y: 8 });
      if (!wide) t.to(a, { opacity: 0, y: -6, duration: 0.03, ease: 'power2.in' }, 0.205);
      // one line at a time: each is on screen while its band is lit, and the outgoing one has gone before the next
      // starts (never two overprinted)
      lis.forEach((li, i) => { const c = 0.30 + 0.15*i;
        t.to(li, { opacity: 1, y: 0, duration: 0.03, ease: 'expo.out' }, i === 0 ? 0.235 : c - 0.058);
        if (i < 4) t.to(li, { opacity: 0, y: -6, duration: 0.025, ease: 'power2.in' }, c + 0.062); });
    }
    t.set({}, {}, 1); }
  { // scene 3: the line, then our figures, then the platform under them (C14): one block at a time under the headline,
    // in one place, each gone before the next arrives (U32: few words on screen)
    // v3-r5 (the stack): the line, then our figures, which stay; the platform is now the stack section after this scene
    const t = tl(3), el = S(3).el, a = $('.beat-a', el), b = $('.beat-b', el);
    gsap.set([a, b], { clearProps: 'opacity,transform' });
    gsap.set(b, { opacity: 0, y: 8 });
    // round 6: scene 3's hold runs on through the stack section after it (the next scene starts after the stack), so
    // its beats are placed in its own pinned span (pf of the hold), not in the stretch the stack scrolls over
    const h3 = segs.find(x => x.kind === 'hold' && x.a === 3), pf = h3 ? clamp((S(3).h - vh)/Math.max(1, h3.to - h3.from), 0.2, 1) : 1; pf3 = pf;
    t.to(a, { opacity: 0, y: -6, duration: 0.035*pf, ease: 'power2.in' }, 0.38*pf);
    t.to(b, { opacity: 1, y: 0, duration: 0.05*pf, ease: 'expo.out' }, 0.425*pf);
    // round 7 (review High 1): on a desktop the sphere then glides across to sit beside the stack section (stackGo), so the
    // words leave first, in order: the figures, then the headline, both gone by 0.92 of the pinned span
    if (wide) { const h = $('h2', S(3).stage); gsap.set(h, { clearProps: '--t' });
      t.to(b, { opacity: 0, y: -6, duration: 0.03*pf, ease: 'power2.in' }, 0.86*pf);
      t.to(h, { '--t': 0, duration: 0.03*pf, ease: 'power2.in' }, 0.89*pf); }
    t.set({}, {}, 1); }
  { // scene 4: the fall's words leave as the bird is drawn in; the rebirth's words arrive as the crown swells.
    // v3-r5 (review finding 1): in order. The fall's line goes before its headline; the rebirth's headline comes
    // before its line and its link (each beat's copy on --t, page.css; the beat itself carries the headline's fade)
    const t = tl(4), a = $('.swap .beat-a', S(4).el), b = $('.swap .beat-b', S(4).el);
    const aBody = $$('.body', a), bBody = $$('.body, .text-link', b);
    gsap.set([a, b], { clearProps: 'opacity,transform' }); gsap.set([...aBody, ...bBody], { clearProps: '--t' });
    gsap.set(b, { opacity: 0, y: 8 }); gsap.set(bBody, { '--t': 0 });
    t.to(aBody, { '--t': 0, duration: 0.022, ease: 'power1.in' }, 0.333);
    t.to(a, { opacity: 0, y: -6, duration: 0.03, ease: 'power2.in' }, 0.36);
    t.to(b, { opacity: 1, y: 0, duration: 0.04, ease: 'expo.out' }, 0.425);
    t.to(bBody, { '--t': 1, duration: 0.03, ease: 'power1.out' }, 0.468); t.set({}, {}, 1); }
  { // scene 6 on a phone: one step at a time under the headline, each gone before the next arrives
    const t = tl(6), lis = $$('.steps li', S(6).el);
    gsap.set(lis, { clearProps: 'opacity,transform' });
    // round 6 (U41): on a desktop the steps arrive one at a time as the reader scrolls, each with a soft fade up, and
    // stay (update: stepsIn); hidden until then, the ones already in shown at once after a rebuild
    if (wide) { gsap.killTweensOf(lis); lis.forEach((li, i) => gsap.set(li, i < stepsIn ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 })); }
    if (!wide) {
      gsap.set(lis.slice(1), { opacity: 0, y: 8 });
      lis.forEach((li, i) => { if (i > 0) t.to(li, { opacity: 1, y: 0, duration: 0.04, ease: 'expo.out' }, 0.06 + 0.24*i);
        if (i < lis.length - 1) t.to(li, { opacity: 0, y: -6, duration: 0.03, ease: 'power2.in' }, 0.02 + 0.24*(i + 1)); });
    }
    t.set({}, {}, 1); }
  { // the close: the line is there from the first frame; the crisp mark takes over from the particles as they condense
    // into it (scrubbed). The wordmark and the buttons are not on this timeline (v3-r3, review High 2): see closeText
    const t = tl(7), el = S(7).el, mk = $$('.final .mark', el);
    gsap.set([...mk, ...closeEls()], { clearProps: 'opacity,transform' });
    gsap.set(mk, { opacity: 0 });
    t.to(mk, { opacity: 1, duration: 0.1*0.9/h7, ease: 'power1.inOut' }, 0.32*0.9/h7); t.set({}, {}, 1); }
  closeOn = null; closeText(false, true);
}

// ---------- the close's words (v3-r3, review High 2) ----------
// The wordmark and both buttons stay hidden while the sphere becomes the mark, and come in once, over 300 ms, when the
// mark has formed (the close's p 0.42: the particles condensed at 0.36, the crisp mark full at 0.42). It runs on time,
// not on scroll, so a slow scroll, a flick past the close or a jump all show the same single fade. Scrolling back up
// under p 0.38 (a little hysteresis, so resting on the threshold never flickers) takes them away at once, before the
// sphere opens out again. The timelines below this never touch them, so nothing can show them early.
// v3-r5: CLOSE_IN is where the glowing mark has held for CLOSE_HOLD of a screen (measure); glow.k is the glow, 1 until
// the wordmark arrives, then down to 0 over 600 ms, ease-out; back to 1 at once on the way up
const CLOSE_HOLD = 0.06, glow = { k: 1 };   // round 6 (U42): the phoenix flies out as soon as the mark has formed (was 40vh of held mark)
const rest = { k: 1 };   // round 7 (review High 2): the field's own strength, 1 until the mark has formed, then 0 over 400 ms
let CLOSE_IN = 0.42, CLOSE_OUT = 0.38, h7 = 0.9;
let closeOn = null, closeLog = [];
// round 6 (U42, Yuan, approved by Tim Fri 9 Oct): the phoenix is the Glint. Once the sphere has become the mark, the
// phoenix flies out of it, loops and sweeps left to right over the mark and HEY HEY LABS; each letter appears as the bird
// passes (the Glint's light rides just behind its head), then the tagline and the actions fade in (300 ms). It all runs
// on a timer from the moment the mark forms, so a slow scroll, a flick past the close or a jump all see it once. Then the
// bird keeps flying (M40): a slow orbit in the open space above the lockup, never over the words. Desktop: the lockup side
// by side (U36), the sweep across the mark and the name; phones (stacked): the loop round the mark, the sweep across the
// name. Scrolling back up past the threshold takes the name, the tagline and the actions away at once, glow back on, and
// hands the bird back to its lap over 0.4 s.
const closeEls = () => [$('.close .tagline'), $('.close .actions')].filter(Boolean);
const glint = { k: 0, fx: null }, wmBase = () => $('.final .wm-box > .wm'), wmGlint = () => $('.final .wm-glint');
const fly = { on: false, t: 0, k: 0, path: null, done: false, words: false, last: null, bank: 0 };
let wmFront = null;   // the Glint's front on screen (CSS px) while the bird crosses the name: the word's veil stops there
function closeText(on, now = false){
  if (on === closeOn) return; closeOn = on;
  const els = closeEls(), base = wmBase(); if (!els.length || !gsap) return;
  closeLog.push({ on, t: Math.round(performance.now()) }); if (closeLog.length > 50) closeLog.shift();
  gsap.killTweensOf([glint, glow, rest, ...els, base].filter(Boolean));
  if (now || !on) { gsap.set([...els, base].filter(Boolean), { opacity: on ? 1 : 0, overwrite: true }); gsap.set(glow, { k: on ? 0 : 1, overwrite: true });
    rest.k = on ? 0 : 1;   // round 7: back up past the threshold the field returns at once
    glint.k = on ? 1 : 0; glint.fx = null; wmFront = null; fly.on = false; fly.done = !!on; fly.words = !!on; drawGlint(); return; }
  gsap.set([...els, base].filter(Boolean), { opacity: 0 });
  gsap.to(glow, { k: 0, duration: 0.6, ease: 'power2.out', overwrite: true });
  // round 7 (review High 2, B57): the mark has formed, so the field's particles leave over 400 ms and only the vector t01
  // artwork remains at rest (the bird is not in the field: it flies on)
  gsap.to(rest, { k: 0, duration: 0.4, ease: 'power1.out', overwrite: true });
  fly.on = true; fly.t = 0; fly.path = null; fly.done = false; fly.words = false; glint.k = 0; glint.fx = null;
}
// the flight's path, from the lockup as it sits: pieces of Catmull-Rom spline through screen points, timed by arc length
function crPt(P, i, u){ const a = P[Math.max(0, i - 1)], b = P[i], c = P[Math.min(P.length - 1, i + 1)], d = P[Math.min(P.length - 1, i + 2)];
  const u2 = u*u, u3 = u2*u, f = (p0, p1, p2, p3) => 0.5*(2*p1 + (-p0 + p2)*u + (2*p0 - 5*p1 + 4*p2 - p3)*u2 + (-p0 + 3*p1 - 3*p2 + p3)*u3);
  return [f(a[0], b[0], c[0], d[0]), f(a[1], b[1], c[1], d[1])]; }
function sampled(P){ const pts = [P[0].slice()], acc = [0];
  for (let i = 0; i < P.length - 1; i++) for (let j = 1; j <= 24; j++) { const q = crPt(P, i, j/24), l = pts[pts.length - 1];
    acc.push(acc[acc.length - 1] + Math.hypot(q[0] - l[0], q[1] - l[1])); pts.push(q); }
  return { pts, acc, L: acc[acc.length - 1] }; }
function along(S, s){ s = clamp(s, 0, S.L); let lo = 0, hi = S.acc.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S.acc[m] < s) lo = m; else hi = m; }
  const d = S.acc[hi] - S.acc[lo] || 1, u = (s - S.acc[lo])/d, a = S.pts[lo], b = S.pts[hi];
  return { x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u), dx: b[0] - a[0], dy: b[1] - a[1] }; }
function flyPath(){
  const m = rel($('.final .mark')), w = rel($('.final .wm-box')), lk = rel($('.final .lk')), stacked = getComputedStyle($('.final .lk')).flexDirection === 'column';
  const top = Math.max(rel(header).bottom, safeT) + 12, H = m.height, mc = [m.left + m.width/2, m.top + m.height/2];
  const W = wide ? clamp(w.width*0.42, 150, 230) : clamp(w.width*0.62, 110, 150);   // the bird's size across
  const room = Math.max(40, lk.top - top), wy = w.top + w.height/2 - W*0.1;   // the sweep's line: the bird's body along the name, its wings clear of the line under it
  // 1. out of the mark, up and over to the left, round a loop on the left that comes down into the sweep (a loop the
  // loop: up, back over, down and through), so the sweep runs left to right across the mark and the name (desktop) or
  // the name (phone, the mark above it). The loop's radius fits the room above the name and left of the lockup.
  const Lp = Math.max(28, Math.min(H*0.95, (wy - top - W*0.55)/2, ((stacked ? w.left + 0.3*H : m.left) - W*0.45 - 12)/(stacked ? 1.3 : 1.9)));
  const cx = stacked ? Math.max(w.left - 0.3*Lp, Lp + W*0.42) : m.left - 0.9*Lp, cy = wy - Lp;
  const out = [[mc[0], mc[1]], [mc[0] - 0.15*Lp, m.top - 0.35*Lp], [cx + 0.15*Lp, cy - Lp], [cx - Lp, cy], [cx, cy + Lp]];
  const sweep = [[cx, wy], [Math.max(cx + 8, stacked ? w.left : m.left), wy], [w.right + 0.5*Lp, wy]];
  // 3. up off the name's right end into the orbit: an ellipse over the lockup.
  // round 7 (review top fix 1): the orbit's path stays inside 12% to 40% of the screen's height, the bird's box inside the
  // frame (12 px in) and 12 px clear of the lockup. The box reaches up to about REACH times the bird's size across above
  // and below its place on the path (measured: tools/close-rest.mjs upK, downK), so where the room over the lockup is
  // short the bird circles smaller: a calm, distant bird over the name, never cut by the top edge, never over the words
  const REACH = 1.45, SWING = 4;
  const cLim = s => [Math.max(vh*0.12, 12 + REACH*s), Math.min(vh*0.40, lk.top - 12 - REACH*s)];
  let wo = W*0.62; while (wo > 24 && cLim(wo)[1] - cLim(wo)[0] < 2*SWING) wo -= 1;
  const [cA, cB] = cLim(wo), ry = clamp((cB - cA)/2, 0, Math.max(SWING, Math.min(0.3*Lp, room*0.12))), oy = cB >= cA ? (cA + cB)/2 : cA;
  const ox = lk.left + lk.width/2, rx = Math.max(40, Math.min(vw/2 - 12 - 1.1*wo, Math.max(lk.width/2 + 0.4*Lp, 120)));
  const box = [12, 12, vw - 12, lk.top - 12];   // the safety net: the engine's fit holds the bird inside it while it circles
  const rise = [sweep[2], [ox + rx + 0.2*Lp, wy - 0.5*Lp], [ox + rx, oy]];
  let A = sampled(out);
  { // the spline swings wider than its points: if the loop's top would put the bird's crest past the header, squash it
    const minY = Math.min(...A.pts.map(q => q[1])), lim = top + W*0.62;
    if (minY < lim) { const k = (wy - lim)/Math.max(1, wy - minY); A = sampled(out.map(([x, y]) => [x, wy - (wy - y)*k])); } }
  const B = sampled(sweep), C = sampled(rise);
  const v = B.L/(wide ? 1.0 : 0.95), vo = 2*Math.PI*Math.sqrt((rx*rx + ry*ry)/2)/14;   // the sweep in about a second; one orbit in 14 s
  const dA = 2*A.L/v, dB = B.L/v, dC = 2*C.L/(v + vo);
  return { A, B, C, dA, dB, dC, v, vo, W, wo, ox, oy, rx, ry, box, band: [+cA.toFixed(1), +cB.toFixed(1)], wx: [w.left, w.right], stacked };
}
function flyAt(F, t){   // where the bird is t s after the mark formed: { x, y, dx, dy, w, phase }
  if (t < F.dA) { const s = 0.5*F.v*t*t/F.dA, q = along(F.A, s); return { ...q, w: F.W*lerp(0.3, 1, smooth(0, F.dA*0.8, t)), phase: 0 }; }
  t -= F.dA;
  if (t < F.dB) { const q = along(F.B, F.v*t); return { ...q, w: F.W, phase: 1 }; }
  t -= F.dB;
  if (t < F.dC) { const a = (F.vo - F.v)/F.dC, q = along(F.C, F.v*t + 0.5*a*t*t); return { ...q, w: lerp(F.W, F.wo*0.9, smooth(0, F.dC, t)), phase: 2 }; }
  t -= F.dC;   // the orbit, anticlockwise on screen from its right end (up, over to the left, back under)
  const om = F.vo/Math.sqrt((F.rx*F.rx + F.ry*F.ry)/2), a = om*t;
  // round 7: a little smaller on the far (upper) half of the circle, so the flat orbit reads as circling
  return { x: F.ox + F.rx*Math.cos(a), y: F.oy - F.ry*Math.sin(a), dx: -F.rx*Math.sin(a), dy: -F.ry*Math.cos(a), w: F.wo*(0.9 - 0.1*Math.sin(a)), phase: 3 };
}
function flyFrame(dt){
  if (!hero || reduced) return;
  fly.k = clamp(fly.k + (fly.on ? dt/0.35 : -dt/0.4), 0, 1);
  if (!fly.on) { if (fly.k <= 0) { hero.setFly({ k: 0 }); fly.last = null; return; } }
  else { if (!fly.path) fly.path = flyPath(); fly.t += dt; }
  const F = fly.path; if (!F) { hero.setFly({ k: 0 }); return; }
  const q = flyAt(F, fly.t), hl = Math.hypot(q.dx, q.dy) || 1; fly.phase = q.phase;
  // a gentle bank from the turn: the heading's change, eased
  let bank = 0; if (fly.last) { const h0 = Math.atan2(fly.last.dy, fly.last.dx), h1 = Math.atan2(q.dy, q.dx); let d = h1 - h0; d = Math.atan2(Math.sin(d), Math.cos(d)); bank = clamp(-d/Math.max(dt, 1e-3)*0.12, -0.5, 0.5); }
  fly.bank = lerp(fly.bank, bank, 1 - Math.exp(-dt*6)); fly.last = q;
  hero.setFly({ k: smooth(0, 1, fly.k), x: q.x, y: q.y, dx: q.dx/hl, dy: q.dy/hl, w: q.w, bank: fly.bank });
  if (!fly.on) return;
  // the name: the Glint's front rides just behind the bird's head while it crosses, so each letter appears as it passes
  const head = q.x + (q.dx/hl)*q.w*0.32;
  if (q.phase === 1) { glint.fx = Math.max(glint.fx ?? -1e9, head); wmFront = glint.fx; drawGlint(); }
  if (q.phase >= 2 && !fly.done) {   // passed: the name at full ink, the Glint gone, then the tagline and the actions
    fly.done = true; glint.fx = null; glint.k = 1; wmFront = null; drawGlint();
    const base = wmBase(); if (base) base.style.opacity = '1';
    gsap.to(closeEls(), { opacity: 1, duration: 0.3, ease: 'power2.out', delay: 0.1 }); fly.words = true;
  }
}
window.__fly = () => ({ on: fly.on, t: +fly.t.toFixed(2), k: +fly.k.toFixed(2), done: fly.done, phase: fly.phase ?? null, at: fly.last && [+fly.last.x.toFixed(1), +fly.last.y.toFixed(1), +fly.last.w.toFixed(1)], front: wmFront && +wmFront.toFixed(1), d: fly.path && [fly.path.dA, fly.path.dB, fly.path.dC].map(v => +v.toFixed(2)),
  orbit: fly.path && { ox: +fly.path.ox.toFixed(1), oy: +fly.path.oy.toFixed(1), rx: +fly.path.rx.toFixed(1), ry: +fly.path.ry.toFixed(1), wo: +fly.path.wo.toFixed(1), W: +fly.path.W.toFixed(1), band: fly.path.band } });
// ---------- the Glint (W3, B62) ----------
// The name is drawn three times in one place (index.html): the plain word (shown once the light has passed), the full
// word behind the light's front (a mask that opens with it), and the light itself: a band carrying the phoenix's
// spectrum on its trailing edge into white by night, mineral pigments into wet indigo by day. Side by side (desktop) it
// runs from the spine rightwards; stacked (phone, ?close=centred) it opens from the centre out both ways. The mark's
// spine flares as the light gathers on it and leaves.
const NIGHT_HUES = ['#FF9DB0', '#FFD08A', '#9DF5C8', '#8FC8FF', '#B9A8FF'], DAY_HUES = ['#B9553F', '#C89B3C', '#3B8C73', '#2F5E9A', '#6D4C9A'];
const WM_VB = [-9, 57.5, 1354.71, 141], WM_INK = [-2.5, 1338.21];
function gStops(g, list){
  if (!g) return; const x0 = WM_VB[0], span = WM_VB[2]; let last = 0, html = '';
  for (const [x, a] of list) { const o = clamp((x - x0)/span, last, 1); last = o; html += `<stop offset="${o.toFixed(4)}" stop-color="#fff" stop-opacity="${a.toFixed(3)}"/>`; }
  if (g.innerHTML !== html) g.innerHTML = html;
}
function drawGlint(){
  const gs = wmGlint(), box = $('.final .wm-box'), lk = $('.final .lk'); if (!gs || !box || !lk) return;
  const night = theme() === 'dark', stacked = getComputedStyle(lk).flexDirection === 'column' && glint.fx === null;   // round 6: the bird's sweep runs left to right on a phone too
  let k = glint.k;
  const b = stacked ? 110 : 200, SG = $('#glS'), light = $('.final .gl-light');
  const hues = night ? NIGHT_HUES : DAY_HUES, tip = night ? '#FFFFFF' : '#2E3A66', X1 = WM_VB[0] + WM_VB[2];
  let F, G, html = '';
  if (!stacked) {
    const r = box.getBoundingClientRect(), m = markBox(true), sx = WM_VB[0] + (m.lx - r.left)/Math.max(1, r.width)*WM_VB[2];
    let f = lerp(sx, WM_INK[1] + b, k);
    // round 6 (U42): while the bird crosses, the front is just behind its head (k follows it, for the light's fade)
    if (glint.fx !== null) { const s0 = Math.min(sx, WM_INK[0] - b*0.2); f = WM_VB[0] + (glint.fx - r.left)/Math.max(1, r.width)*WM_VB[2]; k = clamp((f - s0)/(WM_INK[1] + b - s0), 0.001, 0.999); }
    F = [[WM_VB[0], 1], [f - b, 1], [f, 0], [X1, 0]];
    G = [[WM_VB[0], 0], [f - b, 0], [f - b*0.35, 1], [f + b*0.12, 0], [X1, 0]];
    SG.setAttribute('x1', (f - b).toFixed(1)); SG.setAttribute('x2', f.toFixed(1));
    hues.forEach((h, i) => { html += `<stop offset="${(i/(hues.length + 1)).toFixed(3)}" stop-color="${h}"/>`; });
    html += `<stop offset="0.82" stop-color="${tip}"/><stop offset="1" stop-color="${tip}"/>`;
  } else {
    const c = (WM_INK[0] + WM_INK[1])/2, d = ((WM_INK[1] - WM_INK[0])/2 + b)*k;
    F = [[WM_VB[0], 0], [c - d, 0], [c - d + b, 1], [c + d - b, 1], [c + d, 0], [X1, 0]];
    G = [[WM_VB[0], 0], [c - d - b*0.12, 0], [c - d + b*0.35, 1], [c - d + b, 0], [c + d - b, 0], [c + d - b*0.35, 1], [c + d + b*0.12, 0], [X1, 0]];
    SG.setAttribute('x1', (c - d).toFixed(1)); SG.setAttribute('x2', (c + d).toFixed(1));
    const e = clamp(b/Math.max(1, 2*d), 0, 0.5); html = `<stop offset="0" stop-color="${tip}"/>`;
    [...hues].reverse().forEach((h, i) => { html += `<stop offset="${(e*0.18 + e*0.8*(i + 1)/(hues.length + 1)).toFixed(4)}" stop-color="${h}"/>`; });
    html += `<stop offset="${e.toFixed(4)}" stop-color="${tip}"/><stop offset="${(1 - e).toFixed(4)}" stop-color="${tip}"/>`;
    hues.forEach((h, i) => { html += `<stop offset="${(1 - e + e*0.8*(i + 1)/(hues.length + 1)).toFixed(4)}" stop-color="${h}"/>`; });
    html += `<stop offset="1" stop-color="${tip}"/>`;
  }
  if (SG.innerHTML !== html) SG.innerHTML = html;
  gStops($('#glFG'), F); gStops($('#glBG'), G);
  gs.style.opacity = k > 0 && k < 1 ? '1' : '0';
  if (light) { light.style.opacity = (smooth(0, 0.08, k)*(1 - smooth(0.9, 1, k))).toFixed(3); light.setAttribute('filter', 'url(#glHalo)'); }   // by night a halo of light, by day the pigment bleeding into the paper like wet ink
  const sp = $('.final .mark-spark');
  if (sp) { const m = markBox(true), L = rel(lk);
    sp.style.left = (m.lx - L.left - 1).toFixed(1) + 'px'; sp.style.top = (m.lt - L.top).toFixed(1) + 'px'; sp.style.height = (m.lb - m.lt).toFixed(1) + 'px';
    sp.style.opacity = (fly.on && !fly.done ? smooth(0, 0.15, fly.t)*(1 - smooth(0.35, 0.8, fly.t)) : 0).toFixed(3); }   // round 6: the spine flares as the bird leaves it
}
window.__glint = () => ({ glow: +glow.k.toFixed(3), glint: +glint.k.toFixed(3), closeIn: +CLOSE_IN.toFixed(3) });
window.__close = () => ({ on: closeOn, log: closeLog.slice() });

// ---------- the light kept off every word ----------
const TEXT = '.hero-words h1, .hero-words .standfirst, .hero-words .actions > *, .top .brand, .top .talk, .top .mode, '
  + '.stage h2, .stage .body, .layers li, .facts li, .platform h3, .certs, .gc-logo, .text-link, .band-names b, .band-names i, .final .wm-box, .close .line, .close .tagline, '
  + '.close .actions > *, .foot .legal, .foot .prod, .steps li, .orbit-hint';
let textEls = [];
// v3-r5: an element's opacity as drawn: its own and its ancestors' inline opacity, times the exit order's factors
// (--t, --g, --b on .op elements, page.css)
const fac = (s, k) => { const v = s.getPropertyValue(k); return v === '' ? 1 : +v; };
function shown(el){ let o = 1; for (let e = el, i = 0; e && i < 6; e = e.parentElement, i++) { const s = e.style; if (s.visibility === 'hidden') return 0;
  if (s.opacity !== '') o *= +s.opacity; if (e._op) o *= fac(s, '--t')*fac(s, '--g')*fac(s, '--b'); } return o; }
// Text is kept clear line by line (v3-precision): a heading or a paragraph gives one rectangle per line of type, so the
// art shows beside a short line instead of behind a box; controls give their own box. At most 24 (the shader's limit);
// past that, a block's lines merge into one box.
const LINEWISE = 'h1, h2, .standfirst, .body, .layers li, .steps li, .close .line, .legal, .band-names b, .band-names i, .platform h3, .certs';
function lineRects(el){
  const r = document.createRange(); r.selectNodeContents(el);
  const lines = [];
  for (const q of r.getClientRects()) {
    if (q.width < 1 || q.height < 1) continue;
    const L = lines.find(l => Math.abs(l.t - q.top) < q.height*0.5 && Math.abs(l.b - q.bottom) < q.height*0.5 + 4);
    if (L) { L.l = Math.min(L.l, q.left); L.r = Math.max(L.r, q.right); L.t = Math.min(L.t, q.top); L.b = Math.max(L.b, q.bottom); }
    else lines.push({ l: q.left, r: q.right, t: q.top, b: q.bottom });
  }
  return lines;
}
function hideRects(){
  const out = [], H = innerHeight;
  for (const el of textEls) {
    const b = el.getBoundingClientRect();
    if (b.bottom < -16 || b.top > H + 16 || !b.width || b.width < 2 || shown(el) < 0.05) continue;
    if (el.matches('.band-names i') && !el.parentElement.classList.contains('lit')) continue;   // only the lit callout's line shows
    if (el.matches('.orbit-hint') && !el.classList.contains('on')) continue;
    const pad = el.closest('.band-names') ? 8 : el.matches('h1, h2') ? 14 : 12;
    // v3-r3: each line's veil carries the line's own opacity, so a veil fades in and out with its words (no pop)
    const a = Math.min(1, shown(el));
    if (el.matches(LINEWISE)) {
      const ls = lineRects(el);
      if (ls.length && out.length + ls.length <= 22) { for (const l of ls) if (l.b > -16 && l.t < H + 16) out.push([l.l - pad, l.t - pad + 2, l.r + pad, l.b + pad - 2, a]); continue; }
    }
    const q = [b.left - pad, b.top - pad + 2, b.right + pad, b.bottom + pad - 2, a];
    if (wmFront !== null && el.matches('.final .wm-box')) { q[2] = Math.min(q[2], wmFront - 24); if (q[2] <= q[0] + 2) continue; }   // round 6: only the letters already in
    if (el.matches('.top .brand')) q.brand = true;
    out.push(q);
    if (out.length >= 24) break;
  }
  return out.slice(0, 24);
}

// ---------- the bird's flight bounds ----------
// The screen 48 px in from every edge (below the status bar's inset), then 64 px clear of each text block on screen,
// on the side of it away from the sphere; in the hero, also under the header. Where the sphere runs off an edge the bird
// may follow it out of the frame there, as a camera this close would lose it, and come back.
const COLS = '.hero-words, .stage .words, .close .final .wm-box, .close .line, .close .tagline, .close .actions, .foot, .band-names > span';
let colEls = [];
function flightBox(frame){
  const E = 48, C = 64, H = innerHeight;
  let x0 = E, y0 = E + safeT, x1 = vw - E, y1 = H - E;
  const [ox, oy, rr] = frame;
  if (ox + rr > vw + 2) x1 = vw + rr*2;
  if (ox - rr < -2) x0 = -rr*2;
  for (const el of colEls) {
    const b = el.getBoundingClientRect();
    if (!b.width || b.bottom < 0 || b.top > H || b.right < 0 || b.left > vw || shown(el) < 0.05) continue;
    if (el.matches('.band-names > span') && (+el.style.opacity || 0) < 0.05) continue;
    const g = [ox - b.right, b.left - ox, oy - b.bottom, b.top - oy], m = Math.max(...g);
    if (m <= 0) continue;
    const i = g.indexOf(m);
    if (i === 0) x0 = Math.max(x0, b.right + C); else if (i === 1) x1 = Math.min(x1, b.left - C);
    else if (i === 2) y0 = Math.max(y0, b.bottom + C); else y1 = Math.min(y1, b.top - C);
  }
  // round 7 (review High 1): on a desktop the stack section's blocks count too, so the bird stays 64 px off its words
  if (wide) for (const b of stackBoxes()) {
    const g = [ox - b.right, b.left - ox, oy - b.bottom, b.top - oy], m = Math.max(...g); if (m <= 0) continue;
    const i = g.indexOf(m);
    if (i === 0) x0 = Math.max(x0, b.right + C); else if (i === 1) x1 = Math.min(x1, b.left - C);
    else if (i === 2) y0 = Math.max(y0, b.bottom + C); else y1 = Math.min(y1, b.top - C);
  }
  const hb = rel(header).bottom; if (hb > 0) y0 = Math.max(y0, hb + 8);
  return [x0, y0, x1, y1];
}

// ---------- the stack section's words and the art (round 7, review High 1) ----------
// The stack (stack/, pasted after scene 3) is not a pinned scene: it scrolls by in the page's flow. Its blocks of copy
// (the heading, the lede, each logo row, each claim, the certifications) on or near the screen, this frame
const STACK_Q = '.stack-head h2, .stack-lede, .stack-row, .stack-claims > div, .stack-certs-h, .stack-certs li, .stack-fine';
let stackEls = [], stackMemo = { t: -1, list: [] };
function stackBoxes(){
  if (stackMemo.t === clock) return stackMemo.list;
  const H = innerHeight, list = [];
  for (const el of stackEls) { const b = el.getBoundingClientRect(); if (b.width < 1 || b.bottom < -240 || b.top > H + 240) continue; list.push(b); }
  stackMemo = { t: clock, list }; return list;
}
// Desktop: if any of the stack's words would come within STACK_GAP of the sphere's rim (the hand-over into scene 4,
// where the sphere grows into its next pose), the sphere moves right until they are clear: the least x for its centre
// that keeps every block's box STACK_GAP off the disc
function stackClear(fr){
  if (!wide || !fr) return fr;
  const R = fr[2]*silK, G = R + STACK_GAP; let cx = fr[0];   // the silhouette as drawn (silK, as stackFrame sizes it), so at rest it holds 78% exactly
  for (const b of stackBoxes()) {
    if (b.right > fr[0]) continue;   // the column is left of the sphere; nothing else to clear here
    const dy = Math.max(0, b.top - fr[1], fr[1] - b.bottom); if (dy >= G) continue;
    cx = Math.max(cx, b.right + Math.sqrt(G*G - dy*dy));
  }
  return cx === fr[0] ? fr : [cx, fr[1], fr[2]];
}
// The art layer's strength near the stack's words: the least distance from any of its blocks to the sphere's rim, its
// axis and the bird's box, as drawn last frame. Under 960 px the column is the screen's width, so the art cannot sit
// beside it: the sphere, the axis and the bird fade out over the last 80 px before any word comes within 48 px of them,
// stay out while the stack passes, and come back once its last word has gone by ("Good work, unfinished." arriving). On a
// desktop the layout keeps 64 px (stackClear, the flight box), so this only ever acts as a net: out by 48 px
const ART_MIN = 48;
let artK = 1;
// The art is judged where it is drawn last frame AND where it will be drawn this frame (the pose's frame, its axis
// upright through the centre, as the camera never rolls here; on a desktop the bird inside this frame's flight box), so a
// thrown scroll, where the words move a long way between two frames, never shows a frame of art over them
function stackArtK(fr, fb){
  if (!hero || reduced) return 1;
  const list = stackBoxes(); if (!list.length) return 1;
  const o = hero.silhouette, bb = hero.birdBox, ax = axisNow, shown = hero.birdState.shown > 0.05;
  const R = fr ? fr[2]*silK : 0, ext = fr ? clamp(fr[2]*0.08, 3, 36) : 0;   // the silhouette as drawn, as stackClear sizes it
  const fbOk = wide && fb && fb[2] - fb[0] > 8 && fb[3] - fb[1] > 8;
  const bird = fbOk ? { x0: fb[0], y0: fb[1], x1: fb[2], y1: fb[3] } : bb;
  const rr = (q, z) => Math.hypot(Math.max(0, q.x0 - z.x1, z.x0 - q.x1), Math.max(0, q.y0 - z.y1, z.y0 - q.y1));
  let d = 1e9;
  for (const b of list) {
    const q = { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom };
    d = Math.min(d, Math.max(0, distRectPt(q, o.x, o.y) - o.r));
    if (ax) d = Math.min(d, distRectSeg(q, ax));
    if (fr) { d = Math.min(d, Math.max(0, distRectPt(q, fr[0], fr[1]) - R), distRectSeg(q, [fr[0], fr[1] - R - ext, fr[0], fr[1] + R + ext])); }
    if (shown) { if (bb) d = Math.min(d, rr(q, bb)); if (bird && bird !== bb) d = Math.min(d, rr(q, bird)); }
  }
  return wide ? smooth(ART_MIN, STACK_GAP, d) : smooth(ART_MIN, ART_MIN + 80, d);
}
function setArtK(k){
  if (Math.abs(k - artK) < 0.002 && k !== 0 && k !== 1) return; artK = k;
  const v = k >= 0.999 ? '' : k.toFixed(3); canvas.style.opacity = v; svg.style.opacity = v;
}
window.__artK = () => artK;

// ---------- the axis (M33): the sphere's own line, pole to pole ----------
const NS = 'http://www.w3.org/2000/svg', svg = $('#spine');
// v3-r3 (review High 1): no rectangular holes. The axis fades out near words through a gradient laid along it: the same
// soft ellipse around each line of type as the canvas's veil, feathered over 160 px, so the line never ends in a cut
svg.innerHTML = '<defs><linearGradient id="spFade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1"></linearGradient><mask id="spMask" maskUnits="userSpaceOnUse" x="-50" y="-50" width="20000" height="20000"><rect x="-50" y="-50" width="20000" height="20000" fill="url(#spFade)"/></mask></defs><g class="spg" mask="url(#spMask)"></g>';
const spg = svg.querySelector('.spg'), spFade = svg.querySelector('#spFade');
const mkp = (cls) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', cls); spg.appendChild(p); return p; };
// One path, top to bottom along the axis, drawn with one stroke and one glow; the ticks mark the five bands where the
// axis crosses them (scene 2), the leaders join each band to its callout, the sparks rise along it (scene 3) and the
// pulse climbs it from the bottom pole to the top as the bird is reborn (scene 4)
const SP = { glow: mkp('sp-glow'), line: mkp('sp-line'), ticks: mkp('sp-ticks'), lead: mkp('sp-lead'), leadDot: mkp('sp-lead-dot'),
  sparks: mkp('sp-sparks'), pulse: mkp('sp-pulse') };
let holeRects = [], fadeKey = '';
function setHoles(rects){ holeRects = rects; }
// the veil's field at a point: 1 inside the ellipse around a line of type, falling to 0 over 160 px (hero.js veilOf)
const VEIL_F = 160;
function veilAt(x, y){
  let v = 0;
  for (const b of holeRects) {
    const cx = (b[0] + b[2])/2, cy = (b[1] + b[3])/2, ex = (b[2] - b[0])*0.625 + 6, ey = (b[3] - b[1])*0.625 + 6, qx = x - cx, qy = y - cy;
    const k0 = Math.hypot(qx/ex, qy/ey), a = b.length > 4 ? b[4] : 1;
    if (k0 <= 1) { v = Math.max(v, a); continue; }
    const d = k0*(k0 - 1)/Math.max(Math.hypot(qx/(ex*ex), qy/(ey*ey)), 1e-6);
    v = Math.max(v, (1 - smooth(0, VEIL_F, d))*a);
  }
  return v;
}
function fadeAlong(A0, A1){
  spFade.setAttribute('x1', f1(A0[0])); spFade.setAttribute('y1', f1(A0[1])); spFade.setAttribute('x2', f1(A1[0])); spFade.setAttribute('y2', f1(A1[1]));
  const N = 40; let key = '', html = '';
  for (let i = 0; i < N; i++) { const t = i/(N - 1), o = (1 - veilAt(lerp(A0[0], A1[0], t), lerp(A0[1], A1[1], t))).toFixed(2);
    key += o; html += `<stop offset="${t.toFixed(3)}" stop-color="#fff" stop-opacity="${o}"/>`; }
  if (key !== fadeKey) { fadeKey = key; spFade.innerHTML = html; }
}
const f1 = v => v.toFixed(1);
function spine(pose, seg, calm){
  if (!hero) return;
  const rt = pose.route, mk = rt.mark || 0;
  const sp = 1.6 + Math.max(0, pose.bandOff ? Math.max(pose.bandOff[0], -pose.bandOff[4]) : GAP*2)*pose.spread;   // round 6: the stack's own reach
  let T = hero.project([0, sp, 0]), B = hero.project([0, -sp, 0]);
  // v3-r4: across, the line stays on the sphere's own axis (the desktop close now slides the sphere from the page's axis
  // into the lockup's mark) and takes only the mark line's own offset from the mark's centre; along, it lands on the mark
  if (mk > 0) { const m = markBox(true), ox = (m.lx - m.cx)*mk; T = [T[0] + ox, lerp(T[1], m.lt, mk)]; B = [B[0] + ox, lerp(B[1], m.lb, mk)]; }
  // a centre line runs a little past the outline it measures: 8% of the radius (3 to 36 px), none at the close, where
  // the mark's own line spans its bands exactly
  const ext = clamp((pose.frame ? pose.frame[2] : 100)*0.08, 3, 36)*(1 - mk);
  const dx = T[0] - B[0], dy = T[1] - B[1], L0 = Math.hypot(dx, dy) || 1, ux = dx/L0, uy = dy/L0;
  const A0 = [T[0] + ux*ext, T[1] + uy*ext], A1 = [B[0] - ux*ext, B[1] - uy*ext], L = L0 + 2*ext;
  // the canvas's own pillar is clipped to this same segment (v3-r2, M33): no trail or stray of it ever leaves the axis
  if ((rt.vis ?? 1) < 0.05) hero.setAxis([-9e3, -9e3, -9e3, -9e3], 0.5);   // no axis at all (the phone's scene 6): no pillar either
  else hero.setAxis([A0[0], A0[1], A1[0], A1[1]], lerp(Math.max(3, (pose.frame ? pose.frame[2] : 100)*0.1), 1.5, mk));
  axisNow = (rt.vis ?? 1) < 0.05 ? null : [A0[0], A0[1], A1[0], A1[1]];
  const d = `M${f1(A0[0])} ${f1(A0[1])} L${f1(A1[0])} ${f1(A1[1])}`;
  fadeAlong(A0, A1);
  SP.line.setAttribute('d', d); SP.glow.setAttribute('d', d);
  // grown from the sphere's centre outward (the hero's first second)
  const g = clamp(rt.grow ?? 1, 0, 1);
  const dash = g >= 0.999 ? 'none' : g <= 0.001 ? `0 ${f1(L + 10)}` : `0 ${f1(L*(1 - g)/2)} ${f1(L*g)} ${f1(L + 10)}`;
  SP.line.style.strokeDasharray = SP.glow.style.strokeDasharray = dash;
  const dark = rt.dark || 0;
  // v3-r3 (M29): in light the axis is Graphite at 75%: this line at 50% over the canvas's own ink at 50% at most
  // (hero.js dayPil, 3 px wide, 8 px at the ends) gives 75% on the axis and 50% at its soft edges
  const op = (theme() === 'light' ? 0.5 : 0.3 + 0.22*(1 - calm))*(1 - 0.82*dark)*(rt.vis ?? 1);
  SP.line.style.opacity = op.toFixed(3);
  SP.glow.style.opacity = (theme() === 'light' ? 0 : 0.05*(1 - dark)*(rt.vis ?? 1)).toFixed(3);
  // ticks: the five bands where the axis crosses them (scene 2); on a desktop a hairline leader from each band's rim to
  // its callout
  let ticks = '', leads = '', dots = '';
  if (rt.ticks > 0.01) {
    for (let k = 0; k < 5; k++) { const y = bandY(pose, k), q = hero.project([0, y, 0]), tw = 3 + 7*pose.lit[k];
      ticks += `M${f1(q[0] - tw)} ${f1(q[1])} H${f1(q[0] + tw)} `;
      const Ld = leadOf[k];
      if (Ld) { leads += Math.abs(Ld[3] - Ld[1]) < 1.5 ? `M${f1(Ld[0])} ${f1(Ld[1])} H${f1(Ld[2])} `
        : `M${f1(Ld[0])} ${f1(Ld[1])} H${f1(Ld[2] - 20)} V${f1(Ld[3])} H${f1(Ld[2])} `; dots += `M${f1(Ld[0])} ${f1(Ld[1])} h0.01 `; } }
  }
  SP.ticks.setAttribute('d', ticks || 'M0 0'); SP.ticks.style.opacity = (op*(rt.ticks || 0)).toFixed(3);
  SP.lead.setAttribute('d', leads || 'M0 0'); SP.lead.style.opacity = ((rt.ticks || 0)*namesOn).toFixed(3);
  SP.leadDot.setAttribute('d', dots || 'M0 0'); SP.leadDot.style.opacity = SP.lead.style.opacity;
  // the sparks ride the axis between the poles only, rising (the dash pattern moves toward the path's start, the top)
  SP.sparks.setAttribute('d', `M${f1(T[0])} ${f1(T[1])} L${f1(B[0])} ${f1(B[1])}`);
  SP.sparks.style.opacity = ((rt.sparks || 0)*0.45*(rt.vis ?? 1)).toFixed(3); SP.sparks.style.strokeDashoffset = f1((clock*70) % 36);
  // the rebirth: one pulse of light climbs the axis from the bottom pole, where the phoenix fell, to the top, where the
  // fenghuang rises
  if (rt.pulse >= 0 && rt.pulse <= 1) {
    SP.pulse.setAttribute('d', `M${f1(B[0])} ${f1(B[1])} L${f1(T[0])} ${f1(T[1])}`);
    const pl = Math.max(40, L0*0.22);
    SP.pulse.style.strokeDasharray = `${f1(pl)} ${f1(L0 + pl*2 + 10)}`; SP.pulse.style.strokeDashoffset = f1(pl - (L0 + pl)*rt.pulse);
    SP.pulse.style.opacity = (Math.sin(Math.PI*rt.pulse)*(theme() === 'light' ? 0.75 : 0.55)).toFixed(3);
  } else SP.pulse.style.opacity = '0';
}

// ---------- scene 2's callouts: each band's name beside it, the lit one with its line, on a hairline leader ----------
const names = $$('.band-names > span'), leadOf = [null, null, null, null, null];
let namesOn = 0;
function placeNames(pose, on){
  namesOn = on;
  if (!hero || !on) { for (const s of names) { s.style.opacity = '0'; s.style.visibility = 'hidden'; } leadOf.fill(null); return; }
  const B = hero.basis, base = $('.band-names').getBoundingClientRect();
  const right = hero.project(B.r.map(v => v*1.6))[0];
  const xs = Math.max(right + (wide ? 40 : 14), 0);
  const top = safeT + 12; let prevB = -1e9;
  names.forEach((s, k) => {
    const y = bandY(pose, k), q = hero.project([0, y, 0]);
    const rim = hero.project(B.r.map(v => v*BAND_W[k]).map((v, i) => v + (i === 1 ? y : 0)))[0];
    const x = wide ? xs : Math.max(right, rim) + 14;
    const mw = Math.max(80, vw - x - (wide ? parseFloat(getComputedStyle(header).paddingLeft) || 64 : 12)); s.style.maxWidth = mw + 'px';
    const hh = s.querySelector('b').offsetHeight || 20, full = s.offsetHeight || hh, em = clamp(pose.lit[k], 0, 1);
    // round 6 (U40): only the active label keeps the room its line needs (the stack opens round it, so the line fits);
    // the others keep their name's; none starts above the end of the one before it
    const yy = Math.max(top, q[1] - hh/2, prevB + 10); prevB = yy + (em > 0.6 ? full : hh);
    s.style.transform = `translate(${f1(x - base.left)}px, ${f1(yy - base.top)}px)`;
    const a = on*smooth(0.4, 0.9, pose.spread);
    s.style.opacity = (a*(0.22 + 0.78*em)).toFixed(3);   // round 6 (U40): every name but the active one dimmed right down
    s.style.visibility = a > 0.01 ? 'visible' : 'hidden';
    s.classList.toggle('lit', pose.lit[k] > 0.6);
    leadOf[k] = wide && a > 0.05 ? [rim + 10, q[1], x - 12, yy + hh/2] : null;
  });
}

// ---------- stillness: calm while scrolling, full brightness when the page rests ----------
const level = { k: Q.get('calm') === '1' ? 0 : 1 };
let lastScroll = -1e9, resting = true;
const pinnedLevel = Q.get('calm') === '1' || Q.get('bright') === '1';
addEventListener('scroll', () => {
  lastScroll = performance.now();
  if (resting && !pinnedLevel) { resting = false; gsap && gsap.to(level, { k: 0, duration: 0.25, ease: 'power2.out', overwrite: true }); }
}, { passive: true });

// ---------- the orbit hint (hero only): under the sphere's lower left, clear of its light ----------
let hintDone = false; try { hintDone = localStorage.getItem('hhl-orbit-used') === '1'; } catch (e) {}
const finePtr = matchMedia('(pointer: fine)').matches;
// a mouse cannot pinch, and a plain wheel scrolls the page (the story runs on scroll), so a fine pointer is told only to drag
hint.textContent = finePtr ? 'Drag to turn' : 'Drag to turn, pinch to zoom';
if (finePtr && orbit) orbit.setAttribute('aria-label', 'The sphere and the phoenix. Drag to turn; arrow keys turn, plus and minus zoom, 0 resets.');
if (hero) hero.onFirstUse(() => { hintDone = true; hint.classList.remove('on'); try { localStorage.setItem('hhl-orbit-used', '1'); } catch (e) {} });
let hintSeen2 = false;
function placeHint(inHero){
  const o = hero && hero.sphere;
  // v3-r5 (review finding 5): on a phone, once the reader has reached scene 2 the hint does not come back this visit
  if (!wide && cur.n >= 2) hintSeen2 = true;
  if (!o || hintDone || hintSeen2 || !inHero || reduced || still !== null) { hint.classList.remove('on'); return; }
  let x, y;
  // v3-r5 (review finding 4): on a desktop the hint is centred on the sphere's centre line, under its bottom pole and
  // the axis's tip (where the axis meets the hint, the veil fades it out), kept on screen
  if (wide) { const w = hint.offsetWidth || 90, ax = axisNow ? axisNow[2] : o.x, tip = axisNow ? axisNow[3] : o.y + o.r;
    x = clamp(ax - w/2, 16, vw - w - 16); y = Math.min(Math.max(o.y + o.r + 22, tip + 10), innerHeight - 44); }
  else { x = 24; y = rel(header).bottom + 4; }
  const ink = inkOf(1);
  if (wide && ink && x < ink.x1 + 32) x = ink.x1 + 32;
  hint.style.left = Math.round(x) + 'px'; hint.style.top = Math.round(y) + 'px'; hint.classList.add('on');
}

// ---------- words never over the sphere (v3-r4, review High 2, M33) ----------
// Between scenes a stage's words scroll while the sphere moves to its next pose, so a block of copy could pass over the
// sphere or its axis (the phone's scene 4 to 5 hand-over, the desktop's "The same standard" rising past the sphere's
// edge). Each frame, every block of copy in a stage that is in transit gets an opacity from its distance to the sphere:
// the shell's silhouette (live, and the frame the pose asks for) and the axis line (a capsule 4 px either side). It
// fades out over the last CLEAR_F (80) px of approach and is gone before it touches; where a block's resting place is
// nearer than 80 px (a phone's words sit 16 px or more under the sphere), the fade takes the room there is, measured at
// its resting place against the resting pose, so the block is fully on screen the moment it settles (no pop). In a
// pinned scene's own hold nothing is faded: the layouts keep words clear there. Blocks are the copy's own containers,
// never an element a timeline animates, so the two opacities multiply.
const CLEAR_F = 80, AXIS_HW = 4;
let silK = SIL_K, axisNow = null, clearEls = [], clearLog = { worst: 1e9, n: 0 };
const CLEAR_Q = '.close-in > .line, .close .actions > *, .foot > *';   // v3-r5: scenes 1 to 6 run on the exit order below
function inkRect(el){
  const r = document.createRange(); r.selectNodeContents(el);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const q of r.getClientRects()) { if (q.width < 1 || q.height < 1) continue; x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }
  return x1 > x0 ? { x0, y0, x1, y1 } : null;
}
const distRectPt = (b, x, y) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
function distRectSeg(b, a){   // a rectangle to a segment: sampled (the axis is short and straight), 1 px or better
  const L = Math.hypot(a[2] - a[0], a[3] - a[1]), n = Math.max(2, Math.ceil(L/2));
  let d = 1e9; for (let i = 0; i <= n; i++) { const t = i/n; d = Math.min(d, distRectPt(b, lerp(a[0], a[2], t), lerp(a[1], a[3], t))); }
  return d;
}
function sphereParts(fr, k = SIL_K){   // a pose's frame as the sphere it draws: the silhouette and the axis with its tips
  const R = fr[2]*k, ext = clamp(fr[2]*0.08, 3, 36);
  return { disc: [fr[0], fr[1], R], axis: [fr[0], fr[1] - R - ext, fr[0], fr[1] + R + ext] };
}
function clearDist(b, parts){
  let d = 1e9;
  for (const pt of parts) {
    if (pt.disc) d = Math.min(d, Math.max(0, distRectPt(b, pt.disc[0], pt.disc[1]) - pt.disc[2]));
    if (pt.axis) d = Math.min(d, Math.max(0, distRectSeg(b, pt.axis) - AXIS_HW));
  }
  return d;
}
function hostOf(n){ return n === 1 ? S(1).el : (S(n).stage || S(n).el); }
function settledFrame(n, pose){   // the frame a scene's resting pose draws, in the coordinates of its settled stage
  const f = pose.frame.slice();
  if (n === 1) f[1] -= rel(S(1).el).top;   // the hero's framing is live (fitHero adds the scroll), the others settled
  return f;
}
// the distance rule for one block: 1 clear, falling to 0 as it reaches the sphere or the axis (see above). v3-r5: the
// shell and the axis are judged apart, each against its own resting distance; where a resting pose already brings one
// to the words (scene 5's push-in rests 6 px over them, its axis veiled where it meets them), that part only fades a
// block that comes nearer than it rests, so the words are not lost the moment their stage moves
function partDist(b, parts, kind){ let d = 1e9;
  for (const pt of parts) { if (kind === 'disc' && pt.disc) d = Math.min(d, Math.max(0, distRectPt(b, pt.disc[0], pt.disc[1]) - pt.disc[2]));
    if (kind === 'axis' && pt.axis) d = Math.min(d, Math.max(0, distRectSeg(b, pt.axis) - AXIS_HW)); }
  return d; }
function kOf(d, d0){
  if (d >= 1e8) return 1;
  if (d0 < 4) return d >= d0 - 0.5 ? 1 : clamp(d/Math.max(1, d0), 0, 1)*0.5;
  let k = clamp(d/clamp(d0*0.85, 1, CLEAR_F), 0, 1); return k*k*(3 - 2*k);
}
function clearK(el, n, live, restPose, hostTop, y){
  const b = inkRect(el);
  if (!b || b.y1 < -40 || b.y0 > innerHeight + 40) return 1;
  // its resting distance: the block where its stage settles, against the sphere of the pose it will rest in (the
  // scene's start if the story is before it, its end if after, the current moment if inside)
  if (!(n in restPose)) { const h = segs.find(x => x.kind === 'hold' && x.a === n);
    const rp = !h ? 0 : y < h.from ? 0 : y > h.to ? 1 : clamp((y - h.from)/Math.max(1, h.to - h.from), 0, 1);
    restPose[n] = sphereParts(settledFrame(n, POSES[n](rp)), silK); }
  const off = hostTop[n], bs = { x0: b.x0, x1: b.x1, y0: b.y0 - off, y1: b.y1 - off };
  const dd = partDist(b, live, 'disc'), da = partDist(b, live, 'axis');
  const k = Math.min(kOf(dd, partDist(bs, [restPose[n]], 'disc')), kOf(da, partDist(bs, [restPose[n]], 'axis')));
  if (k > 0.02) { clearLog.worst = Math.min(clearLog.worst, Math.min(dd, da)); clearLog.n++; }
  return k;
}

// ---------- the exit order (v3-r5, review findings 1 and 2) ----------
// Each scene's copy leaves and arrives as one group, in order: on the way out the body copy and the buttons reach 0
// before the headline starts to fade, and the headline leaves last; on the way in, the reverse. No copy ever shows
// without its heading. One number per scene, its presence P (0 to 1), decides it: the headline takes 2P (full until P
// falls under 0.5), the body 2P - 1 (gone by 0.5). P is the least of
//   K     the distance rule, over every block of the scene (a block touching the sphere or the axis makes P 0)
//   top   the headline's distance to the top edge (under the status bar): it fades over the last 40 px, so a headline
//         is never cut by the top of the screen, and the body under it has gone first
//   exit  on a phone, the scheduled exit of a scene's words in its hand-over (exitWin): the sphere rises with them
//         until then (phoneLift), so they leave in order, in the open, never squeezed against the art
// A button never rests at a partial opacity: it fades in or out over 120 ms (on time, not on scroll) to 1 while
// everything above it is at 0.98 or more, else to 0, and it is cut to 0 at once if that falls under 0.6.
const GROUP = {
  1: { heads: '.hero-words h1', rest: '.hero-words .standfirst', btns: '.hero-words .actions > *', geo: '.hero-words > :not(.vh)' },
  2: { heads: 'h2', rest: '.layer-swap', geo: '.words > :not(.vh)' },
  3: { heads: 'h2', rest: '.beats', inner: '.beats .text-link', geo: '.words > :not(.vh)' },
  4: { heads: '.swap h2', rest: '.swap .body', btns: '.swap .text-link', geo: '.words > :not(.vh)' },
  5: { heads: 'h2', rest: '.words > .body', geo: '.words > :not(.vh)' },
  6: { heads: 'h2', rest: '.step-track, .steps', geo: '.words > :not(.vh)' },
};
let groups = [], btnEls = [];
function buildGroups(){
  for (const g of groups) for (const el of [...g.heads, ...g.rest, ...g.btns]) { el.style.removeProperty('--g'); el.style.removeProperty('--b'); }
  groups = []; btnEls = [];
  if (reduced) return;
  const mark = el => { el._op = true; el.classList.add('op'); return el; };
  for (const n in GROUP) {
    const c = GROUP[n], host = +n === 1 ? S(1).el : S(+n).stage, q = sel => sel ? $$(sel, host).filter(e => !e.closest('.vh')) : [];
    const grp = { n: +n, heads: q(c.heads).map(mark), rest: q(c.rest).map(mark), btns: q(c.btns).map(mark), geo: q(c.geo), P: 1 };
    for (const el of grp.btns) { el._b = 1; el._g = true; btnEls.push(el); }
    for (const el of q(c.inner).map(mark)) { el._b = 1; el._g = false; btnEls.push(el); }
    groups.push(grp);
  }
}
// a phone's hand-over: the leaving words go by exitWin(g)[1], so that the next words arrive (their top 4% inside the
// screen's foot) at most 0.31 of a screen later; their body starts 0.12 of a screen before that
function exitWin(g){
  // where the next words come on screen: their top 4% inside the foot, carried up by the drift (wordDrift)
  const ink = g.b === 7 ? { y0: closeCapTop() } : inkOf(g.b), dr = drifts(g.b) ? driftK()*vh : 0, tIn = ink ? 1 - (vh*0.96 - ink.y0)/(vh - dr) : 0.66;
  const t1 = clamp(tIn - 0.31, 0.16, 0.42);
  return [t1 - 0.12, t1 - 0.05, t1];   // body out from [0] to [1], the headline from [1] to [2]
}
const lin = (a, b, x) => clamp((x - a)/Math.max(1e-6, b - a), 0, 1);
function placeWords(g, pose, y, t, dt){
  if (Q.get('clear') === '0') return;   // test hook: no clearance at all (the v3-r3 behaviour), for the before numbers
  const live = [];
  // v3-r5: the pose's frame at the silhouette's measured scale (the hero's camera draws it at 1.0 of the frame, the
  // stages' at about 1.04), so a sphere resting a few px above its words is not read as touching them
  if (hero && pose.frame) { const o = hero.silhouette; live.push({ disc: [o.x, o.y, o.r] }); live.push(sphereParts(pose.frame, silK)); }
  if (axisNow) live.push({ axis: axisNow });
  const restPose = {}, hostTop = {}, topLine = safeT + 4;
  // the close (scene 7): each block by the distance rule alone, as v3-r4 (its wordmark and buttons run on closeText)
  for (const el of clearEls) {
    const n = el._sc; if (!(n in hostTop)) hostTop[n] = rel(hostOf(n)).top;
    const settled = Math.abs(hostTop[n]) < 1 && g.kind === 'hold' && g.a === n;
    let k = settled || !live.length ? 1 : clearK(el, n, live, restPose, hostTop, y);
    // v3-r5: the close's buttons never rest at a partial opacity either: 120 ms to 1 or 0, cut at once under 0.6
    if (el._btn) { el._kb = k < 0.6 ? 0 : clamp((el._kb ?? 1) + Math.sign((k >= 0.95 ? 1 : 0) - (el._kb ?? 1))*dt/0.12, 0, 1); k = el._kb; }
    if (el._clr !== k) { el._clr = k; el.style.opacity = k >= 0.999 ? '' : k.toFixed(3); el.style.pointerEvents = k < 0.5 ? 'none' : ''; }
  }
  for (const grp of groups) {
    const n = grp.n; if (!(n in hostTop)) hostTop[n] = rel(hostOf(n)).top + ((S(n).words && S(n).words._dy) || 0);   // less the drift
    const settled = Math.abs(hostTop[n]) < 1 && g.kind === 'hold' && g.a === n;
    let P = 1;
    if (!settled) {
      if (live.length) for (const el of grp.geo) { P = Math.min(P, clearK(el, n, live, restPose, hostTop, y)); if (P <= 0) break; }
      grp.why = { K: P };
      // the headline in view (scene 4: the beat on screen) against the top edge
      let ht = 1e9;
      for (const h of grp.heads) { if (shown(h.parentElement) < 0.5 && grp.heads.length > 1) continue; const r = inkRect(h); if (r) ht = Math.min(ht, r.y0); }
      if (ht < 1e8) P = Math.min(P, lin(topLine, topLine + 40, ht));
      grp.why.top = ht;
      if ((!wide && (n <= 5 || (n === 6 && pins6()))) || (wide && n === 6 && Q.get('lift') !== '0')) { const sg = segs.find(x => x.kind === 'blend' && x.a === n), td = tOf(n);
        if (sg && td > 0) { const w = exitWin(sg); P = Math.min(P, 1 - 0.5*lin(w[0], w[1], td) - 0.5*lin(w[1], w[2], td)); } }
      // pinned scene 6 arrives only once scene 5's words have gone (never two scenes' words at once)
      if (n === 6 && pins6()) { const sg = segs.find(x => x.kind === 'blend' && x.a === 5), td = tOf(5);
        if (sg && td < 1) P = Math.min(P, lin(exitWin(sg)[2], exitWin(sg)[2] + 0.04, td)); }
    }
    grp.P = P;
    // v3-r5: on time, not on scroll, so nothing rests half-faded: the body and its buttons go to 1 while P is 0.8 or
    // more, else to 0, over 120 ms, and are cut to 0 at once under 0.55; the headline goes to 1 while P is 0.25 or
    // more, and is cut under 0.05. So the body has gone before the headline starts to leave, at any speed
    for (const el of grp.heads) setVar(el, '--g', timedQ(el, P, 0.25, 0.05, dt));
    for (const el of [...grp.rest, ...grp.btns]) setVar(el, '--g', timedQ(el, P, 0.8, 0.55, dt));
  }
  // the buttons' timed fade: to 1 while all above them is at 0.98 or more, else to 0, over 120 ms; under 0.6, cut to 0
  for (const el of btnEls) {
    let h = 1; for (let e = el, i = 0; e && i < 6; e = e.parentElement, i++) { const s = e.style; if (s.opacity !== '') h *= +s.opacity;
      if (e._op) h *= fac(s, '--t')*(e === el ? 1 : fac(s, '--g')*fac(s, '--b')); }
    if (el._g) h *= fac(el.style, '--g');
    const goal = h >= 0.98 ? 1 : 0;
    // after a jump the story glides for 120 ms; a button then takes its state at once, so the copy is resolved in 150 ms
    el._b = h < 0.6 ? 0 : glide ? goal : clamp(el._b + Math.sign(goal - el._b)*dt/0.12, 0, 1);
    setVar(el, '--b', el._b*el._b*(3 - 2*el._b));
    const eff = h*el._b; el.style.pointerEvents = eff < 0.5 ? 'none' : '';
  }
}
function timedQ(el, P, on, cut, dt){
  const goal = P >= on ? 1 : 0, q = el._q ?? 1;
  el._q = P < cut ? 0 : glide ? goal : clamp(q + Math.sign(goal - q)*dt/0.12, 0, 1);
  return el._q*el._q*(3 - 2*el._q);
}
function setVar(el, k, v){ v = v >= 0.999 ? 1 : v <= 0.001 ? 0 : +v.toFixed(3); const key = '_v' + k; if (el[key] === v) return; el[key] = v;
  if (v === 1) el.style.removeProperty(k); else el.style.setProperty(k, String(v)); }
window.__clear = () => ({ ...clearLog, faded: clearEls.filter(e => e._clr < 0.999).length, groups: groups.map(g => [g.n, +g.P.toFixed(3), g.why]) });
// round 7 test hook (tools/stack-clear.mjs, close-rest.mjs, rebirth-contrast.mjs): the art as drawn this frame, in CSS px:
// the sphere's silhouette, its axis line, the bird's box and flight box, and the art layer's opacity
window.__art = () => { if (!hero) return null; const o = hero.silhouette, b = hero.birdBox, f = hero.flight;
  return { disc: [o.x, o.y, o.r], axis: axisNow ? axisNow.slice() : null, bird: b ? [b.x0, b.y0, b.x1, b.y1] : null, flight: f,
    shown: hero.birdState.shown, op: +getComputedStyle(canvas).opacity, spineOp: +getComputedStyle(svg).opacity, dim: hero.dimNow ?? null }; };

// ---------- a fast jump (v3-r5, review finding 2) ----------
// The story trails the page by a light 0.3 s scrub. When the page and the story are more than a screen apart (a jump, a
// thrown scroll, a tap on the status bar), the story stops trailing: it glides to the page's position in 120 ms, eased
// out, so the copy there is resolved (and its buttons have run their 120 ms fade) within 150 ms, all at once.
const JUMP = 1, GLIDE_MS = 120;
let glide = null;
function storyY(now){
  const target = scrollY, at = g => lerp(g.from, g.to, 1 - Math.pow(1 - Math.min(1, (now - g.t0)/GLIDE_MS), 3));
  let ys = glide ? at(glide) : proxy.y;
  if (!glide && Math.abs(target - ys) > vh*JUMP) glide = { from: ys, to: target, t0: now };
  else if (glide && Math.abs(target - glide.to) > 0.5) glide = { from: ys, to: target, t0: now };
  if (glide) {
    if (scrub && scrub.getTween()) scrub.getTween().progress(1);
    ys = at(glide);
    if (now - glide.t0 >= GLIDE_MS) { glide = null; proxy.y = ys = target; }
  }
  return ys;
}
window.__glide = () => glide;

// ---------- a phone's hand-over (v3-r5, review finding 4, M25) ----------
// A phone's words rest under the sphere, so leaving words would have to cross it. Instead the sphere rises with them:
// its lowest point (the silhouette and the axis's tip) keeps its resting distance above the leaving words while they
// rise, the sphere drawing back (to 0.6 of its size at most) rather than leaving the top of the screen. The words go in
// order at exitWin, then the sphere eases into the next pose over 0.4 of a screen. Arriving words are kept clear the
// same way: the sphere stays at least its resting distance above them as they come up.
const bottomOf = fr => fr[1] + fr[2]*SIL_K + clamp(fr[2]*0.08, 3, 36);
function fitUnder(fr, C, rMin){
  if (bottomOf(fr) <= C + 0.5) return fr;
  const q = SIL_K + 0.08, R = Math.max(rMin, Math.min(fr[2], (C - (safeT + 4))/(2*q)));
  return [fr[0], C - R*SIL_K - clamp(R*0.08, 3, 36), R];
}
function fitOver(fr, Ct, rMin){   // the sphere's top (the axis's tip) at Ct or below, shrinking toward the foot if it must
  const top = fr[1] - fr[2]*SIL_K - clamp(fr[2]*0.08, 3, 36); if (top >= Ct - 0.5) return fr;
  const q = SIL_K + 0.08, R = Math.max(rMin, Math.min(fr[2], (innerHeight - 16 - Ct)/(2*q)));
  return [fr[0], Ct + R*SIL_K + clamp(R*0.08, 3, 36), R];
}
const mixFrame = (x, y, t) => [lerp(x[0], y[0], t), lerp(x[1], y[1], t), Math.exp(lerp(Math.log(x[2]), Math.log(y[2]), t))];
function phoneLift(g, t, fr){
  let out = fr;
  if (Q.get('lift') === '0') return fr;   // test hook: the v3-r4 hand-over, for the before numbers
  // the words' own positions on screen (the page's scroll, not the story's trailing one): the sphere follows them exactly
  if (g.a <= 5) {
    const rest = settledFrame(g.a, POSES[g.a](1)), w = exitWin(g), td = tOf(g.a);
    // 10 px higher than at rest as the stage starts to move: the frame's model of the outline is a few px off the drawn
    // one for the largest spheres (scene 5's push-in), and the words must never come nearer than they rest
    const C = bottomOf(rest) + Math.max(rel(hostOf(g.a)).top, -w[2]*vh) - 10*lin(0, 0.02, td);
    out = mixFrame(fitUnder(fr, C, rest[2]*0.45), fr, smooth(w[2], Math.min(1, w[2] + 0.4), td));
  }
  if (drifts(g.b)) { const rest = settledFrame(g.b, POSES[g.b](0)); out = fitUnder(out, bottomOf(rest) + Math.max(0, rel(hostOf(g.b)).top + (S(g.b).words._dy || 0)), rest[2]*0.45); }
  // pinned scene 6 (words at the top): the sphere goes under them, 40 px clear, once scene 5's words have gone (5 to 6),
  // and stays under them until they have gone (6 to 7)
  if (pins6() && (g.b === 6 || g.a === 6)) {
    const ink = inkOf(6), Ct = (ink ? ink.y1 : 0) + 40;
    let k;
    if (g.b === 6) { const w = exitWin(g); k = smooth(w[2], w[2] + 0.12, tOf(5)); }
    else { const w = exitWin(g); k = 1 - smooth(w[2], Math.min(1, w[2] + 0.3), tOf(6)); }
    if (k > 0) out = mixFrame(out, fitOver(out, Ct, out[2]*0.45), k);
  }
  return out;
}
// The arriving words drift: on a phone, while their stage comes up, they ride DRIFT (0.32) of a screen above their place
// and close that up as the stage settles (they rise at 0.68 of the page's speed), so they come on screen sooner and the
// stretch with no words between two scenes stays under 0.35 of a screen. Scenes 2 to 5 only (words under the sphere).
// On a desktop (words beside the sphere, nothing to cross) the arriving words of scenes 2 to 6 drift 0.25 of a screen.
const DRIFT = 0.32, DRIFT_D = 0.25;
const drifts = n => Q.get('lift') !== '0' && (wide ? n >= 2 && n <= 6 : n >= 2 && n <= 5);
const driftK = () => wide ? DRIFT_D : DRIFT;
// Scene 6's words rest at the TOP of a phone's screen, over the sphere (v3-r3), so as its stage came up from the foot
// they would have to cross the sphere. Instead they are pinned: while scene 6's stage comes in (and while it leaves),
// its words hold their resting place on the screen, and the stage lets them show outside its box for that time
const pins6 = () => !wide && Q.get('lift') !== '0';
function wordDrift(){
  for (let n = 2; n <= 5; n++) {
    const w = S(n).words; if (!w) continue;
    const td = tOf(n - 1), dy = drifts(n) && td > 0 && td < 1 ? -driftK()*vh*(1 - td) : 0;
    if (w._dy !== dy) { w._dy = dy; w.style.transform = dy ? `translate3d(0, ${dy.toFixed(1)}px, 0)` : ''; }
  }
  const w6 = S(6).words, st6 = S(6).stage; if (!w6 || !st6) return;
  // scene 6: a phone pins its words coming in and going out; a desktop drifts them in, and pins them going out (to the
  // close, whose line comes late in its stage)
  const a = tOf(5), b = tOf(6);
  const dy = pins6() && ((a > 0 && a < 1) || (b > 0 && b < 1)) ? -rel(st6).top
    : wide && Q.get('lift') !== '0' && b > 0 && b < 1 ? -rel(st6).top
    : drifts(6) && a > 0 && a < 1 ? -driftK()*vh*(1 - a) : 0;
  if (w6._dy !== dy) { w6._dy = dy; w6.style.transform = dy ? `translate3d(0, ${dy.toFixed(1)}px, 0)` : ''; st6.style.overflow = dy ? 'visible' : ''; }
}
// how far the page (not the story) is through the hand-over from scene n to the next: 0 before it, 1 after
function tOf(n){ const sg = segs.find(x => x.kind === 'blend' && x.a === n); return sg ? lin(sg.from, sg.to, scrollY) : 0; }

// ---------- the frame ----------
const proxy = { y: scrollY };
let scrub = null, intro = still !== null ? 1 : 0, lastNow = performance.now(), frameMs = [], cur = { n: 1, p: 0 }, bzOn = false;
function update(){
  const now = performance.now(), dt = Math.min(0.1, (now - lastNow)/1000); lastNow = now; clock += dt;
  frameMs.push(dt*1000); if (frameMs.length > 240) frameMs.shift();
  intro = Math.min(1, intro + dt/1.6);
  if (!pinnedLevel && !resting && now - lastScroll > 140) { resting = true; gsap.to(level, { k: 1, duration: 0.6, ease: 'power2.out', overwrite: true }); }
  const y = jumpY !== null ? jumpY : storyY(now);
  const { g, t } = where(y);
  const inHero = g.kind === 'hold' && g.a === 1 && y < 4;
  if (g.kind === 'hold' && g.a === 1 && hero) heroCam = { ...hero.getCamera(), dist: hero.getCamera().dist };
  let pose, sceneN, p;
  if (hero && (g.kind === 'hold' && g.a === 1)) takeAnchor(hero.simTime);
  if (g.kind === 'hold') { sceneN = g.a; p = t; pose = POSES[g.a](t); }
  else { const e = ((wide && Q.get('lift') !== '0' && BLEND_D[g.a]) || BLEND[g.a] || BLEND.std)(t); sceneN = e < 0.5 ? g.a : g.b; p = sceneN === g.a ? 1 : 0;
    pose = mix(POSES[g.a](1), POSES[g.b](0), e); }
  pose.vis = 1;
  if (!wide && g.kind === 'blend' && pose.frame) pose.frame = phoneLift(g, t, pose.frame);
  pose = camera.apply(pose, g, t, vw, innerHeight);   // v3-r5: the close-ups on the phoenix in the hand-overs (camera.js)
  if (wide && pose.frame) pose.frame = stackClear(pose.frame);   // round 7 (review High 1): never within 64 px of the stack's words
  // M40: the bird keeps flying where the reader stops: the held loop drifts 0.6 s either way along the lap on an 8 s
  // swell (not in the rebirth's own moment or the close)
  if (pose.loopT !== null && pose.loopT !== undefined && !(sceneN === 4 && p > 0.2 && p < 0.8)) pose.loopT += (sceneN === 7 ? 1.6 : 0.6)*Math.sin(clock*2*Math.PI/8);   // round 6: the close too, wider there (round the small sphere the lap is short on screen)
  cur = { n: sceneN, p: +p.toFixed(3), seg: g.kind, t: +t.toFixed(3) };
  if (!reduced) wordDrift();
  // v3-r3: a scene's timeline is at 0 up to and including its first pixel (it read 1 exactly at the boundary, the flash)
  for (const n in TL) { const s = S(+n); TL[n].progress(g.kind === 'hold' && g.a === +n ? t : (y <= s.top ? 0 : 1)); }
  if (!reduced) { const h7 = segs.find(x => x.kind === 'hold' && x.a === 7);
    if (h7) { const p7 = y <= h7.from ? -1 : clamp((y - h7.from)/Math.max(1, h7.to - h7.from), 0, 1);
      if (closeOn !== true && p7 >= CLOSE_IN) closeText(true); else if (closeOn !== false && p7 < CLOSE_OUT) closeText(false); } }
  // scene 6: the active step (the phone's track and its bar; the desktop's lit step), from the same p as its timeline
  { const sec = S(6), act = sceneN === 6 ? (p < 0.25 ? 0 : p < 0.49 ? 1 : p < 0.73 ? 2 : 3) : (y > sec.top ? 3 : 0);
    if (act !== stepOn) { stepOn = act; stepLis.forEach((li, i) => li.classList.toggle('on', i === act));
      trackSpans.forEach((sp, i) => sp.classList.toggle('on', i === act)); placeBar(); } }
  placeSteps(y);
  // a control while its words are faded out cannot be clicked by accident (it can still be focused: see MOMENT)
  for (const el of fadeEls) { const o = el.style.opacity; el.style.pointerEvents = o !== '' && +o < 0.5 ? 'none' : ''; }
  if (hero) {
    const calm = level.k, P2 = { ...pose, dim: pose.dim*lerp(0.72 + 0.28*calm, 1, pose.steady || 0), cap: 0.84,
      fieldK: rest.k,   // round 7 (review High 2): at the close, once the mark has formed, only the vector mark remains
      guard: clamp((pose.closeUp || 0)*3, 0, 1) };   // round 7 (review High 4): in a close-up the bird's light stays off every word
    if (inHero) delete P2.cam;
    if (Q.get('bird') === '0') P2.bird = 0;   // test hook (tools/axis-ink.mjs): the field and the axis alone
    hero.setPose(P2);
    placeNames(pose, g.kind === 'hold' && g.a === 2 ? smooth(0, 0.04, t)*(1 - smooth(0.96, 1, t)) : 0);
    flyFrame(dt);   // round 6 (U42): the phoenix's flight at the close, on its own timer
    // a close camera crops the bird; the close's flight has its own path, and while it circles (round 7) its own box
    const fb = pose.frame ? ((pose.closeUp || 0) > 0.02 ? null : fly.k > 0 ? (fly.on && fly.phase === 3 && fly.path ? fly.path.box : null) : flightBox(pose.frame)) : null;
    if (pose.frame) hero.setFlight(fb);
    setArtK(stackArtK(pose.frame, fb));   // round 7 (review High 1): the art out of the way of the stack's words
    hero.setParallax(inHero);
    hero.setInteractive(inHero && !reduced);
    if (g.a === 1 && (g.kind === 'hold' || t < 0.5)) {
      const top = Math.max(rel(header).bottom - 8, 0);
      // the hero's light: right of the words on a desktop (and off the right edge, where the sphere bleeds); under the
      // header and above the words on a phone
      if (wide) { const ink = inkOf(1), xl = (ink ? ink.x1 : vw*0.45) + 56;
        hero.setBox(xl - 400*(1 - (inHero ? 1 : 0)), top - 400*(inHero ? 0 : 1), vw + 600, innerHeight + 400, 160); }
      // v3-r3: every edge of the hero's light box feathers over 160 px, like the words' veil: no straight cut
      else { const wt = rel(heroWords).top; hero.setBox(-400, inHero ? top + 12 : -400, vw + 400, inHero ? wt - 16 : innerHeight + 400, 160); }
    } else hero.setBox(-400, -400, vw + 600, innerHeight + 400, pose.feather ?? 40);
    placeWords(g, pose, y, t, dt);
    const hr = hideRects(); hero.setHide((pose.behind || 0) > 0.9 ? [] : hr); setHoles(hr.filter(q => !q.brand));
    spine(pose, g, calm);
    hero.frame(now);
    // round 7 (review top fix 2): by day the white reveal burns the paper's grain away round the bird (page.css
    // body::after), so the paper there is #FFFFFF; the variables change only while the reveal burns
    { const z = hero.blazeAt, r = z && theme() === 'light' ? z.r*smooth(0, 0.5, z.k) : 0;
      if (r > 0.5) { root.style.setProperty('--bz-r', r.toFixed(1) + 'px'); root.style.setProperty('--bz-x', z.x.toFixed(1) + 'px'); root.style.setProperty('--bz-y', z.y.toFixed(1) + 'px'); bzOn = true; }
      else if (bzOn) { bzOn = false; root.style.removeProperty('--bz-r'); root.style.removeProperty('--bz-x'); root.style.removeProperty('--bz-y'); } }
    if (pose.frame && pose.frame[2] > 1) silK = clamp(hero.silhouette.r/pose.frame[2], 0.9, 1.15);
    placeHint(inHero);
  }
}

// ---------- reduced motion: each scene a still of its pose ----------
const STILL_P = { 1: 0, 2: 0.9, 3: 0.75, 4: 0.92, 5: 0.5, 6: 0.5, 7: 0.7 };
// the bird's moment per still, in loops (x PERIOD): life A, the flame phoenix, mid-lap in scenes 1 to 4 (scene 4: the
// front pass, crossing the sphere's face; scene 4 as it turns down toward the fall); life B, the fenghuang, rising
// over the top pole in 5 and 6. Stills are drawn at full strength (scene 6's phone pose dims to 0.55 in motion)
const STILL_BIRD = { 1: 0.50, 2: 0.45, 3: 0.52, 4: 0.62, 5: 1.30, 6: 1.22 };
for (const kv of (Q.get('sb') || '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'); STILL_BIRD[k] = +v; }   // test hook: ?sb=5:1.3
function renderStills(){
  if (!hero) return;
  const W = Math.min(innerWidth, innerHeight)*0.92, cx = innerWidth/2, cy = innerHeight/2;
  SC.forEach(s => {
    const holder = s.n === 1 ? slot : s.art; if (!holder || s.n === 7) return;
    holder.querySelectorAll('canvas.still').forEach(c => c.remove());
    // v3-r4 (review finding 5, M28): every still carries the bird at its mid-scene pose, so the rebirth reads without
    // motion: the flame phoenix in scenes 1 to 4 (before the rebirth), the rainbow fenghuang in 5 and 6 (after it)
    let pose = { ...POSES[s.n](STILL_P[s.n]), bird: 1, birdScale: 1, loopT: STILL_BIRD[s.n]*PERIOD, exit: 0, ember: 0, speed: 1 };
    if (s.n === 2) pose = { ...pose, lit: [0.75, 0.75, 0.75, 0.75, 0.75] };
    // scene 5 ("at any scale"): the sphere smaller than the others, never under 96 px (phone) or 160 px (desktop) across
    const box0 = holder.getBoundingClientRect(), onScr = Math.max(200, box0.width)/W;
    const r = s.n === 2 ? W/2/2.1 : s.n === 5 ? Math.max((wide ? 160 : 96)/2/SIL_K/onScr, 0.62*W/2/BIRD.reach) : W/2/BIRD.reach;
    hero.setPose({ ...pose, frame: [cx, cy, r], cap: 0.84, dim: Math.max(0.9, pose.dim ?? 1) });
    hero.setBox(-400, -400, innerWidth + 400, innerHeight + 400, 1); hero.setHide([]);
    const c = document.createElement('canvas'), dpr = Math.min(2, devicePixelRatio || 1); c.className = 'still';
    const box = holder.getBoundingClientRect(); const aw = Math.max(200, box.width), ah = Math.max(200, box.height || aw);
    c.width = Math.round(aw*dpr); c.height = Math.round(ah*dpr);
    const sw = W, sh = sw*ah/aw;
    hero.still(still ?? STILL_BIRD[s.n]*PERIOD, c.getContext('2d'), cx - sw/2, cy - sh/2, sw, sh);
    holder.appendChild(c);
  });
}

// ---------- focus: a control that waits for its moment brings the scroll to it ----------
const MOMENT = { 3: 0.6, 4: 0.8, 7: 0.7 };
document.addEventListener('focusin', e => {
  if (reduced || !segs.length) return;
  const sec = e.target.closest('.pinned'); if (!sec) return;
  const n = +sec.dataset.scene, g = segs.find(x => x.kind === 'hold' && x.a === n); if (!g || !(n in MOMENT)) return;
  const y = g.from + (g.to - g.from)*MOMENT[n]*(n === 3 ? pf3 : 1);
  if (Math.abs(scrollY - y) > 4 && shown(e.target) < 0.5) { scrollTo(0, y); if (scrub && scrub.getTween()) scrub.getTween().progress(1); }
});

// ---------- scene 6's track ----------
const stepLis = $$('#work .steps li'), trackSpans = $$('#work .step-track span'), trackBar = $('#work .step-track .bar');
let stepOn = -1;
// round 6 (U41, Yuan, approved by Tim): a desktop's steps arrive one at a time, each a soft fade up (600 ms, 14 px), on
// time once the scroll reaches it (Show as the stage settles, then every 0.2 of the scene), and stay once in. Several
// due at once (a jump, a flick) come in together over 120 ms. Back above scene 5's end they reset, so a return sees them again.
const STEP_AT = [-0.25, 0.2, 0.4, 0.6];
let stepsIn = 0, stepAt = -1e9;
function placeSteps(y){
  if (!wide || reduced || !gsap) return;
  const h = segs.find(x => x.kind === 'hold' && x.a === 6); if (!h) return;
  const p6 = (y - h.from)/Math.max(1, h.to - h.from), want = STEP_AT.filter(a => p6 >= a).length;
  if (want === 0 && y < h.from - vh*1.2 && stepsIn > 0) { stepsIn = 0; gsap.killTweensOf(stepLis); gsap.set(stepLis, { opacity: 0, y: 14 }); return; }
  if (want <= stepsIn) return;
  const now = performance.now(), jump = want - stepsIn > 1 || now - stepAt < 400;   // a jump, a flick or a glide through several thresholds: in at once, quickly (copy resolved within 150 ms)
  stepAt = now;
  if (jump && stepsIn > 0) gsap.to(stepLis.slice(0, stepsIn), { opacity: 1, y: 0, duration: 0.12, ease: 'power2.out', overwrite: true });   // round 7: no empty target (GSAP warned "target not found")
  for (let i = stepsIn; i < want; i++) gsap.to(stepLis[i], jump ? { opacity: 1, y: 0, duration: 0.12, ease: 'power2.out' } : { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' });
  stepsIn = Math.max(stepsIn, want);
}
window.__steps = () => stepsIn;
function placeBar(){ const sp = trackSpans[stepOn]; if (!sp || !trackBar) return;
  trackBar.style.width = sp.offsetWidth + 'px'; trackBar.style.transform = `translateX(${sp.offsetLeft}px)`; }

// ---------- start ----------
let jumpY = null;
let fadeEls = [];
function refresh(){ measure(); stepOn = -1; textEls = $$(TEXT); colEls = $$(COLS); stackEls = $$(STACK_Q); fadeEls = $$('.stage .beat-a, .stage .beat-b, .stage .beat-c, .layers li, .steps li, .close .actions');
  clearEls = $$(CLEAR_Q); for (const el of clearEls) { el._sc = +el.closest('.scene').dataset.scene; el._clr = 1; el._kb = 1; el._btn = el.matches('.btn, .text-link'); el.style.opacity = ''; }
  buildGroups(); buildTimelines(); }
function boot(){
  refresh();
  if (reduced) { renderStills(); return; }
  if (!gsap || !ScrollTrigger) { console.warn('GSAP did not load'); return; }
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  const tw = gsap.to(proxy, { y: () => maxY, ease: 'none', scrollTrigger: { start: 0, end: () => maxY, scrub: 0.3, invalidateOnRefresh: true } });
  scrub = tw.scrollTrigger;
  ScrollTrigger.addEventListener('refreshInit', measure);
  ScrollTrigger.addEventListener('refresh', () => { refresh(); });
  gsap.ticker.add(update);
  const goto = (n, pp) => {
    n = clamp(n || 1, 1, 7); pp = clamp(pp || 0, 0, 1);
    const g = segs.find(x => x.kind === 'hold' && x.a === n);
    const yy = g.from + (g.to - g.from)*pp;
    jumpY = yy; scrollTo(0, yy);
    setTimeout(() => { if (scrub && scrub.getTween()) scrub.getTween().progress(1); proxy.y = scrollY; jumpY = null; }, 60);
  };
  window.__goto = goto;
  window.__at = yy => { if (yy === null) { proxy.y = scrollY; jumpY = null; return; } jumpY = yy; proxy.y = yy; scrollTo(0, yy); };   // v3-r4 test hook (tools/clear-sweep.mjs): hold the story at a scroll position, no smoothing
  if (Q.has('scene')) goto(parseInt(Q.get('scene'), 10), parseFloat(Q.get('p') || '0'));
}
// ---------- the hero's button (round 6, U43, Yuan, approved by Tim as one gentle lift) ----------
// "Talk to an engineer" lifts once, about 3 px and back (700 ms), once the hero has settled (2.8 s after the page is
// ready), then stays still. It never runs if the reader has already scrolled or pointed at it, and stops at once on
// either. ?btn=dock gives Yuan's version for comparison: a small Dock-style bounce, twice, 3 s apart. Reduced motion: none.
(function heroNudge(){
  const btn = $('.hero .btn.primary'); if (!btn || reduced || !btn.animate) return;
  let stopped = false, anim = null, timers = [];
  const stop = () => { if (stopped) return; stopped = true; timers.forEach(clearTimeout); if (anim) anim.cancel(); };
  addEventListener('scroll', () => { if (scrollY > 2) stop(); }, { passive: true });
  btn.addEventListener('pointerenter', stop); btn.addEventListener('focus', stop);
  const dock = Q.get('btn') === 'dock';
  const lift = () => { if (stopped || scrollY > 2) return;
    anim = dock
      ? btn.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-7px)', offset: 0.3, easing: 'cubic-bezier(0.3, 0, 0.6, 1)' }, { transform: 'translateY(0)', offset: 0.6, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
          { transform: 'translateY(-2.5px)', offset: 0.78 }, { transform: 'translateY(0)' }], { duration: 900, easing: 'cubic-bezier(0.2, 0, 0.4, 1)' })
      : btn.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)', offset: 0.45 }, { transform: 'translateY(0)' }], { duration: 700, easing: 'cubic-bezier(0.37, 0, 0.63, 1)' }); };
  const t0 = 2800; timers.push(setTimeout(lift, t0)); if (dock) timers.push(setTimeout(lift, t0 + 3000));
  window.__nudge = () => ({ stopped, dock, playing: !!anim && anim.playState === 'running' });
})();
window.__story = () => { const s = frameMs.slice().sort((a, b) => a - b); return { ...cur, median: +(s[s.length >> 1] || 0).toFixed(2), p95: +(s[Math.floor(s.length*0.95)] || 0).toFixed(2), level: +level.k.toFixed(2) }; };
if (hero) { window.__hero = hero; if (Q.get('bench') === '1') window.__bench = n => hero.bench(n); }
addEventListener('resize', () => { if (reduced) return; measure(); });
wideMQ.addEventListener('change', () => { refresh(); ScrollTrigger && ScrollTrigger.refresh(); });
if (document.readyState === 'complete' || window.gsap) (document.fonts ? document.fonts.ready : Promise.resolve()).then(boot);
else addEventListener('load', () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(boot));
