// The bird, kept apart from the engine so a newer bird can be dropped in.
//
// Round 8 (Thu 8 Oct 2026): the phoenix of 2026-10-07-hhl-phoenix-field/lab/r5.html, ported whole: every feather a
// function (a curved shaft, a vane, barbs), drawn twice, as sparks (the point pass) and as anti-aliased hairlines (the
// stroke pass, one instanced quad per segment); the leading edge as one smooth curve; the tail and crest plumes as
// simulated silk (verlet chains with inertia, drag and a feather's stiffness); a wingbeat whose rate and depth follow
// the lap (slow deep strokes as it unfolds, a glide, wings swept back for the dive); the death drawn along the shell into
// the pillar's foot. On top of r5: two lives (M27). Loop 0, 2, 4 ... is life A, the flame phoenix (r5's Phoenix flame
// ramp); loop 1, 3 ... is life B, the rainbow fenghuang. The rebirth at the top pole is where one becomes the other.
//
// v3-r5 (Fri 9 Oct 2026): fh10 PORTED (tools/port-fh10.py, on port-fh9.py): fh10's geometry block whole and its
// build-fh10.mjs hunks for the passes and the rig (both lives' heads, crests, eyes; the body and neck light; the flame
// tail 1.2 bodies; both birds 1.3 times on a phone).
// v3-r5: fh9 PORTED (tools/port-fh9.py, on port-fh8.py): fh8's geometry block whole; its look, point and stroke
// passes and its rig by fh8's own hunks: the 3.4 S tail with travelling waves, the folded-plume fix (no rebirth
// block), the feathered head and short hooked beak, the light hierarchy, the fenghuang 20% grander on a slower beat.
// Not ported: fh8's engine-only passes (the night motes' buffer, the axis pull, the pillar's top glow, the day wash's
// push) and its lap; the landing keeps its own lap, which the scroll's clock is tuned to.
//
// v3-r2 (Thu 8 Oct 2026): THE FH5 BIRD IS IN (both lives), through this swap point.
//   From 2026-10-07-hhl-phoenix-field/lab/fh5.html (design 081dc852): its geometry whole (BIRD_GLSL: the fenghuang's
//   upright S of a neck and its head, the crest of five, broader wings, the tail of seven with eye and flame tips, body
//   feathers facing the viewer), its birdXf (the head-first draw into the pole, the two births: a flame licking up off the
//   crown, a ring of light turning round it), its birdHue and nine-argument birdCol (the white-gold core, the eyes), its
//   point pass (the sparkle along the silk, the eye's one spark), its stroke pass and STROKES table (the inner plumes and
//   the head's line work for life B only), and its rest shapes (restLocal, plumeLenJS, LEN_B).
//   Kept from the landing: its own lap (the page's loop clock is tuned to it, and the scroll holds it), the pole
//   direction for the close's last pass (uPoleD), the absorb into the pole, the engine's day drawing.
//   Not ported (engine passes, outside this file): fh5's soft mass pass for the torso and head, its wisp pass, its depth of
//   field, its second lap with free flight for life B. hero.js changed by two lines only: the stroke loop sets uFOff and
//   uHeadG and skips life B's own groups while life A flies.
// ============================================================================================================
//
// SWAP POINT. Everything that is the bird lives in this file; hero.js uses only what is exported here.
//   BIRD_ENGINE_DECL   the engine uniforms every bird shader reads (declared once, here)
//   BIRD_HELPERS_GLSL  hash(vec2), flame, depthOf, zoomRaw, zoomOf, zoomGain (the engine's points pass uses them too)
//   BIRD_GLSL          the geometry: vec3 birdPoint(vec3 h, float flap, out vec4 info) and the part functions; sets gSpec
//   BIRD_LOOK_GLSL     birdXf (gather out of the top pole, draw into a pole along the shell), birdCol, birdOcc,
//                      birdEmberCol (an ember's colour), spectral
//   BIRD_UPDATE_GLSL   update shader: birdEmberBorn, birdWakeK
//   BIRD_VERTEX_GLSL   points shader: isBirdClass, birdTexel, birdVertex, birdEmberK, birdFieldTouch
//   BIRD_STROKE_VS/FS  the hairline pass; STROKES its groups
//   BIRD (JS)          share, emberAlpha, reach, sparkA, strokeA, createRig
//   createRig({ phone, period, homeDir }) returns { at(T, phase), flapHz(tau), simulate(dt, b), outline(b),
//     uniforms(gl, u, b, eye), lifeOf(T), setLift(k), TOP_IN, POLE_IN }

export const BIRD_ENGINE_DECL = `
uniform mat4 uVP;
uniform float uPx, uTau, uPeriod, uBurn, uScale, uFlap, uT, uForm, uFireA, uRep, uBirdK;
uniform vec3 uC, uF, uU, uS, uInk, uInk2, uHot; uniform vec3 uFl[4];`;

export const BIRD_HELPERS_GLSL = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
vec3 flame(float x){ x = fract(x)*4.0; int i = int(floor(x)); return mix(uFl[i], uFl[(i+1)%4], smoothstep(0.0, 1.0, fract(x))); }
float depthOf(vec4 cp){ return clamp(1.0 - (cp.z/cp.w)*0.5 - 0.25, 0.25, 1.0); }
float zoomRaw(vec4 cp){ return 7.0/max(cp.w, 0.05); }
float zoomOf(vec4 cp){ return clamp(zoomRaw(cp), 0.6, 1.15); }              // points stay fine strands when close
float zoomGain(vec4 cp){ return clamp(sqrt(zoomRaw(cp)/1.15), 1.0, 1.8); }  // and the light they lose comes back as brightness`;

