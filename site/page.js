// The scroll journey (round 8, Thu 8 Oct 2026; built in round 4): seven scenes, one sphere, one bird, one spine.
//
// How it is driven
//   The page's scroll position, smoothed by a light ScrollTrigger scrub (0.3 s, round 8: fast or slow, never held back), is the only clock
//   of the story. From it we
//   find the scene and its progress p (0..1) and build one pose: where the sphere sits, the camera, its brightness and
//   speed, and the journey's looks inside the engine (bands, pillar, embers, other spheres, the mark). Between two
//   scenes the two settled poses blend, eased, over the one screen of scroll where the stages hand over: the sphere
//   transforms and glides, never fades out and back in (M25). hero.js draws the pose in the same
//   frame (it is driven from gsap.ticker), so the spine, the words and the sphere never drift apart.
//   Pinned scenes are CSS sticky stages inside tall sections (no pin spacer, no jump when the iOS toolbar collapses:
//   the lengths are in svh, which never changes). The words in each stage run on a paused GSAP timeline whose
//   progress is p.
// The spine
//   The pillar's line of light, drawn in an SVG layer above the canvas (crisp at any DPR): from the top of the screen
//   down the rail (the page's centre on desktop, 16 px from the left on a phone) into the sphere's top pole, through the
//   axis, out of the bottom pole and back to the rail to the bottom of the screen. Each scene sets how much of it is
//   drawn and what it carries (ticks at the five bands, sparks, the stall's dark, the close's rise into the split).
// Stillness
//   While the page scrolls the sphere is calm; about 140 ms after scrolling stops it eases up to its full brightness
//   over 600 ms. The engine's light is capped below the words' white (hero.js uCap), so text stays brightest.
//
// Test hooks: ?scene=<1..7>&p=<0..1> jumps to that scene's progress (no smoothing) · ?t=<s> holds the hero's loop ·
// &calm=1 or &bright=1 pins the stillness level · &rail=0 the phone fallback (the line only through the art) ·
// &reduced=1 · &nofield=1 · &q=0..4 · &bench=1 then __bench(n) · &close=centred the round 6 close · __story() reports
// the scene, p and the frame time · __goto(n, p) jumps · __hero.birdState the bird's loop time, life and state.
import { createHero } from './hero.js';
import { BIRD } from './bird.js';

const Q = new URLSearchParams(location.search);
const reduced = Q.get('reduced') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const still = Q.has('t') ? parseFloat(Q.get('t')) : null;
const wideMQ = matchMedia('(min-width: 960px)');
const touchy = matchMedia('(pointer: coarse)').matches;
const railOn = Q.get('rail') !== '0';
const { gsap, ScrollTrigger } = window;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a)*t;
const smooth = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const bump = (x, a, b, c, d) => smooth(a, b, x)*(1 - smooth(c, d, x));
const HOME_YAW = 0.35, HOME_PITCH = 0.12, R = 1.6, PERIOD = 16;
const BAND_Y = [1.376, 0.8, 0, -0.8, -1.376], BAND_W = [1.11, 1.536, 1.6, 1.536, 1.11], GAP = 0.62;

if (reduced) document.documentElement.classList.add('reduced');
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- the facts' sources: one tap away ----------
for (const b of $$('.fact')) b.addEventListener('click', () => {
  const open = b.getAttribute('aria-expanded') !== 'true', src = document.getElementById(b.getAttribute('aria-controls'));
  b.setAttribute('aria-expanded', String(open)); src.hidden = !open;
});

// ---------- the mark: one file (page.css --mark-src, the thin spine s14) for the crisp mark and the particle targets ----------
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

// ---------- the theme and the scheme (round 6) ----------
// The inline head script set data-theme and data-scheme before first paint. The switch in the header flips the theme,
// remembers it (localStorage, wrapped) and cross-fades in about 300 ms (View Transitions where the browser has them,
// otherwise every colour eases and the canvas fades its own day value). The footer's review switch picks the scheme.
const root = document.documentElement;
const theme = () => root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
const scheme = () => root.getAttribute('data-scheme') || 'plasma';
const ALLOY = [0.922, 0.929, 0.925], GRAPHITE = [0.0824, 0.0902, 0.1020];
// round 7: signal is the scheme's one colour in the light theme, at full ink on the sphere's pillar and the spine
// (page.css --sp): Plasma #7F8CFF, Graphite #15171A, Coral #B5384F (4.9:1 on Alloy; CIEDE2000 23.0 from #D97757, 24.4 from #F05926)
function hex(h){ return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)/255); }
// the sphere's light per scheme: the field's two inks, the lit bands' tint, the pillar's line and sparks, the brightest
// any light may get (night), and the halo where it glows by day
const SCHEMES = {
  plasma: { ink: [0.55, 0.70, 1.0], ink2: [0.80, 0.62, 1.0], tint: [0.86, 0.91, 1.0], pillar: [0.82, 0.88, 1.0], spark: [1.0, 0.97, 0.9],
    peak: [201/255, 199/255, 217/255], halo: [0.975, 0.983, 1.0], haloK: 0.55, signal: hex('#7F8CFF') },
  mono: { ink: [0.80, 0.82, 0.85], ink2: [0.88, 0.88, 0.90], tint: [0.93, 0.94, 0.95], pillar: [0.92, 0.93, 0.94], spark: [0.98, 0.98, 0.98],
    peak: [201/255, 203/255, 206/255], halo: [0.965, 0.969, 0.965], haloK: 0.4, signal: hex('#15171A') },
  coral: { ink: [0.80, 0.82, 0.85], ink2: [0.88, 0.88, 0.90], tint: [0.93, 0.94, 0.95], pillar: [1.0, 0.67, 0.65], spark: [1.0, 0.79, 0.76],
    peak: [214/255, 202/255, 204/255], halo: [0.965, 0.969, 0.965], haloK: 0.4, axisK: 0.9, signal: hex('#B5384F') },
};
const lookOf = () => ({ axisK: 0, ...SCHEMES[scheme()] || SCHEMES.plasma, day: theme() === 'light' ? 1 : 0,
  bgC: [0.0824, 0.0902, 0.1020], bgE: [0.0742, 0.0812, 0.0918], dayBg: ALLOY, dayInk: GRAPHITE, inkMax: 0.8 });
