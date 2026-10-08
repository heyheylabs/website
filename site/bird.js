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
// ============================================================================================================
// LIFE B IS A PLACEHOLDER (clearly marked; search "PLACEHOLDER LIFE B").
//   The real fenghuang is being built in 2026-10-07-hhl-phoenix-field/lab/fh*.html. Until it lands, life B is r5's
//   bird with: the whole spectrum laid across the plumage at once (head and crest warm, the wings through gold and
//   green, the long plumes out to blue and violet at their tips), a fuller, taller crest, longer primaries, and longer,
//   wider-fanned tail plumes. Everything that differs between the lives reads two uniforms, the same names fh1 uses:
//     uFh  0..1  the form of life B (crest, primaries, tail)       uRb  0..1  the spectrum's weight
//   plus uHue0 (the spectrum's starting hue, in turns). The rig sets them from the loop (rig.lifeOf).
//
// HOW TO DROP IN THE REAL FENGHUANG (one swap point, this file):
//   1. From lab/fh*.html, copy its BIRD template string over BIRD_GLSL below (keep the `gSpec` writes, or set gSpec
//      in its part functions: the spectral position 0..1 of the point being drawn; fh1's `spec` argument is the same
//      thing), and its spectral()/oklch() and birdCol() over the ones in BIRD_LOOK_GLSL. fh1 already speaks uFh, uRb
//      and uHue0, so hero.js needs no change.
//   2. Copy its JS rest shapes (restLocal: the crest and tail chains) and plumeLenJS into createRig below, and its
//      STROKES table (fh1 adds `outer` counts: the flame life draws only the outer pair; hero.js honours `outer`).
//   3. If its chains have more nodes, change CH and CHAIN_N (uChain's size) together.
//   4. Reload with ?scene=4&p=0.7 (the rebirth) and ?scene=7&p=0.3 (the last pass) and shoot.
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