// fh10: the fenghuang's tail is drawn 0.75 under 600 px (fh10's shader reads this when the module loads)
const TAIL_PHB = typeof innerWidth !== 'undefined' && innerWidth < 600 ? 0.75 : 1;
export const BIRD_GLSL = `
// fh5 (2026-10-07-hhl-phoenix-field/lab/fh5.html, design 081dc852), ported whole through the swap point (v3-r2).
uniform float uAbsorb; uniform vec3 uPole;                // the landing's absorb: drawn into a pole

// The phoenix in full plumage, in its own frame: x across the wings, y off its back, z toward the head.
// Every part is drawn as feathers: a shaft, a vane edge and barbs slanting toward the tip, so the bird reads as strokes.
// h.x picks the part; the leftover fractions of h pick the feather and the place on it. info: part, tip, heat, weight.
uniform vec3 uPath[8]; uniform float uPathStep, uUnfurl;   // uUnfurl: 0 folded at rebirth, 1 open
// the plumes are simulated (verlet chains with inertia, air drag and a feather's stiffness, see simChains): two tail
// plumes of 28 nodes, then two crest plumes of 16, in the bird's own frame. uAmp: the beat's amplitude (gliding is
// small), uTuck: the wings swept back for the dive.
uniform vec3 uChain[88]; uniform float uAmp, uTuck;
uniform vec3 uViewL;                                 // r7: the direction to the eye in the bird's own frame
// r7: how much of a body or neck feather shows. The torso and neck are tubes of feathers; seen from the side, the ones
// edge-on at the silhouette piled into an outline and the far side's shafts crossed the near side as chords. Only the
// feathers facing the viewer are drawn (a soft turn-off from 55 degrees round to edge-on), so the torso fills like a wing
float facing(vec3 n, vec3 ax){ vec3 v = uViewL - ax*dot(uViewL, ax), m = n - ax*dot(n, ax); float l = length(v);   // ax: the tube's axis
  if (l < 1e-3 || length(m) < 1e-3) return 1.0;
  return mix(1.0, smoothstep(-0.05, 0.55, dot(normalize(m), v/l)), clamp(l*2.5, 0.0, 1.0)); }
// r7: a body feather's sparks sit on its barbs (a few on the shaft), never on the vane's edge, so no outline is traced
vec3 vaneB(float r1, float r2, float r3, float nb, float slant){
  if (r1 < 0.3) return vec3(r2, (r3 - 0.5)*0.05, 0.9);
  float b = floor(r2*nb), side = fract(r2*nb) < 0.5 ? -1.0 : 1.0;
  return vec3(min((b + 0.5)/nb + r3*slant, 1.0), side*sqrt(r3), 0.6);
}
// fh: the two lives. uFh 0 is the flame phoenix (r5's form), 1 the fenghuang: a longer S of a neck, a crest of five
// plumes, broader wings with longer primaries, a tail of seven plumes (eye tips and flame points). The rebirth morphs
// one into the other as the wings unfold. gSpec: where a point sits on the bird's spectrum (0 the wing's leading edge,
// 1 the tail's tips); gCore: how much of the white-gold core it carries; gEye: the eye ring's pattern on a plume tip.
// fh9: uHold (life B's raised glide held), uWOpen (the wings opening at the rebirth), uFlare (the crest and plume eyes
// flaring as it unfolds), uHeadK (the head's scale about the skull; 1.45 on a phone)
uniform float uHold, uWOpen, uFlare, uHeadK;
uniform float uFh;
float gSpec = 0.0, gCore = 0.0, gEye = 0.0, gEdge = 0.0, gSpark = 0.0, gHead = 0.0, gSkull = 0.0, gHi = 0.0;
float gWing = -1.0, gFlr = 0.0;   // fh9: gWing, where a wing point sits shoulder (0) to tip (1), -1 off the wing; gFlr, the rebirth flare's points (crest tips, plume eyes)   // fh8 (M35): gHi, the fenghuang's hot highlights (crest tips, plume eyes, the wing's leading edge)
   // fh7: gSkull, the skull and beak alone   // fh4: gSpark marks the eye's one spark; gHead the head, neck and crest   // fh3: gEdge, where the fenghuang's plumes and crest tips sparkle
const float PI = 3.14159265;
vec3 headPos(){ return mix(vec3(0.0, 0.135, 0.54), vec3(0.0, 0.33, 0.585), uFh); }   // fh3: the fenghuang carries its head high on an upright neck
vec3 bdir(float sweep, float elev){ return vec3(cos(elev)*cos(sweep), sin(elev), -cos(elev)*sin(sweep)); }
vec3 pathAt(float s){                              // the flight path behind the bird, s local units back from its centre
  float k = clamp(s/uPathStep, 0.0, 6.999); int i = int(k); float f = k - float(i);
  vec3 a = uPath[max(i - 1, 0)], b = uPath[i], c = uPath[min(i + 1, 7)], d = uPath[min(i + 2, 7)];
  vec3 p = 0.5*((2.0*b) + (-a + c)*f + (2.0*a - 5.0*b + 4.0*c - d)*f*f + (-a + 3.0*b - 3.0*c + d)*f*f*f);
  float over = s - 7.0*uPathStep;
  if (over > 0.0) p = uPath[7] + normalize(uPath[7] - uPath[6] + vec3(0.0, 0.0, -1e-4))*over;
  return p;
}
// where a particle sits on a feather: u along the shaft, v across the vane (-1 leading, +1 trailing), and its weight
vec3 vane(float r1, float r2, float r3, float nb, float slant){
  if (r1 < 0.36) return vec3(r2, (r3 - 0.5)*0.05, 1.0);                                   // the shaft
  if (r1 < 0.60) return vec3(r2, (r3 < 0.5 ? -1.0 : 1.0)*(0.92 + 0.16*fract(r3*2.0)), 0.7); // the vane edge
  float b = floor(r2*nb), side = fract(r2*nb) < 0.5 ? -1.0 : 1.0;                        // barbs
  return vec3(min((b + 0.5)/nb + r3*slant, 1.0), side*r3, 0.5);
}
// The shaft is a curve, not a rod: in the vane's own plane its tip sweeps toward the trailing side as c*L*u*u with
// c = 0.12, so the chord's midpoint sits 3% of the feather's length off the shaft (sagitta c/4, over sqrt(1 + c*c)).
// B keeps only the air's bend out of that plane; the vane is laid out across the curved shaft's local normal.
const float SAG_C = 0.12;
vec3 feather(vec3 R, vec3 D, vec3 N, vec3 B, float L, float wv, vec3 uv){
  vec3 P = normalize(cross(N, D));
  float u = uv.x;
  float w = wv*L*sqrt(max(sin(PI*min(u*1.12, 1.0)), 0.0))*(1.0 - 0.3*u)*(uv.y < 0.0 ? 0.45 : 1.0);
  vec3 Pl = normalize(P - D*(2.0*SAG_C*u));
  // fh4 (M32): each feather has its own slight S across its length and a slow flutter out of its plane, growing to the
  // tip; each barb sweeps toward the tip along its length (a curve, not a ruled line) and its end flickers in the air
  float sd = fract(sin(dot(R, vec3(91.7, 47.3, 13.1)))*4375.5453)*6.2831853;
  vec3 bend = P*(0.010*L*sin(PI*u*1.6 + sd)*u) + N*(L*u*u*(0.022*sin(uT*1.3 + sd) + 0.008*sin(uT*4.1 + sd*2.0 + u*5.0)));
  float ay = abs(uv.y);
  vec3 barbC = D*(0.30*w*ay*ay) + N*(0.10*w*ay*ay*sin(uT*3.7 + sd + u*9.0));
  return R + D*(L*u) + P*(SAG_C*L*u*u) + N*(dot(B, N)*L*u*u) + Pl*(uv.y*w) + bend + barbC;
}
float fjit(float n){ return fract(sin(n*12.9898 + 4.1414)*43758.5453); }   // a fixed jitter per feather, 0 to 1
float featherFade(float u){ return 1.0 - smoothstep(0.85, 1.0, u); }      // every feather fades out over its last 15%
float rootFade(float u){ return smoothstep(0.0, 0.15, u); }              // flight feathers rise out of the coverts, no hard root line
void bones(float ph, out vec3 sh, out vec3 el, out vec3 wr, out vec3 tp, out vec3 dH, out float fold){
  float e = sin(ph), rising = cos(ph);
  fold = mix(1.0, max(smoothstep(-0.2, 0.9, rising)*0.7*uAmp, uTuck), uWOpen);   // folds at the wrist on the upstroke; born folded (fh9: opens in 0.5 s)
  float th = mix(0.34 + 0.62*e*uAmp, 0.12, uTuck);     // a raised V plus the beat; swept low and back for the dive
  // fh9 (review fh8, top fix 1): in life B's long glide the wings are held raised and spread: 35 degrees of dihedral,
  // open at the wrist, the beat reduced to a slow breath, so the hero frame reads as fh7's fanned bird
  fold = mix(fold, 0.0, uHold); th = mix(th, 0.61 + 0.05*e, uHold);
  sh = vec3(0.07, 0.035, 0.10);
  float wk = mix(1.0, 1.12, uFh);                     // fh8 (M35): the fenghuang's arm and hand 12% longer: a wider span
  el = sh + bdir(-0.15 + 0.40*fold, th)*0.30*wk;
  wr = el + bdir(0.12 + 0.80*fold, th + 0.18*(1.0 - 0.75*uHold)*sin(ph - 0.7))*0.40*wk;
  dH = bdir(0.32 + 1.0*fold, th + 0.40*(1.0 - 0.75*uHold)*sin(ph - 1.2));  // the hand lags the arm
  tp = wr + dH*0.38*wk;
}
// the leading edge as one smooth curve: Catmull-Rom through shoulder, elbow, wrist and tip (t 0 to 3), arcing a little
// forward, so the roots of the flight feathers and the marginal coverts never line up on a ruler-straight bone
vec3 armAt(float t, vec3 sh, vec3 el, vec3 wr, vec3 tp){
  float k = clamp(t, 0.0, 2.999); int i = int(k); float f = k - float(i);
  vec3 a0 = 2.0*sh - el, a4 = 2.0*tp - wr;
  vec3 a = i == 0 ? a0 : (i == 1 ? sh : el), b = i == 0 ? sh : (i == 1 ? el : wr);
  vec3 c = i == 0 ? el : (i == 1 ? wr : tp), d = i == 0 ? wr : (i == 1 ? tp : a4);
  vec3 p = 0.5*((2.0*b) + (-a + c)*f + (2.0*a - 5.0*b + 4.0*c - d)*f*f + (-a + 3.0*b - 3.0*c + d)*f*f*f);
  return p + vec3(0.0, 0.012, 0.080)*sin(PI*pow(clamp(t/3.0, 0.0, 1.0), 1.6));   // most forward at the wrist
}
// a long pheasant plume, like the two feathers on Sun Wukong's cap: it follows the path the bird just flew, sweeps out
// to its own side in a long S, and carries a slow travelling wave that grows toward the tip
vec3 chainAt(int base, int n, float x){              // Catmull-Rom through a simulated chain, x in node units
  float k = clamp(x, 0.0, float(n - 1) - 1e-3); int i = int(k); float f = k - float(i);
  vec3 a = uChain[base + max(i - 1, 0)], b = uChain[base + i], c = uChain[base + min(i + 1, n - 1)], d = uChain[base + min(i + 2, n - 1)];
  return 0.5*((2.0*b) + (-a + c)*f + (2.0*a - 5.0*b + 4.0*c - d)*f*f + (-a + 3.0*b - 3.0*c + d)*f*f*f);
}
float plumeLen(float kk);
vec3 chainDir(int base, int n, float x){             // fh2: the chain's direction from its node segments, no second spline
  float k = clamp(x, 0.0, float(n - 1) - 1e-3); int i = int(k); float f = k - float(i);
  vec3 a = uChain[base + min(i + 1, n - 1)] - uChain[base + i], b = uChain[base + min(i + 2, n - 1)] - uChain[base + min(i + 1, n - 1)];
  return mix(a, b, smoothstep(0.0, 1.0, f)*step(float(i), float(n) - 2.5)); }
// a long pheasant plume, like the two feathers on Sun Wukong's cap: its rachis is the simulated chain
vec3 spine(float s, float kk){ return chainAt(kk < 0.0 ? 0 : 28, 28, (s - 0.3)/max(plumeLen(kk), 1e-3)*27.0); }
float plumeUnf(){ return mix(0.06, 1.0, smoothstep(0.4, 1.0, uUnfurl)); }   // fh8: how far the tail's plumes have unfurled (length, 0.06 to 1)
float plumeLen(float kk){ return (kk > 0.0 ? 1.24 : 1.14)*mix(0.06, 1.0, smoothstep(0.4, 1.0, uUnfurl)); }   // unfurl last
float barred(float u, float n){ float b = fract(u*n); return 0.45 + 0.55*smoothstep(0.08, 0.22, b)*(1.0 - smoothstep(0.58, 0.72, b)); }
vec3 crestWave(float u, float kk){ return vec3(sin(u*4.0 - uT*2.6 + kk*1.3), 0.6*sin(u*3.2 - uT*2.1 + kk), 0.0)*0.05*u*u; }
// Every feather is a function of (which feather, uv on it): u along the shaft, v across the vane (-1 leading, +1
// trailing), and a weight. The particle pass samples them at random; the stroke pass walks them as hairlines (the rachis,
// and every barb from the shaft out to the vane edge), so the plumage resolves as real feathers at any zoom.
// grp 0 primaries (10 a side), 1 secondaries (11), 2 tertials (3), 3 greater coverts (16)
vec3 wingF(float grp, float i, float side, vec3 uv, float flap, out vec4 info){
  float rising = cos(flap), spread = mix(smoothstep(0.3, -0.9, rising), 1.0, uHold);
  vec3 sh, el, wr, tp, dH; float fold; vec3 p;
  if (grp < 0.5) {                                   // ten primaries splaying like fingers
    float fi = i/9.0;
    bones(flap - 0.55*uv.x*fi - 0.2 - 0.12*uv.x*uv.x, sh, el, wr, tp, dH, fold);   // the tips lag the hand: secondary motion
    vec3 N = normalize(cross(dH, vec3(0.0, 0.0, -1.0)));
    float psi = (0.20 + (1.05 + 0.35*spread)*fi)*(1.0 - 0.5*fold);
    vec3 D = normalize(cos(psi)*vec3(0.0, 0.0, -1.0) + sin(psi)*dH);
    float L = mix(0.50 + 0.46*pow(fi, 0.7), 0.56 + 0.58*pow(fi, 0.8), uFh)*(1.0 - 0.12*fold)*(0.95 + 0.10*fjit(i*1.7 + 0.3));   // the fenghuang's primaries run longer
    vec3 B = vec3(0.0, 0.0, -0.10) - N*(0.16*rising + 0.05*sin(flap - 1.6)) + N*0.03*sin(uT*8.0 + i*1.7)*uv.x;   // air bends the shaft
    p = feather(armAt(2.04 + 0.92*pow(fi, 0.9), sh, el, wr, tp), D, N, B, L, mix(0.13, 0.15, uFh), uv);
    gSpec = 0.13 + 0.25*uv.x + 0.12*fi;                 // leading edge to trailing tips, and a step on per finger
    gWing = clamp(0.50 + 0.22*fi + 0.30*uv.x*(0.35 + 0.65*fi), 0.0, 1.0);   // fh9: the primaries carry the cool end, blue at the outer tip
    p += N*(0.012*uv.y*uv.y*uv.x*sin(uT*19.0 + uv.x*11.0 + i*2.3 + uv.y*3.0));   // the vane's edge flutters in the airflow
    info = vec4(1.0, 0.5 + 0.5*uv.x, pow(uv.x, 4.0)*0.8, uv.z*rootFade(uv.x));
  } else if (grp < 1.5) {                            // eleven secondaries along the forearm
    float fj = i/10.0;
    bones(flap - 0.35*uv.x - 0.1, sh, el, wr, tp, dH, fold);
    vec3 dF = normalize(wr - el), N = normalize(cross(dF, vec3(0.0, 0.0, -1.0)));
    float psi = 0.03 + 0.24*fj + 0.06*(fjit(i*3.1 + 2.0) - 0.5);
    vec3 D = normalize(cos(psi)*vec3(0.0, 0.0, -1.0) + sin(psi)*dF);
    vec3 B = vec3(0.0, 0.0, -0.05) - N*(0.10*rising);
    float L = (0.40 + 0.07*sin(PI*fj) - 0.03*fj)*(0.92 + 0.16*fjit(i*2.3 + 5.1))*mix(1.0, 1.22, uFh);   // broader, rounder
    p = feather(armAt(1.0 + 0.98*fj, sh, el, wr, tp), D, N, B, L, mix(0.17, 0.19, uFh), uv);
    gSpec = 0.11 + 0.22*uv.x + 0.04*fj;
    gWing = 0.08 + 0.40*fj + 0.06*uv.x;
    p += N*(0.008*uv.y*uv.y*uv.x*sin(uT*17.0 + uv.x*9.0 + i*1.9));
    info = vec4(1.0, 0.35 + 0.4*uv.x, pow(uv.x, 4.0)*0.4, uv.z*0.9*rootFade(uv.x));
  } else if (grp < 2.5) {                            // three tertials over the body
    bones(flap - 0.2*uv.x, sh, el, wr, tp, dH, fold);
    vec3 dU = normalize(el - sh), N = normalize(cross(dU, vec3(0.0, 0.0, -1.0)));
    p = feather(armAt(0.15 + 0.35*i, sh, el, wr, tp), normalize(vec3(-0.12 - 0.05*i, 0.0, -1.0)), N, vec3(0.0, 0.0, -0.04), 0.36*(0.84 + 0.08*i + 0.10*fjit(i + 9.0)), 0.22, uv);
    info = vec4(1.0, 0.25 + 0.3*uv.x, 0.0, uv.z*0.8*rootFade(uv.x));
    gSpec = 0.09 + 0.15*uv.x; gWing = 0.03*uv.x;
  } else {                                           // greater coverts, a shorter row over the flight feathers
    float fm = i/15.0;
    bones(flap - 0.1*uv.x, sh, el, wr, tp, dH, fold);
    vec3 dS = fm < 0.5 ? normalize(wr - el) : dH, N = normalize(cross(dS, vec3(0.0, 0.0, -1.0)));
    float psi = (mix(0.08, 0.75, fm) + 0.08*(fjit(i*2.9 + 1.1) - 0.5))*(1.0 - 0.5*fold);
    vec3 D = normalize(cos(psi)*vec3(0.0, 0.0, -1.0) + sin(psi)*dS);
    vec3 R = armAt(1.0 + fm*1.96, sh, el, wr, tp) + N*0.02;
    p = feather(R, D, N, vec3(0.0, 0.0, -0.03), 0.21*mix(0.92, 1.06, fm)*(0.82 + 0.30*fjit(i*1.9 + 3.3)), 0.32, uv);
    info = vec4(1.0, 0.3, 0.0, uv.z*0.8*rootFade(uv.x));
    gSpec = 0.04 + 0.08*uv.x + 0.04*fm; gWing = 0.06 + 0.50*fm;
  }
  info.w *= featherFade(uv.x);
  p.x *= side; return p;
}
// the simulated plumes get the same 3% sagitta: an arc lifting off the chain (zero at both ends, 0.03 L at the middle),
// toward the bird's up, so a plume at rest never reads as a straight rod
vec3 plumeBow(vec3 T, float L, float u){ vec3 n = vec3(0.0, 1.0, 0.0) - T*T.y; float k = length(n);
  return (k > 1e-3 ? n/k : vec3(1.0, 0.0, 0.0))*(4.0*0.03*L*u*(1.0 - u)); }
// the crest: in the flame life two long thin plumes arcing up and back (the simulated chains). fh3: in the fenghuang,
// three short plumes rising up and back from the crown, each 0.35 of the neck's length (about 0.17), the outer two
// splayed a little to the sides, every tip curling back and a little down; they sway together, never droop
vec3 crestB(float k, float u, out vec3 T){
  // fh9 (review fh8, High 1; gen1 top fix 3): three long fine plumes swept back from the crown, the upper one 40 degrees
  // over the line of the skull, the lower 18 (about 30 on average), each a little longer than the one under it, so side
  // on they read as three separate lines and never as a fan, a comma or a glow; they sway one after another
  float sd = k < 0.5 ? -1.0 : (k > 3.5 ? 1.0 : 0.0), j = k < 0.5 ? 0.0 : (k > 3.5 ? 2.0 : 1.0);
  float L = mix(0.36, 0.28, j*0.5)*mix(0.867, 1.0, uFh)*mix(1.0, uHeadK, 0.6)*mix(0.25, 1.0, max(smoothstep(0.2, 0.85, uUnfurl), uWOpen));
  vec3 R = headPos() + vec3(sd*0.010, 0.026 - 0.004*j, -0.020)*uHeadK;   // fh5: rooted in the skull, not on it
  float an = mix(0.70, 0.32, j*0.5) + 0.3*(1.0 - uFh);   // fh10
  vec3 d = normalize(vec3(sd*mix(0.22, 0.10, uFh), sin(an), -cos(an)));
  vec3 c = R + L*(d*u + vec3(0.0, -0.30, -0.06)*u*u + vec3(0.0, 0.10, 0.0)*u*u*u);
  T = normalize(d + vec3(0.0, -0.60, -0.12)*u + vec3(0.0, 0.30, 0.0)*u*u + vec3(0.0, 0.0, -1e-5));
  return c + vec3(sin(uT*2.2 - u*3.0 + j*1.1), 0.5*sin(uT*1.7 - u*2.4 + j), 0.0)*0.016*u*u;
}
vec3 crestF(float k, vec3 uv, out vec4 info){
  // fh8 (review fh7, High 1): lc, the crest's unfurl. Both lives' folded crests (a quarter of their length at full width,
  // end on at the rebirth) were a bright block at the throat; now it is narrower in proportion and its light follows its area
  float lc = mix(0.25, 1.0, max(smoothstep(0.2, 0.85, uUnfurl), uWOpen*uFh)), u = uv.x, L = 1.30*lc;   // fh9: the fenghuang's crest opens with its wings, so it can flare at the rebirth
  float m = k/4.0, inner = step(0.5, k)*step(k, 3.5), mm = step(0.5, m);
  vec3 c0 = chainAt(56, 16, u*15.0), c1 = chainAt(72, 16, u*15.0);
  vec3 cA = mix(c0, c1, mm), TA = normalize(mix(chainDir(56, 16, u*15.0), chainDir(72, 16, u*15.0), mm) + vec3(0.0, 0.0, -1e-5));
  cA += plumeBow(TA, L, u);
  vec3 TB, cB = crestB(k, u, TB);
  // fh10 (review fh9, High 1): life A's crest is three swept-back plumes too (fh9 drew its two long simulated plumes)
  vec3 c = cB, T = normalize(TB + vec3(0.0, 0.0, -1e-5));
  vec3 P = normalize(cross(T, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 0.0, 0.2));
  // fh4: both lives' crests are the tail's slender plume in small: a fine vane tapering to a point, barred like the tail
  float w = sqrt(lc)*(mix(0.016, 0.012, uFh)*(0.55 + 0.45*smoothstep(0.0, 0.08, u))*pow(1.0 - u, 0.7) + 0.002)*mix(1.0, 0.85 + 0.3*sin(PI*u), uFh);   // fh5: the fenghuang's crest starts full on the head
  float vis = 1.0;   // fh10: three plumes in both lives
  float tip = uFh*smoothstep(0.62, 0.92, u)*(1.0 - smoothstep(0.97, 1.0, u));   // the curled tips catch the light
  info = vec4(3.0, 0.45 + 0.55*u, u*u*0.5 + 0.35*tip, lc*sqrt(lc)*smoothstep(0.25, 0.55, lc)*vis*uv.z*mix(1.05, 1.0, uFh)*mix(barred(u, 22.0), 0.8 + 0.2*barred(u, 22.0), uFh)*mix(featherFade(u), 1.0, tip)*(1.0 + 0.25*tip));
  gSpec = 0.92 + 0.22*u + 0.03*(k - 2.0); gEye = 0.0; gEdge = tip; gHi = 0.55*tip; gFlr = uFh*smoothstep(0.55, 1.0, u);
  gWing = uFh > 0.5 ? 0.02 + 0.16*u : -1.0;   // fh9: the crest in the warm end, vermilion to gold, its tips white-gold (never violet, B29)
  return c + P*uv.y*w;
}
vec3 tcovF(float k, vec3 uv, out vec4 info, float flap){   // tail coverts: short and quiet, so the long plumes lead
  float spread = smoothstep(0.3, -0.9, cos(flap));
  float kc = k - 3.0, a = kc/3.0*0.26*(0.85 + 0.3*spread);
  float lt = mix(0.4, 1.0, smoothstep(0.2, 0.8, uUnfurl)), L = 0.30*lt;   // fh8: lt, the coverts' unfurl (light scales with it)
  vec3 D = normalize(vec3(sin(a), -0.06, -cos(a))), R = vec3(sin(a)*0.03, 0.02, -0.30);
  vec3 bendP = (pathAt(0.30 + L*uv.x) - vec3(0.0, 0.0, -0.30 - L*uv.x))*0.7;
  info = vec4(4.0, 0.3 + 0.4*uv.x, pow(uv.x, 4.0)*0.3, uv.z*0.6*featherFade(uv.x)*lt);
  gSpec = 0.30 + 0.12*uv.x + 0.02*kc; gCore = 0.3*(1.0 - uv.x);
  return feather(R, D, vec3(0.0, 1.0, 0.0), vec3(0.0, -0.03, 0.0), L, 0.26, uv) + bendP;
}
// THE SIGNATURE. The flame life: two very long pheasant plumes, barred, to a fine point. fh3, the fenghuang: five
// flowing plumes 1.6 times its body and head (about 1.8), fanned over 35 degrees between the two simulated chains (so all
// five ride the same silk), each in a long S; the outer two are the longest and curl up at the tip (the chains' rest
// shape carries the S and the curl, see restLocal). The outer pair and the middle one end in an eye (a small oval in
// rings of the spectrum), the other two in flame points that waver. k 0 and 6 are the outer pair; the inner three are
// k 1 to 3 (m 0.25, 0.5, 0.75 across the fan).
float plumeLenK(float k){ return k < 0.5 || k > 5.5 ? 1.0 : (abs(k - 2.0) < 0.5 ? 0.76 : 0.86); }
vec3 plumeAt(float x, float mm){ return mix(chainAt(0, 28, x), chainAt(28, 28, x), mm); }
vec3 plumeF(float k, vec3 uv, out vec4 info, float flap){
  float mA = k/6.0, mB = k > 5.5 ? 1.0 : k/4.0, m = mix(mA, mB, uFh);
  float inner = step(0.5, k)*step(k, 5.5), lk = mix(1.0, plumeLenK(k), uFh), mm = mix(step(0.5, mA), mB, uFh);
  // fh8 (review fh7, High 1): lf is how far the plume has unfurled. fh7 folded the full plume's particles and barbs into
  // 6% of its length at the full width, so at every rebirth the tail's root was a solid hard-edged block (a rainbow swatch
  // at night, an ink slab by day). Now a folded plume is narrower in proportion and carries light in proportion to its
  // area, so its density per pixel never rises above the open plume's; it grows out of the seed's soft light
  float lf = mix(0.06, 1.0, smoothstep(0.4, 1.0, uUnfurl)), lfA = lf*sqrt(lf)*smoothstep(0.06, 0.3, lf);
  float L = mix(mix(1.14, 1.24, mm), ${(3.4*TAIL_PHB).toFixed(3)}, uFh)*lf*lk, u = uv.x, x = u*lk*27.0;
  float fan = 1.0 - abs(2.0*m - 1.0);
  vec3 lift = vec3(0.0, 0.10*fan*u*u, 0.0)*uFh;
  vec3 c = plumeAt(x, mm) + lift, T = normalize(mix(chainDir(0, 28, x), chainDir(28, 28, x), mm) + vec3(0.0, 0.20*fan*u, 0.0)*uFh*L/27.0 + vec3(0.0, 0.0, -1e-5));
  c += plumeBow(T, L, u);
  vec3 P = normalize(cross(vec3(0.0, 1.0, 0.0), T));
  vec3 Q = normalize(cross(T, P));
  float eye = (k < 0.5 || k > 5.5 || abs(k - 2.0) < 0.5) ? 1.0 : 0.0, flame = 1.0 - eye;
  // fh7 (M34; fh8 M35 raised its amplitudes from 0.045 and 0.035 to 0.065 and 0.05): each inner plume rides the outer pair's silk plus its own travelling wave, the same wave as the chains'
  // rest pose (across on the slow clock and half the wingbeat, up and down on the beat) but phase-lagged 0.45 rad per
  // plume, so the five plumes undulate one after another like ribbons and never move as one sheet
  { float lag = (k - 2.0)*0.45 + 0.3, A = L*pow(u, 1.25);
    c += P*(0.065*inner*A*sin(6.2832*1.05*u - (0.55*flap + 1.25*uT) + lag))*uFh;
    c += Q*(0.05*inner*A*sin(6.2832*0.9*u - flap - 0.6 + lag*0.8))*uFh; }
  // fh8 (review fh7, finding 2): every plume, the outer pair included, carries one more travelling wave (period 1.4 s,
  // 0.12 body lengths at the tip (M35: up from the review's 0.08), about 1.1 waves along the plume), each plume 0.12 s behind its neighbour, turning
  // helically (across, then up and down), on a narrow cone: 9 degrees across from the chains, plus 7 degrees each side
  // here, laid across the plume as the viewer sees it, so seen edge on or in a steep dive the five never close into one
  // line (where the two chains cross, the plumes between them would otherwise all meet)
  { float pk = m*4.0, ph = 6.2832*(uT/1.4 - 1.1*u) - pk*6.2832*0.12/1.4, A8 = 0.13*pow(u, 1.2);
    c += (P*sin(ph) + Q*0.75*cos(ph))*A8*uFh;
    vec3 E = cross(T, uViewL); E = length(E) > 0.2 ? normalize(E) : Q;   // across the plume AS SEEN, so the cone never closes edge on
    c += E*(m - 0.5)*2.0*0.123*L*u*uFh; }
  c += P*(0.022*flame*smoothstep(0.6, 1.0, u)*sin(u*24.0 - uT*6.5 + k*2.1))*uFh;          // flame points waver
  float w0 = (mix(0.12, 0.092, uFh)*smoothstep(0.0, 0.05, u)*pow(1.0 - u, 0.6) + 0.004)*sqrt(lf);   // fh7: the fenghuang's long plumes are slender (fh6 0.15 on a 1.82 plume)
  float UE = mix(0.87, 0.91, uFh), RE = mix(0.08, 0.05, uFh);   // fh7: on the longer plume the eye keeps its size (0.16 of 1.82 then, 0.10 of 3.4 now)
  float ez = (u - UE)/RE, eyeK = eye*uFh;
  float wE = 0.078*sqrt(max(1.0 - ez*ez, 0.0))*sqrt(lf);
  float w = mix(w0, w0*mix(1.0, 0.55, smoothstep(0.55, 0.78, u)), eyeK);                 // the eye plumes thin to a bare shaft
  w = max(w, wE*eyeK);
  w = mix(w, w*pow(max(1.0 - u, 0.0), 0.35), flame*uFh);                                  // flame plumes taper finer
  float bar = mix(barred(u, 22.0), 0.8 + 0.2*barred(u, 22.0), uFh);
  float ring = 1.0, er = length(vec2(ez, uv.y*w/max(wE, 1e-3)));
  gEye = 0.0;
  if (eyeK > 0.0 && abs(ez) < 1.0) {                                                      // the eye: core, a dark gap, a ring
    gEye = eyeK*(er < 0.38 ? 1.0 : (er < 0.56 ? 0.0 : (er < 0.8 ? 0.5 : 0.25)));
    ring = mix(1.0, er > 0.38 && er < 0.56 ? 0.25 : 1.3, eyeK);
  }
  float tipFade = 1.0 - eyeK*smoothstep(UE + RE*0.85, UE + RE*1.25, u);
  gHi = eyeK*(abs(ez) < 1.0 ? (er < 0.38 ? 1.0 : (er > 0.56 && er < 0.8 ? 0.45 : 0.0)) : 0.0);   // fh8: each eye's core blazes, its ring glints
  gFlr = gHi;
  ring *= 1.0 + 0.7*eyeK*step(abs(ez), 1.0)*exp(-er*er*6.0);                              // fh3: a soft inner glow in each eye
  gEdge = uFh*smoothstep(0.78, 0.96, abs(uv.y))*smoothstep(0.08, 0.3, u)*(1.0 - eyeK*step(abs(ez), 1.0));   // silk edges
  float vis = mix(1.0 - inner, 1.0, uFh);
  info = vec4(5.0, 0.3 + 0.6*u, u*u*0.25 + 0.15*(1.0 - bar) + 0.35*flame*uFh*smoothstep(0.85, 1.0, u),
              vis*uv.z*(uv.z > 0.9 ? 1.45 : 1.15)*bar*featherFade(u)*ring*tipFade*max(lfA, 0.7*uFlare*eyeK*step(abs(ez), 1.0)*step(er, 0.38)));   // fh9: the plume eyes' cores light first, in the flare, before the plumes unfurl
  gSpec = 0.40 + 0.62*u + (m - 0.5)*0.10;
  return c + P*uv.y*w;
}
// the body (r6): one tapered form, full at the breast and narrowing to 60% of the r5 width toward the tail root, so the
// breast flows into the tail instead of ending in a round oblong. tr runs 0 at the tail root to 1 at the neck's base.
float bodyR(float tr){ float t = clamp(tr, 0.0, 1.0);
  return 0.115*pow(max(sin(PI*mix(0.04, 0.88, pow(t, 0.85))), 0.0), 0.75)*mix(0.6, 1.0, smoothstep(0.3, 0.8, t)); }   // the breast meets the neck at its width
vec3 bodyS(float tr, float a){ float r = bodyR(tr); return vec3(cos(a)*r, 0.02 + sin(a)*r*0.8, mix(-0.34, 0.24, tr)); }
// the body's contour feathers (r7: 6 rows of 24, wider vanes, barbed like the wings): offset row to row like scales, each
// a short feather laid back along the body's surface, long enough to reach over the next row, and only those facing the
// viewer drawn, so the torso is one stippled vane
const float BODY_ROWS = 6.0, BODY_COLS = 24.0;
vec3 bodyF(float row, float col, vec3 uv, out vec4 info){
  float tr = 0.95 - row*0.155, a = (col + 0.5 + 0.5*mod(row, 2.0))/BODY_COLS*2.0*PI + 0.05*(fjit(row*24.0 + col) - 0.5);
  vec3 n = normalize(vec3(cos(a), sin(a)*0.8, 0.0));
  vec3 R = bodyS(tr, a) + n*0.004, D = normalize(bodyS(tr - 0.03, a) - bodyS(tr, a));
  float L = (0.23 + 0.03*fjit(row*7.0 + col*3.1))*(row > 2.5 ? 1.1 : 1.0), r = bodyR(tr - 0.15);   // each reaches well over the next row
  info = vec4(2.0, 0.25 + 0.3*uv.x, 0.15 + 0.25*uv.x*uv.x, (0.75 + 0.25*step(0.0, sin(a)))*uv.z*mix(0.5, 1.0, rootFade(uv.x))*featherFade(uv.x)*facing(n, -D));
  gCore = 0.9 - 0.35*uv.x; gSpec = 0.30 - 0.25*tr;
  return feather(R, D, n, -n*0.10, L, clamp(0.5*r/L, 0.08, 0.26), uv);
}
vec3 neckF(float row, float col, vec3 uv, out vec4 info){
  vec3 H = headPos();
  float t = (row + 0.5)/10.0, it = 1.0 - t;
  vec3 P0 = vec3(0.0, 0.03, 0.20), P1 = mix(vec3(0.025, -0.06, 0.34), vec3(0.02, -0.02, 0.37), uFh), P2 = mix(vec3(-0.02, 0.19, 0.37), vec3(-0.02, 0.36, 0.44), uFh), P3 = H + vec3(0.0, -0.004, -0.045*uHeadK);   // fh10: the neck runs into the skull, never short of it
  vec3 c = it*it*it*P0 + 3.0*it*it*t*P1 + 3.0*it*t*t*P2 + t*t*t*P3;
  vec3 tg = normalize(3.0*it*it*(P1 - P0) + 6.0*it*t*(P2 - P1) + 3.0*t*t*(P3 - P2));
  float a = (col + 0.5 + 0.5*mod(row, 2.0))/10.0*2.0*PI, rr = mix(mix(0.065, 0.038, t), mix(0.078, 0.047, t), uFh);   // fh8 (review fh7, 5): the fenghuang's neck fuller (fh7 0.060 to 0.030), a phoenix's ruff, not an egret's
  vec3 n = normalize(vec3(cos(a), sin(a)*0.85, 0.0));
  info = vec4(2.0, 0.15 + 0.2*uv.x, 0.15, 1.1*uv.z*featherFade(uv.x)*facing(n, tg));
  gCore = mix(0.75, 0.2, t); gSpec = 0.96 + 0.12*t + 0.04*uv.x;      // the neck's hackles carry the end of the spectrum
  return feather(c + n*rr, normalize(-tg + n*0.25), n, -n*0.008, mix(0.11, 0.145, uFh), mix(0.4, 0.46, uFh), uv);   // fh8: B's hackles longer and broader   // r7: long enough to lap the next row
}
// fh4: the head as one tapered silhouette, filled through: a skull 1.6 times the beak's length (0.16 against 0.10),
// round at the back, narrowing into the beak, which runs on from it to a fine point with a slight droop; one eye spark,
// on the side facing the viewer
const float HEAD_L = 0.16, BEAK_L = 0.10;
// fh9 (review fh8, High 1): life B's head is three readable parts. The skull 0.13 (fh8 0.16), the beak 0.9 of it
// (0.117, fh8 0.056), closed, full at the root and hooked to a hard tip; the eye a third of the skull behind the beak
float headL(){ return mix(0.12, 0.13, uFh); }   // fh10: life A's skull 0.12 (fh9 0.16), round, not a cone
// fh6: the fenghuang's beak is short, 35% of the skull's length (0.056 against 0.16; A keeps 0.10), full at its root
// and drawn to a fine point that hooks down at the tip; HSPLIT: where along the head the beak starts
float beakL(){ return mix(0.065, 0.117, uFh); }   // fh10: life A's beak 0.35 of its head (0.065 of 0.185)
float headSplit(){ return headL()/(headL() + beakL()); }
vec3 headPt(float s, float a, float rho, out float r){
  float HL = headL(), bl = beakL(), z = s*(HL + bl), sb = max(z - HL, 0.0)/bl;
  float zq = z/HL;                                 // fh5: the fenghuang's skull is domed (full to the brow, then the beak), not a cone
  // fh10 (review fh9, High 1): life A's skull is domed and round, 1.5 times the beak's base (0.036 against 0.024), the beak full
  // at its root and closed, with a slight droop
  r = z < HL ? mix(max(0.034*sqrt(max(1.0 - (zq - 0.5)*(zq - 0.5)/0.3136, 0.0)), 0.024*smoothstep(0.55, 1.0, zq))*sqrt(smoothstep(0.0, 0.02, z)), (0.017 + 0.030*(1.0 - zq*zq*zq))*sqrt(smoothstep(0.0, 0.045, z)), uFh) : 0.024*pow(max(1.0 - sb, 0.0), 0.8);
  float dro = mix(0.010*sb*sb, 0.003*sb*sb + 0.020*pow(sb, 6.0), uFh);   // fh6: B's culmen curves down into a hook (fh9: a firmer hook at the tip)
  vec3 ax = vec3(0.0, 0.006 - dro, -0.075 + z);
  return headPos() + (ax + vec3(cos(a)*r*rho, sin(a)*r*rho*0.9, 0.0))*uHeadK;
}
// fh6: the fenghuang's head is feathered, not outlined: short hairlines rooted over the skull from the beak's root back
// to the brow, each running back along the skin and lifting a little off it toward its tip, so the head reads as
// plumage swept back from the beak. Only the side facing the eye draws them (they fade to nothing toward the
// silhouette), so no line traces the head's edge.
const float HEAD_NL = 96.0;
vec3 headF(float f, vec3 uv, out vec4 info){
  float g1 = fract(f*0.6180340 + 0.13), g2 = fract(f*0.7548777 + 0.41), g3 = fract(f*0.5698403 + 0.77);
  float sp = headSplit(), u = uv.x;
  if (f < 6.0) {                                       // fh7: the beak as tapering lines, root to tip: culmen, gape, mandible
    float k = mod(f, 3.0), sd = uViewL.x < 0.0 ? -1.0 : 1.0, r;
    float a = k < 0.5 ? 1.45 : (k < 1.5 ? 0.05 : -1.3); a = sd > 0.0 ? a : PI - a;
    vec3 p = headPt(mix(sp*0.97, 0.995, u), a, f < 2.5 ? 1.0 : 0.6, r);
    info = vec4(2.0, 0.1, 0.4, mix(0.9, 1.0, uFh)*uv.z*(1.0 - 0.6*u)*(f < 2.5 ? 1.0 : 0.5)*smoothstep(0.0, 0.05, u));
    gCore = 1.0; gSpec = 1.06; gEye = 0.0; gEdge = 0.0; gSpark = 0.0; gHead = 1.0;
    return p; }
  float s0 = mix(0.34, 1.02, sqrt(g1))*sp, ln = mix(0.22, 0.36, g3)*sp;    // roots from the brow to the beak's root
  float a0 = g2*2.0*PI, s = max(s0 - ln*u, 0.02), a = a0 + 0.18*u*u*cos(a0), r;
  vec3 p = headPt(s, a, 1.0 + 0.16*u*u, r);
  vec3 n = normalize(vec3(cos(a), sin(a)*0.9, 0.0));
  float fc = smoothstep(0.08, 0.5, dot(n, normalize(uViewL)));
  info = vec4(2.0, 0.08 + 0.06*u, 0.15, mix(0.9, 1.0, uFh)*uv.z*fc*smoothstep(0.0, 0.12, u)*featherFade(u)*(0.75 + 0.25*g3));
  gCore = 0.35; gSpec = 1.0 + 0.10*u + 0.04*g3; gEye = 0.0; gEdge = 0.0; gSpark = 0.0; gHead = 1.0;
  return p;
}
// fh4: the torso as one solid mass of light, so the bird reads as one body at phone size: a teardrop filled through (not
// a shell), full and round at the breast, drawn to a point at the tail root, its narrow end at the neck running into the
// hackles. In the life's palette at about 0.8 of the wings' light (MASS_W, measured on the shots).
const float MASS_W = 0.28;
vec3 torsoMass(vec3 h, out vec4 info){
  float hq = mix(0.22, 0.40, uFh);                     // fh5: the fenghuang's head takes 40% of the mass, the torso keeps its light
  if (h.x < hq) {                                      // a fifth of the mass fills the head's silhouette, so it reads solid
    float r, rho = pow(fract(h.z*31.7 + h.y*7.3), 0.45), s = pow(h.y, 0.85);
    vec3 p = headPt(s, h.z*2.0*PI, rho, r);
    info = vec4(2.0, 0.1 + 0.05*s, 0.2 + 0.3*smoothstep(0.6, 1.0, s), 0.62*clamp(r/0.03, 0.4, 1.0)*mix(0.5, 0.4, uFh));   // fh10: A's head mass quieter too   // fh5: B's skull a dense core of light, held under white so the eye reads
    gCore = s > headSplit() ? 1.0 : mix(0.7, 0.3, uFh); gSpec = 1.06; gEye = 0.0; gEdge = 0.0; gSpark = 0.0; gHead = 1.0; gSkull = 1.0;   // fh5: B's skull in colour, the beak white-gold
    return p;
  }
  float t = h.y, a = h.z*2.0*PI, rho = pow(fract(h.z*53.17 + h.y*17.31), 0.4);   // rho: through the volume, a little toward the skin
  float r = 0.112*pow(t, 0.75)*sqrt(max(1.0 - pow(t, 5.0), 0.0))*1.14 + 0.05*smoothstep(0.86, 1.0, t);   // round breast, point at the tail
  vec3 c = vec3(0.0, 0.02 + 0.012*t, mix(-0.36, 0.27, t));
  info = vec4(2.0, 0.5, 0.0, MASS_W*(0.75 + 0.25*rho)*mix(0.4, 1.0, smoothstep(0.3, 0.9, uUnfurl))*0.78/(1.0 - hq));   // quieter while the wings are still folded
  gCore = 0.12; gSpec = 0.24 - 0.18*(1.0 - t); gEye = 0.0; gEdge = 0.0; gSpark = 0.0; gHead = 0.0; gSkull = 0.0;
  return c + vec3(cos(a)*r*rho, sin(a)*r*rho*0.8, 0.0);
}
// fh4: a wisp's source, chosen by its particle (not per respawn), so the draw pass finds the same feather and its hue
vec3 wispPt(vec2 c, float hz, out vec4 info){
  float hx = fract(sin(dot(c + 41.7, vec2(12.9898, 78.233)))*43758.5453), hy = fract(sin(dot(c + 43.9, vec2(12.9898, 78.233)))*43758.5453);
  if (hx < 0.55) return wingF(0.0, 7.0 + floor(hy*2.999), hx < 0.275 ? -1.0 : 1.0, vec3(0.84 + 0.16*hz, 0.0, 1.0), uFlap, info);
  float k = uFh > 0.5 ? (hy < 0.5 ? (hy < 0.25 ? 0.0 : 6.0) : 1.0 + floor((hy - 0.5)*5.999)) : (hy < 0.5 ? 0.0 : 6.0);
  return plumeF(k, vec3(0.78 + 0.22*hz, 0.0, 1.0), info, uFlap);
}
vec3 birdPoint(vec3 h, float flap, out vec4 info){
  float x = h.x; info = vec4(0.0, 0.0, 0.0, 1.0); gEdge = 0.0; gHead = 0.0; gSpark = 0.0; gSkull = 0.0; gHi = 0.0; gWing = -1.0; gFlr = 0.0;
  if (x < 0.46) {                                      // WINGS
    float q = x/0.46; float side = q < 0.5 ? -1.0 : 1.0; q = fract(q*2.0);
    if (q < 0.50) { float qi = q/0.50*10.0; return wingF(0.0, floor(qi), side, vane(fract(qi), h.y, h.z, 16.0, 0.06), flap, info); }
    if (q < 0.80) { float qi = (q - 0.50)/0.30*11.0; return wingF(1.0, floor(qi), side, vane(fract(qi), h.y, h.z, 12.0, 0.06), flap, info); }
    if (q < 0.86) { float qi = (q - 0.80)/0.06*3.0; return wingF(2.0, floor(qi), side, vane(fract(qi), h.y, h.z, 9.0, 0.06), flap, info); }
    if (q < 0.95) { float qi = (q - 0.86)/0.09*16.0; return wingF(3.0, floor(qi), side, vane(fract(qi), h.y, h.z, 6.0, 0.08), flap, info); }
    vec3 sh, el, wr, tp, dH; float fold;               // the leading edge: the arm and hand, lined with marginal coverts
    bones(flap, sh, el, wr, tp, dH, fold);
    // a soft band, not a comb: spread evenly along the curved edge, densest at the edge and thinning back over the
    // flight feathers' roots, fading out toward the wingtip
    float t = h.y*3.0, off = h.z*h.z*0.11, jt = fract(h.y*977.0 + h.z*131.0) - 0.5;
    vec3 p = armAt(t, sh, el, wr, tp) + vec3(0.0, 0.012 + 0.008*jt, 0.012 - off);
    info = vec4(1.0, 0.15 + 0.3*h.y, 0.15*h.y, (1.0 - 0.55*h.z)*(1.0 - smoothstep(2.4, 3.0, t)));
    gHi = (1.0 - h.z)*(1.0 - h.z)*(1.0 - smoothstep(2.2, 3.0, t));   // fh8: the leading edge catches the light, brightest along the bone
    gSpec = 0.02 + 0.05*h.z + 0.03*h.y; gWing = clamp(t/3.0, 0.0, 1.0)*0.95;
    p.x *= side; return p;
  }
  vec3 H = headPos();                                  // the head
  if (x < 0.56) {                                      // BODY, NECK, HEAD, BEAK
    float q = (x - 0.46)/0.10;
    float qT = mix(0.60, 0.54, uFh), qN = mix(0.78, 0.70, uFh);   // fh5: the fenghuang's head takes 30% of these (22%)
    if (q < qT) {                                      // the torso's sparks ride its contour feathers, as on the wings
      float qi = q/qT*BODY_ROWS*BODY_COLS, f = floor(qi);
      return bodyF(floor(f/BODY_COLS), mod(f, BODY_COLS), vaneB(fract(qi), h.y, h.z, 18.0, 0.12), info);
    } else if (q < qN) {                               // r7: the neck's sparks ride its hackles too (they were rings)
      float qi = (q - qT)/(qN - qT)*100.0, f = floor(qi);
      gHead = 1.0; return neckF(floor(f/10.0), mod(f, 10.0), vaneB(fract(qi), h.y, h.z, 5.0, 0.2), info);
    }
    gCore = mix(0.85, 0.5, uFh); gSpec = 1.06; gSpark = 0.0; gHead = 1.0; gSkull = 1.0;   // fh4: THE HEAD, one tapered form; and the eye's one spark (fh5: B's skull in colour, so the white-hot eye reads)
    if (fract(q*40.0) < 0.05) {
      float side = uViewL.x < 0.0 ? -1.0 : 1.0, r; vec3 c = headPt(mix(0.0645, 0.13*2.0/3.0, uFh)/(headL() + beakL()), 0.0, 0.0, r);   // fh10: A's eye 0.3 of its head behind the beak's base   // fh6: B's eye forward on the skull, near the beak's root (A's stays 0.07 from the back)
      info = vec4(2.0, 0.1, 1.0, 1.6); gCore = 1.0; gSpark = 1.0;
      return c + vec3(side*r*0.86, 0.36*r, 0.0)*uHeadK;
    }
    float r, rho = pow(fract(h.z*31.7 + h.y*7.3), mix(0.45, 0.5, uFh));
    vec3 p = headPt(h.y, h.z*2.0*PI, rho, r);
    info = vec4(2.0, 0.1 + 0.05*h.y, 0.25 + 0.35*smoothstep(0.6, 1.0, h.y), 0.85*clamp(r/0.03, 0.35, 1.0)*mix(1.0, 0.45, 1.0 - step(headSplit(), h.y)));   // fh5: B's skull sparks denser; fh6: and quieter, so the feathers carry the head, not glitter
    if (h.y > headSplit()) gCore = 1.0;                      // the beak is the white-gold core's
    return p;
  }
  if (x < 0.61) {                                      // crest: the outer two, and the inner three as the fenghuang grows them
    float q = (x - 0.56)/0.05, qa = fract(q*7.31), k;
    if (q < 0.67) k = qa < 0.5 ? 0.0 : 4.0; else k = 2.0;   // fh10: the middle plume in both lives   // fh3: the fenghuang's middle crest plume
    gHead = 1.0; return crestF(k, vane(fract(q*13.0), h.y, h.z, 26.0, 0.04), info); }
  if (x < 0.65) { float qi = (x - 0.61)/0.04*7.0; return tcovF(floor(qi), vane(fract(qi), h.y, h.z, 7.0, 0.06), info, flap); }
  if (x < 0.92) {                                      // tail: the outer pair, and the inner five as the fenghuang grows them
    float q = (x - 0.65)/0.27, qa = fract(q*9.17), k;
    if (q < 1.0 - uFh*0.6) k = qa < 0.5 ? 0.0 : 6.0; else k = 1.0 + floor(qa*2.999);   // fh3: three inner plumes
    return plumeF(k, vane(fract(q*17.0), h.y, h.z, 44.0, 0.035), info, flap); }
  // FLAME WISPS peeling off the trailing edges and the plumes
  float q = (x - 0.92)/0.08, age = fract(h.y + uT*0.55);
  vec3 o;
  if (q < 0.55) {
    vec3 sh, el, wr, tp, dH; float fold; bones(flap - age*1.4, sh, el, wr, tp, dH, fold);
    float t = fract(q/0.55*2.0);
    o = armAt(1.0 + 2.0*t, sh, el, wr, tp) + dH*(0.25*t*t) + vec3(0.0, 0.0, -0.34 - 0.10*sin(PI*t) - 0.10*fjit(h.z*31.0));
    o.x *= q < 0.275 ? -1.0 : 1.0;
  } else {
    float kq = fract(q*7.0), mm = mix(step(0.5, kq), kq, uFh);
    o = plumeAt(mix(0.25, 0.9, h.z)*27.0*mix(1.0, 0.8, uFh), mm);
  }
  vec3 p = o + vec3(0.0, 0.0, -0.75)*age + vec3(0.0, 0.22, 0.0)*age*age
         + vec3(sin(age*7.0 + h.z*20.0 + uT*3.0), sin(age*5.0 + h.z*13.0 + uT*2.3), 0.0)*0.07*age;
  info = vec4(6.0, 1.0, 0.25*(1.0 - age), pow(1.0 - age, 1.6)*0.6*smoothstep(0.0, 0.15, age)); gSpec = h.z*1.1;
  return p;
}
`;

