// The generative phoenix (ledger M36, GENOME.md). Tim, Thu 8 Oct 2026: "randomise the phoenix, both random standard
// phoenix each refresh and rebirth as well as a unique rainbow phoenix each refresh and each time it reappears ... tie
// it to the user if u can viewing".
//
// One function does the work: genomeFor(line, load, rebirth) -> { id, lifeA, lifeB }.
//   line     the viewer's line: 128 random bits made once in this browser and kept in localStorage. No fingerprinting,
//            no server, nothing personal. A private window or cleared storage simply starts a new line.
//   load     this viewer's page loads, counted from 1 (the caption's "No. 0042").
//   rebirth  the rebirths inside one visit, counted from 0 (each 32 s cycle is one flame life and one rainbow life).
// The same three numbers always give the same bird, so ?bird=<line>.<load>.<rebirth> reproduces one exactly.
//
// Every gene is drawn from a seeded PRNG (cyrb128 string hash into sfc32) inside a curated range, so each bird stays on
// brand and majestic (M35): no gene touches the head, beak or eye (their proportions were ruled in fh5 to fh7), and the
// shapes stay inside the lap's measured reach on a phone. Palettes are built in OKLCH and checked (gamut, muddiness,
// lightness order, step size, hue window, the head against the shell); a palette that fails is drawn again.
//
// This file has no dependency on the engine. The page's adapter (gen1.html, "THE GENOME ADAPTER") maps the genes onto
// its uniforms and constants. Classic script: it defines window.PhoenixGenome.
(function (root) {
'use strict';

// ---- seeded randomness ----------------------------------------------------------------------------------------------
function cyrb128(str) {                                // a fast 128-bit string hash (four 32-bit words)
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
function sfc32(a, b, c, d) {                           // small fast counter PRNG, 0 <= x < 1
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0; d = (d + 1) | 0;
    a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function rng(str) { const s = cyrb128(str), r = sfc32(s[0], s[1], s[2], s[3]); for (let i = 0; i < 12; i++) r(); return r; }
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pick = (r, items) => {                           // items: [value, weight] pairs
  const tot = items.reduce((s, it) => s + it[1], 0); let x = r() * tot;
  for (const it of items) { if ((x -= it[1]) < 0) return it[0]; } return items[items.length - 1][0];
};

// ---- OKLCH -----------------------------------------------------------------------------------------------------------
// The engine's palettes are display-encoded with a plain 2.2 curve (its oklchJS), so these are too.
function oklabToLinear(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const rad = d => d * Math.PI / 180;
function lchLinear(L, C, hDeg) { return oklabToLinear(L, C * Math.cos(rad(hDeg)), C * Math.sin(rad(hDeg))); }
function inGamut(L, C, hDeg) { return lchLinear(L, C, hDeg).every(v => v >= -1e-4 && v <= 1 + 1e-4); }
function maxChroma(L, hDeg) {                          // the sRGB gamut's edge at this lightness and hue (bisection)
  let lo = 0, hi = 0.4; for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (inGamut(L, m, hDeg)) lo = m; else hi = m; } return lo;
}
function lchDisplay(L, C, hDeg) {                      // in gamut by construction; clamp only guards the last bit
  return lchLinear(L, C, hDeg).map(v => +Math.pow(clamp(v, 0, 1), 1 / 2.2).toFixed(4));
}
function dE(p, q) {                                     // OKLab distance between two {L, C, h}
  const a1 = p.C * Math.cos(rad(p.h)), b1 = p.C * Math.sin(rad(p.h)), a2 = q.C * Math.cos(rad(q.h)), b2 = q.C * Math.sin(rad(q.h));
  return Math.hypot(p.L - q.L, a1 - a2, b1 - b2);
}
const wrap = h => ((h % 360) + 360) % 360;
function hex(rgbDisplay) { return '#' + rgbDisplay.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase(); }

// ---- life A: a flame family ------------------------------------------------------------------------------------------
// Four stops the bird runs through over its life (root to tip along each feather, tips a step ahead), plus a hot core.
// Mostly the flame (crimson or scarlet through orange to gold); occasionally ember-violet (a magenta ember at the root
// burning through red to amber) or white-gold (pale gold to near white).
const FAMILIES = [['flame', 0.78], ['ember-violet', 0.11], ['white-gold', 0.11]];
// Calibrated on fh7's approved Flame (OKLCH L 0.58, 0.63, 0.68, 0.78; hue 29, 31, 39, 66; every stop at the gamut's
// edge): the red holds through the first half of the life, then turns fast to gold. Lightness is laid stop by stop so
// the middle stops sit at the orange cusp (about L 0.68), where orange is most saturated; lighter, it goes peach.
function flameStops(r, fam) {
  let h0, span, L0, d1, d2, d3, cf, cf3, bend;
  if (fam === 'ember-violet') { h0 = lerp(338, 350, r()); span = lerp(70, 92, r()); L0 = lerp(0.52, 0.56, r()); d1 = lerp(0.04, 0.06, r()); d2 = lerp(0.05, 0.07, r()); d3 = lerp(0.09, 0.13, r()); cf = lerp(0.92, 1.0, r()); cf3 = lerp(0.86, 0.98, r()); bend = lerp(0.9, 1.3, r()); }
  else if (fam === 'white-gold') { h0 = lerp(56, 64, r()); span = lerp(14, 24, r()); L0 = lerp(0.76, 0.80, r()); d1 = lerp(0.03, 0.045, r()); d2 = lerp(0.035, 0.05, r()); d3 = lerp(0.04, 0.06, r()); cf = lerp(0.92, 1.0, r()); cf3 = lerp(0.8, 0.92, r()); bend = lerp(0.9, 1.2, r()); }
  else { h0 = lerp(25, 35, r()); span = lerp(30, 56, r()); L0 = lerp(0.56, 0.61, r()); d1 = lerp(0.035, 0.055, r()); d2 = lerp(0.04, 0.06, r()); d3 = lerp(0.08, 0.13, r()); cf = lerp(0.95, 1.0, r()); cf3 = lerp(0.88, 1.0, r()); bend = lerp(1.6, 2.6, r()); }
  const Ls = [L0, L0 + d1, L0 + d1 + d2, L0 + d1 + d2 + d3];
  return [0, 1, 2, 3].map(i => {
    const L = Ls[i], h = wrap(h0 + span * Math.pow(i / 3, bend));
    const C = maxChroma(L, h) * (i === 3 ? cf3 : cf);
    return { L: +L.toFixed(4), C: +C.toFixed(4), h: +h.toFixed(2) };
  });
}
// the checks: return the reasons a palette fails (empty = passes)
function checkFlame(stops, fam) {
  const why = [];
  const inBand = h => h >= 330 || h <= 105;            // reds, oranges, golds; violet only at the ember's root
  stops.forEach((s, i) => {
    if (!inGamut(s.L, s.C, s.h)) why.push(`stop ${i} out of gamut`);
    if (!inBand(s.h)) why.push(`stop ${i} hue ${s.h.toFixed(0)} outside the flame band`);
    if (s.C < (fam === 'white-gold' ? 0.035 : 0.07)) why.push(`stop ${i} greyed (C ${s.C.toFixed(3)})`);
    const rel = s.C / Math.max(maxChroma(s.L, s.h), 1e-4);
    if (fam !== 'white-gold' && rel < 0.78) why.push(`stop ${i} dull (${(rel * 100).toFixed(0)}% of the gamut's chroma)`);
    if (s.h >= 45 && s.h <= 110 && s.L < 0.64 + 0.002*(s.h - 45)) why.push(`stop ${i} muddy (orange or gold at L ${s.L.toFixed(2)} reads brown)`);   // gold needs more light than orange
    if (s.L < 0.5) why.push(`stop ${i} too dark on the night ground (L ${s.L.toFixed(2)})`);
  });
  for (let i = 1; i < 4; i++) {
    if (stops[i].L - stops[i - 1].L < 0.028) why.push(`lightness not rising at stop ${i}`);
    const d = dE(stops[i], stops[i - 1]);
    if (d < 0.035) why.push(`stops ${i - 1} and ${i} too close (dE ${d.toFixed(3)})`);
    if (d > 0.2) why.push(`stops ${i - 1} and ${i} clash (dE ${d.toFixed(3)})`);
  }
  return why;
}
const ANCHOR_FLAME = [{ L: 0.583, C: 0.236, h: 29.3 }, { L: 0.626, C: 0.247, h: 30.5 }, { L: 0.677, C: 0.216, h: 38.7 }, { L: 0.784, C: 0.166, h: 65.8 }];   // fh7's Flame
function flamePalette(r) { return flamePaletteOf(r, pick(r, FAMILIES)); }
function flamePaletteOf(r, fam) {
  let stops, tries = 0, why = [];
  for (; tries < 32; tries++) { stops = flameStops(r, fam); why = checkFlame(stops, fam); if (!why.length) break; }
  if (why.length) stops = ANCHOR_FLAME;                // never reached in the 20,000-bird sweep; kept as the floor
  const tip = stops[3];
  const hot = { L: lerp(0.95, 0.975, r()), C: 0, h: clamp(wrap(tip.h + lerp(-4, 10, r())), 62, 100) };
  hot.C = Math.min(maxChroma(hot.L, hot.h) * 0.9, fam === 'white-gold' ? lerp(0.025, 0.04, r()) : lerp(0.045, 0.07, r()));
  return { family: fam, tries: tries + 1, stops, hot: { L: +hot.L.toFixed(4), C: +hot.C.toFixed(4), h: +hot.h.toFixed(2) },
    fl: stops.map(s => lchDisplay(s.L, s.C, s.h)), hotRgb: lchDisplay(hot.L, hot.C, hot.h) };
}

// ---- life B: a spectrum ------------------------------------------------------------------------------------------------
// The engine's spectral(s): hue = h0 + dir*spread*s^1.12 (in turns), at one lightness and chroma with a lift toward
// yellow (OKLCH yellow is dark at an even lightness). s runs 0 at the wing's leading edge to about 1.15 at the crest.
function specAt(sp, s) {
  const hh = (((sp.h0 + sp.dir * Math.pow(Math.max(s, 0), 1.12) * sp.spread) % 1) + 1) % 1;
  const yl = Math.exp(-Math.pow(((((hh - 0.29 + 0.5) % 1) + 1) % 1 - 0.5) * 5, 2));
  return { L: sp.L + sp.lift * yl, C: sp.C - 0.015 * yl, h: hh * 360 };
}
function checkSpectrum(sp) {
  const why = []; let greyed = 0, n = 0;
  for (let s = 0; s <= 1.15 + 1e-9; s += 0.05) {       // the engine pulls an out-of-gamut colour toward its own grey:
    const c = specAt(sp, s), m = maxChroma(c.L, c.h); n++;   // too much of that and the band reads muddy
    if (m / c.C < 0.72) greyed++;
  }
  if (greyed / n > 0.2) why.push(`${greyed} of ${n} samples pulled toward grey`);
  const head = specAt(sp, 1.06).h;                     // the head and neck must not sit in the shell's blue-violet
  if (head >= 258 && head <= 300) why.push(`head hue ${head.toFixed(0)} sits in the shell's blue-violet`);
  const tail = specAt(sp, 1.0).h, wing = specAt(sp, 0.13).h;
  if (Math.min(Math.abs(tail - wing), 360 - Math.abs(tail - wing)) < 60) why.push('wing and tail tips too alike');
  return why;
}
function spectrum(r) {
  let sp, why = [], tries = 0;
  for (; tries < 32; tries++) {
    sp = { h0: r(), spread: lerp(0.72, 0.92, r()), dir: r() < 0.5 ? 1 : -1, L: lerp(0.69, 0.735, r()), C: lerp(0.150, 0.172, r()), lift: lerp(0.09, 0.14, r()) };
    why = checkSpectrum(sp); if (!why.length) break;
  }
  if (why.length) sp = { h0: 25 / 360, spread: 0.85, dir: 1, L: 0.71, C: 0.165, lift: 0.12 };
  Object.keys(sp).forEach(k => { if (k !== 'dir') sp[k] = +sp[k].toFixed(4); });
  sp.tries = tries + 1;
  const hot = { L: lerp(0.955, 0.975, r()), h: lerp(76, 92, r()) }; hot.C = Math.min(maxChroma(hot.L, hot.h) * 0.9, lerp(0.05, 0.075, r()));
  return { spec: sp, hot: { L: +hot.L.toFixed(4), C: +hot.C.toFixed(4), h: +hot.h.toFixed(2) }, hotRgb: lchDisplay(hot.L, hot.C, hot.h),
    fl: [0.05, 0.3, 0.55, 0.8].map(s => { const c = specAt(sp, s); const m = maxChroma(c.L, c.h); return lchDisplay(c.L, Math.min(c.C, m), c.h); }) };
}

// ---- the shapes --------------------------------------------------------------------------------------------------------
// Eye-spot patterns over the inner plumes (bit k-1 = inner plume k ends in an eye); the outer pair always does.
const EYE_MASKS = { 3: [[0b010, 0.4], [0b101, 0.3], [0b111, 0.15], [0b000, 0.15]],
                    4: [[0b0110, 0.4], [0b1001, 0.35], [0b0000, 0.25]],
                    5: [[0b00100, 0.3], [0b01010, 0.3], [0b10101, 0.25], [0b00000, 0.15]] };
function lifeAShape(r) {
  return {
    plumes: r() < 0.3 ? 3 : 2,                        // 2 long plumes, or a shorter third between them
    len: +lerp(0.84, 1.12, r()).toFixed(3),          // x 2.75 to 2.95 bird units
    curl: +lerp(0.55, 1.5, r()).toFixed(3),          // how far the pair sweeps apart and the depth of its S
    bars: +lerp(16, 30, r()).toFixed(2),             // barring along the plumes and crest
    barDepth: +lerp(0.40, 0.65, r()).toFixed(3),     // how dark the bars (fh7 0.55)
    crestLen: +lerp(0.7, 1.2, r()).toFixed(3),       // x 1.30
    crestRise: +lerp(0.7, 1.35, r()).toFixed(3),     // how upright the crest stands
    span: +lerp(0.94, 1.06, r()).toFixed(3),         // arm and hand bones
    prim: +lerp(0.92, 1.1, r()).toFixed(3),          // primaries' length
    heat: +lerp(0.85, 1.25, r()).toFixed(3),         // how much of the hot core the feather tips carry
  };
}
const LEADS = ['crest', 'eyes', 'edges', 'tips'];
function lifeBShape(r) {
  const inner = pick(r, [[3, 0.45], [4, 0.25], [5, 0.30]]);
  const lead = LEADS[Math.floor(r() * 4)], light = {};
  LEADS.forEach(k => { light[k] = k === lead ? +lerp(1.35, 1.6, r()).toFixed(3) : +lerp(0.8, 1.05, r()).toFixed(3); });
  return {
    plumes: inner + 2, inner,                        // 5 to 7: the outer pair and 3 to 5 inner
    eyeMask: pick(r, EYE_MASKS[inner]),
    eyeR: +lerp(0.88, 1.18, r()).toFixed(3),         // the plume eye's size
    len: +lerp(0.86, 1.0, r()).toFixed(3),           // x 3.4 (the phone's framing was measured at 1.0)
    crest: r() < 0.55 ? 3 : 5,
    crestLen: +lerp(0.85, 1.25, r()).toFixed(3),     // x 0.12
    crestRise: +lerp(0.85, 1.2, r()).toFixed(3),
    span: +lerp(0.97, 1.05, r()).toFixed(3),
    prim: +lerp(0.96, 1.08, r()).toFixed(3),
    lead, light,                                     // the light hierarchy: which features run hottest (M35)
  };
}

// ==== v2 (gen2, review gen1) =============================================================================================
// gen1's blind review: every bird had the same shape (High 1), the flame head was a carrot (High 2, the page's), and the
// day flame palettes collapsed into one dusty tone (High 3); ember-violet read as plain flame (top fix 1). v2 keeps v1
// untouched (gen1.html still draws v1, bird for bird) and adds:
//   1. Shape genes in visible ranges, both lives: wing span 0.8 to 1.2, primaries 0.75 to 1.3, the wingtip pointed or
//      fingered (5 to 7 slotted primaries) 50/50, neck 0.8 to 1.25, tail plume length, overall scale 0.9 to 1.15.
//   2. A gate: each bird differs from the one before it in its viewer's line (the previous rebirth of this load; the
//      first rebirth of the load before, for rebirth 0) in at least 3 shape genes by 15% or more (a flip of the wingtip
//      counts as one). Drawn again up to 64 times; then the 3 widest-ranged genes are pushed to the far end.
//   3. Flame families: flame, blue-white (replaces ember-violet), white-gold; each with its own day pigment
//      (vermilion #D9542B, ultramarine #3F6FD8, ochre #C9962E), so by day each reads as itself.
//   4. Life A's crest: 2, 3 or 4 plumes (the two long plumes always, M14); life B's: 2 or 3 long swept-back plumes.
const FAMILIES2 = [['flame', 0.72], ['blue-white', 0.14], ['white-gold', 0.14]];
const DAY_PIGMENT = { 'flame': '#D9542B', 'blue-white': '#3F6FD8', 'white-gold': '#C9962E' };
const hexRgb = h => [1, 3, 5].map(i => +(parseInt(h.slice(i, i + 2), 16) / 255).toFixed(4));
function blueStops(r) {                                // a blue-white flame: ultramarine root to pale sky tip (#3D6BFF to #7FB4FF)
  const h0 = lerp(264, 268, r()), h3 = lerp(246, 252, r()), L0 = lerp(0.56, 0.59, r());
  const Ls = [L0, L0 + lerp(0.06, 0.08, r()), L0 + lerp(0.12, 0.14, r()), L0 + lerp(0.19, 0.22, r())], cfs = [0.96, 0.9, 0.76, 0.62];
  return [0, 1, 2, 3].map(i => { const h = lerp(h0, h3, i / 3), C = maxChroma(Ls[i], h) * cfs[i];
    return { L: +Ls[i].toFixed(4), C: +C.toFixed(4), h: +h.toFixed(2) }; });
}
function checkBlue(stops) {
  const why = [];
  stops.forEach((s, i) => { if (!inGamut(s.L, s.C, s.h)) why.push(`stop ${i} out of gamut`); if (s.h < 235 || s.h > 272) why.push(`stop ${i} hue ${s.h} outside the blue band (no violet)`);
    if (s.C < 0.06) why.push(`stop ${i} greyed`); });
  for (let i = 1; i < 4; i++) { if (stops[i].L - stops[i - 1].L < 0.028) why.push(`lightness not rising at stop ${i}`); const d = dE(stops[i], stops[i - 1]); if (d < 0.035 || d > 0.2) why.push(`stops ${i - 1}, ${i} dE ${d.toFixed(3)}`); }
  return why;
}
function flamePalette2(r) {
  const fam = pick(r, FAMILIES2);
  if (fam !== 'blue-white') { const p = flamePaletteOf(r, fam); p.dayRgb = hexRgb(DAY_PIGMENT[fam]); return p; }
  let stops, why = [], tries = 0;
  for (; tries < 32; tries++) { stops = blueStops(r); why = checkBlue(stops); if (!why.length) break; }
  const hot = { L: lerp(0.955, 0.97, r()), h: lerp(250, 262, r()) }; hot.C = Math.min(maxChroma(hot.L, hot.h) * 0.9, lerp(0.018, 0.028, r()));   // #EAF2FF
  return { family: fam, tries: tries + 1, stops, hot: { L: +hot.L.toFixed(4), C: +hot.C.toFixed(4), h: +hot.h.toFixed(2) },
    fl: stops.map(s => lchDisplay(s.L, s.C, s.h)), hotRgb: lchDisplay(hot.L, hot.C, hot.h), dayRgb: hexRgb(DAY_PIGMENT[fam]) };
}
// the shape genes the gate compares, with their ranges (a binary gene counts as differing when it flips)
const SHAPE_KEYS = ['span', 'prim', 'finger', 'neck', 'len', 'scale'];
const RANGES = { A: { span: [0.8, 1.2], prim: [0.75, 1.3], neck: [0.8, 1.25], len: [0.8, 1.12], scale: [0.9, 1.15] },
                 B: { span: [0.8, 1.2], prim: [0.75, 1.3], neck: [0.8, 1.25], len: [0.8, 1.0], scale: [0.9, 1.15] } };
function drawShape(r, life) {
  const R = RANGES[life], o = {};
  for (const k of ['span', 'prim', 'neck', 'len', 'scale']) o[k] = +lerp(R[k][0], R[k][1], r()).toFixed(3);
  o.finger = r() < 0.5 ? 1 : 0; o.fingers = 5 + Math.floor(r() * 3);
  return o;
}
function shapeDiffs(a, b) {
  return SHAPE_KEYS.filter(k => k === 'finger' ? a.finger !== b.finger : Math.max(a[k], b[k]) / Math.min(a[k], b[k]) >= 1.15);
}
function nextShape(prev, r, life) {
  let c;
  for (let i = 0; i < 64; i++) { c = drawShape(r, life); if (!prev || shapeDiffs(c, prev).length >= 3) return { ...c, gateTries: i + 1 }; }
  const R = RANGES[life];                              // never reached in the sweep; the floor: push three genes to the far end
  for (const k of ['span', 'prim', 'neck']) c[k] = prev[k] < (R[k][0] + R[k][1]) / 2 ? R[k][1] : R[k][0];
  return { ...c, gateTries: 65 };
}
const chainMemo = new Map();
function shapeFor(line, load, rebirth, life) {         // the gated shape, walked along the viewer's line from its first bird
  const key = `${line}.${life}`; let ch = chainMemo.get(key);
  if (!ch) { ch = []; if (chainMemo.size > 64) chainMemo.clear(); chainMemo.set(key, ch); }
  const r0 = l => rng(`phoenix.v2.shape.${line}.${l}.0.${life}`);
  while (ch.length < load) { const l = ch.length + 1; ch.push(nextShape(ch.length ? ch[ch.length - 1] : null, r0(l), life)); }
  let s = ch[load - 1];
  for (let k = 1; k <= rebirth; k++) s = nextShape(s, rng(`phoenix.v2.shape.${line}.${load}.${k}.${life}`), life);
  return s;
}
function genomeFor2(line, load, rebirth) {
  const base = `phoenix.v2.${line}.${load}.${rebirth}`;
  const rA = rng(base + '.a'), rB = rng(base + '.b');
  const pa = flamePalette2(rA), pb = spectrum(rB), A = lifeAShape(rA), B = lifeBShape(rB);
  A.crest = pick(rA, [[2, 0.4], [3, 0.35], [4, 0.25]]); B.crest = rB() < 0.5 ? 2 : 3;
  B.crestLen = +lerp(0.85, 1.2, rB()).toFixed(3);
  const sA = shapeFor(line, load, rebirth, 'A'), sB = shapeFor(line, load, rebirth, 'B');
  return {
    id: `${line}.${load}.${rebirth}`, version: 2,
    lifeA: { kind: 'flame', family: pa.family, palette: pa, ...A, ...sA },
    lifeB: { kind: 'rainbow', palette: pb, ...B, ...sB },
  };
}

// ==== v3 (gen3, review gen2) =============================================================================================
// gen2's blind review: 15 of 24 flame birds were the same orange (top fix 1), a head hung free of its body in the dive
// (High 1) and the flame crest was two long sticks, not a crest (High 2). v3 keeps v1 and v2 untouched (gen1.html and
// gen2.html still draw their birds, bird for bird) and changes:
//   1. Flame families: flame 34%, white-gold 10%, blue-white 20%, violet-gold 18% (violet through most of the life, burning to gold
//      at the tips, never violet alone), jade 18% (B41's neon green, an emerald root to a pale lime tip). Orange is the flame
//      family alone, so at most 40% of births (measured in shots/gen3/measure/families.json). Day pigments are I1's
//      minerals (ledger M39): cinnabar, ochre, azurite, rouge lake, malachite.
//   2. The neck gene is 0.85 to 1.1 (v2 0.8 to 1.25), so no bird holds its head further from its wings than fh10's own
//      bird does by more than 10% (the detach check, shots/gen3/measure/detach.json).
//   3. Life A's tail plumes 0.9 to 1.1 of 1.2 body lengths (the page sets the 1.2); crest length 0.85 to 1.15 of 1.5 head
//      lengths; crest plumes 2, 3 or 4, all swept back (the page draws them as the fenghuang's).
const FAMILIES3 = [['flame', 0.34], ['white-gold', 0.10], ['blue-white', 0.20], ['violet-gold', 0.18], ['jade', 0.18]];
const DAY_PIGMENT3 = { 'flame': '#C23B22', 'white-gold': '#C9962E', 'blue-white': '#2F5D8A', 'violet-gold': '#99406B', 'jade': '#2E8B6A' };
// the HEY HEY LABS avoid list (brands/hhl/DESIGN.md section 4) as OKLCH, for the family check
function hexLch(h) {
  const lin = hexRgb(h).map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]), m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]), s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(a, b), h: wrap(Math.atan2(b, a) * 180 / Math.PI) };
}
const AVOID = { 'Claude orange #D97757': '#D97757', 'Claude cream #F4F1EA': '#F4F1EA', 'Dose wall green #1F473E': '#1F473E', 'Dose mint #B4DBD5': '#B4DBD5',
  'Dose cross orange #F05926': '#F05926', 'Dose ink #173030': '#173030' };