const metaTheme = $('meta[name="theme-color"]');
function store(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
const modeBtn = $('#mode');
function syncMode(){
  const t = theme(); metaTheme && metaTheme.setAttribute('content', t === 'light' ? '#EBEDEC' : '#15171A');
  if (modeBtn) { modeBtn.setAttribute('aria-pressed', String(t === 'dark')); modeBtn.setAttribute('title', t === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'); }
}
let onLook = () => {};
function setTheme(t, how = 'fade'){
  if (t === theme()) return;
  const flip = () => { root.setAttribute('data-theme', t); syncMode(); onLook(how === 'cut'); };
  const vt = how === 'fade' && document.startViewTransition && Q.get('vt') !== '0';
  if (vt) { document.startViewTransition(flip); return; }
  if (how === 'fade') { root.classList.add('theme-fade'); clearTimeout(setTheme.t); setTheme.t = setTimeout(() => root.classList.remove('theme-fade'), 360); }
  flip();
}
syncMode();
if (modeBtn) modeBtn.addEventListener('click', () => { const t = theme() === 'dark' ? 'light' : 'dark'; store('hhl-theme', t); setTheme(t); });
// the system setting, followed live while the visitor has not chosen (and no ?theme)
{ let chosen = Q.has('theme'); try { chosen = chosen || !!localStorage.getItem('hhl-theme'); } catch (e) {}
  const mq = matchMedia('(prefers-color-scheme: light)');
  mq.addEventListener && mq.addEventListener('change', e => { if (!chosen) setTheme(e.matches ? 'light' : 'dark'); });
  if (modeBtn) modeBtn.addEventListener('click', () => { chosen = true; }); }
// the review switch
for (const r of $$('#schemes input')) {
  r.checked = r.value === scheme();
  r.addEventListener('change', () => { if (!r.checked) return; root.setAttribute('data-scheme', r.value); store('hhl-scheme', r.value);
    const u = new URL(location.href); u.searchParams.set('scheme', r.value); history.replaceState(null, '', u); onLook(false); });
}
window.__theme = (t, how) => setTheme(t, how);

// ---------- the engine ----------
const canvas = $('#field'), orbit = $('#orbit'), hint = $('#orbitHint');
let hero = null;
try {
  hero = createHero(canvas, {
    field: Q.get('field') || 'sphere', still, reduced, nofield: Q.get('nofield') === '1', forceHalf: Q.has('nofloat32'), orbit,
    quality: Q.has('q') ? parseInt(Q.get('q'), 10) : undefined, external: !reduced, look: lookOf(),
  });
} catch (e) { console.warn('hero:', e.message); hero = null; }
if (!hero) document.documentElement.classList.add('no-gl');
else if (!reduced) orbit.hidden = false;
if (hero) markReady.then(() => MARK.rects.length && hero.setMarkRects(MARK.rects));
onLook = cut => { if (!hero) return; hero.setLook(lookOf(), cut || reduced); if (reduced) renderStills(); };

// ---------- the scenes ----------
const SC = $$('.scene').map(el => ({ el, n: +el.dataset.scene, pinned: el.classList.contains('pinned'),
  stage: $('.stage', el), art: $('.art', el), words: $('.words', el) || $('.work-in', el) }));
const S = n => SC[n - 1];
const heroWords = $('.hero-words'), slot = $('.sphere-slot'), header = $('.top');
let wide = wideMQ.matches, vh = innerHeight, vw = innerWidth, segs = [], maxY = 1;

function measure(){
  wide = wideMQ.matches; vw = innerWidth;
  vh = S(2).stage.getBoundingClientRect().height || innerHeight;   // one stage is 100svh
  const y0 = scrollY;
  for (const s of SC) { const r = s.el.getBoundingClientRect(); s.top = r.top + y0; s.h = r.height; }
  // the story as segments of scroll: a scene held (its p runs 0..1) or two scenes handing over (one screen)
  segs = [];
  for (let i = 0; i < SC.length; i++) {
    const s = SC[i], next = SC[i + 1];
    const holdFrom = i === 0 ? 0 : s.top;
    const holdTo = next ? next.top - vh : s.top + Math.max(0, s.h - vh);
    segs.push({ kind: 'hold', a: s.n, from: holdFrom, to: Math.max(holdFrom + 1, holdTo) });
    if (next) segs.push({ kind: 'blend', a: s.n, b: next.n, from: Math.max(holdFrom + 1, holdTo), to: next.top });
  }
  maxY = Math.max(1, document.documentElement.scrollHeight - innerHeight);
}
function where(y){
  for (const g of segs) if (y <= g.to) return { g, t: clamp((y - g.from)/Math.max(1, g.to - g.from), 0, 1) };
  const g = segs[segs.length - 1]; return { g, t: 1 };
}
const rel = el => el.getBoundingClientRect();

// ---------- where the sphere sits ----------
function fitHero(){
  const r = rel(slot);
  let box = { left: r.left, top: r.top, width: r.width, height: r.height };
  if (!wide) box = { left: 0, top: r.top, width: vw, height: Math.max(160, r.height) };
  // the bird's lap stays inside the sphere's column: 56 px clear of the screen's edge, under the header's band
  const reach = Math.min(box.height/2, wide ? Math.min(box.width*0.62, (vw - 56 - box.left)/2) : box.width/2);
  let rad = Math.min(reach/BIRD.reach, vh*0.3);
  // desktop: the lap's widest reach (about two radii to the right at its far point) ends 56 px inside the screen
  if (wide) rad = Math.min(rad, (vw - 56 - (box.left + box.width/2))/2.05);
  const cx = wide ? Math.max(box.left + box.width/2, box.left + rad*BIRD.reach) : box.left + box.width/2;
  return { frame: [cx, box.top + box.height/2, rad], box };
}
// a scene's art box as it sits when its stage has settled (stages are sticky at the top), so a hand-over between two
// scenes interpolates two still poses and the sphere glides between them while the words scroll (round 8)
function artBox(n){ const r = rel(S(n).art), dy = S(n).stage ? rel(S(n).stage).top : 0;
  return { x: r.left, y: r.top - dy, w: r.width, h: r.height, cx: r.left + r.width/2, cy: r.top - dy + r.height/2 }; }
const railX = () => wide ? vw/2 : (railOn ? 16 : vw/2);
// the left rail the spine steps out to from the header mark (Tim, 8 Oct: "integrate with logo from beginning"): half the
// page gutter on desktop, clear of the words; the phone rail
const leftRail = () => wide ? Math.round(parseFloat(getComputedStyle($('.top')).paddingLeft)/2) || 28 : 16;
// a mark's thin line in px (the header's or the close's): its x, top and bottom
function lineOf(el){ const r = rel(el), sc = r.width/MARK.vb[2], [lx, ly, lw, lh] = MARK.line;
  return { x: r.left + (lx + lw/2 - MARK.vb[0])*sc, t: r.top + (ly - MARK.vb[1])*sc, b: r.top + (ly + lh - MARK.vb[1])*sc }; }

// ---------- the poses ----------
const BASE = { cam: { yaw: HOME_YAW, pitch: HOME_PITCH, roll: 0, dist: 1 }, dim: 1, speed: 1, bird: 1, lift: 0, spread: 0,
  lit: [0, 0, 0, 0, 0], pillar: 0, ember: 0, others: 0, morph: 0, white: 0, exit: 0, loopT: null,
  steady: 0, behind: 0,
  route: { top: 1, thru: 0, thruK: 1, bot: 1, ticks: 0, sparks: 0, dark: 0, pulse: -1, ax: 1, cin: 1, cout: 0, straight: 0, mark: 0, hx: 0 } };
const P = o => ({ ...BASE, ...o, cam: { ...BASE.cam, ...(o.cam || {}) }, route: { ...BASE.route, ...(o.route || {}) } });
let heroCam = { ...BASE.cam }, clock = 0;

// The bird's clock through the story (round 8). One 32 s two-life cycle (bird.js): loop 0 (0 to 16 s) is life A, the
// flame phoenix; loop 1 (16 to 32 s) is life B, the fenghuang. The hero lets the loop run free; from scene 2 on the
// scroll holds it, scene by scene, each scene's end the next one's start, so the bird flies one unbroken lap through
// the page: A rides above the bands (2), circles the pillar (3), falls into the bottom pole at the stall (4, tau 0.9),
// is reborn at the top as B (4, crossing 16 s), carries the camera out and back (5), glides beside the steps (6) and
// makes its last pass into the top pole as the mark forms (7). Values are in loops (x 16 s).
const LT = { s2a: 0.10, s2b: 0.38, s3b: 0.64, s4: [0.64, 0.90, 0.94, 1.18, 1.26], s5b: 1.42, s6b: 1.62, s7b: 1.70 };
// where the hero's free bird is when the scroll takes the loop over: if it is life A in the open part of its lap, the
// story picks it up right there; otherwise it starts fresh (hero.js fades the bird back in over a cut)
let anchorT = LT.s2a*PERIOD;
function takeAnchor(simT){
  const loop = Math.floor(simT/PERIOD), tau = simT/PERIOD - loop;
  anchorT = ((loop % 2) + 2) % 2 === 0 && tau > 0.03 && tau < 0.30 ? tau*PERIOD : LT.s2a*PERIOD;
}
const POSES = {
  1(p){   // the promise: the whole sphere, the phoenix flying its lap; the line grows out of the header mark
    const f = fitHero();
    const g = intro;
    return P({ frame: f.frame, cam: heroCam, route: { hx: 1, ax: 0, top: smooth(0, 0.3, g), thruK: smooth(0.28, 0.55, g), bot: smooth(0.5, 1, g), cin: 1, cout: 0 } });
  },
  2(p){   // built in pieces: five bands slide apart, each lights as its line is read; the phoenix rides high and cools
    const A = artBox(2), t = smooth(0.0, 0.22, p);
    const rBase = Math.min(A.h/2.3, A.w*0.36), rBands = Math.min(A.h/2/1.95, A.w*(wide ? 0.27 : 0.25));
    const lit = [0, 1, 2, 3, 4].map(i => { const c = 0.30 + 0.15*i;
      return Math.max(bump(p, c - 0.075, c - 0.04, c + 0.07, i === 4 ? 9 : c + 0.1), p > c + 0.07 ? 0.38 : 0.12); });
    return P({ frame: [A.x + A.w*(wide ? 0.38 : 0.28), A.cy, lerp(rBase, rBands, t)],
      cam: { yaw: HOME_YAW + 0.25*t, pitch: HOME_PITCH + 0.34*t }, bird: lerp(0.9, 0.5, t), lift: t, spread: t, lit,
      loopT: lerp(anchorT, LT.s2b*PERIOD, p),
      dim: 0.92, route: { top: 1, thru: smooth(0.06, 0.28, p), bot: smooth(0.2, 0.48, p), ticks: t } });
  },
  3(p){   // the line through the middle: the bands close, the pillar becomes a line with sparks; the phoenix circles it
    const A = artBox(3), close = smooth(0.0, 0.32, p), r = Math.min(A.h/2.3, A.w*0.36);
    const rBands = Math.min(A.h/2/1.95, A.w*(wide ? 0.27 : 0.3));
    return P({ frame: [A.cx, A.cy, lerp(rBands, r, close)], cam: { yaw: HOME_YAW + 0.25*(1 - close) - 0.12*smooth(0.3, 1, p), pitch: HOME_PITCH + 0.34*(1 - close) + 0.06*close },
      bird: lerp(0.5, 0.75, smooth(0.1, 0.6, p)), lift: 1 - close, spread: 1 - close, lit: [0.38, 0.38, 0.38, 0.38, 0.38].map(v => v*(1 - close)),
      loopT: lerp(LT.s2b, LT.s3b, p)*PERIOD,
      pillar: smooth(0.12, 0.45, p), dim: 0.85,
      route: { top: 1, thru: 1, bot: smooth(0.1, 0.45, p), ticks: 1 - close, sparks: smooth(0.3, 0.5, p) } });
  },
  4(p){   // the stall: the field slows to cold embers, the phoenix falls into the bottom pole; a beat; reborn as the fenghuang
    const A = artBox(4), r = Math.min(A.h/2.3, A.w*0.36), k = LT.s4;
    const tau = p < 0.42 ? lerp(k[0], k[1], smooth(0, 0.42, p)) : p < 0.55 ? lerp(k[1], k[2], (p - 0.42)/0.13)
      : p < 0.86 ? lerp(k[2], k[3], (p - 0.55)/0.31) : lerp(k[3], k[4], (p - 0.86)/0.14);
    const ember = smooth(0.06, 0.38, p)*(1 - smooth(0.6, 0.86, p));
    const relight = smooth(0.58, 0.8, p);
    return P({ frame: [A.cx, A.cy, r], cam: { yaw: HOME_YAW - 0.12*(1 - smooth(0.5, 0.9, p)), pitch: HOME_PITCH + 0.05 },
      bird: 1, loopT: tau*PERIOD, ember, speed: lerp(1, 0.1, ember), dim: 1 - 0.45*ember,
      route: { top: 1, thru: 0, bot: Math.max(1 - smooth(0.2, 0.42, p), relight), dark: ember, pulse: p > 0.55 && p < 0.86 ? (p - 0.55)/0.31 : -1 } });
  },
  5(p){   // any size: the fenghuang carries the camera out until the sphere is one bright point among others, then flies us
    // back in until it fills the screen, and holds there a moment (Yuan, 8 Oct)
    const A = artBox(5), r = Math.min(A.h/2.3, A.w*0.36);
    const out = smooth(0.0, 0.26, p), inn = smooth(0.3, 0.56, p);
    const rFar = 5, rFill = Math.min(vh*0.5, vw*0.62);
    const lr = lerp(lerp(Math.log(r), Math.log(rFar), out), Math.log(rFill), inn);
    const cx = lerp(A.cx, vw/2, inn), cy = lerp(A.cy, vh/2, inn);
    return P({ frame: [cx, cy, Math.exp(lr)], cam: { yaw: HOME_YAW + 0.4*out - 0.2*inn, pitch: HOME_PITCH + 0.1*out },
      others: smooth(0.06, 0.24, p)*(1 - smooth(0.42, 0.6, p)), dim: lerp(1, 0.8, inn), bird: 1,
      loopT: lerp(LT.s4[4], LT.s5b, p)*PERIOD,
      route: { top: 1 - 0.9*out*(1 - inn), thru: 0, bot: (1 - out)*(1 - inn) } });
  },
  6(p){   // how we work: the sphere faint and turning slowly beside the steps; the fenghuang glides slow and wide
    let fr;
    if (wide) fr = [vw*0.25, vh*0.66, vh*0.17];
    // phone: the sphere half off the right edge, its pillar off screen, so the pillar never crosses a line of text
    else { const r = Math.min(vw*0.56, vh*0.3); fr = [vw + r*0.12, vh*0.52, r]; }
    return P({ frame: fr, cam: { yaw: HOME_YAW + clock*0.06, pitch: HOME_PITCH + 0.1 }, dim: wide ? 0.26 : 0.3, steady: wide ? 0 : 1,
      behind: wide ? 0 : 1, speed: 0.4, bird: wide ? 0.55 : 0, loopT: lerp(LT.s5b, LT.s6b, p)*PERIOD,
      route: { top: 1, thru: 1, bot: 1, straight: 1, ax: 0 } });
  },
  7(p){   // fortune (round 4's close, M25): the fenghuang's last rainbow pass into the top pole; every particle streams
    // into the mark, glowing blue-white with a faint spectrum drifting through it, then settling to white; the crisp
    // mark and the wordmark come in exactly on top, and the light stays lit under them
    const m = markBox(), A = { cx: m.cx, cy: m.cy };
    const rMark = hero ? hero.radiusForUnitPx(m.k*28/(2*R)) : 40, rStart = Math.min(vh*0.24, vw*0.3);
    const cond = smooth(0.08, 0.36, p);
    return P({ frame: [A.cx, A.cy, Math.exp(lerp(Math.log(rStart), Math.log(rMark), smooth(0.02, 0.34, p)))],
      cam: { yaw: lerp(HOME_YAW, 0, smooth(0, 0.32, p)), pitch: lerp(HOME_PITCH, 0, smooth(0, 0.32, p)) },
      bird: 1, exit: smooth(0.0, 0.24, p), loopT: lerp(LT.s6b, LT.s7b, smooth(0, 0.24, p))*PERIOD, morph: cond,
      shimmer: 0.9*bump(p, 0.1, 0.24, 0.42, 0.78),
      white: smooth(0.3, 0.6, p), dim: lerp(1, 0.42, cond)*lerp(1, 0.34, smooth(0.42, 0.7, p)), speed: lerp(1, 0.4, cond),
      route: { top: 1, thru: 1 - smooth(0.62, 0.8, p), bot: 1 - smooth(0.1, 0.4, p), mark: cond } });
  },
};
// where the crisp mark sits once the close's stage has settled (it is sticky at the top): its ink's centre, one grid
// unit (28 across the ink) in px, and its thin line. live: where it is on screen right now (for the spine)
function markBox(live = false){
  const r = rel($('.final .mark')), sc = r.width/MARK.vb[2], [ix, iy, iw, ih] = MARK.ink, [lx, ly, lw, lh] = MARK.line;
  const dy = live || reduced ? 0 : Math.max(0, rel(S(7).stage).top);   // settled while it slides in; carried up with the page after
  const X = v => r.left + (v - MARK.vb[0])*sc, Y = v => r.top - dy + (v - MARK.vb[1])*sc;
  return { cx: X(ix + iw/2), cy: Y(iy + ih/2), k: iw*sc/28, top: Y(iy), bottom: Y(iy + ih), lx: X(lx + lw/2), lt: Y(ly), lb: Y(ly + lh) };
}
const BLEND = { std: t => t*t*(3 - 2*t), 5: t => smooth(0.0, 0.62, t) };
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
function buildTimelines(){
  for (const k in TL) { TL[k].progress(0); TL[k].kill(); }
  if (reduced || !gsap) return;
  const tl = n => (TL[n] = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } }));
  { const t = tl(2), lis = $$('.layers li', S(2).el);
    gsap.set(lis, { opacity: 0, y: 8 });
    lis.forEach((li, i) => { const c = 0.30 + 0.15*i;
      t.to(li, { opacity: 1, y: 0, duration: 0.035 }, c - 0.075);
      if (i < 4) t.to(li, { opacity: 0, y: -6, duration: 0.03, ease: 'power2.in' }, c + 0.07); });
    t.set({}, {}, 1); }
  { const t = tl(3), a = $('.beat-a', S(3).el), b = $('.beat-b', S(3).el);
    gsap.set([a, b], { clearProps: 'all' });
    if (!wide) { gsap.set(b, { opacity: 0, y: 8 }); t.to(a, { opacity: 0, y: -6, duration: 0.04, ease: 'power2.in' }, 0.5); t.to(b, { opacity: 1, y: 0, duration: 0.05 }, 0.55); }
    else { gsap.set(b, { opacity: 0 }); t.to(b, { opacity: 1, duration: 0.08 }, 0.42); }
    t.set({}, {}, 1); }
  { const t = tl(4), a = $('.swap .beat-a', S(4).el), b = $('.swap .beat-b', S(4).el);
    gsap.set(b, { opacity: 0, y: 8 });
    t.to(a, { opacity: 0, y: -6, duration: 0.05, ease: 'power2.in' }, 0.5);
    t.to(b, { opacity: 1, y: 0, duration: 0.07 }, 0.6); t.set({}, {}, 1); }
  { const t = tl(5), w = S(5).words;   // the words leave as the push-in ends; the full sphere then holds (Yuan)
    t.to(w, { opacity: 0, y: -8, duration: 0.05, ease: 'power2.in' }, 0.41); t.set({}, {}, 1); }
  { const t = tl(7), el = S(7).el, mk = $$('.final .mark', el), wm = $$('.final .wm', el), rest = [$('.line', el), $('.actions', el)];
    gsap.set(mk, { opacity: 0 }); gsap.set(wm, { opacity: 0 }); gsap.set(rest, { opacity: 0, y: 10 });
    t.to(mk, { opacity: 1, duration: 0.12, ease: 'power1.inOut' }, 0.34);
    t.to(wm, { opacity: 1, duration: 0.1 }, 0.42);
    t.to(rest, { opacity: 1, y: 0, duration: 0.08, stagger: 0.03 }, 0.48); t.set({}, {}, 1); }
}