export const BIRD_GLSL = `
// The phoenix in full plumage, in its own frame: x across the wings, y off its back, z toward the head.
// Every part is drawn as feathers: a shaft, a vane edge and barbs slanting toward the tip, so the bird reads as strokes.
// h.x picks the part; the leftover fractions of h pick the feather and the place on it. info: part, tip, heat, weight.
uniform vec3 uPath[8]; uniform float uPathStep, uUnfurl;   // uUnfurl: 0 folded at rebirth, 1 open
// the plumes are simulated (verlet chains, see simulate() in bird.js): two tail plumes of 28 nodes, then two crest
// plumes of 16, in the bird's own frame. uAmp: the beat's amplitude (gliding is small), uTuck: the wings swept back
uniform vec3 uChain[88]; uniform float uAmp, uTuck;
uniform float uAbsorb; uniform vec3 uPole;                // drawn into a pole: 0 flying, 1 gone; the point just inside it
uniform float uFh;                                        // PLACEHOLDER LIFE B: the fenghuang's form, 0 phoenix, 1 fenghuang
float gSpec = 0.0;                                        // the spectral place (0..1) of the point last drawn (life B's colour)
const float PI = 3.14159265;
vec3 bdir(float sweep, float elev){ return vec3(cos(elev)*cos(sweep), sin(elev), -cos(elev)*sin(sweep)); }
vec3 pathAt(float s){                              // the flight path behind the bird, s local units back from its centre
  float k = clamp(s/uPathStep, 0.0, 6.999); int i = int(k); float f = k - float(i);
  vec3 a = uPath[max(i - 1, 0)], b = uPath[i], c = uPath[min(i + 1, 7)], d = uPath[min(i + 2, 7)];
  vec3 p = 0.5*((2.0*b) + (-a + c)*f + (2.0*a - 5.0*b + 4.0*c - d)*f*f + (-a + 3.0*b - 3.0*c + d)*f*f*f);
  float over = s - 7.0*uPathStep;
  if (over > 0.0) p = uPath[7] + normalize(uPath[7] - uPath[6] + vec3(0.0, 0.0, -1e-4))*over;
  return p;
}
vec3 vane(float r1, float r2, float r3, float nb, float slant){
  if (r1 < 0.36) return vec3(r2, (r3 - 0.5)*0.05, 1.0);                                   // the shaft
  if (r1 < 0.60) return vec3(r2, (r3 < 0.5 ? -1.0 : 1.0)*(0.92 + 0.16*fract(r3*2.0)), 0.7); // the vane edge
  float b = floor(r2*nb), side = fract(r2*nb) < 0.5 ? -1.0 : 1.0;                        // barbs
  return vec3(min((b + 0.5)/nb + r3*slant, 1.0), side*r3, 0.5);
}
// the shaft is a curve: its tip sweeps toward the trailing side as c*L*u*u (a 3% sagitta)
const float SAG_C = 0.12;
vec3 feather(vec3 R, vec3 D, vec3 N, vec3 B, float L, float wv, vec3 uv){
  vec3 P = normalize(cross(N, D));
  float u = uv.x;
  float w = wv*L*sqrt(max(sin(PI*min(u*1.12, 1.0)), 0.0))*(1.0 - 0.3*u)*(uv.y < 0.0 ? 0.45 : 1.0);
  vec3 Pl = normalize(P - D*(2.0*SAG_C*u));
  return R + D*(L*u) + P*(SAG_C*L*u*u) + N*(dot(B, N)*L*u*u) + Pl*(uv.y*w);
}
float fjit(float n){ return fract(sin(n*12.9898 + 4.1414)*43758.5453); }
float featherFade(float u){ return 1.0 - smoothstep(0.85, 1.0, u); }
float rootFade(float u){ return smoothstep(0.0, 0.15, u); }
void bones(float ph, out vec3 sh, out vec3 el, out vec3 wr, out vec3 tp, out vec3 dH, out float fold){
  float e = sin(ph), rising = cos(ph);
  fold = mix(1.0, max(smoothstep(-0.2, 0.9, rising)*0.7*uAmp, uTuck), smoothstep(0.0, 0.7, uUnfurl));
  float th = mix(0.34 + 0.62*e*uAmp, 0.12, uTuck);
  sh = vec3(0.07, 0.035, 0.10);
  el = sh + bdir(-0.15 + 0.40*fold, th)*0.30;
  wr = el + bdir(0.12 + 0.80*fold, th + 0.18*sin(ph - 0.7))*0.40;
  dH = bdir(0.32 + 1.0*fold, th + 0.40*sin(ph - 1.2));
  tp = wr + dH*0.38;
}
vec3 armAt(float t, vec3 sh, vec3 el, vec3 wr, vec3 tp){
  float k = clamp(t, 0.0, 2.999); int i = int(k); float f = k - float(i);
  vec3 a0 = 2.0*sh - el, a4 = 2.0*tp - wr;
  vec3 a = i == 0 ? a0 : (i == 1 ? sh : el), b = i == 0 ? sh : (i == 1 ? el : wr);
  vec3 c = i == 0 ? el : (i == 1 ? wr : tp), d = i == 0 ? wr : (i == 1 ? tp : a4);
  vec3 p = 0.5*((2.0*b) + (-a + c)*f + (2.0*a - 5.0*b + 4.0*c - d)*f*f + (-a + 3.0*b - 3.0*c + d)*f*f*f);
  return p + vec3(0.0, 0.012, 0.080)*sin(PI*pow(clamp(t/3.0, 0.0, 1.0), 1.6));
}
vec3 chainAt(int base, int n, float x){
  float k = clamp(x, 0.0, float(n - 1) - 1e-3); int i = int(k); float f = k - float(i);
  vec3 a = uChain[base + max(i - 1, 0)], b = uChain[base + i], c = uChain[base + min(i + 1, n - 1)], d = uChain[base + min(i + 2, n - 1)];
  return 0.5*((2.0*b) + (-a + c)*f + (2.0*a - 5.0*b + 4.0*c - d)*f*f + (-a + 3.0*b - 3.0*c + d)*f*f*f);
}
// PLACEHOLDER LIFE B: the fenghuang's plumes run 30% longer
float plumeLen(float kk){ return (kk > 0.0 ? 2.95 : 2.75)*(1.0 + 0.30*uFh)*mix(0.06, 1.0, smoothstep(0.4, 1.0, uUnfurl)); }
vec3 spine(float s, float kk){ return chainAt(kk < 0.0 ? 0 : 28, 28, (s - 0.3)/max(plumeLen(kk), 1e-3)*27.0); }
float barred(float u, float n){ float b = fract(u*n); return 0.45 + 0.55*smoothstep(0.08, 0.22, b)*(1.0 - smoothstep(0.58, 0.72, b)); }
// grp 0 primaries (10 a side), 1 secondaries (11), 2 tertials (3), 3 greater coverts (16)
vec3 wingF(float grp, float i, float side, vec3 uv, float flap, out vec4 info){
  float rising = cos(flap), spread = smoothstep(0.3, -0.9, rising);
  vec3 sh, el, wr, tp, dH; float fold; vec3 p;
  if (grp < 0.5) {
    float fi = i/9.0;
    bones(flap - 0.55*uv.x*fi - 0.2 - 0.12*uv.x*uv.x, sh, el, wr, tp, dH, fold);
    vec3 N = normalize(cross(dH, vec3(0.0, 0.0, -1.0)));
    float psi = (0.20 + (1.05 + 0.35*spread)*fi)*(1.0 - 0.5*fold);
    vec3 D = normalize(cos(psi)*vec3(0.0, 0.0, -1.0) + sin(psi)*dH);
    float L = (0.50 + 0.46*pow(fi, 0.7))*(1.0 - 0.12*fold)*(0.95 + 0.10*fjit(i*1.7 + 0.3))*(1.0 + 0.12*uFh);
    vec3 B = vec3(0.0, 0.0, -0.10) - N*(0.16*rising + 0.05*sin(flap - 1.6)) + N*0.03*sin(uT*8.0 + i*1.7)*uv.x;
    p = feather(armAt(2.04 + 0.92*pow(fi, 0.9), sh, el, wr, tp), D, N, B, L, 0.13, uv);
    p += N*(0.012*uv.y*uv.y*uv.x*sin(uT*19.0 + uv.x*11.0 + i*2.3 + uv.y*3.0));
    info = vec4(1.0, 0.5 + 0.5*uv.x, pow(uv.x, 4.0)*0.8, uv.z*rootFade(uv.x));
    gSpec = 0.22 + 0.24*fi + 0.12*uv.x;
  } else if (grp < 1.5) {
    float fj = i/10.0;
    bones(flap - 0.35*uv.x - 0.1, sh, el, wr, tp, dH, fold);
    vec3 dF = normalize(wr - el), N = normalize(cross(dF, vec3(0.0, 0.0, -1.0)));
    float psi = 0.03 + 0.24*fj + 0.06*(fjit(i*3.1 + 2.0) - 0.5);
    vec3 D = normalize(cos(psi)*vec3(0.0, 0.0, -1.0) + sin(psi)*dF);
    vec3 B = vec3(0.0, 0.0, -0.05) - N*(0.10*rising);
    float L = (0.40 + 0.07*sin(PI*fj) - 0.03*fj)*(0.92 + 0.16*fjit(i*2.3 + 5.1));
    p = feather(armAt(1.0 + 0.98*fj, sh, el, wr, tp), D, N, B, L, 0.17, uv);
    p += N*(0.008*uv.y*uv.y*uv.x*sin(uT*17.0 + uv.x*9.0 + i*1.9));
    info = vec4(1.0, 0.35 + 0.4*uv.x, pow(uv.x, 4.0)*0.4, uv.z*0.9*rootFade(uv.x));
    gSpec = 0.15 + 0.10*fj + 0.10*uv.x;
  } else if (grp < 2.5) {
    bones(flap - 0.2*uv.x, sh, el, wr, tp, dH, fold);
    vec3 dU = normalize(el - sh), N = normalize(cross(dU, vec3(0.0, 0.0, -1.0)));
    p = feather(armAt(0.15 + 0.35*i, sh, el, wr, tp), normalize(vec3(-0.12 - 0.05*i, 0.0, -1.0)), N, vec3(0.0, 0.0, -0.04), 0.36*(0.84 + 0.08*i + 0.10*fjit(i + 9.0)), 0.22, uv);
    info = vec4(1.0, 0.25 + 0.3*uv.x, 0.0, uv.z*0.8*rootFade(uv.x));
    gSpec = 0.13 + 0.08*uv.x;
  } else {
    float fm = i/15.0;
    bones(flap - 0.1*uv.x, sh, el, wr, tp, dH, fold);
    vec3 dS = fm < 0.5 ? normalize(wr - el) : dH, N = normalize(cross(dS, vec3(0.0, 0.0, -1.0)));
    float psi = (mix(0.08, 0.75, fm) + 0.08*(fjit(i*2.9 + 1.1) - 0.5))*(1.0 - 0.5*fold);
    vec3 D = normalize(cos(psi)*vec3(0.0, 0.0, -1.0) + sin(psi)*dS);
    vec3 R = armAt(1.0 + fm*1.96, sh, el, wr, tp) + N*0.02;
    p = feather(R, D, N, vec3(0.0, 0.0, -0.03), 0.21*mix(0.92, 1.06, fm)*(0.82 + 0.30*fjit(i*1.9 + 3.3)), 0.32, uv);
    info = vec4(1.0, 0.3, 0.0, uv.z*0.8*rootFade(uv.x));
    gSpec = 0.11 + 0.14*fm;
  }
  info.w *= featherFade(uv.x);
  p.x *= side; return p;
}
vec3 plumeBow(vec3 T, float L, float u){ vec3 n = vec3(0.0, 1.0, 0.0) - T*T.y; float k = length(n);
  return (k > 1e-3 ? n/k : vec3(1.0, 0.0, 0.0))*(4.0*0.03*L*u*(1.0 - u)); }
vec3 crestF(float kk, vec3 uv, out vec4 info){
  float u = uv.x, L = 1.30*(1.0 + 0.35*uFh)*mix(0.25, 1.0, smoothstep(0.2, 0.85, uUnfurl));
  int cb = kk < 0.0 ? 56 : 72;
  vec3 c = chainAt(cb, 16, u*15.0), T = normalize(chainAt(cb, 16, u*15.0 + 0.06) - c + vec3(0.0, 0.0, -1e-5));
  c += plumeBow(T, L, u);
  vec3 P = normalize(cross(T, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 0.0, 0.2));
  float w = 0.034*(1.0 + 0.7*uFh)*smoothstep(0.0, 0.10, u)*pow(1.0 - u, 0.9);   // PLACEHOLDER LIFE B: a fuller crest
  info = vec4(3.0, 0.45 + 0.55*u, u*u*0.5, uv.z*1.05*barred(u, 14.0)*featherFade(u));
  gSpec = 0.02 + 0.10*u;
  return c + P*uv.y*w;
}
vec3 tcovF(float k, vec3 uv, out vec4 info, float flap){
  float spread = smoothstep(0.3, -0.9, cos(flap));
  float kc = k - 3.0, a = kc/3.0*0.26*(0.85 + 0.3*spread)*(1.0 + 0.4*uFh);
  float L = 0.30*(1.0 + 0.4*uFh)*mix(0.4, 1.0, smoothstep(0.2, 0.8, uUnfurl));
  vec3 D = normalize(vec3(sin(a), -0.06, -cos(a))), R = vec3(sin(a)*0.03, 0.02, -0.30);
  vec3 bendP = (pathAt(0.30 + L*uv.x) - vec3(0.0, 0.0, -0.30 - L*uv.x))*0.7;
  info = vec4(4.0, 0.3 + 0.4*uv.x, pow(uv.x, 4.0)*0.3, uv.z*0.6*featherFade(uv.x));
  gSpec = 0.46 + 0.08*uv.x;
  return feather(R, D, vec3(0.0, 1.0, 0.0), vec3(0.0, -0.03, 0.0), L, 0.26, uv) + bendP;
}
vec3 plumeF(float kk, vec3 uv, out vec4 info){
  float L = plumeLen(kk), u = uv.x, s = 0.30 + L*u;
  vec3 c = spine(s, kk), T = normalize(spine(s + 0.02, kk) - c);
  c += plumeBow(T, L, u);
  vec3 P = normalize(cross(vec3(0.0, 1.0, 0.0), T));
  float w = (0.12*smoothstep(0.0, 0.05, u)*pow(1.0 - u, 0.7) + 0.004)*(1.0 + 0.5*uFh);   // PLACEHOLDER LIFE B: wider vanes
  float bar = barred(u, 22.0);
  info = vec4(5.0, 0.3 + 0.6*u, u*u*0.25 + 0.15*(1.0 - bar), uv.z*(uv.z > 0.9 ? 1.45 : 1.15)*bar*featherFade(u));
  gSpec = 0.52 + 0.48*u;
  return c + P*uv.y*w;
}
vec3 bodyF(float row, float col, vec3 uv, out vec4 info){
  float tr = (row + 0.5)/18.0, a = (col + 0.5 + 0.5*mod(row, 2.0))/14.0*2.0*PI;
  float r = 0.115*pow(max(sin(PI*mix(0.04, 0.97, pow(tr, 0.85))), 0.0), 0.75);
  vec3 n = normalize(vec3(cos(a), sin(a)*0.8, 0.0));
  vec3 R = vec3(cos(a)*r, 0.02 + sin(a)*r*0.8, mix(-0.34, 0.24, tr));
  vec3 D = normalize(vec3(0.0, 0.0, -1.0) + n*0.22);
  info = vec4(2.0, 0.05 + 0.1*uv.x, 0.1, (0.55 + 0.25*step(0.0, sin(a)))*uv.z*featherFade(uv.x));
  gSpec = 0.06 + 0.06*(1.0 - tr);
  return feather(R, D, n, -n*0.01, 0.075 + 0.02*sin(PI*tr), 0.62, uv);
}
vec3 neckF(float row, float col, vec3 uv, out vec4 info){
  vec3 H = vec3(0.0, 0.135, 0.54);
  float t = (row + 0.5)/10.0, it = 1.0 - t;
  vec3 P0 = vec3(0.0, 0.03, 0.20), P1 = vec3(0.025, -0.06, 0.34), P2 = vec3(-0.02, 0.19, 0.37), P3 = H + vec3(0.0, -0.01, -0.03);
  vec3 c = it*it*it*P0 + 3.0*it*it*t*P1 + 3.0*it*t*t*P2 + t*t*t*P3;
  vec3 tg = normalize(3.0*it*it*(P1 - P0) + 6.0*it*t*(P2 - P1) + 3.0*t*t*(P3 - P2));
  float a = (col + 0.5 + 0.5*mod(row, 2.0))/10.0*2.0*PI, rr = mix(0.065, 0.038, t);
  vec3 n = normalize(vec3(cos(a), sin(a)*0.85, 0.0));
  info = vec4(2.0, 0.05, 0.15, 0.7*uv.z*featherFade(uv.x));
  gSpec = 0.04*(1.0 - t);
  return feather(c + n*rr, normalize(-tg + n*0.25), n, -n*0.008, 0.06, 0.4, uv);
}
vec3 birdPoint(vec3 h, float flap, out vec4 info){
  float x = h.x; info = vec4(0.0, 0.0, 0.0, 1.0);
  if (x < 0.46) {                                      // WINGS
    float q = x/0.46; float side = q < 0.5 ? -1.0 : 1.0; q = fract(q*2.0);
    if (q < 0.50) { float qi = q/0.50*10.0; return wingF(0.0, floor(qi), side, vane(fract(qi), h.y, h.z, 16.0, 0.06), flap, info); }
    if (q < 0.80) { float qi = (q - 0.50)/0.30*11.0; return wingF(1.0, floor(qi), side, vane(fract(qi), h.y, h.z, 12.0, 0.06), flap, info); }
    if (q < 0.86) { float qi = (q - 0.80)/0.06*3.0; return wingF(2.0, floor(qi), side, vane(fract(qi), h.y, h.z, 9.0, 0.06), flap, info); }
    if (q < 0.95) { float qi = (q - 0.86)/0.09*16.0; return wingF(3.0, floor(qi), side, vane(fract(qi), h.y, h.z, 6.0, 0.08), flap, info); }
    vec3 sh, el, wr, tp, dH; float fold;               // the leading edge: a soft band of marginal coverts
    bones(flap, sh, el, wr, tp, dH, fold);
    float t = h.y*3.0, off = h.z*h.z*0.11, jt = fract(h.y*977.0 + h.z*131.0) - 0.5;
    vec3 p = armAt(t, sh, el, wr, tp) + vec3(0.0, 0.012 + 0.008*jt, 0.012 - off);
    info = vec4(1.0, 0.15 + 0.3*h.y, 0.15*h.y, (1.0 - 0.55*h.z)*(1.0 - smoothstep(2.4, 3.0, t)));
    gSpec = 0.10 + 0.05*t;
    p.x *= side; return p;
  }
  vec3 H = vec3(0.0, 0.135, 0.54);                     // the head
  if (x < 0.56) {                                      // BODY, NECK, HEAD, BEAK
    float q = (x - 0.46)/0.10;
    if (q < 0.50) {
      float t = h.y*18.0, row = floor(t), tr = (row + 0.5)/18.0;
      float ca = floor(h.z*14.0), s = fract(h.z*14.0);
      float a = (ca + 0.5 + 0.5*mod(row, 2.0))/14.0*2.0*PI;
      float r = 0.115*pow(max(sin(PI*mix(0.04, 0.97, pow(tr, 0.85))), 0.0), 0.75);
      info = vec4(2.0, 0.0, 0.1, 0.55 + 0.25*step(0.0, sin(a)));
      gSpec = 0.06 + 0.06*(1.0 - tr);
      return vec3(cos(a)*r, 0.02 + sin(a)*r*0.8, mix(-0.34, 0.24, tr) - s*0.07);
    } else if (q < 0.74) {
      float t = h.y, it = 1.0 - t;
      vec3 P0 = vec3(0.0, 0.03, 0.20), P1 = vec3(0.025, -0.06, 0.34), P2 = vec3(-0.02, 0.19, 0.37), P3 = H + vec3(0.0, -0.01, -0.03);
      vec3 c = it*it*it*P0 + 3.0*it*it*t*P1 + 3.0*it*t*t*P2 + t*t*t*P3;
      float a = (floor(h.z*10.0) + 0.5)/10.0*2.0*PI, s = fract(h.z*10.0);
      float r = mix(0.065, 0.038, t);
      info = vec4(2.0, 0.05, 0.15, 0.7);
      gSpec = 0.04*(1.0 - t);
      return c + vec3(cos(a)*r, sin(a)*r*0.85, -s*0.05);
    } else if (q < 0.90) {
      float a = h.y*2.0*PI, b = acos(2.0*h.z - 1.0);
      vec3 n = vec3(sin(b)*cos(a), sin(b)*sin(a), cos(b));
      gSpec = 0.0;
      if (fract(q*40.0) < 0.12) { info = vec4(2.0, 0.1, 1.0, 1.6); return H + vec3(sign(n.x)*0.034, 0.018, 0.022) + n*0.006; }
      info = vec4(2.0, 0.1, 0.25, 0.8);
      return H + n*vec3(0.048, 0.044, 0.064);
    }
    float t = h.y, a = h.z*2.0*PI;
    vec3 c = H + vec3(0.0, -0.012 - 0.03*t*t, 0.055 + 0.10*t);
    info = vec4(2.0, 0.15, 0.6, 1.1);
    gSpec = 0.0;
    return c + vec3(cos(a), sin(a), 0.0)*0.019*(1.0 - t);
  }
  if (x < 0.61) { float q = (x - 0.56)/0.05*2.0; return crestF(floor(q)*2.0 - 1.0, vane(fract(q), h.y, h.z, 26.0, 0.04), info); }
  if (x < 0.65) { float qi = (x - 0.61)/0.04*7.0; return tcovF(floor(qi), vane(fract(qi), h.y, h.z, 7.0, 0.06), info, flap); }
  if (x < 0.92) { float q = (x - 0.65)/0.27*2.0; return plumeF(floor(q)*2.0 - 1.0, vane(fract(q), h.y, h.z, 44.0, 0.035), info); }
  // FLAME WISPS peeling off the trailing edges and the plumes
  float q = (x - 0.92)/0.08, age = fract(h.y + uT*0.55);
  vec3 o;
  if (q < 0.55) {
    vec3 sh, el, wr, tp, dH; float fold; bones(flap - age*1.4, sh, el, wr, tp, dH, fold);
    float t = fract(q/0.55*2.0);
    o = armAt(1.0 + 2.0*t, sh, el, wr, tp) + dH*(0.25*t*t) + vec3(0.0, 0.0, -0.34 - 0.10*sin(PI*t) - 0.10*fjit(h.z*31.0));
    o.x *= q < 0.275 ? -1.0 : 1.0;
    gSpec = 0.2 + 0.3*t;
  } else {
    float kk = fract(q*7.0) < 0.5 ? -1.0 : 1.0;
    o = spine(0.30 + plumeLen(kk)*mix(0.25, 0.9, h.z), kk);
    gSpec = 0.6 + 0.35*h.z;
  }
  vec3 p = o + vec3(0.0, 0.0, -0.75)*age + vec3(0.0, 0.22, 0.0)*age*age
         + vec3(sin(age*7.0 + h.z*20.0 + uT*3.0), sin(age*5.0 + h.z*13.0 + uT*2.3), 0.0)*0.07*age;
  info = vec4(6.0, 1.0, 0.25*(1.0 - age), pow(1.0 - age, 1.6)*0.6*smoothstep(0.0, 0.15, age));
  return p;
}
`;