function violetGoldStops(r) {                          // violet through most of the life (OKLCH 296 to 316, rising in light), gold at the tips (84 to 92)
  const hv = lerp(296, 306, r()), hg = lerp(84, 92, r()), L0 = lerp(0.50, 0.54, r());
  const st = [{ L: L0, h: hv, k: 0.92 }, { L: L0 + lerp(0.08, 0.10, r()), h: hv + lerp(2, 6, r()), k: 0.86 }, { L: L0 + lerp(0.19, 0.21, r()), h: hv + lerp(6, 10, r()), k: 0.62 }, { L: lerp(0.85, 0.87, r()), h: hg, k: 0.7 }];
  return st.map(s => ({ L: +s.L.toFixed(4), C: +(maxChroma(s.L, s.h) * s.k).toFixed(4), h: +s.h.toFixed(2) }));
}
function jadeStops(r) {                                // emerald at the root (OKLCH 148 to 156) to a pale lime tip (124 to 130)
  const h0 = lerp(148, 156, r()), h3 = lerp(124, 130, r()), L0 = lerp(0.62, 0.65, r());
  const Ls = [L0, L0 + lerp(0.07, 0.08, r()), L0 + lerp(0.15, 0.17, r()), lerp(0.88, 0.9, r())], ks = [0.95, 0.92, 0.85, 0.7];
  return [0, 1, 2, 3].map(i => { const h = lerp(h0, h3, i / 3); return { L: +Ls[i].toFixed(4), C: +(maxChroma(Ls[i], h) * ks[i]).toFixed(4), h: +h.toFixed(2) }; });
}
// a new family's own checks: in gamut, lit enough on the night ground, lightness rising, no muddy step, its hue band,
// and every stop at least 0.1 (OKLab) from every avoid-list colour
function checkFamily3(stops, fam) {
  const why = [];
  const band = fam === 'violet-gold' ? (h, i) => (i < 3 ? h >= 290 && h <= 318 : h >= 78 && h <= 95) : (h) => h >= 118 && h <= 160;
  stops.forEach((s, i) => {
    if (!inGamut(s.L, s.C, s.h)) why.push(`stop ${i} out of gamut`);
    if (!band(s.h, i)) why.push(`stop ${i} hue ${s.h} outside the ${fam} band`);
    if (s.L < 0.5) why.push(`stop ${i} too dark on the night ground`);
    if (s.C < 0.05) why.push(`stop ${i} greyed (C ${s.C})`);
    for (const [name, hx] of Object.entries(AVOID)) { const d = dE(s, hexLch(hx)); if (d < 0.1) why.push(`stop ${i} ${d.toFixed(3)} from ${name}`); }
  });
  for (let i = 1; i < 4; i++) { if (stops[i].L - stops[i - 1].L < 0.028) why.push(`lightness not rising at stop ${i}`); const d = dE(stops[i], stops[i - 1]); if (d < 0.035) why.push(`stops ${i - 1}, ${i} too close`); }
  return why;
}
function flamePalette2BW(r) {                          // v2's blue-white, drawn on this rng
  let stops, why = [], tries = 0;
  for (; tries < 32; tries++) { stops = blueStops(r); why = checkBlue(stops); if (!why.length) break; }
  const hot = { L: lerp(0.955, 0.97, r()), h: lerp(250, 262, r()) }; hot.C = Math.min(maxChroma(hot.L, hot.h) * 0.9, lerp(0.018, 0.028, r()));
  return { family: 'blue-white', tries: tries + 1, stops, why, hot: { L: +hot.L.toFixed(4), C: +hot.C.toFixed(4), h: +hot.h.toFixed(2) },
    fl: stops.map(s => lchDisplay(s.L, s.C, s.h)), hotRgb: lchDisplay(hot.L, hot.C, hot.h) };
}
function flamePalette3(r) {
  const fam = pick(r, FAMILIES3);
  if (fam === 'flame' || fam === 'white-gold') { const p = flamePaletteOf(r, fam); p.dayRgb = hexRgb(DAY_PIGMENT3[fam]); return p; }
  if (fam === 'blue-white') { const p = flamePalette2BW(r); p.dayRgb = hexRgb(DAY_PIGMENT3[fam]); return p; }
  const make = fam === 'jade' ? jadeStops : violetGoldStops;
  let stops, why = [], tries = 0;
  for (; tries < 32; tries++) { stops = make(r); why = checkFamily3(stops, fam); if (!why.length) break; }
  const hot = fam === 'jade' ? { L: lerp(0.955, 0.97, r()), h: lerp(118, 126, r()) } : { L: lerp(0.955, 0.97, r()), h: lerp(86, 94, r()) };
  hot.C = Math.min(maxChroma(hot.L, hot.h) * 0.9, lerp(0.03, 0.05, r()));
  return { family: fam, tries: tries + 1, stops, why, hot: { L: +hot.L.toFixed(4), C: +hot.C.toFixed(4), h: +hot.h.toFixed(2) },
    fl: stops.map(s => lchDisplay(s.L, s.C, s.h)), hotRgb: lchDisplay(hot.L, hot.C, hot.h), dayRgb: hexRgb(DAY_PIGMENT3[fam]) };
}
const RANGES3 = { A: { span: [0.8, 1.2], prim: [0.75, 1.3], neck: [0.85, 1.1], len: [0.9, 1.1], scale: [0.9, 1.15] },
                  B: { span: [0.8, 1.2], prim: [0.75, 1.3], neck: [0.85, 1.1], len: [0.8, 1.0], scale: [0.9, 1.15] } };