export const BIRD_LOOK_GLSL = `
uniform vec3 uBirth, uEye, uPoleB, uPoleD; uniform float uPullT;
const vec2 BODY_K = vec2(1.000, 1.100), NECK_K = vec2(3.600, 3.800);   // fh10: the body's and the neck's plumage light, life A and life B
uniform float uRb, uHue0;          // fh5: the spectrum's weight (the fenghuang's life) and its starting hue, in turns
uniform float uNew, uNt;           // fh5: the life being born this cycle (0 the phoenix, 1 the fenghuang); fh6: uNt, 1 at night
// The spectrum in OKLCH: one lightness and chroma for every hue, so no band shouts (fh1's, kept so the swap is clean)
vec3 oklch(float L, float C, float hh){
  float a = C*cos(hh), b = C*sin(hh);
  float l_ = L + 0.3963377774*a + 0.2158037573*b, m_ = L - 0.1055613458*a - 0.0638541728*b, s_ = L - 0.0894841775*a - 1.2914855480*b;
  float l = l_*l_*l_, m = m_*m_*m_, q = s_*s_*s_;
  vec3 rgb = vec3(4.0767416621*l - 3.3077115913*m + 0.2309699292*q, -1.2684380046*l + 2.6097574011*m - 0.3413193965*q, -0.0041960863*l - 0.7034186147*m + 1.7076147010*q);
  float lo = min(rgb.r, min(rgb.g, rgb.b)), g = L*L*L;
  if (lo < 0.0) rgb = mix(vec3(g), rgb, g/(g - lo + 1e-5));
  return pow(clamp(rgb, 0.0, 1.0), vec3(1.0/2.2));
}
vec3 spectral(float s){
  float hh = fract(uHue0 + pow(max(s, 0.0), 1.12)*0.85)*6.2831853;
  float yl = exp(-pow((fract(hh/6.2831853 - 0.29 + 0.5) - 0.5)*5.0, 2.0));
  return oklch(0.71 + 0.12*yl, 0.165 - 0.015*yl, hh);
}
// a local bird point to the world: the rebirth gathers it out of the top pole (staggered, strand by strand) and the
// death draws it along the shell into the pillar's foot. wp: how far it is gathered; ab: how far it is drawn in.
vec3 birdXf(vec3 l, vec4 info, vec3 h, float hk, out float wp, out float ab, out float vis, out float hb){
  float rank = clamp(info.y, 0.0, 1.0)*0.55 + (info.x > 4.5 ? 0.12 : 0.0);
  float g = rank*0.6 + hk*0.18; wp = smoothstep(g, g + 0.26, uForm);
  float bp = clamp(uBurn*2.0, 0.0, 1.0);
  hb = smoothstep(0.0, 0.3, info.y - (1.0 - bp*1.35));
  vec3 w = uC + (uS*l.x + uU*l.y + uF*l.z)*uScale;
  w += (normalize(h - 0.5 + 1e-4)*1.2*h.z + uU*0.35 - uF*0.35)*hb*(0.12 + 0.4*bp);
  ab = 0.0; vis = 1.0;
  if (uPullT > 0.0) {
    vec3 dn = uPoleD;   // the landing: down for the fall, up for the close's last pass
    // fh5: drawn in, head first: each point starts its pull by where it sits along the body (0 at the beak, 1 at the
    // tail's tips), so the head goes in at pullT 0.4 and the last fifth of the body streams down the shell into the pole
    // after it, accelerating as it goes (an ease-in), and is gone only at the pole's mouth, never faded on the way
    float ord = clamp((0.75 - l.z)/2.6, 0.0, 1.0), pk = clamp((uPullT - 0.5*ord)/0.45, 0.0, 1.0);
    ab = pk*pk*(1.6 - 0.6*pk);
    float r = length(w); vec3 nn = w/max(r, 1e-4);
    float th = acos(clamp(dot(nn, dn), -1.0, 1.0));
    vec3 tg = nn - dn*dot(nn, dn); float tl = length(tg); tg = tl > 1e-4 ? tg/tl : vec3(0.0, 0.0, 1.0);
    float th2 = th*(1.0 - ab);
    w = (dn*cos(th2) + tg*sin(th2))*mix(r, 1.63, smoothstep(0.0, 0.4, ab)) + normalize(h - 0.5 + 1e-4)*pow(h.z, 0.6)*mix(0.03, 0.075, ab*ab);   // a small round hot knot at the foot
    w *= mix(1.0, min(1.0, 1.6/max(length(w), 1e-4)), smoothstep(0.0, 0.3, ab));   // r6: the knot is light on the shell, never a bump past it (B44)
    vis = 1.0 - smoothstep(0.86, 1.0, ab);
  }
  // fh3: the two births differ. The phoenix gathers as a tongue of flame licking up off the crown; the fenghuang
  // gathers out of a slow ring of light turning round the crown, so its feathers spiral in to their places
  vec3 bo = normalize(h - 0.5 + 1e-4)*0.06*sqrt(h.z);
  vec3 bA = vec3(bo.x*0.6, abs(bo.y)*3.2 + 0.05*h.z, bo.z*0.6);
  // fh6 (fh8): both births are the same seed rise, a tongue of light licking up off the crown
  return mix(uBirth + bA, w, wp);
}
// the bird's colour: the loop's palette runs root to tip along each feather (tips a step further on), shifted by hue
vec3 birdHue(vec4 info, float hueOff){
  return flame(clamp(uTau*0.88 + info.y*0.13 + hueOff, 0.0, 0.745));
}
// fh9 (review fh8, top fix 2): life B's wings are graded through the spectrum shoulder to tip, red, orange, gold, green,
// cyan, blue (OKLCH 28 to 255 degrees, no violet stop), whatever the life's starting hue, so the rainbow covers the bird
vec3 wingSpec(float x){ float hh = mix(28.0, 255.0, clamp(x, 0.0, 1.0))/360.0;
  float yl = exp(-pow((fract(hh - 0.29 + 0.5) - 0.5)*5.0, 2.0));
  return oklch(0.70 + 0.12*yl, 0.17 - 0.015*yl, hh*6.2831853); }
vec3 birdCol(vec4 info, float wp, float ab, float hb, float hk, float hueOff, float spec, float core, float eye){
  vec3 col = birdHue(info, hueOff);
  if (uRb > 0.0) {                                     // the fenghuang: the whole spectrum at once, a white-gold core
    vec3 rc = spectral(spec + hueOff*3.0 + 0.5*eye*step(0.75, eye) + 0.25*eye*step(0.4, eye)*step(eye, 0.6));
    if (gWing >= 0.0) rc = mix(rc, wingSpec(gWing + hueOff*1.5), 0.92);   // fh9
    rc = mix(rc, uHot, core*0.8);
    rc = mix(rc, uHot, 0.45*step(0.99, eye));         // fh3: each eye's core glows white-gold
    col = mix(col, rc, uRb);
  }
  col = mix(col, uHot, clamp(info.z, 0.0, 1.0)*mix(0.5, 0.22, uRb));
  col = mix(col, mix(uFl[3], uHot, 0.35 + 0.4*info.y), hb*0.85);
  // fh6: at night the fenghuang's seed is its own spectrum from the first frame (never the field's grey ink)
  col = mix(mix(uInk, uInk2, hk), col, mix(smoothstep(0.0, 0.7, wp)*0.85, 0.75 + 0.25*smoothstep(0.0, 0.7, wp), uRb*uNt));
  return mix(col, uHot, ab*0.6);
}
float birdOcc(vec3 w, float ab){   // the sphere hides what is inside it or behind it
  vec3 rd = w - uEye; float rl = length(rd); rd /= max(rl, 1e-4);
  float tc = -dot(uEye, rd), dp = length(uEye + rd*tc);
  float behind = smoothstep(1.6, 1.45, dp)*smoothstep(-0.05, 0.25, rl - tc);
  float inside = smoothstep(1.58, 1.46, length(w))*smoothstep(0.0, 0.12, uAbsorb);
  return (1.0 - 0.72*behind*(1.0 - ab))*(1.0 - inside);
}
vec3 birdEmberCol(float x, vec2 c){ return mix(flame(x), spectral(hash(c + 31.7)), uRb); }`;