export const BIRD_LOOK_GLSL = `
uniform vec3 uBirth, uEye, uPoleB, uPoleD; uniform float uPullT;
uniform float uRb, uHue0;          // PLACEHOLDER LIFE B: the spectrum's weight and its starting hue, in turns (fh1's names)
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
// a local bird point to the world: the rebirth gathers it out of the top pole (staggered, strand by strand); the death
// draws it along the shell into a pole (uPoleD: down for the fall, up for the close's last pass). wp: how far it is
// gathered; ab: how far it is drawn in.
vec3 birdXf(vec3 l, vec4 info, vec3 h, float hk, out float wp, out float ab, out float vis, out float hb){
  float rank = clamp(info.y, 0.0, 1.0)*0.55 + (info.x > 4.5 ? 0.12 : 0.0);
  float g = rank*0.6 + hk*0.18; wp = smoothstep(g, g + 0.26, uForm);
  float bp = clamp(uBurn*2.0, 0.0, 1.0);
  hb = smoothstep(0.0, 0.3, info.y - (1.0 - bp*1.35));
  vec3 w = uC + (uS*l.x + uU*l.y + uF*l.z)*uScale;
  w += (normalize(h - 0.5 + 1e-4)*1.2*h.z + uU*0.35 - uF*0.35)*hb*(0.12 + 0.4*bp);
  ab = 0.0; vis = 1.0;
  if (uPullT > 0.0) {
    vec3 dn = uPoleD;
    float fk = 2.0 - min(length(w - uPoleB)/1.6, 1.0);
    float lin = pow(clamp(uPullT/0.6, 0.0, 1.0), 1.0/fk); ab = lin*lin*(3.0 - 2.0*lin);
    float r = length(w); vec3 nn = w/max(r, 1e-4);
    float th = acos(clamp(dot(nn, dn), -1.0, 1.0));
    vec3 tg = nn - dn*dot(nn, dn); float tl = length(tg); tg = tl > 1e-4 ? tg/tl : vec3(0.0, 0.0, 1.0);
    float th2 = th*(1.0 - ab);
    w = (dn*cos(th2) + tg*sin(th2))*mix(r, 1.63, smoothstep(0.0, 0.4, ab)) + normalize(h - 0.5 + 1e-4)*pow(h.z, 0.6)*mix(0.03, 0.075, ab*ab);
    float fo = clamp((uPullT - 0.6)/0.4, 0.0, 1.0); vis = 1.0 - fo*fo;
  }
  return mix(uBirth + normalize(h - 0.5 + 1e-4)*0.06*sqrt(h.z), w, wp);
}
// the bird's colour. Life A: the flame ramp runs root to tip along each feather (tips a step further on). Life B
// (PLACEHOLDER): the whole spectrum at once across the plumage (gSpec), with a white-gold core where it is hottest.
vec3 birdCol(vec4 info, float wp, float ab, float hb, float hk, float hueOff, float spec){
  vec3 col = flame(clamp(uTau*0.88 + info.y*0.13 + hueOff, 0.0, 0.745));
  if (uRb > 0.0) col = mix(col, spectral(spec + hueOff*3.0), uRb);
  col = mix(col, uHot, clamp(info.z, 0.0, 1.0)*mix(0.5, 0.22, uRb));
  col = mix(col, mix(uFl[3], uHot, 0.35 + 0.4*info.y), hb*0.85);
  col = mix(mix(uInk, uInk2, hk), col, smoothstep(0.0, 0.7, wp)*0.85);
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
void birdVertex(ivec2 c, vec4 s){
  vec3 h = birdHash(vec2(c) + uRep*vec2(613.37, 271.91));
  vec4 info; vec3 l = birdPoint(h, uFlap, info); float spec = gSpec;
  float fl = sin(uT*9.0 + h.z*40.0)*0.5 + 0.5;
  l += vec3(sin(uT*5.5 + h.x*50.0), sin(uT*6.5 + h.y*60.0), sin(uT*4.5 + h.z*70.0)) * (0.001 + 0.006*fl*info.y*info.y);
  float hk = hash(vec2(c) + 42.1), wp, ab, vis, hb;
  vec3 w = birdXf(l, info, h, hk, wp, ab, vis, hb);
  vec4 cq = uVP*vec4(w, 1.0); gl_Position = cq;
  float dep = depthOf(cq);
  vec3 col = birdCol(info, wp, ab, hb, hash(vec2(c) + 2.2), (hk - 0.5)*0.05, spec);
  float a = dep*(0.72 + 0.28*fl)*info.w*uFireA*(1.0 - 0.45*hb)*vis*(1.0 + 0.25*step(0.6, uTau));
  vCol = vec4(col, a*wp*(0.35 + 0.65*wp)*uBirdA);
  vCol.a = max(vCol.a, 0.07*(1.0 - wp)*(1.0 - uForm)*info.w*uFireA*dep*step(uAbsorb, 0.0));
  vCol.a *= birdOcc(w, ab);
  float zr = zoomRaw(cq), ps = uPx*(1.1 + 0.45*fl*info.y + 0.5*info.z)*(0.8 + 0.5*dep)*zoomOf(cq)*mix(1.0, 0.7, smoothstep(1.2, 3.0, zr));
  vCol.a *= min(zoomGain(cq), 1.25)*min(1.0, ps*ps);
  gl_PointSize = max(ps, 1.0);
}
`;