function drawShape3(r, life) {
  const R = RANGES3[life], o = {};
  for (const k of ['span', 'prim', 'neck', 'len', 'scale']) o[k] = +lerp(R[k][0], R[k][1], r()).toFixed(3);
  o.finger = r() < 0.5 ? 1 : 0; o.fingers = 5 + Math.floor(r() * 3);
  return o;
}
function nextShape3(prev, r, life) {                   // v2's gate (3 of 6 shape genes differ by 15%, or a flip)
  let c;
  for (let i = 0; i < 64; i++) { c = drawShape3(r, life); if (!prev || shapeDiffs(c, prev).length >= 3) return { ...c, gateTries: i + 1 }; }
  const R = RANGES3[life];
  for (const k of ['span', 'prim', 'scale']) c[k] = prev[k] < (R[k][0] + R[k][1]) / 2 ? R[k][1] : R[k][0];
  return { ...c, gateTries: 65 };
}
const chainMemo3 = new Map();
function shapeFor3(line, load, rebirth, life) {
  const key = `${line}.${life}`; let ch = chainMemo3.get(key);
  if (!ch) { ch = []; if (chainMemo3.size > 64) chainMemo3.clear(); chainMemo3.set(key, ch); }
  const r0 = l => rng(`phoenix.v3.shape.${line}.${l}.0.${life}`);
  while (ch.length < load) { const l = ch.length + 1; ch.push(nextShape3(ch.length ? ch[ch.length - 1] : null, r0(l), life)); }
  let s = ch[load - 1];
  for (let k = 1; k <= rebirth; k++) s = nextShape3(s, rng(`phoenix.v3.shape.${line}.${load}.${k}.${life}`), life);
  return s;
}
function genomeFor3(line, load, rebirth) {
  const base = `phoenix.v3.${line}.${load}.${rebirth}`;
  const rA = rng(base + '.a'), rB = rng(base + '.b');
  const pa = flamePalette3(rA), pb = spectrum(rB), A = lifeAShape(rA), B = lifeBShape(rB);
  A.crest = pick(rA, [[2, 0.3], [3, 0.4], [4, 0.3]]); A.crestLen = +(0.85 + (A.crestLen - 0.7) / 0.5 * 0.3).toFixed(3);
  B.crest = rB() < 0.5 ? 2 : 3; B.crestLen = +lerp(0.85, 1.2, rB()).toFixed(3);
  const sA = shapeFor3(line, load, rebirth, 'A'), sB = shapeFor3(line, load, rebirth, 'B');
  return {
    id: `${line}.${load}.${rebirth}`, version: 3,
    lifeA: { kind: 'flame', family: pa.family, palette: pa, ...A, ...sA },
    lifeB: { kind: 'rainbow', palette: pb, ...B, ...sB },
  };
}