export const BIRD_UPDATE_GLSL = `
vec3 birdEmberBorn(vec3 onBird, vec3 j){ return mix(onBird + j*(0.03 + 0.9*uBurn), uPole + j*0.05, uAbsorb); }
float birdWakeK(){ return (1.0 - uAbsorb)*clamp(1.0 - uBurn*4.5, 0.0, 1.0); }
`;

export const BIRD_VERTEX_GLSL = `
uniform float uBirdA, uPulseY, uPulseA, uBL; uniform vec3 uPulseC, uBLC;
bool isBirdClass(int cls){ return cls == 4 || cls == 6; }
ivec2 birdTexel(int i){ int per = int(uW)/8; int k = i >> 1; int y = k/per; int m = (3*y) % 8; return ivec2(8*(k - y*per) + (((i & 1) == 0 ? 12 : 14) - m) % 8, y); }
vec3 birdHash(vec2 c){ return vec3(hash(c + 0.11), hash(c + 7.31), hash(c + 3.77)); }
float birdEmberK(){ return 1.0 - uAbsorb; }
// the bird lights the shell where it passes (a soft pool in its own hue), and a faint light runs up the pillar at rebirth
void birdFieldTouch(vec4 s, inout vec4 col, inout float size){
  vec3 dB = s.xyz - uC; float lk = uBL*exp(-dot(dB, dB)*1.6)/(1.0 + 4.0*dot(dB, dB));
  col.rgb = mix(col.rgb, uBLC, min(lk*0.9, 0.85)); col.a *= 1.0 + 1.6*lk;
  float pk = uPulseA*exp(-dot(s.xz, s.xz)/0.02)*exp(-(s.y - uPulseY)*(s.y - uPulseY)/0.06);
  col = vec4(mix(col.rgb, uPulseC, min(pk*0.6, 1.0)), col.a + pk*0.25); size *= 1.0 + 0.3*pk;
}
// the sparks: fine glints along every feather (the hairlines carry the form; see BIRD_STROKE_VS)
void birdVertex(ivec2 c, vec4 s){   // fh5's bird pass (its sparkle along the silk, the eye's one spark), less its mass pass
  vec3 h = birdHash(vec2(c) + uRep*vec2(613.37, 271.91));
  vec4 info; gHi = 0.0; gWing = -1.0; gFlr = 0.0; vec3 l = birdPoint(h, uFlap, info); float spec = gSpec, core = gCore, eye = gEye, edg = gEdge, spk = gSpark;
  float hiP = gHi*uRb, skl = gSkull*uNt*(1.0 - spk);   // fh10: both lives   // fh8
  float fl = sin(uT*9.0 + h.z*40.0)*0.5 + 0.5;
  l += vec3(sin(uT*5.5 + h.x*50.0), sin(uT*6.5 + h.y*60.0), sin(uT*4.5 + h.z*70.0)) * (0.001 + 0.006*fl*info.y*info.y);
  float hk = hash(vec2(c) + 42.1), wp, ab, vis, hb;
  vec3 w = birdXf(l, info, h, hk, wp, ab, vis, hb);
  vec4 cq = uVP*vec4(w, 1.0); gl_Position = cq;
  float dep = depthOf(cq);
  vec3 col = birdCol(info, wp, ab, hb, hash(vec2(c) + 2.2), (hk - 0.5)*0.05, spec, core, eye);
  float a = dep*(0.72 + 0.28*fl)*info.w*uFireA*(1.0 - 0.45*hb)*vis*(1.0 + 0.25*step(0.6, uTau));
  vCol = vec4(col, a*wp*(0.35 + 0.65*wp)*uBirdA);
  vCol.a = max(vCol.a, 0.07*(1.0 - wp)*(1.0 - uForm)*info.w*uFireA*dep*step(uAbsorb, 0.0));
  vCol.a *= birdOcc(w, ab);
  // fh8 (M35): the fenghuang's light is uneven: its body plumage steps down 28%, its hot points (crest tips, plume eyes,
  // the leading edge) burn up to 3.2 times brighter and whiter; at night its crest is carried by the line-work
  vCol.a *= mix(1.0 - 0.28*uRb, 3.2, hiP); vCol.rgb = mix(vCol.rgb, uHot, 0.45*hiP);
  // fh9: the rebirth flare (crest tips and plume eyes, 0.3 s, the brightest light of the cycle), the wings' light
  { float fz = uFlare*gFlr*uFh; vCol.a *= 1.0 + 5.0*fz; vCol.rgb = mix(vCol.rgb, uHot, 0.6*fz); }
  if (gWing >= 0.0) vCol.a *= 1.0 + 0.3*uRb;
  // fh10: the body and neck plumage carry at least 60% of the wings' light, so the head stays joined to the body
  if (abs(info.x - 2.0) < 0.5 && gSkull < 0.5 && spk < 0.5) vCol.a *= gHead > 0.5 ? mix(NECK_K.x, NECK_K.y, uRb) : mix(BODY_K.x, BODY_K.y, uRb);
  if (abs(info.x - 3.0) < 0.5) vCol.a *= mix(0.3, 0.15 + 0.30*hiP, uRb);   /* fh10: life A's crest is its lines too */   // fh9: no halo by night or day: the crest is its plumes' lines
  { float tw = pow(0.5 + 0.5*sin(uT*5.3 + h.z*157.0 + h.y*41.0), 12.0)*edg*uRb;
    vCol.rgb = mix(vCol.rgb, uHot, 0.55*tw); vCol.a *= 1.0 + 2.4*tw; }
  float zr = zoomRaw(cq), ps = uPx*(1.1 + 0.45*fl*info.y + 0.5*info.z)*(0.8 + 0.5*dep)*zoomOf(cq)*mix(1.0, 0.7, smoothstep(1.2, 3.0, zr));
  vCol.a *= min(zoomGain(cq), 1.25)*min(1.0, ps*ps);
  if (abs(info.x - 3.0) < 0.5) ps = min(ps, uPx*1.2);   // fh9: the crest's sparks stay fine points
  if (spk > 0.5) { ps = 2.0*uPx/1.15*mix(min(zoomOf(cq), 1.0), 1.0, uFh); vCol.a *= mix(1.6, 3.0, uFh);   /* fh10: A's eye too */ vCol.rgb = mix(vCol.rgb, vec3(1.0, 0.985, 0.95), max(uFh, 0.6)); }
  // fh7 (fh8): at night the fenghuang's skull is a fine pale stipple between its feather strands, never a soft blob
  if (skl > 0.0) { vCol.a *= 1.0 - 0.55*skl; ps = min(ps, uPx*1.1); vCol.rgb = mix(vCol.rgb, mix(mix(vec3(1.0, 0.88, 0.70), vec3(0.94, 0.93, 0.97), uFh), vCol.rgb, 0.25), skl);   /* fh10: life A's pale is warm */ }
  gl_PointSize = max(ps, 1.0);
}
`;