// The stroke pass: every feather drawn as anti-aliased hairlines, one instanced quad per segment. A group (primaries,
// secondaries, ...) is one draw; the instance number picks the feather, then the rachis segment or the barb and its
// segment. Width is in world units (thicker at the root, a fine point at the tip), never under one pixel: thinner than
// that it dims instead. Barbs carry an anisotropic sheen so the vane shimmers as it turns.
export const BIRD_STROKE_VS = `#version 300 es
precision highp float;
uniform float uGrp, uNF, uNb, uSR, uSB, uSlant, uWR, uWB, uStrA, uFpx, uRachA;
uniform vec2 uVpx;
${BIRD_ENGINE_DECL}
${BIRD_HELPERS_GLSL}
${BIRD_GLSL}
${BIRD_LOOK_GLSL}
out vec4 vCol; out float vD; out float vHw;
vec3 partPt(float f, vec3 uv, out vec4 info){
  if (uGrp < 3.5) { float side = f < uNF ? -1.0 : 1.0; return wingF(uGrp, mod(f, uNF), side, uv, uFlap, info); }
  if (uGrp < 4.5) return crestF(f*2.0 - 1.0, uv, info);
  if (uGrp < 5.5) return tcovF(f, uv, info, uFlap);
  if (uGrp < 6.5) return plumeF(f*2.0 - 1.0, uv, info);
  if (uGrp < 7.5) return bodyF(floor(f/14.0), mod(f, 14.0), uv, info);
  return neckF(floor(f/10.0), mod(f, 10.0), uv, info);
}
void main(){
  float id = float(gl_InstanceID), E = uSR + uNb*2.0*uSB;
  float f = floor(id/E), e = id - f*E;
  vec3 uv0, uv1; float barb = 0.0, bi = 0.0, s1 = 0.0;
  if (e < uSR) { uv0 = vec3(e/uSR, 0.0, 1.0); uv1 = vec3((e + 1.0)/uSR, 0.0, 1.0); }
  else {
    float r = e - uSR, b = floor(r/(2.0*uSB)), rr = r - b*2.0*uSB, side = rr < uSB ? -1.0 : 1.0, sg = mod(rr, uSB);
    float u0 = (b + 0.35 + 0.3*hash(vec2(b, f + uGrp*17.0)))/uNb, s0 = sg/uSB; s1 = (sg + 1.0)/uSB;
    float sl = uSlant*(side < 0.0 ? 0.7 : 1.0);
    uv0 = vec3(min(u0 + sl*s0 - 0.01*s0*s0, 1.0), side*s0, 0.5); uv1 = vec3(min(u0 + sl*s1 - 0.01*s1*s1, 1.0), side*s1, 0.5);
    barb = 1.0; bi = b;
  }
  vec4 i0, i1; vec3 l0 = partPt(f, uv0, i0); float spec = gSpec; vec3 l1 = partPt(f, uv1, i1);
  float hk = hash(vec2(f + uGrp*31.0, bi + uRep*7.0) + 0.37);
  vec3 h = vec3(hash(vec2(f, uGrp) + 0.11), hash(vec2(f, bi) + 7.31), hash(vec2(bi, uGrp) + 3.77));
  float wp, ab, vis, hb, wp1, ab1, vis1, hb1;
  vec3 w0 = birdXf(l0, i0, h, hk, wp, ab, vis, hb), w1 = birdXf(l1, i1, h, hk, wp1, ab1, vis1, hb1);
  vec4 c0 = uVP*vec4(w0, 1.0), c1 = uVP*vec4(w1, 1.0);
  int k = gl_VertexID;
  if (c0.w < 0.05 || c1.w < 0.05 || wp < 0.02 || uBirdK < 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); vD = 0.0; vHw = 0.0; return; }
  vec2 p0 = c0.xy/c0.w*0.5*uVpx, p1 = c1.xy/c1.w*0.5*uVpx, d = p1 - p0; float dl = length(d);
  vec2 dir = dl > 1e-4 ? d/dl : vec2(1.0, 0.0), nrm = vec2(-dir.y, dir.x);
  float uE = k < 2 ? uv0.x : uv1.x;
  float taper = barb > 0.5 ? (1.0 - 0.6*s1) : (1.0 - 0.8*uE);
  float wW = (barb > 0.5 ? uWB : uWR)*uScale*taper;
  float wpx = wW*uFpx/(k < 2 ? c0.w : c1.w);
  float hw = max(wpx, 1.0)*0.5, pad = hw + 1.0;
  vec2 P = (k < 2 ? p0 : p1) + nrm*((k & 1) == 0 ? -pad : pad);
  vec4 cc = k < 2 ? c0 : c1;
  gl_Position = vec4(P/(0.5*uVpx)*cc.w, cc.z, cc.w);
  vD = (k & 1) == 0 ? -pad : pad; vHw = hw;
  vec4 info = i0; vec3 wm = 0.5*(w0 + w1);
  vec3 T = normalize(w1 - w0 + 1e-6), V = normalize(uEye - wm), L = normalize(-wm + vec3(0.0, 0.4, 0.0));
  float TH = dot(T, normalize(L + V)), sheen = pow(sqrt(max(1.0 - TH*TH, 0.0)), 40.0);
  float irid = barb*0.05*dot(T, V);
  vec3 col = birdCol(info, wp, ab, hb, hk, irid + (hk - 0.5)*0.03, spec);
  col = mix(col, uHot, barb*sheen*0.35);
  float glint = barb > 0.5 ? 0.75 + 0.25*sin(uT*2.3 + bi*1.7 + f*3.1) : 1.0;
  float a = uStrA*(k < 2 ? i0.w : i1.w)*uFireA*vis*wp*(0.35 + 0.65*wp)*birdOcc(wm, ab)*depthOf(cc)*(barb > 0.5 ? (0.9 + 1.6*sheen)*glint*(0.55 + 0.45*s1) : 0.85*uRachA);
  a *= min(1.0, wpx)*uBirdK;
  vCol = vec4(col, a);
}`;
export const BIRD_STROKE_FS = `#version 300 es
precision highp float; in vec4 vCol; in float vD; in float vHw; out vec4 o;
void main(){ float cov = clamp(vHw + 0.5 - abs(vD), 0.0, 1.0); o = vec4(vCol.rgb*vCol.a*cov, 1.0); }`;