// ==== v4 (gen4, review gen3) =============================================================================================
// gen3's blind review, top fix 3: the rainbow birds differed by colour more than by shape. v4 is v3, bird for bird (the
// same rng streams, so every v3 gene is unchanged), plus a body-shape gene for the rainbow bird from its own stream:
//   neck 0.8 to 1.3 (v3 0.85 to 1.1) and body length 0.85 to 1.2 (the torso, tail root to neck root, along the bird's
//   axis; gen4.html draws it). The detach check runs again over 500 seeds by 24 poses (shots/gen4/measure/detach.json).
// v1 to v3 are untouched, so gen1 to gen3 still draw their birds.
const RANGES4B = { neck: [0.8, 1.3], body: [0.85, 1.2] };
// B66 (Tim, Fri 9 Oct 2026: "More red is good"): the 'flame' family is redder, crimson to scarlet to gold, about OKLCH
// (0.55, 0.22, 22), (0.60, 0.24, 25), (0.65, 0.23, 30), (0.78, 0.16, 62); by day its pigment is a crimson, #C8203A. A
// flame stop within OKLab 0.05 of Dose's cross orange #F05926 is rejected and the palette drawn again (the target's
// third stop sits 0.045 from it, so the third stop is held a little redder; counted in shots/gen4/measure/crimson.json).
// The other four families are v3's, unchanged.
const DOSE_ORANGE = '#F05926', DAY_CRIMSON4 = '#C8203A';
function crimsonStops(r) {
  const L0 = lerp(0.54, 0.565, r()), h0 = lerp(20, 24, r()), L1 = L0 + lerp(0.045, 0.055, r()), h1 = h0 + lerp(2, 4, r());
  const L2 = L1 + lerp(0.035, 0.055, r()), h2 = lerp(26, 31, r()), L3 = lerp(0.77, 0.8, r()), h3 = lerp(58, 66, r());
  const tC = [0.22, 0.24, 0.23, 0.16];
  return [[L0, h0], [L1, h1], [L2, h2], [L3, h3]].map(([L, h], i) => { const C = Math.min(maxChroma(L, h) * lerp(0.95, 1.0, r()), tC[i] + 0.01);
    return { L: +L.toFixed(4), C: +C.toFixed(4), h: +h.toFixed(2) }; });
}
function checkDoseOrange(stops) { const d = hexLch(DOSE_ORANGE), why = [];
  stops.forEach((s, i) => { const e = dE(s, d); if (e < 0.05) why.push(`stop ${i} ${e.toFixed(3)} from Dose orange`); }); return why; }