// The stroke pass: every feather drawn as anti-aliased hairlines, one instanced quad per segment. A group (primaries,
// secondaries, ...) is one draw; the instance number picks the feather, then the rachis segment or the barb and its
// segment. Width is in world units (thicker at the root, a fine point at the tip), never under one pixel: thinner than
// that it dims instead. Barbs carry an anisotropic sheen so the vane shimmers as it turns.
export const BIRD_STROKE_VS = `#version 300 es
precision highp float;
uniform float uGrp, uNF, uNb, uSR, uSB, uSlant, uWR, uWB, uStrA, uFpx, uRachA, uFOff, uHeadG;
uniform vec2 uVpx;
${BIRD_ENGINE_DECL}
${BIRD_HELPERS_GLSL}
${BIRD_GLSL}
${BIRD_LOOK_GLSL}
out vec4 vCol; out float vD; out float vHw; float vFlag;
vec3 partPt(float f, vec3 uv, out vec4 info){
  if (uGrp < 3.5) { float side = f < uNF ? -1.0 : 1.0; return wingF(uGrp, mod(f, uNF), side, uv, uFlap, info); }
  if (uGrp < 4.5) return crestF(f < 0.5 ? 0.0 : (f < 1.5 ? 4.0 : 2.0), uv, info);   // the outer pair first, then the fenghuang's middle
  if (uGrp < 5.5) return tcovF(f, uv, info, uFlap);
  if (uGrp < 6.5) return plumeF(f < 0.5 ? 0.0 : (f < 1.5 ? 6.0 : f - 1.0), uv, info, uFlap);
  if (uGrp < 7.5) return bodyF(floor(f/BODY_COLS), mod(f, BODY_COLS), uv, info);
  if (uGrp > 8.5) return headF(f, uv, info);                 // fh5: the head's line-work
  return neckF(floor(f/10.0), mod(f, 10.0), uv, info);
}
void main(){
  float id = float(gl_InstanceID), E = uSR + uNb*2.0*uSB;
  float f = floor(id/E), e = id - f*E; f += uFOff;   // fh: a group may start part-way through its feathers
  vec3 uv0, uv1; float barb = 0.0, bi = 0.0, s1 = 0.0;
  if (e < uSR) { uv0 = vec3(e/uSR, 0.0, 1.0); uv1 = vec3((e + 1.0)/uSR, 0.0, 1.0); }
  else {
    float r = e - uSR, b = floor(r/(2.0*uSB)), rr = r - b*2.0*uSB, side = rr < uSB ? -1.0 : 1.0, sg = mod(rr, uSB);
    float u0 = (b + 0.35 + 0.3*hash(vec2(b, f + uGrp*17.0)))/uNb, s0 = sg/uSB; s1 = (sg + 1.0)/uSB;
    float sl = uSlant*(side < 0.0 ? 0.7 : 1.0);
    uv0 = vec3(min(u0 + sl*s0 - 0.01*s0*s0, 1.0), side*s0, 0.5); uv1 = vec3(min(u0 + sl*s1 - 0.01*s1*s1, 1.0), side*s1, 0.5);
    barb = 1.0; bi = b;
  }
  // fh4: a body feather turned away is skipped before any of its geometry is built (about half of them)
  if (uGrp > 6.5 && uGrp < 7.5) { float fr = floor(f/BODY_COLS), fc = mod(f, BODY_COLS), tr = 0.95 - fr*0.155;
    float a = (fc + 0.5 + 0.5*mod(fr, 2.0))/BODY_COLS*2.0*PI + 0.05*(fjit(fr*24.0 + fc) - 0.5);
    if (facing(normalize(vec3(cos(a), sin(a)*0.8, 0.0)), -normalize(bodyS(tr - 0.03, a) - bodyS(tr, a))) <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); vD = 0.0; vHw = 0.0; vFlag = 0.0; return; } }
  vec4 i0, i1; gHi = 0.0; gWing = -1.0; gFlr = 0.0; vec3 l0 = partPt(f, uv0, i0); float sp0 = gSpec, co0 = gCore, ey0 = gEye, hi0 = gHi*uRb, fl0 = gFlr; vec3 l1 = partPt(f, uv1, i1); vFlag = uHeadG;
  if (i0.w <= 0.0 && i1.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); vD = 0.0; vHw = 0.0; return; }   // r7: a feather turned away draws nothing
  float hk = hash(vec2(f + uGrp*31.0, bi + uRep*7.0) + 0.37);
  vec3 h = vec3(hash(vec2(f, uGrp) + 0.11), hash(vec2(f, bi) + 7.31), hash(vec2(bi, uGrp) + 3.77));
  float wp, ab, vis, hb, wp1, ab1, vis1, hb1;
  vec3 w0 = birdXf(l0, i0, h, hk, wp, ab, vis, hb), w1 = birdXf(l1, i1, h, hk, wp1, ab1, vis1, hb1);
  vec4 c0 = uVP*vec4(w0, 1.0), c1 = uVP*vec4(w1, 1.0);
  int k = gl_VertexID;
  if (c0.w < 0.05 || c1.w < 0.05 || wp < 0.02) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); vD = 0.0; vHw = 0.0; return; }
  vec2 p0 = c0.xy/c0.w*0.5*uVpx, p1 = c1.xy/c1.w*0.5*uVpx, d = p1 - p0; float dl = length(d);
  vec2 dir = dl > 1e-4 ? d/dl : vec2(1.0, 0.0), nrm = vec2(-dir.y, dir.x);
  float uE = k < 2 ? uv0.x : uv1.x;
  float taper = barb > 0.5 ? (1.0 - 0.6*s1) : (1.0 - 0.8*uE);              // the shaft: 100% at the root, 20% at the tip
  float wW = (barb > 0.5 ? uWB : uWR)*uScale*taper;
  float wpx = wW*uFpx/(k < 2 ? c0.w : c1.w);
  float hw = max(wpx, 1.0)*0.5, pad = hw + 1.0;
  vec2 P = (k < 2 ? p0 : p1) + nrm*((k & 1) == 0 ? -pad : pad);
  vec4 cc = k < 2 ? c0 : c1;
  gl_Position = vec4(P/(0.5*uVpx)*cc.w, cc.z, cc.w);
  vD = (k & 1) == 0 ? -pad : pad; vHw = hw;
  // colour and light
  vec4 info = i0; vec3 wm = 0.5*(w0 + w1);
  vec3 T = normalize(w1 - w0 + 1e-6), V = normalize(uEye - wm), L = normalize(-wm + vec3(0.0, 0.4, 0.0));
  float TH = dot(T, normalize(L + V)), sheen = pow(sqrt(max(1.0 - TH*TH, 0.0)), 40.0);
  float tv = dot(T, V);
  // iridescence: the barbs' hue turns with the view. fh3: in the fenghuang a thin film, twice the turn, and it also
  // shifts with the wingbeat, so colour slides across the vanes as they flex
  float irid = barb*(mix(0.05, 0.10, uRb)*tv + uRb*0.03*sin(uFlap + bi*0.37 + f*1.3));
  vec3 col = birdCol(info, wp, ab, hb, hk, irid + (hk - 0.5)*0.03, sp0, co0, ey0);
  col = mix(col, uHot, barb*sheen*0.35);
  if (uRb > 0.0) col = mix(col, spectral(sp0 + 0.32 + 0.30*tv + 0.06*sin(uFlap)), barb*min(sheen*1.6, 1.0)*0.45*uRb);   // fh3: the film's highlight, a colour of its own
  float glint = barb > 0.5 ? 0.75 + 0.25*sin(uT*2.3 + bi*1.7 + f*3.1) : 1.0;   // barbules catching the light, slowly
  float a = uStrA*(k < 2 ? i0.w : i1.w)*uFireA*vis*wp*(0.35 + 0.65*wp)*birdOcc(wm, ab)*depthOf(cc)*(barb > 0.5 ? (0.9 + 1.6*sheen)*glint*(0.55 + 0.45*s1) : 0.85*uRachA);
  a *= min(1.0, wpx)*uBirdK;
  a *= mix(1.0 - 0.28*uRb, 3.2, hi0); col = mix(col, uHot, 0.45*hi0);       // fh8 (M35): the light hierarchy, as the sparks
  { float fz = uFlare*fl0*uFh; a *= 1.0 + 5.0*fz; col = mix(col, uHot, 0.6*fz); }   // fh9: the rebirth flare
  if (gWing >= 0.0) a *= 1.0 + 0.3*uRb;
  if (uGrp > 6.5 && uGrp < 8.5) a *= uGrp > 7.5 ? mix(NECK_K.x, NECK_K.y, uRb) : mix(BODY_K.x, BODY_K.y, uRb);   // fh10: the body's and neck's lines
  if (uHeadG > 1.5) a *= mix(1.0, 1.5, uNt);   // fh10: both lives                // fh9: life B's beak and head lines read first
  if (uGrp > 3.5 && uGrp < 4.5) a *= mix(1.0, 1.3, uNt);   // fh10: both lives              // fh9: 1.3 (fh8 2.0): fine lines, no glow
  if (uHeadG > 1.5) { a *= mix(1.0, 1.7, uNt); col = mix(col, mix(vec3(1.0, 0.88, 0.70), vec3(0.95, 0.94, 0.98), uFh), 0.5*uNt); }   // fh10: life A's strands warm   // fh7: at night the head's strands, pale light on dark                                               // thinner than a pixel: dimmer, never aliased
  vCol = vec4(col, a);
}`;
export const BIRD_STROKE_FS = `#version 300 es
precision highp float; in vec4 vCol; in float vD; in float vHw; out vec4 o;
void main(){ float cov = clamp(vHw + 0.5 - abs(vD), 0.0, 1.0); o = vec4(vCol.rgb*vCol.a*cov, 1.0); }`;