// ---------- the light kept off every word ----------
const TEXT = '.hero-words .eyebrow, .hero-words h1, .hero-words .standfirst, .hero-words .actions > *, .hero-words .cue, .top .brand, .top .talk, '
  + '.stage h2, .stage .body, .layers li, .facts li, .text-link, .band-names span, .final .wm, .close .line, .close .actions > *, .work h2, .steps li, .foot > *';
let textEls = [];
function shown(el){ let o = 1; for (let e = el, i = 0; e && i < 5; e = e.parentElement, i++) { const s = e.style; if (s.visibility === 'hidden') return 0; if (s.opacity !== '') o *= +s.opacity; } return o; }
function hideRects(){
  const out = [];
  for (const el of textEls) {
    const b = el.getBoundingClientRect();
    if (b.bottom < -16 || b.top > innerHeight + 16 || !b.width || shown(el) < 0.05) continue;
    const pad = el.matches('.band-names span') ? 6 : 12;
    const q = [b.left - pad, b.top - pad + 2, b.right + pad, b.bottom + pad - 2];
    if (el.matches('.top .brand')) q.brand = true;
    out.push(q);
    if (out.length >= 24) break;
  }
  return out;
}

// ---------- the bird's flight bounds (round 7) ----------
// The art half of the layout: the screen 48 px in from every edge, then 64 px clear of each text column on screen, on the
// side of it away from the sphere; in the hero, also under the header. hero.js keeps the whole bird inside it.
const COLS = '.hero-words, .stage .words, .work h2, .steps, .close .final .wm, .close .line, .close .actions';
let colEls = [];
function flightBox(frame){
  const E = 48, C = 64, H = innerHeight;
  let x0 = E, y0 = E, x1 = vw - E, y1 = H - E;
  const ox = frame[0], oy = frame[1];
  for (const el of colEls) {
    const b = el.getBoundingClientRect();
    if (!b.width || b.bottom < 0 || b.top > H || b.right < 0 || b.left > vw || shown(el) < 0.05) continue;
    const g = [ox - b.right, b.left - ox, oy - b.bottom, b.top - oy], m = Math.max(...g);
    if (m <= 0) continue;   // the sphere sits behind these words (the phone's scene 6, where the bird is out)
    const i = g.indexOf(m);
    if (i === 0) x0 = Math.max(x0, b.right + C); else if (i === 1) x1 = Math.min(x1, b.left - C);
    else if (i === 2) y0 = Math.max(y0, b.bottom + C); else y1 = Math.min(y1, b.top - C);
  }
  const hb = rel(header).bottom; if (hb > 0) y0 = Math.max(y0, hb + 8);
  return [x0, y0, x1, y1];
}