const CRIMSON_ANCHOR = [{ L: 0.55, C: 0.22, h: 22 }, { L: 0.60, C: 0.24, h: 25 }, { L: 0.64, C: 0.235, h: 28 }, { L: 0.78, C: 0.16, h: 62 }];
function crimsonPalette4(r) {
  let stops, why = [], tries = 0, doseRejects = 0;
  for (; tries < 32; tries++) { stops = crimsonStops(r); const dw = checkDoseOrange(stops); if (dw.length) doseRejects++; why = checkFlame(stops, 'flame').concat(dw); if (!why.length) break; }
  if (why.length) stops = CRIMSON_ANCHOR;
  const hot = { L: lerp(0.95, 0.975, r()), h: lerp(62, 74, r()) }; hot.C = Math.min(maxChroma(hot.L, hot.h) * 0.9, lerp(0.045, 0.07, r()));
  return { family: 'flame', tries: tries + 1, doseRejects, anchored: why.length > 0, stops, hot: { L: +hot.L.toFixed(4), C: +hot.C.toFixed(4), h: +hot.h.toFixed(2) },
    fl: stops.map(s => lchDisplay(s.L, s.C, s.h)), hotRgb: lchDisplay(hot.L, hot.C, hot.h), dayRgb: hexRgb(DAY_CRIMSON4) };
}
function genomeFor4(line, load, rebirth) {
  const g = genomeFor3(line, load, rebirth), r = rng(`phoenix.v4.body.${line}.${load}.${rebirth}`);
  const neck = +lerp(RANGES4B.neck[0], RANGES4B.neck[1], r()).toFixed(3), body = +lerp(RANGES4B.body[0], RANGES4B.body[1], r()).toFixed(3);
  let lifeA = g.lifeA;
  if (lifeA.family === 'flame') lifeA = { ...lifeA, palette: crimsonPalette4(rng(`phoenix.v4.flame.${line}.${load}.${rebirth}`)) };   // B66
  return { ...g, version: 4, lifeA, lifeB: { ...g.lifeB, neck, body } };
}