// The plumage strokes (r5): per group, the feathers it draws (both sides), the rachis segments, barbs per side of the
// vane and the segments of each barb, the barb slant toward the tip, and the rachis and barb widths in bird units.
export const STROKES = [
  { grp: 0, nf: 10, count: 20, nb: 30, sr: 18, sb: 3, slant: 0.10, wr: 0.0045, wb: 0.0026 , ra: 0.75 },   // primaries
  { grp: 1, nf: 11, count: 22, nb: 22, sr: 12, sb: 2, slant: 0.10, wr: 0.004, wb: 0.0024 , ra: 0.75 },   // secondaries
  { grp: 2, nf: 3, count: 6, nb: 16, sr: 10, sb: 2, slant: 0.10, wr: 0.006, wb: 0.002 },       // tertials
  { grp: 3, nf: 16, count: 32, nb: 8, sr: 6, sb: 2, slant: 0.14, wr: 0.005, wb: 0.002 },       // greater coverts
  { grp: 4, nf: 3, count: 3, nb: 44, sr: 36, sb: 2, slant: 0.05, wr: 0.006, wb: 0.0018 },      // the crest plumes (two, or three)
  { grp: 5, nf: 7, count: 7, nb: 12, sr: 8, sb: 2, slant: 0.10, wr: 0.005, wb: 0.002 },        // tail coverts
  { grp: 6, nf: 7, count: 2, nb: 110, sr: 72, sb: 3, slant: 0.035, wr: 0.006, wb: 0.0024 },    // the two outer long plumes
  { grp: 6, nf: 7, count: 3, foff: 2, fh: true, nb: 72, sr: 60, sb: 2, slant: 0.04, wr: 0.0055, wb: 0.0024 },   // the fenghuang's inner three, lighter (fh8: on the 3.4 plume)
  { grp: 7, nf: 24, count: 144, nb: 10, sr: 6, sb: 2, slant: 0.12, wr: 0.003, wb: 0.0024, ra: 0.45 },   // body contour feathers: 6 rows of 24 (r7)
  { grp: 8, nf: 10, count: 100, nb: 8, sr: 4, sb: 1, slant: 0.2, wr: 0.0028, wb: 0.0018, ra: 0.3 },      // neck hackles (r7: longer, more barbs)
  { grp: 9, nf: 96, count: 96, nb: 0, sr: 6, sb: 1, slant: 0, wr: 0.0010, wb: 0.001, ra: 0.9 },   // fh6 (fh8): the fenghuang's head, feathered, the beak as tapering lines
];