// The plumage strokes (r5): per group, the feathers it draws (both sides), the rachis segments, barbs per side of the
// vane and the segments of each barb, the barb slant toward the tip, and the rachis and barb widths in bird units.
export const STROKES = [
  { grp: 0, nf: 10, count: 20, nb: 30, sr: 18, sb: 3, slant: 0.10, wr: 0.0045, wb: 0.0026, ra: 0.75 },   // primaries
  { grp: 1, nf: 11, count: 22, nb: 22, sr: 12, sb: 2, slant: 0.10, wr: 0.004, wb: 0.0024, ra: 0.75 },    // secondaries
  { grp: 2, nf: 3, count: 6, nb: 16, sr: 10, sb: 2, slant: 0.10, wr: 0.006, wb: 0.002 },                // tertials
  { grp: 3, nf: 16, count: 32, nb: 8, sr: 6, sb: 2, slant: 0.14, wr: 0.005, wb: 0.002 },                // greater coverts
  { grp: 4, nf: 2, count: 2, nb: 44, sr: 36, sb: 2, slant: 0.05, wr: 0.006, wb: 0.0018 },               // the crest plumes
  { grp: 5, nf: 7, count: 7, nb: 12, sr: 8, sb: 2, slant: 0.10, wr: 0.005, wb: 0.002 },                 // tail coverts
  { grp: 6, nf: 2, count: 2, nb: 110, sr: 72, sb: 3, slant: 0.035, wr: 0.006, wb: 0.0024 },             // the two long plumes
  { grp: 7, nf: 14, count: 252, nb: 7, sr: 3, sb: 1, slant: 0.16, wr: 0.003, wb: 0.0018, ra: 0.3 },      // body contour feathers
  { grp: 8, nf: 10, count: 100, nb: 5, sr: 3, sb: 1, slant: 0.2, wr: 0.0028, wb: 0.0016, ra: 0.3 },      // neck hackles
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
  name: 'the r5 phoenix (life A) and the PLACEHOLDER fenghuang (life B)',
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
// PLACEHOLDER LIFE B: the spectrum starts at this hue (turns); its white-gold core
const HUE0 = 0.02, WHITE_GOLD = [1.0, 0.94, 0.80];

function createRig({ phone, period, homeDir }) {
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
  function flapHz(tau){ return 0.84 - 0.24*smooth(0.0, 0.04, tau)*(1 - smooth(0.16, 0.26, tau)) - 0.42*smooth(0.40, 0.45, tau)*(1 - smooth(0.52, 0.57, tau)) - 0.30*smooth(0.70, 0.76, tau); }
  function flapAmp(tau){ return 1 + 0.15*smooth(0.06, 0.12, tau)*(1 - smooth(0.2, 0.28, tau)) - 0.68*smooth(0.40, 0.45, tau)*(1 - smooth(0.52, 0.57, tau)); }
  function flapTuck(tau){ return 0.65*smooth(0.70, 0.77, tau)*(1 - smooth(0.88, 0.95, tau)); }
  // The two lives (M27): even loops are life A, odd loops life B. A new life's form and colour turn over while it
  // unfolds (tau 0 to 0.24), out of sight inside the gather; the very first life (loop 0 and before) is A from the start.
  function lifeOf(T){
    const loop = Math.floor(T/period), tau = T/period - loop, isB = ((loop % 2) + 2) % 2 === 1, k = smooth(0.0, 0.24, tau);
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
    const form = smooth(0, 0.09, tau);
    const pullT = tau*period - (T_ARR - PULL_LEAD), absorb = smooth(0, PULL_LEAD, pullT), unfurl = smooth(0.02, 0.22, tau), pp = smooth(0.90, 0.995, tau);
    const pulseA = tau >= 0.90 ? (1 - smooth(0.97, 1.0, tau))*smooth(0.90, 0.92, tau) : 0;
    const life = lifeOf(T), nextB = ((Math.floor(T/period) + 1) % 2 + 2) % 2 === 1;
    const ph = phase ?? T*2*Math.PI*0.84;
    const b = { C, F, U, S, V: toCam, sArc, absorb, pullT, unfurl, pulseY: -1.6 + 3.3*pp, pulseA, pp, tau, life, nextB,
      scale: 0.84*PHONE_K*(1 + 0.4*burn), burn, form, flap: ph + 0.4*Math.sin(ph), amp: flapAmp(tau), tuck: flapTuck(tau), T,
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
  // PLACEHOLDER LIFE B: plumes 30% longer and fanned wider, a crest that stands taller (matches BIRD_GLSL)
  function plumeLenJS(kk, unfurl, fh){ return (kk > 0 ? 2.95 : 2.75)*(1 + 0.30*fh)*(0.06 + 0.94*smooth(0.4, 1.0, unfurl)); }
  function restLocal(ch, j, b){
    const u = j/(ch.n - 1), kk = ch.kk, T = b.T, fh = b.life || 0;
    if (ch.crest) {
      const H = [0, 0.135, 0.54], L = 1.30*(1 + 0.35*fh)*(0.25 + 0.75*smooth(0.2, 0.85, b.unfurl)), R = add(H, [kk*0.022, 0.040, -0.020]);
      const P1 = add(R, scl([kk*0.05, 0.60 + 0.15*fh, 0.02], L)), P2 = add(R, scl([kk*(0.16 + 0.10*fh), 0.50 + 0.25*fh, -1.00 + 0.15*fh], L));
      const c = add(add(scl(R, (1 - u)*(1 - u)), scl(P1, 2*(1 - u)*u)), scl(P2, u*u));
      c[0] += kk*0.035*Math.sin(Math.PI*u*2);
      c[0] += Math.sin(u*4 - T*2.6 + kk*1.3)*0.025*u*u; c[1] += 0.6*Math.sin(u*3.2 - T*2.1 + kk)*0.025*u*u;
      return c;
    }
    const L = plumeLenJS(kk, b.unfurl, fh), sv = 0.3 + L*u, uu = clamp((sv - 0.3)/2.9, 0, 1);
    const pa = pathAtJS(b.path, sv), p = add(scl([0, 0, -sv], 1 - PLUME_PATH), scl(pa, PLUME_PATH));
    p[0] += kk*(0.05 + (0.34 + 0.16*fh)*uu*uu) + 0.10*kk*Math.sin(Math.PI*uu*1.6);
    p[1] += 0.10*Math.sin(Math.PI*uu*1.2) - 0.06*uu;
    const wv = 0.07*Math.pow(uu, 1.4);
    p[0] += Math.sin(2.3*sv - 1.7*T + kk*1.4)*wv; p[1] += 0.6*Math.sin(1.9*sv - 1.3*T + kk*0.7)*wv;
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
            const u = j/(n - 1), kS = ch.crest ? CH_KT*2 + 260*Math.pow(1 - u, 2) : CH_KT + 140*Math.pow(1 - u, 3);
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
    set1('uFh', b.life || 0); set1('uRb', b.life || 0); set1('uHue0', HUE0);
    set1('uPulseY', b.pulseY); set1('uPulseA', b.pulseA);
    // the crown's light runs up the pillar in the next life's colour
    set3('uPulseC', lerp3(f[3], b.nextB ? WHITE_GOLD : f[0], b.pp));
    set1('uBL', 0.9*b.form*(1 - b.absorb)); set3('uBLC', birdLightCol(b));
  }
  return { at, flapHz, simulate, resetChains, outline, uniforms, lifeOf, lapPoint, lapArc, setLift(k){ lift = k; },
    TOP_IN, POLE_IN, POLE_T, POLE_B, T_ARR, period };
}