// ---- the genome ----------------------------------------------------------------------------------------------------------
const VERSION = 1;
function genomeFor(line, load, rebirth, version) {
  if (version === 2) return genomeFor2(line, load, rebirth);
  if (version === 3) return genomeFor3(line, load, rebirth);
  if (version === 4) return genomeFor4(line, load, rebirth);
  const base = `phoenix.v${VERSION}.${line}.${load}.${rebirth}`;
  const rA = rng(base + '.a'), rB = rng(base + '.b');
  const pa = flamePalette(rA), pb = spectrum(rB);
  return {
    id: `${line}.${load}.${rebirth}`,
    lifeA: { kind: 'flame', family: pa.family, palette: pa, ...lifeAShape(rA) },
    lifeB: { kind: 'rainbow', palette: pb, ...lifeBShape(rB) },
  };
}
// fh7's own bird, gene for gene (for &genes=0, and the adapter's neutral values)
const NEUTRAL = {
  lifeA: { plumes: 2, len: 1, curl: 1, bars: 22, barDepth: 0.55, crestLen: 1, crestRise: 1, span: 1, prim: 1, heat: 1 },
  lifeB: { plumes: 5, inner: 3, eyeMask: 0b010, eyeR: 1, len: 1, crest: 3, crestLen: 1, crestRise: 1, span: 1, prim: 1, lead: 'none',
           light: { crest: 1, eyes: 1, edges: 1, tips: 1 }, palette: { spec: { spread: 0.85, dir: 1, L: 0.71, C: 0.165, lift: 0.12 } } },
};
function describe(g) {
  const a = g.lifeA, b = g.lifeB;
  if (g.version === 4) return { flame: `${a.family}, span ${a.span}, ${a.finger ? a.fingers + ' fingers' : 'pointed'}, neck ${a.neck}, x${a.scale}`,
    rainbow: `h0 ${Math.round(b.palette.spec.h0 * 360)}°, span ${b.span}, ${b.finger ? b.fingers + ' fingers' : 'pointed'}, neck ${b.neck}, body ${b.body}, x${b.scale}, ${b.crest}-plume crest` };
  if (g.version === 2 || g.version === 3) return { flame: `${a.family}, span ${a.span}, ${a.finger ? a.fingers + ' fingers' : 'pointed'}, neck ${a.neck}, x${a.scale}`,
    rainbow: `h0 ${Math.round(b.palette.spec.h0 * 360)}°, span ${b.span}, ${b.finger ? b.fingers + ' fingers' : 'pointed'}, neck ${b.neck}, x${b.scale}, ${b.crest}-plume crest` };
  return { flame: `${a.family}, ${a.plumes} plumes, crest x${a.crestLen}`, rainbow: `h0 ${Math.round(b.palette.spec.h0 * 360)}°, ${b.palette.spec.dir === -1 ? 'reversed, ' : ''}${b.plumes} plumes, ${b.crest}-plume crest, ${b.lead} hottest` };
}