// ---------- the bird's lap, timing and plumes, in JS ----------
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]], add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const scl = (a, k) => [a[0]*k, a[1]*k, a[2]*k], dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), norm = a => { const l = len(a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + (b[2] - a[2])*t];

export const BIRD = {
  name: 'the fh8 phoenix (life A) and fenghuang (life B)',
  share: 4,          // the point pass draws one texel in four (classes 4 and 6)
  emberAlpha: 0.35,
  sparkA: 2.0, strokeA: 2.6,
  // how far any lit part of the bird reaches from the sphere's centre, in sphere radii (the page sizes the sphere so
  // the lap stays clear of the words; the flight box catches the rest)
  reach: 1.65,
  createRig,
};

// The flame ramp of life A (ledger B41, r5's "Phoenix"): born blue, then purple, red and gold.
export const FLAME = {
  stops: [[0.16, 0.42, 1.00], [0.58, 0.22, 1.00], [1.00, 0.16, 0.22], [1.00, 0.55, 0.10]],
  hot: [1.00, 0.90, 0.65],
  alpha: 0.65,
};
// life B: the spectrum starts at this hue (turns); its white-gold core
const HUE0 = 0.02, WHITE_GOLD = [1.0, 0.94, 0.80];

function createRig({ phone, period, homeDir }) {
  // fh10: both birds 1.3 times on a phone (the rig's phone flag), the fenghuang's tail 0.75 there
  const PH_K = phone ? 1.3 : 1, TAIL_PHB = phone ? 0.75 : 1;
  const PATH_STEP = 0.42, BANK = 0.5, FLAT = 0.75, RISE = 0.5, TAIL_MAXA = 0.7, PHONE_K = phone ? 0.8 : 1;
  const LAP = [[0.00, 0, 1.70, 0.0], [0.07, 0.05, 1.85, 0.15], [0.15, 0.6, 1.95, 0.5], [0.24, 1.5, 1.7, 0.7], [0.33, 1.85, 1.05, 0.8],
    [0.42, 1.3, 0.4, 1.4], [0.50, 0.0, 0.8, 1.7], [0.58, -1.4, 1.2, 1.2], [0.66, -1.85, 0.6, 0.6], [0.73, -1.75, -0.55, 0.8],
    [0.79, -0.85, -1.4, 0.9], [0.845, 0.0, -1.80, 0.25], [0.90, 0.0, -1.25, 0.0]];
  const POLE_T = [0, 1.66, 0], POLE_B = [0, -1.62, 0], POLE_IN = [0, -1.42, 0], TOP_IN = [0, 1.42, 0], LAT_K = phone ? 0.5 : 1, LAP_END = 0.90;
  const LAP_EYE = scl(homeDir, 10), LAP_FWD = norm([homeDir[0], 0, homeDir[2]]), LAP_RT = cross([0, 1, 0], LAP_FWD);
  const LAP_P = LAP.map(k => [k[1]*LAT_K, k[2], k[3]]);
  function squash(p){
    if (!phone) return p;
    const sp = x => 0.08*Math.log1p(Math.exp(x/0.08)), w = smooth(0.25, 0.9, Math.hypot(p[0], p[2]));
    return [p[0], p[1] - 0.8*sp(p[1] - 1.45)*w, p[2]];
  }
  function crSeg(i, f){
    const n = LAP_P.length, P1 = LAP_P[i], P2 = LAP_P[i + 1];
    const P0 = i > 0 ? LAP_P[i - 1] : sub(scl(P1, 2), P2), P3 = i + 2 < n ? LAP_P[i + 2] : sub(scl(P2, 2), P1);
    const k = (a, b) => Math.max(Math.sqrt(len(sub(b, a))), 1e-3);
    const t0 = 0, t1 = k(P0, P1), t2 = t1 + k(P1, P2), t3 = t2 + k(P2, P3), t = t1 + (t2 - t1)*f;
    const A1 = lerp3(P0, P1, (t - t0)/(t1 - t0)), A2 = lerp3(P1, P2, (t - t1)/(t2 - t1)), A3 = lerp3(P2, P3, (t - t2)/(t3 - t2));
    const B1 = lerp3(A1, A2, (t - t0)/(t2 - t0)), B2 = lerp3(A2, A3, (t - t1)/(t3 - t1));
    return squash(lerp3(B1, B2, (t - t1)/(t2 - t1)));
  }
  const TAB = (() => { const out = [], per = 240; let prev = LAP_P[0], acc = 0;
    for (let i = 0; i < LAP_P.length - 1; i++) for (let j = (i ? 1 : 0); j <= per; j++) {
      const p = crSeg(i, j/per); acc += len(sub(p, prev)); prev = p; out.push({ i, f: j/per, s: acc }); }
    return out; })();
  const LEN = TAB[TAB.length - 1].s;
  const KS = LAP_P.map((_, i) => i === 0 ? 0 : TAB.find(e => e.i === i - 1 && e.f === 1).s), KT = LAP.map(k => k[0]);
  const M = (() => { const n = KT.length, d = [], m = [];
    for (let i = 0; i < n - 1; i++) d.push((KS[i + 1] - KS[i])/(KT[i + 1] - KT[i]));
    m.push(d[0]*0.35); for (let i = 1; i < n - 1; i++) m.push(d[i - 1]*d[i] <= 0 ? 0 : 0.5*(d[i - 1] + d[i]));
    m.push(d[n - 2]*0.8);
    for (let i = 0; i < n - 1; i++) { const a = m[i]/d[i], b = m[i + 1]/d[i], h = a*a + b*b; if (h > 9) { const t = 3/Math.sqrt(h); m[i] = t*a*d[i]; m[i + 1] = t*b*d[i]; } }
    return m; })();
  function lapArc(tau){
    const t = clamp(tau, 0, LAP_END); let i = 0; while (i < KT.length - 2 && KT[i + 1] <= t) i++;
    const h = KT[i + 1] - KT[i], x = (t - KT[i])/h, x2 = x*x, x3 = x2*x;
    return (2*x3 - 3*x2 + 1)*KS[i] + (x3 - 2*x2 + x)*h*M[i] + (-2*x3 + 3*x2)*KS[i + 1] + (x3 - x2)*h*M[i + 1];
  }
  function lapLocal(s){
    if (s <= 0 || s >= LEN) { const e = s <= 0, a = lapLocal(e ? 1e-3 : LEN - 0.02), b = lapLocal(e ? 0.02 : LEN - 1e-3);
      const d = norm(sub(b, a)), o = e ? crSeg(0, 0) : crSeg(LAP_P.length - 2, 1); return add(o, scl(d, e ? s : s - LEN)); }
    let lo = 0, hi = TAB.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TAB[m].s < s) lo = m; else hi = m; }
    const A = TAB[lo], B = TAB[hi], w = (s - A.s)/Math.max(B.s - A.s, 1e-9);
    return A.i === B.i ? crSeg(A.i, A.f + (B.f - A.f)*w) : crSeg(B.i, B.f*w);
  }
  // lift (0..1): the journey's high orbit, the lap wider and higher, so the bird quietens above the five bands
  let lift = 0;
  const lapPoint = s => { const q = lapLocal(s), w = 1 + 0.32*lift;
    return add(add(scl(LAP_RT, q[0]*w), [0, q[1]*(1 + 0.12*lift) + 0.95*lift, 0]), scl(LAP_FWD, q[2]*w)); };
  // the moment the bird reaches the bottom pole (as r5: within 0.45 of the pillar's foot); the pull starts 0.6 s before
  const lapAt0 = tau => { const q = lapLocal(lapArc(tau)); return add(add(scl(LAP_RT, q[0]), [0, q[1], 0]), scl(LAP_FWD, q[2])); };
  const T_ARR = (() => { for (let t = 0.75; t < 0.95; t += 0.0005) if (len(sub(lapAt0(t), POLE_B)) < 0.45) return t*period; return 0.83*period; })(), PULL_LEAD = 0.6;
  function pathLocal(b){
    const out = new Float32Array(24), loc = [];
    for (let k = 0; k < 8; k++) {
      let d = k ? sub(lapPoint(b.sArc - k*PATH_STEP*b.scale), b.C) : [0, 0, 0];
      d = sub(d, scl(b.V, dot(d, b.V)*FLAT));
      loc.push([dot(d, b.S)/b.scale, dot(d, b.U)/b.scale, dot(d, b.F)/b.scale]);
    }
    let q = [0, 0, 0];
    for (let k = 1; k < 8; k++) {
      let d = norm(sub(loc[k], loc[k - 1]));
      if (!d.every(Number.isFinite) || len(d) < 0.5) d = [0, 0, -1];
      const th = Math.acos(clamp(-d[2], -1, 1)), t2 = TAIL_MAXA*Math.tanh(th/TAIL_MAXA), hl = Math.hypot(d[0], d[1]);
      d = hl > 1e-6 ? [d[0]/hl*Math.sin(t2), d[1]/hl*Math.sin(t2), -Math.cos(t2)] : [0, 0, -1];
      out[k*3 - 3] = q[0]; out[k*3 - 2] = q[1]; out[k*3 - 1] = q[2];
      q = add(q, scl(d, PATH_STEP));
    }
    out[21] = q[0]; out[22] = q[1]; out[23] = q[2];
    return out;
  }
  // The wingbeat (r5): its rate and depth follow the lap: slow deep strokes as the reborn bird unfolds, a steady beat,
  // a glide across the front with the wings in a raised V, the wings swept back for the dive. The engine integrates the
  // phase from flapHz (on simulated time while the loop runs free, on real time while the scroll holds it), so the beat
  // never jumps when the page takes the loop over; the downstroke is the longer half (phase + 0.4 sin phase).
  // fh8 (M35): the fenghuang beats slower (0.46 Hz against 0.84), statelier; life k blends the two
  function glideB(t){ return smooth(0.28, 0.32, t)*(1 - smooth(0.37, 0.41, t)) + smooth(0.45, 0.49, t)*(1 - smooth(0.60, 0.64, t)); }
  function flapHzB(t){ return 0.46 - 0.10*smooth(0.0, 0.04, t)*(1 - smooth(0.16, 0.26, t)) - 0.30*glideB(t) - 0.14*smooth(0.70, 0.76, t); }
  function flapHz(tau, life = 0){ return flapHzA(tau)*(1 - life) + flapHzB(tau)*life; }
  function flapHzA(tau){ return 0.84 - 0.24*smooth(0.0, 0.04, tau)*(1 - smooth(0.16, 0.26, tau)) - 0.42*smooth(0.40, 0.45, tau)*(1 - smooth(0.52, 0.57, tau)) - 0.30*smooth(0.70, 0.76, tau); }
  function flapAmp(tau){ return 1 + 0.15*smooth(0.06, 0.12, tau)*(1 - smooth(0.2, 0.28, tau)) - 0.68*smooth(0.40, 0.45, tau)*(1 - smooth(0.52, 0.57, tau)); }
  function flapTuck(tau){ return 0.65*smooth(0.70, 0.77, tau)*(1 - smooth(0.88, 0.95, tau)); }
  // The two lives (M27): even loops are life A, odd loops life B. A new life's form and colour turn over while it
  // unfolds (tau 0 to 0.24), out of sight inside the gather; the very first life (loop 0 and before) is A from the start.
  const isBLoop = T => ((Math.floor(T/period) % 2) + 2) % 2 === 1;
  function lifeOf(T){
    const loop = Math.floor(T/period), tau = T/period - loop, isB = ((loop % 2) + 2) % 2 === 1, k = smooth(0.012, 0.055, tau);   // fh9: turned over in the first 0.9 s, so the unfolding reads as the rebirth (v3-precision had 0.14)
    return isB ? k : (loop <= 0 ? 0 : 1 - k);
  }
  function at(T, phase = null){
    const tau = ((T/period) % 1 + 1) % 1, sArc = lapArc(tau), C = lapPoint(sArc);
    const toCam = norm(sub(LAP_EYE, C));
    const vel = sub(lapPoint(sArc + 0.03), lapPoint(sArc - 0.03)); const heading = len(vel) > 1e-4 ? norm(vel) : [0, 1, 0];
    const rise = RISE*(1 - smooth(0.70, 0.76, tau)*(1 - smooth(0.93, 0.97, tau)));
    let F = sub(heading, scl(toCam, dot(heading, toCam)*FLAT)); F = norm(add(norm(F), [0, rise, 0]));
    const up = norm([toCam[0]*0.75, 0.25 + toCam[1]*0.75, toCam[2]*0.75]);
    let S = cross(F, up); if (len(S) < 1e-3) S = cross(F, [0, 1, 0]); S = norm(S); let U = cross(S, F);
    S = norm(add(scl(S, Math.cos(BANK)), scl(U, Math.sin(BANK)))); U = cross(S, F);
    const burn = smooth(0.72, 0.86, tau)*(1 - smooth(0.85, 0.90, tau))*0.22;
    const form = smooth(0, 0.045, tau);   // fh9: the gather 0.72 s, so the wings open as it ends
    const pullT = tau*period - (T_ARR - PULL_LEAD), absorb = smooth(0, PULL_LEAD, pullT), unfurl = smooth(0.02, 0.22, tau), pp = smooth(0.90, 0.995, tau);
    const pulseA = tau >= 0.90 ? (1 - smooth(0.97, 1.0, tau))*smooth(0.90, 0.92, tau) : 0;
    const life = lifeOf(T), nextB = ((Math.floor(T/period) + 1) % 2 + 2) % 2 === 1;
    const ph = phase ?? T*2*Math.PI*0.84;
    // fh9: the wings open 0.25 to 0.75 s into the life; the crest and plume eyes flare 0.6 to 0.9 s; life B holds its
    // raised glide 6 to 10 s; on a phone life B's head is drawn 1.45 times about the skull
    const lt = tau*period, wopen = smooth(0.25, 0.75, lt), flare = smooth(0.45, 0.6, lt)*(1 - smooth(0.9, 1.1, lt));
    const hold = (isBLoop(T) ? 1 : 0)*smooth(5.6, 6.1, lt)*(1 - smooth(10.0, 10.5, lt)), headK = phone ? 1.2 : 1;   // fh10: both lives' heads, 1.2 inside the 1.3 times bird
    const b = { hold, wopen, flare, headK, C, F, U, S, V: toCam, sArc, absorb, pullT, unfurl, pulseY: -1.6 + 3.3*pp, pulseA, pp, tau, life, nextB,
      scale: 0.84*PHONE_K*(1 + 0.4*burn)*(1 + 0.2*life)*PH_K, burn, H: heading, form, flap: ph + 0.4*Math.sin(ph), amp: flapAmp(tau), tuck: flapTuck(tau), T,
      poleD: [0, -1, 0], pole: POLE_IN };
    b.path = pathLocal(b); return b;
  }

  // ---- the plumes as silk (r5): four verlet chains in the world (the two tail plumes, then the two crest plumes),
  // each node pulled toward the feather's rest shape by a stiffness high at the root and low at the tip, carried by its
  // own inertia, slowed by air drag, pulled a little by gravity; segment lengths are held. The root is pinned to the
  // bird. A jump (the scroll moving the loop, a cut) snaps them to rest, so they never whip across the screen.
  const CH = [{ n: 28, kk: -1, crest: false }, { n: 28, kk: 1, crest: false }, { n: 16, kk: -1, crest: true }, { n: 16, kk: 1, crest: true }];
  const PLUME_PATH = 0.8, CH_DRAG = 6, CH_KT = 22, CH_G = 0.25;
  let chainLive = false, prevFrame = null; const chainLocal = new Float32Array(88*3);
  function pathAtJS(path, sv){
    const k = clamp(sv/PATH_STEP, 0, 6.999), i = Math.floor(k), f = k - i, P = j => [path[j*3], path[j*3 + 1], path[j*3 + 2]];
    const a = P(Math.max(i - 1, 0)), b = P(i), c = P(Math.min(i + 1, 7)), d = P(Math.min(i + 2, 7));
    const o = [0, 0, 0]; for (let m = 0; m < 3; m++) o[m] = 0.5*((2*b[m]) + (-a[m] + c[m])*f + (2*a[m] - 5*b[m] + 4*c[m] - d[m])*f*f + (-a[m] + 3*b[m] - 3*c[m] + d[m])*f*f*f);
    const over = sv - 7*PATH_STEP; if (over > 0) { const e = norm(sub(P(7), P(6))); return add(P(7), scl(e, over)); }
    return o;
  }
  const LEN_B = 3.4;    // fh7 (fh8): the fenghuang's tail, 3 times its body and head (M34)
  function plumeLenJS(kk, unfurl, fh){ return ((kk > 0 ? 1.24 : 1.14)*(1 - fh) + LEN_B*TAIL_PHB*fh)*(0.06 + 0.94*smooth(0.4, 1.0, unfurl)); }
  function restLocal(ch, j, b){                        // the chain's rest shape, in the bird's frame
    const u = j/(ch.n - 1), kk = ch.kk, T = b.T;
    if (ch.crest) {
      const fh = b.life || 0, H = lerp3([0, 0.135, 0.54], [0, 0.33, 0.585], fh), L = 1.30*(1 - 0.5*fh)*(0.25 + 0.75*smooth(0.2, 0.85, b.unfurl)), R = add(H, [kk*0.022, 0.040, -0.020]);
      const P1 = add(R, scl([kk*0.05, 0.60, 0.02], L)), P2 = add(R, scl([kk*(0.16 + 0.10*fh), 0.50 + 0.25*fh, -1.00 + 0.15*fh], L));   // the fenghuang's crest stands higher
      const c = add(add(scl(R, (1 - u)*(1 - u)), scl(P1, 2*(1 - u)*u)), scl(P2, u*u));
      c[0] += kk*0.035*Math.sin(Math.PI*u*2);
      c[0] += Math.sin(u*4 - T*2.6 + kk*1.3)*0.025*u*u; c[1] += 0.6*Math.sin(u*3.2 - T*2.1 + kk)*0.025*u*u;
      return c;
    }
    return restTail(kk, u, b);
  }
  function restTail(kk, u, b){
    const fh = b.life || 0;
    if (fh <= 0) return plumeRest(kk, u, b, 0);
    // fh8 (review fh7, finding 3): life B's tail is an S. It leaves along the body and the line it flew; over its first
    // third the plume turns until its back two thirds trail 35 degrees below the bird's line of flight (straight back
    // from its heading, then down toward its belly as seen in the picture: the ventral side with the part along the line
    // of sight taken out, so the bend is never lost to foreshortening). A turn, so the plume keeps its length; at most 70
    // degrees, so a sharp turn still curls it to the side. Only the tip lifts again (cu, in plumeRest). So the tail never
    // runs up beside the raised wing in either look
    const p = plumeRest(kk, u, b, fh), U0 = DROOP_U0;
    if (u <= U0 || DROOP_B <= 0 || !b.H) return p;
    const pv = plumeRest(kk, U0, b, fh), pe = plumeRest(kk, 1, b, fh), d0 = norm(sub(pe, pv));
    const loc = w => [dot(w, b.S), dot(w, b.U), dot(w, b.F)], V = loc(b.V), hb = scl(norm(loc(b.H)), -1);
    let n = add([0, -1, 0], scl(V, V[1])); n = sub(n, scl(hb, dot(n, hb)));
    const tg = len(n) > 0.05 ? norm(add(scl(hb, Math.cos(DROOP_B)), scl(norm(n), Math.sin(DROOP_B)))) : hb;   // the back two thirds' direction
    const ax = cross(d0, tg), sn = len(ax); if (sn < 1e-4) return p;
    // the turn is scaled by how much of the flight line lies across the picture: flying at or away from the viewer the line
    // is foreshortened, and a full turn would hang the tail straight down past the sphere
    const vis = Math.sqrt(Math.max(0, 1 - dot(hb, V)*dot(hb, V)));
    // and never past 37 degrees below the horizon in the world (a climbing bird's tail would otherwise hang straight down
    // past the sphere's foot and over the hint)
    const k = scl(ax, 1/sn), wy = v => v[0]*b.S[1] + v[1]*b.U[1] + v[2]*b.F[1], rot = (v, an) => add(add(scl(v, Math.cos(an)), scl(cross(k, v), Math.sin(an))), scl(k, dot(k, v)*(1 - Math.cos(an))));
    let aMax = Math.min(Math.atan2(sn, dot(d0, tg)), 70*Math.PI/180)*fh*vis;
    for (let it = 0; it < 8 && aMax > 0.01 && wy(rot(d0, aMax)) < -0.6 && wy(rot(d0, aMax)) < wy(d0); it++) aMax *= 0.75;
    const a = aMax*smooth(U0, DROOP_U1, u), ca = Math.cos(a), sa = Math.sin(a), q = sub(p, pv);
    return add(pv, add(add(scl(q, ca), scl(cross(k, q), sa)), scl(k, dot(k, q)*(1 - ca))));
  }
  // fh8: 40 degrees in the bird's frame, less the two limits in restLocal, reads as 31 degrees below the flight line on screen
  // over a whole flight and 38 in the descent (median, measure/plumes-fh8.json); the bend runs over the plume's first 30%
  // (the S), the back two thirds trail straight on
  const TAIL_AMP = 1;
  const DROOP_B = 40*Math.PI/180, DROOP_U0 = 0.0, DROOP_U1 = 0.3;
  function plumeRest(kk, u, b, fh){
    const T = b.T, L = plumeLenJS(kk, b.unfurl, fh), sv = 0.3 + L*u, uu = clamp((sv - 0.3)/2.9, 0, 1);
    // fh8: life B's first third follows its own body line more than the path it flew (so it leaves the body as the body
    // points, then turns into the S below); life A is unchanged
    const wP = PLUME_PATH*(1 - 0.6*fh*(1 - smooth(0.12, 0.45, u)));
    const pa = pathAtJS(b.path, sv), p = add(scl([0, 0, -sv], 1 - wP), scl(pa, wP));
    // life A: two long plumes trailing the path, swept a little to each side
    const xA = kk*(0.05 + 0.34*uu*uu) + 0.10*kk*Math.sin(Math.PI*uu*1.6), yA = 0.10*Math.sin(Math.PI*uu*1.2) - 0.06*uu;
    // fh7 (M34), life B: two long slender plumes in a narrow sheaf (9 degrees each side, not a fan), trailing the line the
    // bird flew, a soft S, the tips alone curling up. On that rest shape rides a TRAVELLING WAVE, its amplitude growing
    // toward the tip: across (driven by the slow clock and half the wingbeat, about 2 s a wave) and up and down (driven by
    // the wingbeat itself, so each downstroke sends a ripple down the plume, deeper while flapping, shallow in a glide).
    // The two plumes run 0.5 rad apart across and 0.35 up and down, so they weave without crossing; the chain physics
    // then lags the tips behind the rest pose on every bank and beat (follow-through)
    const fan = Math.tan(9*Math.PI/180)*L*u, cu = smooth(0.80, 1.0, u), ph = b.flap || 0, Aw = L*Math.pow(u, 1.25);
    const ampK = 0.45 + 0.4*clamp((b.amp || 1)/1.32, 0, 1);
    // fh8 (M35, "the tail doesn't move enough"): both waves 1.5 times fh7's (across 0.085 to 0.13, up and down 0.075 to 0.11)
    const wX = 0.13*TAIL_AMP*Aw*Math.sin(2*Math.PI*1.05*u - (0.55*ph + 1.25*T) + kk*0.25);
    const wY = 0.11*TAIL_AMP*Aw*ampK*Math.sin(2*Math.PI*0.9*u - ph - 0.6 + kk*0.175);
    const xB = kk*(0.035 + fan) + 0.035*L*Math.sin(2*Math.PI*0.6*u)*(1 - cu) + wX;
    const yB = 0.05*L*Math.sin(Math.PI*u*0.9) - 0.03*L*u + 0.11*L*cu*cu + wY;
    const zB = 0.035*L*cu*cu*cu;
    p[0] += xA*(1 - fh) + xB*fh; p[1] += yA*(1 - fh) + yB*fh; p[2] += zB*fh;
    const wv = 0.16*1.8*TAIL_AMP*Math.pow(uu, 1.4)*(1 - fh);      // life A's slow wave (fh7 0.07, now 0.29; life B carries its own, above)
    p[0] += Math.sin(2.3*sv - 1.7*T + kk*1.4)*wv; p[1] += 0.6*Math.sin(1.9*sv - 1.3*T + kk*0.7)*wv;
    // fh8 (M35): life A's plumes ripple with the wingbeat too (each downstroke sends a wave down them), as life B's do
    p[1] += 0.12*1.8*TAIL_AMP*L*Math.pow(uu, 1.25)*Math.sin(2*Math.PI*0.9*uu - ph - 0.6 + kk*0.3)*(1 - fh);
    return p;
  }
  const toWorld = (fr, l) => add(fr.C, scl(add(add(scl(fr.S, l[0]), scl(fr.U, l[1])), scl(fr.F, l[2])), fr.scale));
  const lerpFrame = (a, b, t) => ({ C: lerp3(a.C, b.C, t), S: norm(lerp3(a.S, b.S, t)), U: norm(lerp3(a.U, b.U, t)), F: norm(lerp3(a.F, b.F, t)), scale: a.scale + (b.scale - a.scale)*t });
  function simulate(dt, b){
    const rest = CH.map(ch => { const r = []; for (let j = 0; j < ch.n; j++) r.push(restLocal(ch, j, b)); return r; });
    const jump = prevFrame && (len(sub(b.C, prevFrame.C)) > 0.35 + 3*dt || Math.abs(b.scale/prevFrame.scale - 1) > 0.25);
    const snap = !chainLive || b.form < 0.03 || b.absorb > 0.98 || !prevFrame || jump || dt <= 0 && !chainLive;
    if (snap) {
      CH.forEach((ch, c) => { ch.x = rest[c].map(l => toWorld(b, l)); ch.xp = ch.x.map(v => v.slice()); ch.tw = null; });
      chainLive = true;
    } else if (dt > 0) {
      const nSub = Math.min(12, Math.max(1, Math.ceil(dt*240))), h = dt/nSub, decay = Math.exp(-CH_DRAG*h);
      for (let k = 1; k <= nSub; k++) {
        const fr = lerpFrame(prevFrame, b, k/nSub);
        CH.forEach((ch, c) => {
          const tw = rest[c].map(l => toWorld(fr, l)), n = ch.n, twp = ch.tw || tw;
          for (let j = 1; j < n; j++) {
            const u = j/(n - 1), kS = ch.crest ? CH_KT*2 + 260*Math.pow(1 - u, 2) : CH_KT*(1 - (0.25 + 0.35*(b.life || 0))*u) + 140*Math.pow(1 - u, 3);   // fh8: softer tips, so they trail on a turn
            const x = ch.x[j], vt = sub(tw[j], twp[j]);
            const v = add(scl(sub(x, ch.xp[j]), decay), scl(vt, 1 - decay));
            const acc = add(scl(sub(tw[j], x), kS), [0, -CH_G*u, 0]);
            ch.xp[j] = x; ch.x[j] = add(add(x, v), scl(acc, h*h));
          }
          ch.tw = tw;
          ch.x[0] = tw[0]; ch.xp[0] = tw[0];
          for (let j = 1; j < n; j++) {
            const r = len(sub(tw[j], tw[j - 1])), d = sub(ch.x[j], ch.x[j - 1]), l = len(d) || 1e-6;
            if (l > r) ch.x[j] = add(ch.x[j - 1], scl(d, r/l));
          }
          const off = ch.x.map((x, j) => sub(x, tw[j]));
          for (let j = 1; j < n; j++) { const a = off[j - 1], c = off[Math.min(j + 1, n - 1)], o = off[j];
            const sm = [0, 1, 2].map(m => 0.25*a[m] + 0.5*o[m] + 0.25*c[m]), k2 = 0.5;
            const nx = add(tw[j], [o[0] + (sm[0] - o[0])*k2, o[1] + (sm[1] - o[1])*k2, o[2] + (sm[2] - o[2])*k2]);
            ch.xp[j] = add(ch.xp[j], sub(nx, ch.x[j])); ch.x[j] = nx; }
        });
      }
    }
    prevFrame = { C: b.C, S: b.S, U: b.U, F: b.F, scale: b.scale };
    let o = 0;
    CH.forEach(ch => ch.x.forEach(w => { const d = scl(sub(w, b.C), 1/b.scale); chainLocal[o++] = dot(d, b.S); chainLocal[o++] = dot(d, b.U); chainLocal[o++] = dot(d, b.F); }));
  }
  function resetChains(){ chainLive = false; prevFrame = null; }

  // the bird's outline in world space, for the page's flight bounds: the wings' reach from the same bones as the shader,
  // the plumes and crest from the simulated chains (their real place), and the wisps off their tips
  const bdir = (sw, el) => [Math.cos(el)*Math.cos(sw), Math.sin(el), -Math.cos(el)*Math.sin(sw)];
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + (b[2] - a[2])*t];
  function bones(ph, b){
    const e = Math.sin(ph), rising = Math.cos(ph), amp = b.amp ?? 1, tuck = b.tuck ?? 0;
    const fold = 1 + (Math.max(smooth(-0.2, 0.9, rising)*0.7*amp, tuck) - 1)*smooth(0, 0.7, b.unfurl), th = 0.34 + 0.62*e*amp + (0.12 - 0.34 - 0.62*e*amp)*tuck;
    const sh = [0.07, 0.035, 0.10], el = add(sh, scl(bdir(-0.15 + 0.40*fold, th), 0.30));
    const wr = add(el, scl(bdir(0.12 + 0.80*fold, th + 0.18*Math.sin(ph - 0.7)), 0.40));
    const dH = bdir(0.32 + 1.0*fold, th + 0.40*Math.sin(ph - 1.2));
    return { sh, el, wr, dH, tp: add(wr, scl(dH, 0.38)), fold, rising };
  }
  function outline(b){
    const L = [], spread = smooth(0.3, -0.9, Math.cos(b.flap)), fh = b.life || 0;
    for (const fi of [0, 0.5, 1]) {
      const B = bones(b.flap - 0.55*fi - 0.2, b);
      const N = norm(cross(B.dH, [0, 0, -1]));
      const psi = (0.20 + (1.05 + 0.35*spread)*fi)*(1 - 0.5*B.fold);
      const D = norm(add(scl([0, 0, -1], Math.cos(psi)), scl(B.dH, Math.sin(psi))));
      const Lf = (0.50 + 0.46*Math.pow(fi, 0.7))*(1 - 0.12*B.fold)*1.05*(1 + 0.12*fh);
      const Bv = sub([0, 0, -0.10], scl(N, 0.16*B.rising));
      const tip = add(add(mix3(B.wr, B.tp, 0.04 + 0.92*Math.pow(fi, 0.9)), scl(D, Lf)), scl(Bv, Lf));
      const wisp = add(tip, [0, 0.10, -0.45]);
      for (const q of [tip, wisp, B.tp, B.el]) { L.push(q); L.push([-q[0], q[1], q[2]]); }
    }
    const H = [0, 0.135, 0.54]; L.push(add(H, [0, 0, 0.2]));
    const out = L.map(q => toWorld(b, q));
    // the plumes from the simulated chains, in the bird's own frame (so a fit to the flight box moves them with it)
    if (chainLive) { let o = 0; for (const ch of CH) for (let j = 0; j < ch.n; j++, o += 3) { if (j % 3 && j !== ch.n - 1) continue;
      const l = [chainLocal[o], chainLocal[o + 1], chainLocal[o + 2]], wd = (ch.crest ? 0.04 : 0.14)*(1 + 0.5*fh);
      out.push(toWorld(b, l)); out.push(toWorld(b, add(l, [wd, 0, 0]))); out.push(toWorld(b, add(l, [-wd, 0, 0])));
      if (!ch.crest && j > ch.n*0.5) out.push(toWorld(b, add(l, [0, 0.10, -0.40]))); } }
    return out;
  }
  function birdLightCol(b){
    const f = FLAME.stops, x = clamp(b.tau*0.88 + 0.06, 0, 0.745)*4, i = Math.floor(x), t = x - i, s = t*t*(3 - 2*t);
    const a = f[i].map((v, k) => v + (f[(i + 1) % 4][k] - v)*s);
    return lerp3(a, WHITE_GOLD, b.life || 0);
  }
  function uniforms(gl, u, b, eye){
    const f = FLAME.stops, set3 = (n, v) => u[n] && gl.uniform3fv(u[n], v), set1 = (n, v) => u[n] && gl.uniform1f(u[n], v);
    if (u['uPath[0]']) gl.uniform3fv(u['uPath[0]'], b.path);
    if (u['uChain[0]']) gl.uniform3fv(u['uChain[0]'], chainLocal);
    set1('uPathStep', PATH_STEP); set1('uUnfurl', b.unfurl); set1('uAbsorb', b.absorb); set3('uPole', b.pole || POLE_IN);
    set1('uAmp', b.amp); set1('uTuck', b.tuck);
    set3('uBirth', POLE_T); set3('uEye', eye); set1('uPullT', b.pullT); set3('uPoleD', b.poleD); set3('uPoleB', scl(b.poleD, 1.62));
    set1('uHold', b.hold || 0); set1('uWOpen', b.wopen ?? 1); set1('uFlare', b.flare || 0); set1('uHeadK', b.headK || 1);   // fh9
    set1('uFh', b.life || 0); set1('uRb', b.life || 0); set1('uHue0', HUE0);
    set1('uNew', ((Math.floor(b.T/period) % 2) + 2) % 2); set1('uNt', night);
    { const v = norm(sub(eye, b.C)); set3('uViewL', [dot(v, b.S), dot(v, b.U), dot(v, b.F)]); }
    set1('uPulseY', b.pulseY); set1('uPulseA', b.pulseA);
    // the crown's light runs up the pillar in the next life's colour
    set3('uPulseC', lerp3(f[3], b.nextB ? WHITE_GOLD : f[0], b.pp));
    set1('uBL', 0.9*b.form*(1 - b.absorb)); set3('uBLC', birdLightCol(b));
  }
  let night = 1;
  return { setNight(k){ night = k; }, at, flapHz, simulate, resetChains, outline, uniforms, lifeOf, lapPoint, lapArc, setLift(k){ lift = k; },
    TOP_IN, POLE_IN, POLE_T, POLE_B, T_ARR, period };
}