// ---------- the spine ----------
const NS = 'http://www.w3.org/2000/svg', svg = $('#spine');
// every part of the spine sits in one group masked by the words' rectangles, so the line never crosses text
svg.innerHTML = '<defs><mask id="spMask" maskUnits="userSpaceOnUse" x="-50" y="-50" width="20000" height="20000"><rect x="-50" y="-50" width="20000" height="20000" fill="#fff"/><g class="holes"></g></mask></defs><g class="spg" mask="url(#spMask)"></g>';
const spg = svg.querySelector('.spg'), holes = svg.querySelector('.holes');
const mk = (cls) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', cls); spg.appendChild(p); return p; };
const SP = { gTop: mk('sp-glow'), gBot: mk('sp-glow'), top: mk('sp-line'), thru: mk('sp-thru'), bot: mk('sp-line'), ticks: mk('sp-ticks'),
  sparks: mk('sp-sparks'), pulse: mk('sp-pulse') };
SP.tip = document.createElementNS(NS, 'circle'); SP.tip.setAttribute('class', 'sp-tip'); SP.tip.setAttribute('r', '2.25'); spg.appendChild(SP.tip);
let holeKey = '';
function setHoles(rects){
  const html = rects.map(r => `<rect x="${f1(r[0])}" y="${f1(r[1])}" width="${f1(r[2] - r[0])}" height="${f1(r[3] - r[1])}" fill="#000"/>`).join('');
  if (html !== holeKey) { holeKey = html; holes.innerHTML = html; }
}
const f1 = v => v.toFixed(1);
function drawn(path, d, from = 'start'){   // draw a share of a path from its start (or from its end)
  const L = path.getTotalLength ? path.getTotalLength() : 0;
  if (!L || d <= 0.001) { path.style.strokeDasharray = `0 ${L + 1}`; path.style.strokeDashoffset = '0'; return null; }
  if (d >= 0.999) { path.style.strokeDasharray = 'none'; return null; }
  path.style.strokeDasharray = `${f1(L*d)} ${f1(L)}`; path.style.strokeDashoffset = from === 'start' ? '0' : f1(-L*(1 - d));
  return path.getPointAtLength(from === 'start' ? L*d : L*(1 - d));
}
// The route, calm (Tim, 8 Oct: "a bit bright and dizzying how it changes direction so much"): at most one gentle curve
// per scene with long straight runs either side. cin: the top comes down the rail and bends once into the top pole;
// cout: the bottom bends once from the bottom pole back to the rail (the hero on desktop). Otherwise the line drops
// straight from the bottom pole. ax 0 is the plain rail (scene 6). Each curve's vertical run is at least 1.8 times its
// sideways run, and the three shape values ease in time (0.45 s) as well as with the scroll, so it never whips.
const RS = { ax: 0, cin: 1, cout: 0, st: 0, hx: 1, t: -1 };
function easeRoute(rt){
  const now = performance.now(), dt = RS.t < 0 || jumpY !== null ? 1e3 : (now - RS.t)/1000; RS.t = now;
  const k = 1 - Math.exp(-dt/0.45);
  for (const [key, v] of [['ax', rt.ax ?? 1], ['cin', rt.cin ?? 1], ['cout', rt.cout ?? 0], ['st', rt.straight || 0], ['hx', rt.hx || 0]]) RS[key] += (v - RS[key])*k;
  return RS;
}
const sweep = (x0, y0, x1, y1) => `C${f1(x0)} ${f1(y0 + (y1 - y0)*0.5)} ${f1(x1)} ${f1(y1 - (y1 - y0)*0.5)} ${f1(x1)} ${f1(y1)}`;
function spine(pose, seg, calm){
  const H = innerHeight, rt = pose.route, R2 = easeRoute(rt), X = lerp(railX(), leftRail(), R2.hx);
  const sp = 1.6 + GAP*2*pose.spread, mkK = rt.mark || 0;
  let tp = hero ? hero.project([0, sp, 0]) : [X, H*0.3], bp = hero ? hero.project([0, -sp, 0]) : [X, H*0.6];
  if (mkK > 0) { const m = markBox(true); tp = [lerp(tp[0], m.lx, mkK), lerp(tp[1], m.lt, mkK)]; bp = [lerp(bp[0], m.lx, mkK), lerp(bp[1], m.lb, mkK)]; }
  // half the round 4 brightness: a quiet hairline, never brighter than the body text
  // round 7: in the light theme the spine is the scheme's signal colour at full opacity, so the schemes tell apart
  const op = (theme() === 'light' ? 1 : 0.28 + 0.2*(1 - calm))*(1 - 0.82*(rt.dark || 0))*(0.25 + 0.75*(pose.vis ?? 1));
  const ax = R2.ax*(1 - R2.st), lx = x => lerp(X, x, ax);
  const T = [lx(tp[0]), tp[1]], B = [lx(bp[0]), bp[1]];
  // top: down the rail, then one gentle bend into the top pole
  const xs = lerp(T[0], X, R2.cin), dxi = Math.abs(xs - T[0]), si = Math.min(Math.max(150, dxi*1.8), H*0.62);
  const yA = T[1] - si*Math.min(1, dxi/2 + 0.001);
  let dTop;
  if (R2.hx > 0.001) {
    // born in the header mark: its line is the first segment, then one short gentle step out to the rail below the
    // header (on desktop a drop from the mark into the page), then the rail down
    const h = lineOf($('.top .mark')), k = R2.hx, sx = lerp(xs, h.x, k), s0 = lerp(Math.min(-4, h.t), h.t, k), s1 = lerp(Math.min(-4, h.t), h.b, k);
    const sy = s1 + Math.max(36, Math.abs(sx - xs)*2.2)*k, y2 = Math.max(sy, Math.min(yA, T[1]));
    dTop = `M${f1(sx)} ${f1(s0)} L${f1(sx)} ${f1(s1)} ` + sweep(sx, s1, xs, sy) + ` L${f1(xs)} ${f1(y2)} ` + (y2 < T[1] - 0.5 ? sweep(xs, y2, T[0], T[1]) : '');
  } else dTop = (yA > -4 ? `M${f1(xs)} -4 L${f1(xs)} ${f1(yA)} ` : `M${f1(xs)} ${f1(yA)} `) + sweep(xs, yA, T[0], T[1]);
  const dThru = `M${f1(T[0])} ${f1(T[1])} L${f1(B[0])} ${f1(B[1])}`;
  // bottom: straight down from the bottom pole (on a phone, to just above the words), or one bend back to the rail
  const xe = lerp(B[0], X, R2.cout), dxo = Math.abs(xe - B[0]), so = Math.min(Math.max(150, dxo*1.8), H*0.62);
  let yEnd = H + 4;
  const w = SC[seg.a - 1].words;
  if (!wide && R2.st < 0.5 && ax > 0.5 && w) { const wt = w.getBoundingClientRect().top; if (wt > B[1] + 30) yEnd = wt - 10; }
  let yB = B[1] + so*Math.min(1, dxo/2 + 0.001);
  if (!wide) yB = Math.min(yB, yEnd); else yEnd = Math.max(yEnd, yB);
  const dBot = `M${f1(B[0])} ${f1(B[1])} ` + sweep(B[0], B[1], xe, yB) + (yEnd > yB + 0.5 ? ` L${f1(xe)} ${f1(yEnd)}` : '');
  for (const [p, d] of [[SP.top, dTop], [SP.gTop, dTop], [SP.bot, dBot], [SP.gBot, dBot], [SP.thru, dThru]]) p.setAttribute('d', d);
  const topK = lerp(rt.top, 1, R2.st), botK = lerp(rt.bot, 1, R2.st);
  const from = R2.hx > 0.5 ? 'start' : 'end';   // in the hero the line grows down out of the mark
  drawn(SP.top, topK, from); drawn(SP.gTop, topK, from); drawn(SP.thru, lerp(rt.thruK ?? 1, 1, R2.st));
  const tip = drawn(SP.bot, botK); drawn(SP.gBot, botK);
  SP.top.style.opacity = SP.bot.style.opacity = op.toFixed(3);
  // on the rail (ax 0) the axis piece is just more rail, so it is drawn like the rest
  SP.thru.style.opacity = (op*Math.max(rt.thru, 1 - ax)).toFixed(3);
  SP.gTop.style.opacity = SP.gBot.style.opacity = (theme() === 'light' ? 0 : 0.04*(1 - (rt.dark || 0))).toFixed(3);
  // the tip: a small point where the line is growing
  if (tip && botK > 0.02 && botK < 0.999 && tip.y < H) { SP.tip.style.opacity = (op*smooth(0, 0.08, botK)).toFixed(3); SP.tip.setAttribute('cx', f1(tip.x)); SP.tip.setAttribute('cy', f1(tip.y)); }
  else SP.tip.style.opacity = '0';
  // ticks: the five bands where the line crosses them (scene 2), or a branch to each step (scene 6)
  let ticks = '';
  if (rt.ticks > 0.01 && hero) {
    for (let k = 0; k < 5; k++) { const y = BAND_Y[k] + (2 - k)*GAP*pose.spread, q = hero.project([0, y, 0]), tw = 3 + 7*pose.lit[k];
      ticks += `M${f1(lx(q[0]) - tw)} ${f1(q[1])} H${f1(lx(q[0]) + tw)} `; }
    SP.ticks.style.opacity = (op*rt.ticks).toFixed(3);
  } else if (R2.st > 0.5) {
    for (const li of stepEls) { const r = li.getBoundingClientRect(), y = r.top + 14; if (y > H*0.88 || y < -10) continue;
      const to = r.left - (wide ? 20 : 8); ticks += `M${f1(X)} ${f1(y)} H${f1(lerp(X, to, smooth(H*0.88, H*0.6, y)))} `; }
    SP.ticks.style.opacity = (op*smooth(0.5, 1, R2.st)).toFixed(3);
  }
  SP.ticks.setAttribute('d', ticks || 'M0 0');
  // sparks run up the line (scene 3); the pulse runs down it as the bird is reborn (scene 4)
  SP.sparks.setAttribute('d', dTop + ' ' + dThru + ' ' + dBot);
  SP.sparks.style.opacity = (rt.sparks*0.45).toFixed(3); SP.sparks.style.strokeDashoffset = f1((clock*70) % 36);
  if (rt.pulse >= 0) {
    SP.pulse.setAttribute('d', dThru + ' ' + dBot.replace(/^M\S+ \S+ /, ' '));
    const L = SP.pulse.getTotalLength(); SP.pulse.style.strokeDasharray = `90 ${f1(L + 200)}`; SP.pulse.style.strokeDashoffset = f1(-(L + 90)*rt.pulse + 90);
    SP.pulse.style.opacity = (Math.sin(Math.PI*rt.pulse)*0.45).toFixed(3);
  } else SP.pulse.style.opacity = '0';
}
let stepEls = $$('.steps li');