// ---- the viewer ----------------------------------------------------------------------------------------------------------
const KEY_LINE = 'hhl-phoenix-line', KEY_LOAD = 'hhl-phoenix-load.';
function newLine() {
  const b = new Uint8Array(16);
  try { (root.crypto || {}).getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  return Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
}
// Reads ?bird= (reproduce one bird: no storage touched), ?line= (simulate another viewer, with its own load counter),
// ?load= (pin the load). Otherwise the stored line, or a new one, and this load = the stored count + 1.
function viewer(search) {
  const Q = new URLSearchParams(search || '');
  const bird = (Q.get('bird') || '').match(/^([0-9a-z]{1,64})\.(\d{1,9})\.(\d{1,9})$/i);
  if (bird) return { line: bird[1].toLowerCase(), load: +bird[2], rebirth0: +bird[3], source: 'bird' };
  let store = null; try { store = root.localStorage; store.getItem(KEY_LINE); } catch (e) { store = null; }
  const qLine = (Q.get('line') || '').match(/^[0-9a-z]{1,64}$/i);
  let line = qLine ? qLine[0].toLowerCase() : null, source = qLine ? 'url-line' : 'stored';
  if (!line) { try { line = store && store.getItem(KEY_LINE); } catch (e) { line = null; }
    if (!line || !/^[0-9a-f]{32}$/.test(line)) { line = newLine(); source = 'new'; try { store && store.setItem(KEY_LINE, line); } catch (e) {} } }
  let load = 1;
  if (Q.has('load')) load = Math.max(1, parseInt(Q.get('load'), 10) || 1);
  else { try { load = (parseInt(store && store.getItem(KEY_LOAD + line), 10) || 0) + 1; store && store.setItem(KEY_LOAD + line, String(load)); } catch (e) { load = 1; } }
  return { line, load, rebirth0: 0, source };
}
const label = load => 'No. ' + String(load).padStart(4, '0');

root.PhoenixGenome = { VERSION, genomeFor, viewer, label, describe, NEUTRAL, checks: { doseOrange: checkDoseOrange, flame: checkFlame, spectrum: checkSpectrum, blue: checkBlue, family3: checkFamily3, shapeDiffs }, FAMILIES3, AVOID, hexLch,
  util: { cyrb128, sfc32, rng, maxChroma, lchDisplay, specAt, hex, dE } };
})(typeof window !== 'undefined' ? window : globalThis);