// ---------- band names beside the bands (scene 2) ----------
const names = $$('.band-names span');
function placeNames(pose, on){
  if (!hero || !on) { for (const s of names) { s.style.opacity = '0'; s.style.visibility = 'hidden'; } return; }
  const B = hero.basis, base = $('.band-names').getBoundingClientRect();
  const right = hero.project(B.r.map(v => v*1.6))[0];
  names.forEach((s, k) => {
    const y = BAND_Y[k] + (2 - k)*GAP*pose.spread, q = hero.project([0, y, 0]);
    const x = Math.max(right, hero.project(B.r.map(v => v*BAND_W[k]))[0]) + (wide ? 28 : 14);
    const mw = Math.max(80, vw - x - (wide ? 40 : 12)); s.style.maxWidth = mw + 'px';
    s.style.transform = `translate(${f1(x - base.left)}px, ${f1(q[1] - base.top - s.offsetHeight/2)}px)`;
    s.style.opacity = (on*smooth(0.4, 0.9, pose.spread)*(0.86 + 0.14*pose.lit[k])).toFixed(3);   // unlit is Steel at 0.86: AA
    s.style.visibility = on > 0.01 ? 'visible' : 'hidden';
    s.classList.toggle('lit', pose.lit[k] > 0.6);
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

// ---------- the orbit hint (hero only) ----------
let hintDone = false; try { hintDone = localStorage.getItem('hhl-orbit-used') === '1'; } catch (e) {}
hint.textContent = 'Drag to turn, pinch to zoom';
if (hero) hero.onFirstUse(() => { hintDone = true; hint.classList.remove('on'); try { localStorage.setItem('hhl-orbit-used', '1'); } catch (e) {} });
function placeHint(inHero){
  const o = hero && hero.sphere;
  if (!o || hintDone || !inHero || reduced || still !== null) { hint.classList.remove('on'); return; }
  // under the sphere, set to the right of its bottom pole so the spine leaving the pole never runs through it
  const y = o.y + o.r + 20, room = wide ? innerHeight - 24 : rel(heroWords).top - 12;
  if (y + 14 > room) { hint.classList.remove('on'); return; }
  hint.style.left = Math.round(o.x + 28) + 'px'; hint.style.top = Math.round(y) + 'px'; hint.classList.add('on');
}

// ---------- the frame ----------
const proxy = { y: scrollY };
let scrub = null, intro = still !== null ? 1 : 0, lastNow = performance.now(), frameMs = [], cur = { n: 1, p: 0 };
function update(){
  const now = performance.now(), dt = Math.min(0.1, (now - lastNow)/1000); lastNow = now; clock += dt;
  frameMs.push(dt*1000); if (frameMs.length > 240) frameMs.shift();
  intro = Math.min(1, intro + dt/1.6);
  if (!pinnedLevel && !resting && now - lastScroll > 140) { resting = true; gsap.to(level, { k: 1, duration: 0.6, ease: 'power2.out', overwrite: true }); }
  const y = jumpY !== null ? jumpY : proxy.y;
  const { g, t } = where(y);
  const inHero = g.kind === 'hold' && g.a === 1 && y < 4;
  if (g.kind === 'hold' && g.a === 1 && hero) heroCam = { ...hero.getCamera(), dist: hero.getCamera().dist };
  let pose, sceneN, p;
  // one sphere, transformed (round 8, M25): a hand-over between two scenes is the two settled poses blended, eased, so
  // the sphere glides, opens, closes and scales without a cut while the words scroll past; the trails travel with it
  // (hero.js carries them). Out of the any-size push-in the full sphere holds a little longer (Yuan).
  // The hero's free loop: while it runs, keep the anchor the story will pick the bird up from
  if (hero && (g.kind === 'hold' && g.a === 1)) takeAnchor(hero.simTime);
  if (g.kind === 'hold') { sceneN = g.a; p = t; pose = POSES[g.a](t); }
  else { const e = (BLEND[g.a] || BLEND.std)(t); sceneN = e < 0.5 ? g.a : g.b; p = sceneN === g.a ? 1 : 0;
    pose = mix(POSES[g.a](1), POSES[g.b](0), e); }
  pose.vis = 1;
  cur = { n: sceneN, p: +p.toFixed(3), seg: g.kind, t: +t.toFixed(3) };
  for (const n in TL) { const s = S(+n); TL[n].progress(g.kind === 'hold' && g.a === +n ? t : (s.top > y ? 0 : 1)); }
  if (hero) {
    const calm = level.k, P2 = { ...pose, dim: pose.dim*lerp(0.72 + 0.28*calm, 1, pose.steady || 0), cap: 0.84 };
    if (inHero) delete P2.cam;
    hero.setPose(P2);
    if (pose.frame) hero.setFlight(flightBox(pose.frame));
    hero.setParallax(inHero);
    hero.setInteractive(inHero && !reduced);
    hero.setThrottle(g.kind === 'hold' && g.a === 6);
    if (g.a === 1 && (g.kind === 'hold' || t < 0.5)) {
      const hb = fitHero().box, top = Math.max(rel(header).bottom - 8, 0);
      if (wide) hero.setBox(rel(heroWords).right + 80 - 400*(1 - (inHero ? 1 : 0)), top - 400*(inHero ? 0 : 1), inHero ? vw - 40 : vw + 400, innerHeight + 400, inHero ? 72 : 120);
      else hero.setBox(-400, inHero ? top + 20 : -400, vw + 400, inHero ? hb.top + hb.height - 20 : innerHeight + 400, 28);
    } else hero.setBox(-400, -400, vw + 400, innerHeight + 400, 40);
    const hr = hideRects(); hero.setHide((pose.behind || 0) > 0.9 ? [] : hr); setHoles(hr.filter(q => !q.brand));
    spine(pose, g, calm);
    placeNames(pose, g.kind === 'hold' && g.a === 2 ? smooth(0, 0.04, t)*(1 - smooth(0.96, 1, t)) : 0);
    hero.frame(now);
    placeHint(inHero);
  }
}

// ---------- reduced motion: each scene a still of its pose ----------
const STILL_P = { 1: 0, 2: 0.9, 3: 0.75, 4: 0.92, 5: 0.5, 6: 0, 7: 0.7 };
function renderStills(){
  if (!hero) return;
  const W = Math.min(innerWidth, innerHeight)*0.92, cx = innerWidth/2, cy = innerHeight/2;
  SC.forEach((s, i) => {
    const holder = s.n === 1 ? slot : s.art; if (!holder || s.n === 7 || s.n === 6) return;
    holder.querySelectorAll('canvas.still').forEach(c => c.remove());
    let pose = { ...POSES[s.n](STILL_P[s.n]), bird: 0 };   // the bird never freezes mid-stroke: the stills show the sphere
    if (s.n === 2) pose = { ...pose, lit: [0.75, 0.75, 0.75, 0.75, 0.75] };
    const r = s.n === 2 ? W/2/2.1 : s.n === 5 ? 5 : s.n === 6 ? W*0.2 : W/2/BIRD.reach;
    hero.setPose({ ...pose, frame: [cx, cy, r], cap: 0.84, dim: pose.dim ?? 1 });
    hero.setBox(-400, -400, innerWidth + 400, innerHeight + 400, 1); hero.setHide([]);
    const c = document.createElement('canvas'), dpr = Math.min(2, devicePixelRatio || 1); c.className = 'still';
    const box = holder.getBoundingClientRect(); const aw = Math.max(200, box.width), ah = Math.max(200, box.height || aw);
    c.width = Math.round(aw*dpr); c.height = Math.round(ah*dpr);
    const sw = s.n === 6 ? W : W, sh = sw*ah/aw;
    hero.still(still ?? (s.n === 4 ? 19.5 : 6.2), c.getContext('2d'), cx - sw/2, cy - sh/2, sw, sh);
    holder.appendChild(c);
  });
}

// ---------- focus: a control that waits for its moment brings the scroll to it ----------
const MOMENT = { 3: 0.6, 4: 0.8, 7: 0.7 };
document.addEventListener('focusin', e => {
  if (reduced || !segs.length) return;
  const sec = e.target.closest('.pinned'); if (!sec) return;
  const n = +sec.dataset.scene, g = segs.find(x => x.kind === 'hold' && x.a === n); if (!g || !(n in MOMENT)) return;
  const y = g.from + (g.to - g.from)*MOMENT[n];
  if (Math.abs(scrollY - y) > 4 && shown(e.target) < 0.5) { scrollTo(0, y); if (scrub && scrub.getTween()) scrub.getTween().progress(1); }
});

// ---------- start ----------
let jumpY = null;
function refresh(){ measure(); textEls = $$(TEXT); colEls = $$(COLS); stepEls = $$('.steps li'); buildTimelines(); }
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
  // ?scene=<n>&p=<0..1>: jump there for shots, without smoothing (also window.__goto(n, p))
  const goto = (n, pp) => {
    n = clamp(n || 1, 1, 7); pp = clamp(pp || 0, 0, 1);
    const g = segs.find(x => x.kind === 'hold' && x.a === n);
    const yy = g.from + (g.to - g.from)*pp;
    jumpY = yy; scrollTo(0, yy);
    setTimeout(() => { if (scrub && scrub.getTween()) scrub.getTween().progress(1); proxy.y = scrollY; jumpY = null; }, 60);
  };
  window.__goto = goto;
  if (Q.has('scene')) goto(parseInt(Q.get('scene'), 10), parseFloat(Q.get('p') || '0'));
}
window.__story = () => { const s = frameMs.slice().sort((a, b) => a - b); return { ...cur, median: +(s[s.length >> 1] || 0).toFixed(2), p95: +(s[Math.floor(s.length*0.95)] || 0).toFixed(2), level: +level.k.toFixed(2) }; };
if (hero) { window.__hero = hero; if (Q.get('bench') === '1') window.__bench = n => hero.bench(n); }
addEventListener('resize', () => { if (reduced) return; measure(); });
wideMQ.addEventListener('change', () => { refresh(); ScrollTrigger && ScrollTrigger.refresh(); });
if (document.readyState === 'complete' || window.gsap) (document.fonts ? document.fonts.ready : Promise.resolve()).then(boot);
else addEventListener('load', () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(boot));
