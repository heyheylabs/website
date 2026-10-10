// The hero: one WebGL2 canvas, fixed behind the whole page. Ported from 2026-10-07-hhl-phoenix-field/variants/22-plumage-plasma.html
// (design b19f0bed: 22's brighter blue-violet shell and white-hot base; the bird and the controls are the same in 21 to 23).
//
// Particles live in a float texture; a fragment shader moves them each frame along one flow field (the Aizawa attractor
// pulled onto a perfect sphere, which leaves a narrow light pillar up its axis; or the Lorenz attractor, one parameter
// away). The phoenix (bird.js) flies a lap fixed to the sphere, dives into the bottom pole and is reborn at the top.
// Light accumulates into a fading float buffer for trails; a small bloom chain and a final pass add the ground.
//
// The page says where the sphere goes (setFrame), how bright it is (setDim), how fast it runs (setSpeed), the box light
// may fall in (setBox: the art box, feathered) and the text blocks light must stay off (setHide). Orbit controls live on
// a hit area over the sphere, clipped to the art box (drag to turn, wheel or pinch to zoom, two fingers twist and pan,
// double tap resets, arrow keys, plus and minus, 0), so the rest of the page scrolls and every word stays clickable.
// It pauses on a hidden tab and when the canvas is off screen; under reduced motion it draws one held pose.
// iOS: half-float fallback for the particle state, and a rebuild after a lost context.
//
// API (createHero(canvas, opts) returns it; null when the browser cannot draw):
//   layout     setFrame(cx, cy, radiusPx, glide = 6)  where the sphere sits on screen (CSS px; glide Infinity cuts)
//              setBox(x0, y0, x1, y1, feather)         the art box light may fall in; zoom and turn stay inside it
//              setHide([[x0, y0, x1, y1, a?], ...])    text lines the soft veil sits under (up to 24; a = the line's opacity)
//              setInteractive(on)                      the orbit hit area on or off (off behind sections)
//   scroll     setCamera({ yaw, pitch, roll, dist, target }, cut)   getCamera()
//              setField({ dim, speed, bird })          brightness, time scale, the bird's brightness (0 hides it)
//              setLoopTime(seconds | null)             pin the 16 s loop to a time, or free it   loopTime (getter)
//              setMorph('bands' | 'none', amount)      pull the field's particles into the mark's five split bands
//   older      setDim(k), setSpeed(k), setBird(k) are the same as setField's parts
//   tests      seek(t), bench(n), startProbe(boxes) / readProbe(), run(frames), quality, frameMs, sphere, view(v)

import { BIRD_ENGINE_DECL, BIRD_HELPERS_GLSL, BIRD_GLSL, BIRD_LOOK_GLSL, BIRD_UPDATE_GLSL, BIRD_VERTEX_GLSL, BIRD_STROKE_VS, BIRD_STROKE_FS,
  STROKES, BIRD, FLAME } from './bird.js';

const SPHERE_R = 1.6, FOV = 0.62, PERIOD = 16, MAX_HIDE = 24, MAX_MK = 16;
// the brightest colour any light may reach: #C9C7D9, below the words' ink #F3F2F0, so text stays brightest (M19)
let PEAK = [201/255, 199/255, 217/255];
const GLOW_MAX_PX = 24;   // the pillar's (and every core's) glow reaches at most this far, in CSS pixels
const FIELDS = { sphere: 1, lorenz: 3 };
const HOME_YAW = 0.35, HOME_PITCH = 0.12;

const PAL = {   // (round 6: the colours are the look's, setLook) variant 22's shell (blue-violet, white-hot base) on the brand's Graphite #15171A, a touch deeper at the edges
  bgC: [0.0824, 0.0902, 0.1020], bgE: [0.0742, 0.0812, 0.0918], ink: [0.55, 0.70, 1.0], ink2: [0.80, 0.62, 1.0],
  alpha: 0.09, fade: 0.035, bloom: 0.6, thr: 0.04, vig: 0.15,
};

const VS_QUAD = `#version 300 es
layout(location=0) in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

// The flow field. Attractors are mapped into a box about 4.6 units across; every speed is softly capped.
const FLOW = `
const float TAU = 6.28318530718;
uniform int uShape;
float hash(vec3 p){ p = fract(p*vec3(443.897,441.423,437.195)); p += dot(p, p.yzx+19.19); return fract((p.x+p.y)*p.z); }
vec3 attractor(vec3 w){
  vec3 v;
  if (uShape == 1) { float S = 1.15; vec3 o = vec3(w.x, w.z, w.y)/S + vec3(0.0, 0.0, 0.7); float x = o.x, y = o.y, z = o.z;
    vec3 d = vec3((z-0.7)*x - 3.5*y, 3.5*x + (z-0.7)*y, 0.6 + 0.95*z - z*z*z/3.0 - (x*x + y*y)*(1.0 + 0.25*z) + 0.1*z*x*x*x);
    v = vec3(d.x, d.z, d.y)*S; }
  else { float S = 0.09; vec3 o = vec3(w.x, w.z, w.y)/S + vec3(0.0, 0.0, 24.0);
    vec3 d = vec3(10.0*(o.y - o.x), o.x*(28.0 - o.z) - o.y, o.x*o.y - 2.6667*o.z); v = vec3(d.x, d.z, d.y)*S; }
  return v*(1.3/(0.5 + length(v)));
}`;

const FS_UPDATE = `#version 300 es
precision highp float; out vec4 o;
uniform sampler2D uState; uniform vec2 uRes;
uniform float uDt, uSeed, uT, uScale, uBurn, uFlap, uLifeK, uForm, uRows, uMorph; uniform int uMorphKind;
uniform vec3 uC, uF, uU, uS, uMC, uMR, uMU, uMF;
const float WAKE_CAP = 0.02;                       // the bird never dents the shell by more than this share of the radius
${FLOW}
// the morph hook (uMorphKind 2): the field condenses into the HEY HEY LABS mark, read from the page's one mark file
// (mark.svg, the thin spine s14: five rounded graded bands split by a thin vertical line). Its rects arrive in grid units
// (28 across the mark's ink, y up, centred on the ink), each [x0, y0, x1, y1] with its corner radius and its share of
// the particles. The mark is laid in the plane that faces the camera through the sphere's centre (uMC, with uMR and uMU
// one grid unit across and up), so the particles land exactly where the page draws the crisp mark.
uniform vec4 uMkR[${MAX_MK}]; uniform float uMkRx[${MAX_MK}], uMkW[${MAX_MK}]; uniform int uMkN;
vec3 markTarget(vec2 uv){
  float r = hash(vec3(uv, 51.3)), a = hash(vec3(uv, 52.9)), b = hash(vec3(uv, 53.7));
  int k = 0; for (int i = 0; i < ${MAX_MK}; i++) { if (i >= uMkN) break; k = i; if (r < uMkW[i]) break; }
  vec4 q = uMkR[k]; float rx = uMkRx[k];
  float x = mix(q.x, q.z, a), yc = (q.y + q.w)*0.5, hh = (q.w - q.y)*0.5;
  float e = min(x - q.x, q.z - x);                   // the rounded ends: narrower toward each tip
  float sh = rx > 0.0 && e < rx ? sqrt(max(0.0, 1.0 - (rx - e)*(rx - e)/(rx*rx))) : 1.0;
  float y = yc + (b*2.0 - 1.0)*hh*sh;
  return uMC + uMR*x + uMU*y + uMF*((hash(vec3(uv, 55.5)) - 0.5)*0.3);
}
${BIRD_GLSL}
${BIRD_UPDATE_GLSL}
vec3 spawn(vec2 uv){
  vec3 j = vec3(hash(vec3(uv, uSeed+1.1)), hash(vec3(uv, uSeed+2.3)), hash(vec3(uv, uSeed+3.5))) - 0.5;
  if (uShape == 1 && hash(vec3(uv, uSeed+5.5)) < 0.6) {          // most are reborn on the sphere's shell
    float y = 2.0*hash(vec3(uv, uSeed+8.8)) - 1.0, ph = TAU*hash(vec3(uv.yx, uSeed+9.9)); float rq = sqrt(max(0.0, 1.0 - y*y));
    return vec3(rq*cos(ph), y, rq*sin(ph))*1.6; }
  if (hash(vec3(uv, uSeed+4.4)) < 0.12) return j*5.0;              // some start anywhere, so the shape keeps gathering
  int y = int(hash(vec3(uv.yx, uSeed+7.7))*uRows), m = (3*y) % 8;   // the rest copy a field particle already on it
  int x = (int(hash(vec3(uv, uSeed+6.6))*uRes.x)/8)*8 + (9 - m) % 8;
  return texelFetch(uState, ivec2(x, y), 0).xyz + j*0.05;
}
void main(){
  ivec2 tc = ivec2(gl_FragCoord.xy); vec2 uv = gl_FragCoord.xy/uRes;
  vec4 s = texelFetch(uState, tc, 0); vec3 p = s.xyz; float age = s.w;
  int cls = (tc.x + 3*tc.y) % 8;
  if (cls == 0) {                                   // embers: shed hot from the bird, then cool into the flow
    vec3 h = vec3(hash(vec3(uv, uSeed+1.3)), hash(vec3(uv.yx, uSeed+5.9)), hash(vec3(uv*2.3, uSeed+8.1)));
    float life = 0.8 + 2.4*hash(vec3(uv, 11.0));
    age += uDt;
    if (uAbsorb > 0.999) age = -1e4;                 // the bird has gone into the pole: its embers go too, until it is reborn
    if (age > life || any(isnan(p)) || (age < 0.0 && uAbsorb < 0.001)) {
      vec4 binfo; vec3 l = birdPoint(h, uFlap, binfo) * uScale;
      vec3 j = vec3(hash(vec3(uv,uSeed+2.0)), hash(vec3(uv,uSeed+4.0)), hash(vec3(uv,uSeed+6.0))) - 0.5;
      p = birdEmberBorn(uC + uS*l.x + uU*l.y + uF*l.z, j); age = uAbsorb > 0.999 ? -1e4 : 0.0;
    } else if (age >= 0.0) {
      float hot = exp(-age*2.0);
      vec3 n = vec3(sin(p.y*3.1 + uT*2.0), sin(p.z*2.7 + uT*1.7), sin(p.x*3.3 + uT*2.3));
      vec3 ev = -uF*0.9 + uU*(0.15 + 0.35*hot) + n*0.16 + (p - uC)*uBurn*2.2;
      p += uDt*mix(ev, attractor(p), smoothstep(0.15, 0.9, age));
      p = mix(p, uPole, uAbsorb*min(1.0, uDt*8.0));   // drawn into the pole with the bird
    }
    o = vec4(p, age); return;
  }
  vec3 p0 = p; float mk = uMorphKind == 2 ? uMorph : 0.0;
  vec3 k1 = attractor(p); vec3 k2 = attractor(p + 0.5*uDt*k1);
  p += uDt*k2; age += uDt;
  if (uShape == 1) {                                // pull the attractor onto a perfect shell, leaving the axis free
    float rr = length(p); float t = smoothstep(1.6*0.5, 1.6*0.85, rr)*smoothstep(1.6*0.05, 1.6*0.16, length(p.xz));
    t = max(t, smoothstep(1.6, 1.6*1.04, rr))*(1.0 - mk); p = p/max(rr, 1e-4)*mix(rr, 1.6, t*(1.0 - exp(-uDt*4.0))); }
  vec3 d = p - uC;                                   // the bird's wake: the field swirls round it and is drawn along
  float r0 = length(p);
  p += uDt*uForm*birdWakeK()*exp(-dot(d, d)*2.2)*(cross(uF, d)*2.0 + uF*1.0);
  if (uShape == 1 && abs(r0 - 1.6) < 1.6*0.06) { float r1 = length(p); p *= clamp(r1, min(r0, 1.6*(1.0 - WAKE_CAP)), max(r0, 1.6*(1.0 + WAKE_CAP)))/max(r1, 1e-4); }
  float life = (12.0 + 18.0*hash(vec3(uv, 3.0))) * uLifeK * (uShape == 1 ? 0.3 : 1.0);
  if (age > life || length(p) > 9.0 || any(isnan(p))) { p = spawn(uv); age = 0.0; }
  if (mk > 0.0) {                                   // the flow stops as the mark forms, then each particle settles on its spot
    p = mix(p, p0, smoothstep(0.25, 0.9, mk));
    p = mix(p, markTarget(uv), 1.0 - exp(-uDt*(1.0 + 11.0*mk)*mk));
    age = min(age, life*(0.45 + 0.45*hash(vec3(uv, 4.7))));   // nobody is reborn while it holds, and they leave staggered
  }
  o = vec4(p, age);
}`;

const VS_PTS = `#version 300 es
precision highp float;
uniform sampler2D uState;
${BIRD_ENGINE_DECL}
uniform float uW, uPass, uAlpha, uEmberA, uSub;
// the journey's looks (all 0 in the hero): the five bands apart and which is lit, the pillar's line and sparks, the
// stall's cold embers, other spheres far off, the mark's white
uniform float uBandOff[5], uBandFloor;   // ROUND6 ENGINE (U40): the page's band offsets and the unlit floor
uniform float uSpread, uLit[5], uPillar, uClock, uEmber, uOthers, uWhite, uShimmer, uAxisOff; uniform vec3 uOR, uOU, uOF, uOSpan;
uniform vec3 uTint, uPillarTint, uSparkTint; uniform float uAxisK;   // uAxisK: the sphere's own pillar takes the pillar tint (the coral scheme)   // the scheme's light: the lit bands, the pillar's line and its sparks
out vec4 vCol; out float vPil;   // vPil: how much of this light is the pillar (round 7: the light theme inks it in the scheme's colour)
${BIRD_HELPERS_GLSL}
void cull(){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); }
vec3 inkOf(ivec2 c){ return mix(uInk, uInk2, hash(vec2(c) + 2.2)); }
vec4 fieldCol(ivec2 c, vec4 s, vec4 cp){
  return vec4(inkOf(c), smoothstep(0.0, 1.2, s.w)*smoothstep(6.5, 3.0, length(s.xyz))*depthOf(cp)*uAlpha*1.2);
}
${BIRD_GLSL}
${BIRD_LOOK_GLSL}
${BIRD_VERTEX_GLSL}
void main(){
  int i = gl_VertexID; ivec2 c; vPil = 0.0;
  if (uPass > 0.5) c = birdTexel(i);                 // the bird's own draw: only its texels
  else c = ivec2(i % int(uW), i / int(uW));
  vec4 s = texelFetch(uState, c, 0);
  int cls = (c.x + 3*c.y) % 8;
  if (uPass > 0.5) { birdVertex(c, s); vCol.a *= uBirdK; return; }   // the bird, crisp, in its own buffer (bird.js)
  vec4 cp = uVP*vec4(s.xyz, 1.0); gl_Position = cp;
  float depth = depthOf(cp), zk = zoomOf(cp), zg = zoomGain(cp)*uSub;
  if (isBirdClass(cls)) { cull(); return; }          // the bird's particles are drawn by the bird pass only
  if (cls == 0) {                                    // embers
    if (s.w < 0.0) { cull(); return; }              // an ember waiting for the rebirth
    float hot = exp(-s.w*2.0);
    vec3 col = birdEmberCol(clamp((uTau - s.w/uPeriod)*0.88 + 0.06, 0.0, 0.745), vec2(c));
    col = mix(col, uHot, hot*hot*0.22);
    col = mix(col, uHot*vec3(1.0, 0.9, 0.7), uBurn*0.6);
    col = mix(col, inkOf(c), smoothstep(0.3, 1.4, s.w)*0.85);   // cooling into the field
    float a = smoothstep(0.0, 0.08, s.w + 0.02)*(0.018 + 0.5*hot*hot)*depth*uFireA*max(uForm, uBurn)*uEmberA*birdEmberK()*uBirdK;
    vCol = vec4(col, a*zg);
    gl_PointSize = uPx*(1.0 + 1.8*hot)*(0.8 + 0.5*depth)*zk;
    return;
  }
  // ---- the field, and the journey's looks on it ----
  vec3 pos = s.xyz; float aK = 1.0, tintK = 0.0, sizeK = 1.0; vec3 tint = uTint; bool own = false;
  float hp = hash(vec2(c) + 5.1);
  if (cls == 3 && hp < uPillar*0.55) {             // the pillar's line: a hairline up the axis, and sparks rising on it
    float hy = hash(vec2(c) + 8.3), sp = hash(vec2(c) + 9.7);
    bool spark = sp < 0.07;
    float y = spark ? -1.72 + 3.44*fract(hy + uClock*(0.16 + 0.1*sp)) : -1.72 + 3.44*hy;
    pos = vec3((hash(vec2(c) + 1.9) - 0.5)*0.006, y, (hash(vec2(c) + 2.9) - 0.5)*0.006);
    aK = spark ? 9.0*smoothstep(1.72, 1.2, abs(y)) : 0.55; sizeK = spark ? 1.7 : 0.8; tintK = 1.0; own = true;
    tint = spark ? uSparkTint : uPillarTint; vPil = 1.0;
  } else if (cls == 2 && hash(vec2(c) + 3.3) < uOthers*0.9) {   // other businesses, far off: small spheres of light
    float id = floor(hash(vec2(c) + 4.4)*56.0);
    vec3 hc = vec3(hash(vec2(id, 1.7)), hash(vec2(id, 2.3)), hash(vec2(id, 3.1)));
    vec2 q = (hc.xy - 0.5)*2.0; if (length(q) < 0.12) q = normalize(q + 1e-3)*0.12;
    vec3 ctr = uOR*q.x*uOSpan.x + uOU*q.y*uOSpan.y - uOF*(hc.z - 0.35)*uOSpan.z;
    vec3 rnd = normalize(vec3(hash(vec2(c) + 6.1), hash(vec2(c) + 6.7), hash(vec2(c) + 7.3)) - 0.5 + 1e-4);
    pos = ctr + rnd*1.6*(0.4 + 1.1*hash(vec2(id, 4.9)));
    aK = 6.0*(0.3 + 0.7*hash(vec2(id, 5.3)))*uOthers; own = true;
  }
  if (uSpread > 0.001 && !(cls == 2 && own)) {      // the five bands slide apart; the lit one brightens toward white
    float y = pos.y;
    int k = y > 1.152 ? 0 : (y > 0.448 ? 1 : (y > -0.448 ? 2 : (y > -1.152 ? 3 : 4)));
    float d = min(abs(abs(y) - 1.152), abs(abs(y) - 0.448));
    pos.y += uBandOff[k]*uSpread;
    if (!own) {
      aK *= mix(1.0, smoothstep(0.02, 0.10, d), min(uSpread*1.6, 1.0));
      float L = uLit[k];
      float boost = (k == 0 || k == 4) ? 0.75 : 1.4;   // the caps carry the pole's white-hot base already
      aK *= mix(1.0, uBandFloor + boost*L, uSpread); tintK = max(tintK, L*0.5*uSpread);
    }
  }
  if (uEmber > 0.001 && !own) {                     // the stall: most of the light goes out, the rest cools and greys
    float e = hash(vec2(c) + 12.7) < 0.2 ? 0.6 : 0.025;
    aK *= mix(1.0, e, uEmber); tint = mix(tint, vec3(0.42, 0.47, 0.6), uEmber); tintK = max(tintK, 0.55*uEmber);
  }
  if (!own) { float ax = 1.0 - smoothstep(0.03, 0.16, length(pos.xz)); vPil = ax; aK *= 1.0 - uAxisOff*ax;   // v3-r2: the axis off at its source (the phone's scene 6, behind the words)
    if (uAxisK > 0.0) { tint = mix(tint, uPillarTint, ax); tintK = max(tintK, ax*uAxisK); } }
  cp = uVP*vec4(pos, 1.0); gl_Position = cp;
  depth = depthOf(cp); zk = zoomOf(cp);
  aK *= clamp(26.0/cp.w, 0.035, 1.0);              // far off, the sphere becomes one bright point, not a white blot
  vCol = own ? vec4(inkOf(c), uAlpha*1.2*depth) : fieldCol(c, s, cp); vCol.a *= zg*aK;
  vCol.rgb = mix(vCol.rgb, tint, clamp(tintK, 0.0, 1.0));
  if (uWhite > 0.001) vCol.rgb = mix(vCol.rgb, mix(uTint, vec3(1.0), smoothstep(0.5, 1.0, uWhite)), smoothstep(0.0, 0.5, uWhite));
  // fortune (the close): the fenghuang's last pass leaves a faint spectrum drifting across the mark, settling to white
  if (uShimmer > 0.001 && !own) vCol.rgb = mix(vCol.rgb, spectral(fract(pos.x*0.22 + pos.y*0.09 - uClock*0.04)), uShimmer*0.75);
  float size = uPx*(0.7 + 0.6*depth)*zk*sizeK;
  if (!own) birdFieldTouch(s, vCol, size);
  gl_PointSize = size;
}`;

const FS_PTS = `#version 300 es
precision highp float; in vec4 vCol; in float vPil; out vec4 o;
void main(){
  float L = length(gl_PointCoord - 0.5)*2.0; if (L > 1.0) discard;
  vec3 c = vCol.rgb*vCol.a*smoothstep(1.0, 0.3, L);
  o = vec4(c, max(c.r, max(c.g, c.b))*vPil);   // alpha carries the pillar's share of the light (added, faded and carried with it)
}`;

const FS_FADE = `#version 300 es
precision highp float; out vec4 o; uniform float uFade;
void main(){ o = vec4(0.0, 0.0, 0.0, uFade); }`;
// round 6: the trails move with the sphere. When the page moves the sphere (the image, not the camera), last frame's
// light is carried to where the sphere now is (and scaled with it) before it fades, so a scroll never leaves a
// stack of ghost spheres behind
const FS_CARRY = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uPrev; uniform vec2 uC0, uC1; uniform float uK, uKeep;
void main(){ vec2 q = uC0 + (vUv - uC1)*uK;
  vec4 c = (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) ? vec4(0.0) : texture(uPrev, q);
  o = c*uKeep; }`;

const FS_DOWN = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uA, uB; uniform vec2 uTx; uniform float uTwo, uThr;
vec3 tap(vec2 uv){ vec3 c = texture(uA, uv).rgb; if (uTwo > 0.5) c += texture(uB, uv).rgb; return c; }
void main(){
  vec3 c = (tap(vUv + uTx*vec2(-1.0,-1.0)) + tap(vUv + uTx*vec2(1.0,-1.0)) + tap(vUv + uTx*vec2(-1.0,1.0)) + tap(vUv + uTx*vec2(1.0,1.0)))*0.25;
  o = vec4(max(c - uThr, 0.0), 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uA; uniform vec2 uTx; uniform float uR;
void main(){
  vec2 d = uTx*uR, e = d*0.7071;
  vec3 c = texture(uA, vUv).rgb*0.25;
  c += (texture(uA, vUv + vec2(d.x, 0.0)).rgb + texture(uA, vUv - vec2(d.x, 0.0)).rgb + texture(uA, vUv + vec2(0.0, d.y)).rgb + texture(uA, vUv - vec2(0.0, d.y)).rgb)*0.125;
  c += (texture(uA, vUv + e).rgb + texture(uA, vUv - e).rgb + texture(uA, vUv + vec2(e.x, -e.y)).rgb + texture(uA, vUv + vec2(-e.x, e.y)).rgb)*0.0625;
  o = vec4(c, 1.0);
}`;

// The final pass. Light falls only inside the art box (feathered at its edges) and never under the page's text blocks
// (each a feathered rectangle), so neither the bird nor the pillar ever cuts through words. Then the ground, a light
// vignette, a soft shoulder and grain. The field dims under the bird's strokes so the bird reads.
const FS_FINAL = `#version 300 es
precision highp float; out vec4 o;
uniform sampler2D uAcc, uBird, uBloom, uBirdW; uniform vec2 uRes; uniform float uBloomK, uVig, uT, uDim, uFeather, uCap; uniform vec3 uPeak;
// round 8: the two quiet climaxes as light at the pillar's ends (r5): the foot gathers the falling bird in, the crown
// blooms the new life out (in its colour). Centres in device px, radius in device px.
uniform float uBirdLift, uBlaze, uBlazeR; uniform vec2 uBlazeP;   // ROUND6 ENGINE: the bird out of the close's dim (U42); the white reveal (M41), centre and radius in device px
uniform float uGuardK, uFieldK;   // ROUND7 ENGINE: the text guard's hold on the bird's light (H4); the field's own strength (H2)
uniform vec4 uPools; uniform float uPoolR, uFootA, uCrownA, uShimK; uniform vec3 uFootC, uCrownC;
uniform vec4 uBead; uniform vec3 uBeadC; uniform vec2 uBeadD; uniform float uBeadS;   // fh11: the rebirth's bead (device px, alpha, tail), its colour, the pillar's direction, its size in device px
uniform vec4 uBox; uniform vec4 uHide[${MAX_HIDE}]; uniform float uHideA[${MAX_HIDE}]; uniform int uHideN; uniform vec3 uBgC, uBgE;
// v3-r3 (review High 1): the words' backing is a soft radial veil, never a rectangle. Each text line's box gives an
// ellipse around it (semi-axes 1.25 of the box's half size, plus 6 px), feathered out over uVeilF device px (160 CSS px),
// in the ground colour at uVeilMax (0.7) times that line's own opacity at most; overlapping veils take the larger, never
// add, so no straight edge ever crosses the sphere, the axis or the birds.
uniform float uVeilF, uVeilMax;
float veilOf(vec2 p, vec4 b){
  vec2 c = (b.xy + b.zw)*0.5, e = (b.zw - b.xy)*0.625 + 6.0*uVeilF/160.0, q = p - c;
  float k0 = length(q/e); if (k0 <= 1.0) return 1.0;
  float k1 = length(q/(e*e)), d = k0*(k0 - 1.0)/max(k1, 1e-6);   // distance outside the ellipse, approximated
  return 1.0 - smoothstep(0.0, uVeilF, d);
}
// the light theme (round 6, redrawn in round 7): uDay 0 is night, 1 is day, eased between them for the switch's cross-fade.
// Day is ink on paper: the shell as Graphite hairlines at uShellA (the Alloy ground shows through, no filled shading), its
// rim one device pixel at uRimA, the pillar in the scheme's signal colour at full ink, the bird as ink in its own hues.
// v3-r4 (review finding 4): in the dark theme the flame phoenix's brightest strokes are laid at uFlTop (#FF9A7A) at 0.9
// at most, so life A reads on a phone inside the sphere's lilac haze; the bird's own light picks where (uFlLo to uFlHi)
uniform float uFlK, uFlLo, uFlHi; uniform vec3 uFlTop;
uniform float uDay, uShellA, uRimA, uMorphK, uPilK, uRidgeK; uniform vec3 uDayBg, uDayInk, uSignal; uniform vec4 uRim; uniform vec2 uPx1, uRing;
// v3-r2 (M33): the pillar's light exists only on the sphere's own axis, pole to pole: the segment the page draws the axis
// on (device px, top-left origin) and the half width the pillar may spread to. Outside it, the pillar's share of the light
// (its trails as the sphere moves, strays above and below the poles) is taken out, in both themes. uAxisW 0: no clip.
uniform vec4 uAxis; uniform float uAxisW, uWashT;
float axisKeep(vec2 p){
  if (uAxisW <= 0.0) return 1.0;
  vec2 a = uAxis.xy, ab = uAxis.zw - uAxis.xy; float L2 = max(dot(ab, ab), 1e-4), t = dot(p - a, ab)/L2;
  float d = length(p - a - ab*clamp(t, 0.0, 1.0));
  return (1.0 - smoothstep(uAxisW, uAxisW + 1.5, d));
}
// v3-r3 (review top fix 3, M29): in light the pillar is a fine ink line, not a pillar. Its ink may spread at most 1.5 CSS
// px either side of the axis (3 px wide), and at most 4 px (8 px wide) only over the last 8% at each end, where the
// poles are; so no heavy black shaft and no blobs at the ends
float dayPil(vec2 p){
  if (uAxisW <= 0.0) return 1.0;
  vec2 a = uAxis.xy, ab = uAxis.zw - uAxis.xy; float L2 = max(dot(ab, ab), 1e-4), t = dot(p - a, ab)/L2;
  float d = length(p - a - ab*clamp(t, 0.0, 1.0)), s = uVeilF/160.0;
  float endK = 1.0 - smoothstep(0.02, 0.08, min(t, 1.0 - t));
  float hw = mix(1.5, 4.0, endK)*s;
  return 1.0 - smoothstep(hw - 0.5*s, hw + 0.5*s, d);
}
float inBox(vec2 p, vec4 b, float f){   // 1 inside the box (x0, y0, x1, y1 in pixels from the top left), 0 outside f away
  vec2 lo = smoothstep(b.xy - f, b.xy, p), hi = 1.0 - smoothstep(b.zw, b.zw + f, p);
  return lo.x*lo.y*hi.x*hi.y;
}
// round 7 (H4, M41): the hard guard. 1 on every line of text (its box grown 16 css px), falling to 0 over 24 px further
// out; a line counts from an eighth of its opacity, so a heading on its way out keeps it. The white reveal never lights
// behind a word, and the bird's own light is held out too while the reveal burns or a close-up runs
float guardOf(vec2 p){
  float g = 0.0, s = uVeilF/160.0;
  for (int i = 0; i < ${MAX_HIDE}; i++) { if (i >= uHideN) break; vec4 b = uHide[i];
    g = max(g, inBox(p, vec4(b.xy - 16.0*s, b.zw + 16.0*s), 24.0*s)*min(1.0, uHideA[i]*8.0)); }
  return g;
}
float mx3(vec3 v){ return max(v.r, max(v.g, v.b)); }
// a light's hue as ink on paper: full saturation, darkened only as far as it must be to read (about 3:1 or more on Alloy)
// M39 (i2b, ink lab): value noise and fbm for the xuan fibre and the mist; I1's four mineral pigments
float inkHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float inkNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(inkHash(i), inkHash(i + vec2(1.0, 0.0)), f.x), mix(inkHash(i + vec2(0.0, 1.0)), inkHash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a*inkNoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
vec3 mineral(vec3 h){                                // a hue (normalised to its brightest channel) to the four pigments
  const vec3 PG[4] = vec3[4](vec3(0.710, 0.322, 0.231), vec3(0.306, 0.541, 0.431), vec3(0.247, 0.373, 0.541), vec3(0.722, 0.541, 0.243));
  vec3 s = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < 4; i++) { vec3 p = PG[i]/mx3(PG[i]); vec3 d = h - p; float w = exp(-dot(d, d)*14.0); s += PG[i]*w; ws += w; }
  return mix(s/max(ws, 1e-4), vec3(0.86, 0.83, 0.78), 0.10);
}
// M39 (i2d): pigment that bleeds out of the line-work: the line's density gathered over two rings of 12 taps whose
// reach wanders with the paper (2.5 to 7 css px), so where the lines crowd the pigment pools and a lone stipple stays
// a dot; nothing reaches further than 7 px past a line
float lineCov(vec2 uv){ return clamp(mx3(texture(uBird, uv).rgb)*6.0, 0.0, 1.0); }
float bleed(vec2 uv, vec2 q, float cpx){
  float rr = mix(2.5, 7.0, fbm(q*0.09 + 4.0)), m = lineCov(uv)*2.0;
  for (int i = 0; i < 12; i++) { float a = float(i)*0.5236 + 0.26*fbm(q*0.3); vec2 o = vec2(cos(a), sin(a))*cpx*rr*uPx1;
    m += lineCov(uv + o*0.45) + lineCov(uv + o)*0.6; }
  return m/21.2;
}
vec3 inkHue(vec3 c){ vec3 h = c/max(mx3(c), 1e-4); float y = dot(h, vec3(0.2126, 0.7152, 0.0722)); return h*min(1.0, 0.45/max(y, 1e-3)); }
void main(){
  vec2 uv = gl_FragCoord.xy/uRes, p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float r = length((uv - 0.5)*vec2(uRes.x/uRes.y, 1.0))*1.25;
  float keep = inBox(p, uBox, uFeather);
  { float v = 0.0; for (int i = 0; i < ${MAX_HIDE}; i++) { if (i >= uHideN) break; v = max(v, veilOf(p, uHide[i])*uHideA[i]); }
    keep *= 1.0 - uVeilMax*v; }
  vec3 bd = texture(uBird, uv).rgb; float ko = clamp(mx3(bd)*5.5, 0.0, 0.93);   // the bird veils the shell behind it (r5)
  vec4 A0 = texture(uAcc, uv); float axk = axisKeep(p);
  float pilShare = clamp(A0.a/max(mx3(A0.rgb), 1e-4), 0.0, 1.0)*(1.0 - axk);
  vec3 fa = A0.rgb*(1.0 - pilShare)*(1.0 - ko), bl = texture(uBloom, uv).rgb*uBloomK;
  float n = fract(sin(dot(gl_FragCoord.xy + fract(uT*7.0)*97.0, vec2(12.9898,78.233)))*43758.5453) - 0.5;
  // ---- night: light added to the Graphite ground ----
  float gd = guardOf(p), gk = gd*uGuardK;   // ROUND7 ENGINE (H4)
  vec3 c = (fa + bl)*uDim*uFieldK*keep + bd*(1.0 - gk)*mix(uDim, 1.0, uBirdLift)*keep;
  { vec2 pf = vec2(gl_FragCoord.x, gl_FragCoord.y);
    float df = length(pf - uPools.xy)/uPoolR, dc = length(pf - uPools.zw)/uPoolR;
    c += (uFootC*uFootA*(exp(-df*df*2.0)*0.6 + exp(-df*df*14.0)*0.8) + uCrownC*uCrownA*(exp(-dc*dc*2.0)*0.6 + exp(-dc*dc*30.0)*0.9))*keep*(1.0 - uDay); }
  // fh11: the bead of light that carries the rebirth up the pillar (a core, a halo, a short tail below it)
  vec3 bm = vec3(0.0);
  if (uBead.z > 0.001) { vec2 d = gl_FragCoord.xy - uBead.xy; float rc = uBeadS, dd = dot(d, d), t = dot(d, -uBeadD), q = length(d + uBeadD*t), L = max(28.0*uBead.w*rc/3.0, 1.0);
    float tl = uBead.w > 0.01 && t > 0.0 ? exp(-q*q/(0.6*rc*rc))*pow(max(1.0 - t/L, 0.0), 1.5) : 0.0;
    bm = vec3(exp(-dd/(rc*rc)), exp(-dd/(9.0*rc*rc)), tl)*uBead.z; }
  c = mix(c, uBeadC*1.7, clamp(bm.x*1.3, 0.0, 0.92)*(1.0 - uDay)) + uBeadC*(0.7*bm.y + 1.0*bm.z)*(1.0 - uDay);
  c += mix(uBgC, uBgE, smoothstep(0.0, 1.1, r));
  c *= mix(1.0, 1.0 - smoothstep(0.45, 1.35, r), uVig);
  // a long soft shoulder up to the cap, per channel, never past the peak colour: a broad lit area settles well below the
  // words' ink (round 6: the fill holds at about two thirds of the ink's luminance), only small hot cores near the top
  vec3 top = min(vec3(uCap), uPeak), kn = top*0.5, sh = max(top - kn, vec3(0.02));
  c = mix(c, kn + sh*(1.0 - exp(-(c - kn)/sh)), step(kn, c));
  c = min(c + n*(1.5/255.0), top);
  if (uFlK > 0.001) c = mix(c, uFlTop, 0.9*uFlK*smoothstep(uFlLo, uFlHi, mx3(bd))*keep);
  // round 6 (M41): the white reveal. The bird white-hot, its light flooding out round it, past the cap (the one moment
  // the light may outshine the page), under the words' veils like all light
  float bzG = 0.0, bzB = 0.0;
  if (uBlaze > 0.001) { vec2 bp = vec2(gl_FragCoord.x, gl_FragCoord.y) - uBlazeP; float q2 = dot(bp, bp)/(uBlazeR*uBlazeR);
    // round 7 (H4): uBlazeR is the bird's own radius; the halo reaches about 1.4 of it and is gone by 2.8; never behind a word
    float dr = sqrt(q2); q2 /= 1.21;
    bzG = (exp(-q2*2.6)*0.62 + exp(-q2*0.3)*0.34*(1.0 - smoothstep(1.4, 2.8, dr)))*uBlaze*keep*(1.0 - gd);
    bzB = smoothstep(0.004, 0.06, mx3(bd))*uBlaze*keep*(1.0 - gd); }
  c = mix(c, vec3(1.0), clamp(bzG + bzB*(1.0 - bzG), 0.0, 1.0));
  // ---- day: the same light drawn as ink on the Alloy ground ----
  vec3 d = uDayBg;
  if (uDay > 0.001) {
    float k = uDim*keep, kf = k*uFieldK;   // ROUND7 ENGINE (H2): the field alone
    // M39 (i2b): css px, the fibre, and the mist that takes the lower sphere into empty paper
    float cpx = max(uRing.x/max(uPx1.x, 1e-6)/2.5, 1.0); vec2 q = p/cpx; vec2 rl = p - uRim.xy; float Rr = max(uRim.z, 1.0);
    float fib = fbm(q*vec2(0.02, 0.16) + 3.1), blot = fbm(q*0.018 + 11.0);
    float mist = mix(1.0, smoothstep(1.05*Rr, -0.05*Rr, rl.y - 0.28*Rr*(blot - 0.5)), 0.85*(1.0 - uMorphK));
    vec3 bdd = max(bd, max(texture(uBird, uv + vec2(uPx1.x, 0.0)).rgb, texture(uBird, uv + vec2(0.0, uPx1.y)).rgb));   // 2 device px strokes
    float kod = clamp(mx3(bdd)*3.0, 0.0, 0.9);
    vec4 A = texture(uAcc, uv);
    float Ls = max(mx3(A.rgb) - A.a, 0.0)*(1.0 - kod), pil = A.a*(1.0 - kod)*axk;
    // a stroke is light above its neighbourhood: the mean of eight taps on a ring 2.5 CSS px out
    float m = 0.0;
    for (int i = 0; i < 8; i++) { float a = float(i)*0.7853982; vec4 t = texture(uAcc, uv + vec2(cos(a), sin(a))*uRing); m += max(mx3(t.rgb) - t.a, 0.0); }
    m *= 0.125;
    float str = (1.0 - exp(-max(Ls - m, 0.0)*uRidgeK))*smoothstep(0.04, 0.16, m + Ls);   // lone strays stay off the paper
    float sh = mix(str, 1.0 - exp(-Ls*1.6), uMorphK);           // the close's condense is the mark's fill, not strokes
    vec3 hue = A.rgb/max(mx3(A.rgb), 1e-4); float sat = mx3(hue) - min(hue.r, min(hue.g, hue.b));
    // v3-r5 (review finding 7, M29): the bird's embers keep their hue only on the bird itself (inside its wash's
    // silhouette); the ones it sheds onto the paper outside it go, so no warm haze or smudge is left around the plumage
    vec3 bw = texture(uBirdW, uv).rgb; float wa = mx3(bw);
    float silB = smoothstep(uWashT*1.6, uWashT*2.2, wa), emb = smoothstep(0.5, 0.8, sat);
    float hk = max(emb*silB, uShimK*smoothstep(0.08, 0.3, sat));   // embers on the bird (and the close's shimmer) keep their hue
    sh *= 1.0 - emb*(1.0 - silB)*(1.0 - uShimK);
    d = mix(d, mix(uDayInk, inkHue(A.rgb), hk), sh*mix(uShellA, 0.6, hk)*mix(1.0, 0.85, uMorphK*uShimK)*kf*(0.65 + 0.7*fib)*mist);   // M39: the ink pools with the fibre, lifts into mist
    // M39 (i2b): the silhouette is one dry-brush stroke: it swells and thins round the sphere and breaks where the
    // brush ran dry, fading into the mist toward the foot (v3-r4 drew one even device pixel)
    float sdr = length(p - uRim.xy) - uRim.z, angr = atan(rl.y, rl.x);
    float swr = 0.5 + 0.5*sin(angr + 2.2), wgt = mix(0.5, 3.0, swr*swr)*cpx;
    float dry = smoothstep(0.28, 0.62, fbm(vec2(angr*Rr/cpx*0.09, sdr/cpx*0.55) + 5.0));
    float brush = clamp(wgt + 0.5 - abs(sdr + 0.4*wgt), 0.0, 1.0)*mix(1.0, dry, 0.75)*(0.25 + 0.75*mist);
    d = mix(d, uDayInk, uRimA*brush*kf*(1.0 - 0.75*uMorphK));
    d = mix(d, uSignal, min(0.5, 1.0 - exp(-pil*dayPil(p)*uPilK))*kf);   // the pillar: 50% at most; with the page's axis line at 50% over it, 75% (v3-r3)
    // the bird (round 8, M29): a fine-line ink drawing. Its colour is laid in first as a restrained, transparent wash
    // (the blurred bird, multiplied into the paper like watercolour: the flame phoenix warm, the fenghuang a soft
    // spectrum), then its hairlines are drawn over it in Graphite ink touched with the feather's own hue
    // v3-r2 (M29, review fix 1): no halo and no smudge. The wash is FLAT: the bird's silhouette (its blurred light
    // thresholded hard, so the gaps between barbs close but nothing feathers out past the plumage) filled with the
    // feather's hue at 25%, laid over the paper, not multiplied into it. Then the line work in Graphite at 70%.
    // v3-r5 (review finding 7): the wash held inside the line work: its edge set further in (the blurred light at 1.6x
    // the old threshold, so it no longer spreads past the plumage as a salmon halo) and laid at 18%, a restrained wash
    float sil = silB*k*(1.0 - gk);
    vec3 wh = bw/max(wa, 1e-4); wh = mix(vec3(dot(wh, vec3(0.2126, 0.7152, 0.0722))), wh, 1.25);   // the hue, a touch purer
    // M39 (i2d): I1's mineral pigments (the flame phoenix lands on the warm pair, cinnabar and ochre; the fenghuang's
    // spectrum on all four) bleeding out of the line-work, by multiply, 0.55 at most: a ragged front that wanders with
    // the paper, a darker tide-line where it dries, a granular body; the blurred bird gives the hue only, never the
    // extent, so there is no halo round the bird
    float blc = mx3(bw) > 0.003 ? bleed(uv, q, cpx)*k*(1.0 - gk) : 0.0, edgeN = fbm(q*0.06 + 21.0), gran = fbm(q*0.35 + 13.0);
    float wash = smoothstep(0.08 + 0.12*edgeN, 0.3 + 0.12*edgeN, blc), tide = smoothstep(0.05, 0.3, wash)*(1.0 - smoothstep(0.45, 0.9, wash));
    vec3 pig = mix(vec3(0.62, 0.61, 0.60), mineral(wh), 0.85);
    d *= mix(vec3(1.0), pig, clamp(wash*0.30*(0.7 + 0.6*gran) + tide*0.08, 0.0, 0.55));
    d = mix(d, uDayInk, clamp(wash*0.05 + tide*0.07, 0.0, 1.0));
    float kb = mix(uDim, 1.0, uBirdLift)*keep*(1.0 - gk), db = mx3(bdd)*kb;
    d = mix(d, uDayInk, (1.0 - exp(-db*4.0))*0.70);
    d = mix(d, mix(uDayInk, uBeadC*0.55, 0.45), clamp(bm.x*1.1 + 0.35*bm.z, 0.0, 0.9));   // fh11: the bead by day, a drop of pigment
    // round 6 (M41): by day the paper burns white round a white-hot bird, its line-work gold leaf for that second
    // round 7 (T2): at the peak the paper inside 1.4 bird radii is #FFFFFF (its edge out to 1.8) and the bird's core,
    // inside about half its radius, white-hot #FFFFFF; its outer line-work stays gold leaf so the bird still reads
    float bzW = 0.0, bzC = 0.0;
    if (uBlaze > 0.001) { float rr = length(vec2(gl_FragCoord.x, gl_FragCoord.y) - uBlazeP)/max(uBlazeR, 1.0);
      bzW = (1.0 - smoothstep(1.4, 1.8, rr))*uBlaze*keep*(1.0 - gd); bzC = 1.0 - smoothstep(0.35, 0.6, rr); }
    d = mix(d, mix(mix(vec3(0.80, 0.56, 0.16), vec3(1.0, 0.86, 0.52), bzG), vec3(1.0), bzC), bzB*0.85);
    d = mix(d, vec3(1.0), max(bzW, clamp(bzG*1.05, 0.0, 1.0))*(1.0 - bzB*0.6*(1.0 - bzC)));
    d += n*(1.2/255.0)*(1.0 - bzW);
  }
  o = vec4(mix(c, d, uDay), 1.0);
}`;

// ---------- small vector and matrix helpers ----------
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]], add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const scl = (a, k) => [a[0]*k, a[1]*k, a[2]*k], dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), norm = a => { const l = len(a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth01 = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
function persp(fov, asp, n, f){ const t = 1/Math.tan(fov/2); return [t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0]; }
function mul(a, b){ const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++){ let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+j]*b[i*4+k]; o[i*4+j] = s; } return o; }
function look(e, t, roll){ const z = norm(sub(e, t)), x0 = norm(cross([0, 1, 0], z)), y0 = cross(z, x0);
  const c = Math.cos(roll || 0), s = Math.sin(roll || 0), x = add(scl(x0, c), scl(y0, s)), y = sub(scl(y0, c), scl(x0, s));
  return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot(x,e),-dot(y,e),-dot(z,e),1]; }

/**
 * Start the hero on a canvas. opts: { field, still, reduced, nofield, quality, forceHalf, orbit (the hit area element) }.
 * Returns null when the browser cannot draw it (no WebGL2, or no float render targets at all).
 */
export function createHero(cv, opts = {}) {
  const gl = cv.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  // float render targets: 32-bit where the GPU renders them; otherwise (some iPhones) half float for the particle state too
  let F32 = false, F16 = false;
  const probeFloat = () => { F32 = !opts.forceHalf && !!gl.getExtension('EXT_color_buffer_float');
    F16 = F32 || !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float'); };
  probeFloat();
  if (!F16) return null;

  const kind = FIELDS[opts.field] || 1;
  const reduced = !!opts.reduced, STILL = Number.isFinite(opts.still) ? opts.still : null;
  const phone = Math.min(innerWidth, innerHeight) < 700;
  const W = phone ? 256 : 512, H = phone ? 192 : 384, N = W * H;   // 49k on phones, 197k on desktops
  const homeDir = [Math.sin(HOME_YAW)*Math.cos(HOME_PITCH), Math.sin(HOME_PITCH), Math.cos(HOME_YAW)*Math.cos(HOME_PITCH)];
  const rig = BIRD.createRig({ phone, period: PERIOD, homeDir });

  function sh(type, src){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function prog(vs, fs){ const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++){ const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); } return { p, u }; }
  function tex(w, h, fmt, data, filt){ const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, gl.FLOAT, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  function fbo(t){ const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; }
  function target(w, h, filt){ const t = tex(w, h, gl.RGBA16F, null, filt); return { t, f: fbo(t), w, h }; }
  function drop(rt){ if (rt) { gl.deleteTexture(rt.t); gl.deleteFramebuffer(rt.f); } }
  function quadTo(rt){ gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.f : null); gl.viewport(0, 0, rt ? rt.w : cw, rt ? rt.h : ch);
    gl.bindVertexArray(quad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
  function bindTex(unit, t){ gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
  function clearRT(rt){ gl.bindFramebuffer(gl.FRAMEBUFFER, rt.f); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }

  // particle state: scattered at random, so a visit opens with the sphere gathering out of the field
  const seedData = new Float32Array(N*4);
  for (let i = 0; i < N; i++){ seedData[i*4] = (Math.random()-0.5)*4; seedData[i*4+1] = (Math.random()-0.5)*4; seedData[i*4+2] = (Math.random()-0.5)*4; seedData[i*4+3] = 99; }
  // every GL object is made here, so a lost context (iOS drops it under memory pressure) can be rebuilt whole
  let pUpd, pPts, pStr, pFade, pCarry, pDown, pBlur, pFin, quad, empty, st, sf, stateFmt = 0, cur = 0;
  function buildGL(){
    pUpd = prog(VS_QUAD, FS_UPDATE); pPts = prog(VS_PTS, FS_PTS); pStr = prog(BIRD_STROKE_VS, BIRD_STROKE_FS); pFade = prog(VS_QUAD, FS_FADE); pCarry = prog(VS_QUAD, FS_CARRY);
    pDown = prog(VS_QUAD, FS_DOWN); pBlur = prog(VS_QUAD, FS_BLUR); pFin = prog(VS_QUAD, FS_FINAL);
    quad = gl.createVertexArray(); gl.bindVertexArray(quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    empty = gl.createVertexArray();
    for (const fmt of F32 ? [gl.RGBA32F, gl.RGBA16F] : [gl.RGBA16F]) {
      st = [tex(W, H, fmt, seedData, gl.NEAREST), tex(W, H, fmt, seedData, gl.NEAREST)]; sf = [fbo(st[0]), fbo(st[1])];
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) { stateFmt = fmt; break; }
      st.forEach(t => gl.deleteTexture(t)); sf.forEach(b => gl.deleteFramebuffer(b));
    }
    cur = 0;
  }
  buildGL();

  // the bird: its lap, timing and uniforms come from bird.js
  const morph = { kind: 0, amount: 0 };
  const axis = { on: false, x0: 0, y0: 0, x1: 0, y1: 0, w: 0 };   // v3-r2: the axis segment the pillar is clipped to (CSS px)
  // the journey's looks, set by setPose (all at rest in the hero)
  const jl = { bandOff: new Float32Array([1.24, 0.62, 0, -0.62, -1.24]), bandFloor: 0.30, axisOff: 0, spread: 0, lit: new Float32Array(5), pillar: 0, ember: 0, others: 0, white: 0, exit: 0, lift: 0, cap: 0.86, shimmer: 0, birdScale: 1, fieldK: 1, guard: 0 };   // ROUND7 ENGINE: fieldK (H2), guard (H4)
  // the look (round 6): the scheme's colours and the theme. day eases to its goal over about 0.3 s (the switch's fade)
  const LK = { ink: PAL.ink, ink2: PAL.ink2, tint: [0.86, 0.91, 1.0], pillar: [0.82, 0.88, 1.0], spark: [1.0, 0.97, 0.9],
    bgC: PAL.bgC, bgE: PAL.bgE, peak: PEAK, day: 0, dayNow: 0, dayBg: [0.922, 0.929, 0.925], dayInk: [0.0824, 0.0902, 0.1020],
    halo: [0.97, 0.98, 1.0], haloK: 0.9, inkMax: 0.8, vig: PAL.vig };
  if (opts.look) { Object.assign(LK, opts.look); LK.dayNow = LK.day; }
  let clock = 0, mark = { C: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], F: [0, 0, 1] };
  // the mark's rects for the condense (setMarkRects): grid units, corner radii, cumulative particle shares
  const mk = { r: new Float32Array(MAX_MK*4), rx: new Float32Array(MAX_MK), w: new Float32Array(MAX_MK), n: 0 };
  let bird = rig.at(0), lifeK = 1, rows = H, camEye = scl(homeDir, 10), subs = [], phase = 2.1, birdIn = 1;
  function step(dt, seed){
    gl.bindFramebuffer(gl.FRAMEBUFFER, sf[1-cur]); gl.viewport(0, 0, W, rows); gl.disable(gl.BLEND);
    const u = pUpd.u; gl.useProgram(pUpd.p); bindTex(0, st[cur]); gl.uniform1i(u.uState, 0);
    gl.uniform2f(u.uRes, W, H); gl.uniform1f(u.uRows, rows); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uSeed, seed); gl.uniform1f(u.uT, bird.T);
    gl.uniform1f(u.uScale, bird.scale); gl.uniform1f(u.uBurn, bird.burn); gl.uniform1f(u.uFlap, bird.flap); gl.uniform1f(u.uForm, bird.form);
    gl.uniform1i(u.uShape, kind); gl.uniform1f(u.uLifeK, lifeK); gl.uniform1f(u.uMorph, morph.amount); gl.uniform1i(u.uMorphKind, morph.kind);
    gl.uniform3fv(u.uMC, mark.C); gl.uniform3fv(u.uMR, mark.R); gl.uniform3fv(u.uMU, mark.U); gl.uniform3fv(u.uMF, mark.F);
    gl.uniform4fv(u['uMkR[0]'], mk.r); gl.uniform1fv(u['uMkRx[0]'], mk.rx); gl.uniform1fv(u['uMkW[0]'], mk.w); gl.uniform1i(u.uMkN, mk.n);
    gl.uniform3fv(u.uC, bird.C); gl.uniform3fv(u.uF, bird.F); gl.uniform3fv(u.uU, bird.U); gl.uniform3fv(u.uS, bird.S);
    rig.uniforms(gl, u, bird, camEye);
    gl.bindVertexArray(quad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); cur = 1 - cur;
  }
  const WARM = STILL !== null || reduced ? 320 : 90;   // a visit opens with the sphere still gathering; stills open on a full one
  function warm(n){ lifeK = 0.35; for (let k = 0; k < n; k++) { bird = rig.at(k*0.06 - 8.4); step(0.06*1.6, k*0.37); } lifeK = 1; }
  warm(WARM);

  // render targets. Level 0 draws at the full device pixel ratio (up to 3); the 2.4 MP cap and then smaller buffers and
  // fewer particles come in only when measured frame time asks for them, never because of a zoom.
  // mb: the bird's motion-blur sub-frames (r5)
  const LEVELS = [{ s: 1.0, r: 1.0, cap: 1e9, mb: 3 }, { s: 1.0, r: 1.0, cap: 2.4e6, mb: 3 }, { s: 0.8, r: 1.0, cap: 2.4e6, mb: 2 }, { s: 0.65, r: 0.75, cap: 2.4e6, mb: 1 }, { s: 0.5, r: 0.5, cap: 2.4e6, mb: 1 }];
  // v3-r2: a phone opens at level 1 (the 2.4 MP cap: at 3x it is 0.9 of full size, not visible) and never climbs back
  // up once it has stepped down, so a scroll never pays for re-allocating the eight render targets twice (the round 8
  // and v3 phone hitches were level changes: every target dropped and rebuilt on the frame that asked for it)
  let lvl = Number.isFinite(opts.quality) ? clamp(opts.quality, 0, LEVELS.length - 1) : (phone ? 1 : 0); const autoQ = !Number.isFinite(opts.quality);
  let lvlFloor = lvl;
  let cw = 0, ch = 0, TW = 0, TH = 0, acc, acc2, birdRT, half, q1, q2, bq1, bq2, px = 1, vw = 1, vh = 1;
  function resize(){
    // the canvas is the large viewport (100lvh), so the iOS toolbar collapsing never resizes it or clears the trails
    vw = cv.clientWidth || innerWidth; vh = cv.clientHeight || innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 3), w = Math.round(vw*dpr), h = Math.round(vh*dpr);
    if (w !== cw || h !== ch) { cw = w; ch = h; cv.width = w; cv.height = h; }
    const k = Math.min(1, Math.sqrt(LEVELS[lvl].cap/(cw*ch)))*LEVELS[lvl].s;
    const tw = Math.max(64, Math.round(cw*k)), th = Math.max(64, Math.round(ch*k));
    rows = Math.round(H*LEVELS[lvl].r/8)*8;
    if (tw === TW && th === TH && acc) return false;
    TW = tw; TH = th; px = 1.15*tw/vw;
    [acc, acc2, birdRT, half, q1, q2, bq1, bq2].forEach(drop);
    acc = target(tw, th, gl.LINEAR); acc2 = target(tw, th, gl.LINEAR); birdRT = target(tw, th, gl.LINEAR);
    half = target(Math.max(1, tw >> 1), Math.max(1, th >> 1), gl.LINEAR);
    q1 = target(Math.max(1, tw >> 2), Math.max(1, th >> 2), gl.LINEAR); q2 = target(q1.w, q1.h, gl.LINEAR);
    bq1 = target(q1.w, q1.h, gl.LINEAR); bq2 = target(q1.w, q1.h, gl.LINEAR);   // the bird alone, blurred: the light theme's wash
    [acc, acc2, birdRT, half, q1, q2, bq1, bq2].forEach(clearRT);
    return true;
  }
  resize();

  // ---------- framing: the page says where the sphere's centre sits and how big it is (CSS pixels) ----------
  const frame = { x: 0.7, y: 0.5, r: 0.25 };    // fractions: centre x of width, centre y of height, radius of height
  const camF = { ...frame };
  const carry = { x: 0, y: 0, r: 1, on: false };   // where the image sat when the trails were last drawn
  const box = { x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5, f: 48 };   // the art box light may fall in, and its feather
  let hide = new Float32Array(MAX_HIDE*4), hideA = new Float32Array(MAX_HIDE), hideN = 0;
  const VEIL_F = 160, VEIL_MAX = 0.7;   // v3-r3: the words' soft veil, CSS px and the ground's opacity at most
  let framed = false, glideK = 6;
  const homeDist = () => SPHERE_R/Math.sin(Math.atan(camF.r*2*Math.tan(FOV/2)));   // the distance that draws the sphere at r

  // ---------- camera: orbit with damping and inertia; zoom is a factor on the framed distance ----------
  const HOME = { yaw: HOME_YAW, pitch: HOME_PITCH, z: 1, roll: 0 };
  const goal = { ...HOME, t: [0, 0, 0] }, cam = { ...HOME, t: [0, 0, 0] };
  const ZMIN = () => 2.4/homeDist(), ZMAX = 1.6;     // zoom stops short of the shell and before the sphere is a speck
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  let parallax = true;   // the pointer leans the hero a little; in the journey the scroll is the only camera
  if (!reduced) addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { tmx = e.clientX/vw - 0.5; tmy = e.clientY/vh - 0.5; } }, { passive: true });
  function eyeOf(c, dist){ return add(c.t, scl([Math.sin(c.yaw)*Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw)*Math.cos(c.pitch)], dist)); }
  function currentEye(){ return eyeOf({ t: cam.t, yaw: cam.yaw + mx*0.3, pitch: cam.pitch + my*0.15 }, homeDist()*cam.z); }
  function viewProj(eye, t, roll){
    const vp = mul(persp(FOV, cw/ch, 0.05, Math.max(80, len(sub(eye, t))*2 + 600)), look(eye, t, roll));
    return mul([1,0,0,0, 0,1,0,0, 0,0,1,0, camF.x*2 - 1, 1 - camF.y*2, 0, 1], vp);   // move the image, not the camera
  }
  function projPx(p){ const vp = viewProj(camEye, cam.t, cam.roll), w = vp[3]*p[0] + vp[7]*p[1] + vp[11]*p[2] + vp[15];
    return [((vp[0]*p[0] + vp[4]*p[1] + vp[8]*p[2] + vp[12])/w*0.5 + 0.5)*vw, (0.5 - (vp[1]*p[0] + vp[5]*p[1] + vp[9]*p[2] + vp[13])/w*0.5)*vh]; }
  function sphereOnScreen(eye, t, roll, k = 1.03){   // k 1: the shell's exact silhouette (the light theme's rim)
    const vp = viewProj(eye, t, roll), w = vp[3]*t[0] + vp[7]*t[1] + vp[11]*t[2] + vp[15];
    const x = (vp[0]*t[0] + vp[4]*t[1] + vp[8]*t[2] + vp[12])/w, y = (vp[1]*t[0] + vp[5]*t[1] + vp[9]*t[2] + vp[13])/w;
    const D = len(sub(eye, t)), ang = Math.asin(Math.min(SPHERE_R*k/Math.max(D, 1.7), 0.999));
    return { x: (x*0.5 + 0.5)*vw, y: (0.5 - y*0.5)*vh, r: Math.tan(ang)/Math.tan(FOV/2)*vh/2 };
  }

  // ---------- orbit controls on a hit area over the sphere, clipped to the art box ----------
  const orbitEl = opts.orbit || null;
  let interactive = false, spinV = 0, pitchV = 0, rollV = 0, zoomAt = -1e9;
  const ptrs = new Map(); let drag = null, lastTap = { t: 0, x: 0, y: 0 };
  function resetView(){ Object.assign(goal, { ...HOME, t: [0, 0, 0] }); spinV = pitchV = rollV = 0; }
  function zoomTo(z){ goal.z = clamp(z, ZMIN(), ZMAX); zoomAt = performance.now(); }
  function pan(dx, dy){
    const e = eyeOf(cam, homeDist()*cam.z), f = norm(sub(cam.t, e)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), k = homeDist()*cam.z*0.0013;
    const c = Math.cos(cam.roll), s = Math.sin(cam.roll), rx = dx*c + dy*s, ry = -dx*s + dy*c;
    goal.t = add(goal.t, add(scl(r, -rx*k), scl(u, ry*k)));
    const tl = len(goal.t); if (tl > 1.2) goal.t = scl(goal.t, 1.2/tl);       // pan stays near the sphere
  }
  function twoState(){ const [a, b] = [...ptrs.values()];
    return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x)/2, my: (a.y + b.y)/2 }; }
  function startDrag(e){
    // two fingers: the zoom is the ratio of the finger distance to where the pinch began, from the zoom it began at,
    // softened (power 0.8) and eased by the camera's damping; no zoom inertia, so a real iPhone pinch feels exact
    if (ptrs.size >= 2) { const g = twoState(); drag = { mode: 'two', ...g, d0: g.d, z0: goal.z, lt: performance.now() }; }
    else if (ptrs.size === 1) drag = { mode: (e && (e.button === 2 || e.button === 1 || e.shiftKey)) ? 'pan' : 'turn', lt: performance.now() };
    else drag = null;
  }
  if (orbitEl) {
    orbitEl.addEventListener('pointerdown', e => {
      if (!interactive) return;
      try { orbitEl.setPointerCapture(e.pointerId); } catch (err) {}
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); spinV = pitchV = rollV = 0;
      if (e.pointerType !== 'mouse' && ptrs.size === 1) {   // double tap resets (dblclick does not reliably fire on touch)
        const now = performance.now();
        if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { resetView(); lastTap.t = 0; }
        else lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
      startDrag(e); used(); wake();
    });
    orbitEl.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p || !drag) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      const now = performance.now(), dts = Math.max(8, now - drag.lt)/1000;
      if (drag.mode === 'two' && ptrs.size >= 2) {
        const g = twoState();
        let da = g.ang - drag.ang; if (da > Math.PI) da -= 2*Math.PI; if (da < -Math.PI) da += 2*Math.PI;
        zoomTo(drag.z0*Math.pow(drag.d0/g.d, 0.8)); goal.roll += da; pan(g.mx - drag.mx, g.my - drag.my);
        rollV = clamp(da/dts, -6, 6);
        drag.ang = g.ang; drag.mx = g.mx; drag.my = g.my; drag.lt = now;
      } else if (drag.mode === 'turn') {
        const c = Math.cos(cam.roll), s = Math.sin(cam.roll), rx = dx*c + dy*s, ry = -dx*s + dy*c;
        goal.yaw -= rx*0.0055; goal.pitch = clamp(goal.pitch + ry*0.0055, -1.35, 1.35);
        spinV = clamp(-rx*0.0055/dts, -4, 4); pitchV = clamp(ry*0.0055/dts, -3, 3); drag.lt = now;
      } else if (drag.mode === 'pan') pan(dx, dy);
      wake();
    });
    const release = e => { ptrs.delete(e.pointerId);
      if (ptrs.size === 0) drag = null;
      else { if (drag && drag.mode === 'two') { spinV = 0; pitchV = 0; } startDrag(); if (drag && drag.mode === 'turn') rollV = 0; } };
    orbitEl.addEventListener('pointerup', release); orbitEl.addEventListener('pointercancel', release);
    // wheel, only while the pointer is over the sphere: a trackpad pinch (ctrl + wheel) or a mouse wheel zooms. At the
    // zoom's end in that direction, and for a trackpad's two-finger scroll, the event is left alone and the page scrolls.
    orbitEl.addEventListener('wheel', e => {
      if (!interactive) return;
      // round 6: the page's story runs on scroll, so a plain wheel always scrolls the page; a trackpad pinch (which
      // arrives as ctrl + wheel) or cmd + wheel zooms
      if (!e.ctrlKey && !e.metaKey) return;
      const k = e.ctrlKey ? e.deltaY*0.01 : (e.deltaMode === 1 ? 33 : 1)*e.deltaY*0.0012;
      const z = clamp(goal.z*Math.exp(k), ZMIN(), ZMAX);
      e.preventDefault(); zoomTo(z); used(); wake();
    }, { passive: false });
    // Safari: trackpad pinch and rotate come as gesture events; on touch the pointers already carry them
    let gs = null;
    orbitEl.addEventListener('gesturestart', e => { e.preventDefault(); gs = ptrs.size < 2 ? { z: goal.z, r: goal.roll } : null; });
    orbitEl.addEventListener('gesturechange', e => { e.preventDefault(); if (!gs || ptrs.size >= 2) return;
      zoomTo(gs.z/Math.pow(Math.max(0.05, e.scale), 0.8)); goal.roll = gs.r + (e.rotation || 0)*Math.PI/180; wake(); });
    orbitEl.addEventListener('gestureend', e => { e.preventDefault(); gs = null; });
    orbitEl.addEventListener('dblclick', () => { resetView(); wake(); });
    orbitEl.addEventListener('contextmenu', e => e.preventDefault());
    orbitEl.addEventListener('keydown', e => {             // keyboard: arrows turn, + and - zoom, 0 resets
      const k = e.key; let hit = true;
      if (k === 'ArrowLeft') goal.yaw += 0.2; else if (k === 'ArrowRight') goal.yaw -= 0.2;
      else if (k === 'ArrowUp') goal.pitch = clamp(goal.pitch + 0.15, -1.35, 1.35); else if (k === 'ArrowDown') goal.pitch = clamp(goal.pitch - 0.15, -1.35, 1.35);
      else if (k === '+' || k === '=') zoomTo(goal.z*0.88); else if (k === '-' || k === '_') zoomTo(goal.z/0.88);
      else if (k === '0') resetView(); else hit = false;
      if (hit) { e.preventDefault(); spinV = pitchV = rollV = 0; used(); wake(); }
    });
  }
  let onUsed = null;
  function used(){ if (onUsed) { const f = onUsed; onUsed = null; f(); } }
  function inertia(dt){
    if (drag) return;
    goal.yaw += spinV*dt; spinV *= Math.exp(-dt*2.5);
    goal.pitch = clamp(goal.pitch + pitchV*dt, -1.35, 1.35); pitchV *= Math.exp(-dt*3.0);
    goal.roll += rollV*dt; rollV *= Math.exp(-dt*3.0);
  }
  let orbBox = '', orbInfo = null;
  function placeOrbit(eye){
    if (!orbitEl) return;
    const o = sphereOnScreen(eye, cam.t, cam.roll), r = Math.max(48, o.r*1.08);
    // the hit area is the sphere's square clipped to the art box, round only when nothing is clipped
    const x0 = Math.max(o.x - r, box.x0), y0 = Math.max(o.y - r, box.y0), x1 = Math.min(o.x + r, box.x1), y1 = Math.min(o.y + r, box.y1);
    const round = x0 === o.x - r && y0 === o.y - r && x1 === o.x + r && y1 === o.y + r;
    orbInfo = { x: o.x, y: o.y, r: o.r };
    const on = interactive && x1 - x0 > 40 && y1 - y0 > 40;
    const key = on ? `${Math.round(x0)},${Math.round(y0)},${Math.round(x1)},${Math.round(y1)},${round}` : 'off';
    if (key === orbBox) return; orbBox = key;
    const s = orbitEl.style;
    if (!on) { s.display = 'none'; return; }
    s.display = ''; s.left = Math.round(x0) + 'px'; s.top = Math.round(y0) + 'px';
    s.width = Math.round(x1 - x0) + 'px'; s.height = Math.round(y1 - y0) + 'px'; s.borderRadius = round ? '50%' : '0';
  }

  // ---------- the bird's flight bounds (round 7) ----------
  // The page names a box the bird must stay inside (CSS px: the art half, 48 px in from the screen's edges and 64 px clear
  // of the text column). Each frame the bird's outline (bird.js) is projected; if it would leave the box, the bird is
  // scaled about its own centre (to no less than 0.55 unless the box itself is smaller) and then moved in the screen's
  // plane by the rest. A tighter fit is taken at once; a looser one eases back over about 0.15 s, so it never pops.
  // A last check moves it by any remainder, so no frame leaves the box.
  const flight = { on: false, x0: 0, y0: 0, x1: 0, y1: 0 }, fit = { k: 1, dx: 0, dy: 0 };
  const PAD = 6;
  function birdBox(vp, b){
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of rig.outline(b)) {
      const w = vp[3]*q[0] + vp[7]*q[1] + vp[11]*q[2] + vp[15]; if (w <= 0.05) continue;
      const x = ((vp[0]*q[0] + vp[4]*q[1] + vp[8]*q[2] + vp[12])/w*0.5 + 0.5)*vw, y = (0.5 - (vp[1]*q[0] + vp[5]*q[1] + vp[9]*q[2] + vp[13])/w*0.5)*vh;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x0: x0 - PAD, y0: y0 - PAD, x1: x1 + PAD, y1: y1 + PAD };
  }
  const projPt = (vp, q) => { const w = vp[3]*q[0] + vp[7]*q[1] + vp[11]*q[2] + vp[15];
    return [((vp[0]*q[0] + vp[4]*q[1] + vp[8]*q[2] + vp[12])/w*0.5 + 0.5)*vw, (0.5 - (vp[1]*q[0] + vp[5]*q[1] + vp[9]*q[2] + vp[13])/w*0.5)*vh]; };
  // move the bird's centre by (dx, dy) screen px, in the plane facing the camera
  function shiftBird(vp, eye, b, dx, dy){
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    const f = norm(sub(cam.t, eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), e = 0.05;
    const c = projPt(vp, b.C), a = projPt(vp, add(b.C, scl(r, e))), v = projPt(vp, add(b.C, scl(u, e)));
    const j00 = (a[0] - c[0])/e, j10 = (a[1] - c[1])/e, j01 = (v[0] - c[0])/e, j11 = (v[1] - c[1])/e, det = j00*j11 - j01*j10;
    if (Math.abs(det) < 1e-6) return;
    const s1 = (dx*j11 - j01*dy)/det, s2 = (j00*dy - j10*dx)/det;
    b.C = add(b.C, add(scl(r, s1), scl(u, s2)));
  }
  function needed(B, c){   // the scale about the centre c, then the shift, that bring box B inside the flight box
    const F = flight; let k = 1;
    if (B.x1 > F.x1 && c[0] < F.x1) k = Math.min(k, (F.x1 - c[0])/(B.x1 - c[0]));
    if (B.x0 < F.x0 && c[0] > F.x0) k = Math.min(k, (c[0] - F.x0)/(c[0] - B.x0));
    if (B.y1 > F.y1 && c[1] < F.y1) k = Math.min(k, (F.y1 - c[1])/(B.y1 - c[1]));
    if (B.y0 < F.y0 && c[1] > F.y0) k = Math.min(k, (c[1] - F.y0)/(c[1] - B.y0));
    k = Math.max(k, 0.55);
    k = Math.max(0.15, Math.min(k, (F.x1 - F.x0)/Math.max(1, B.x1 - B.x0), (F.y1 - F.y0)/Math.max(1, B.y1 - B.y0)));
    const sx0 = c[0] + (B.x0 - c[0])*k, sx1 = c[0] + (B.x1 - c[0])*k, sy0 = c[1] + (B.y0 - c[1])*k, sy1 = c[1] + (B.y1 - c[1])*k;
    const dx = sx0 < F.x0 ? F.x0 - sx0 : sx1 > F.x1 ? F.x1 - sx1 : 0, dy = sy0 < F.y0 ? F.y0 - sy0 : sy1 > F.y1 ? F.y1 - sy1 : 0;
    return { k, dx, dy };
  }
  function keepBirdIn(eye, dt){
    const relax = 1 - Math.exp(-dt/0.15);
    let want = { k: 1, dx: 0, dy: 0 }, vp = null;
    // the dive into a pole is the bird going into the sphere, which sits inside the art: the fit lets go as it is drawn in
    const live = flight.on && birdK > 0.01 && bird.absorb < 0.35 && flight.x1 - flight.x0 > 8 && flight.y1 - flight.y0 > 8;
    // the box collapses while the sphere leaves the screen between scenes: keep the last fit rather than let the bird out
    const keep = flight.on && !live && birdK > 0.01;
    if (live) { vp = viewProj(eye, cam.t, cam.roll); want = needed(birdBox(vp, bird), projPt(vp, bird.C)); }
    else if (keep) want = { ...fit };
    // tighter at once, looser eased
    fit.k = want.k < fit.k ? want.k : fit.k + (want.k - fit.k)*relax;
    for (const key of ['dx', 'dy']) { const w = want[key], c = fit[key];
      fit[key] = (Math.sign(w) === Math.sign(c) || c === 0) && Math.abs(w) > Math.abs(c) ? w : c + (w - c)*relax; }
    if (!live) { if (Math.abs(fit.k - 1) < 1e-3 && Math.abs(fit.dx) + Math.abs(fit.dy) < 0.05) return; vp = viewProj(eye, cam.t, cam.roll); }
    bird.scale *= fit.k; shiftBird(vp, eye, bird, fit.dx, fit.dy);
    if (live) { const r = needed(birdBox(vp, bird), projPt(vp, bird.C));   // the remainder, never stored
      if (r.k < 0.999) bird.scale *= r.k; shiftBird(vp, eye, bird, r.dx, r.dy); }
  }

  // ---------- round 6 (U42): the bird flown along the page's path at the close ----------
  // fly.k blends from the lap (0) to the flown bird (1); x, y the bird's centre (CSS px); dx, dy its heading on screen;
  // w its size across (CSS px); bank its roll about the heading (radians). The bird lies in the plane facing the camera
  // through the sphere's centre, its back to the viewer as on the lap. A history of where it has been gives its plumes
  // the flown path to trail along.
  const fly = { k: 0, x: 0, y: 0, dx: 1, dy: 0, w: 160, bank: 0 }, flyHist = [];
  const FLY_SPAN = 2.4;   // the bird's size across at scale 1, in sphere units (calibrated against birdBox, round 6)
  function screenToPlane(vp, eye, x, y){
    const f = norm(sub(cam.t, eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    let P = cam.t.slice();
    for (let i = 0; i < 3; i++) {
      const c = projPt(vp, P), e = 0.02, a = projPt(vp, add(P, scl(r, e))), v = projPt(vp, add(P, scl(u, e)));
      const j00 = (a[0] - c[0])/e, j10 = (a[1] - c[1])/e, j01 = (v[0] - c[0])/e, j11 = (v[1] - c[1])/e, det = j00*j11 - j01*j10;
      if (Math.abs(det) < 1e-9) break;
      const dx = x - c[0], dy = y - c[1]; P = add(P, add(scl(r, (dx*j11 - j01*dy)/det), scl(u, (j00*dy - j10*dx)/det)));
    }
    const c = projPt(vp, P), a = projPt(vp, add(P, scl(r, 0.01)));
    return { P, ppu: Math.hypot(a[0] - c[0], a[1] - c[1])/0.01, f, r, u };
  }
  function flyBird(eye, b, dt){
    if (fly.k < 0.001) { flyHist.length = 0; return; }
    const vp = viewProj(eye, cam.t, cam.roll), q = screenToPlane(vp, eye, fly.x, fly.y), k = fly.k;
    const hl = Math.hypot(fly.dx, fly.dy) || 1;
    const Fw = norm(add(scl(q.r, fly.dx/hl), scl(q.u, -fly.dy/hl)));
    const up0 = norm(add(scl(q.f, -0.75), scl(q.u, 0.25)));
    let Sw = norm(cross(Fw, up0)), Uw = cross(Sw, Fw);
    Sw = norm(add(scl(Sw, Math.cos(fly.bank)), scl(Uw, Math.sin(fly.bank)))); Uw = cross(Sw, Fw);
    const sw = Math.max(0.05, fly.w/(Math.max(q.ppu, 1e-3)*FLY_SPAN));
    b.C = add(scl(b.C, 1 - k), scl(q.P, k));
    b.F = norm(add(scl(b.F, 1 - k), scl(Fw, k)));
    let U = norm(add(scl(b.U, 1 - k), scl(Uw, k))), S = norm(cross(b.F, U)); U = cross(S, b.F);
    b.S = S; b.U = U; b.V = scl(q.f, -1);
    b.scale = Math.exp(Math.log(b.scale)*(1 - k) + Math.log(sw)*k);
    b.absorb *= 1 - k; if (k > 0.5) b.pullT = Math.min(b.pullT, -5);
    b.form = Math.max(b.form, k); b.unfurl = Math.max(b.unfurl, k);
    // the plumes trail the path the bird has flown (sampled back along its history)
    flyHist.unshift(b.C.slice()); if (flyHist.length > 240) flyHist.length = 240;
    const back = s => { let acc = 0;
      for (let i = 1; i < flyHist.length; i++) { const d = len(sub(flyHist[i], flyHist[i - 1]));
        if (acc + d >= s && d > 1e-6) return add(flyHist[i - 1], scl(sub(flyHist[i], flyHist[i - 1]), (s - acc)/d)); acc += d; }
      const end = flyHist[flyHist.length - 1]; return sub(end, scl(b.F, s - acc)); };
    b.path = rig.pathLocal(b, back);
  }
  // ---------- round 6 (M41): the white reveal ----------
  // The rainbow phoenix's first second: when a life B loop begins (its first 0.8 s), the blaze runs on real time, never
  // twice within 4 s; going back into life A (a scroll up) lets it go over 0.3 s. One swell: no strobe.
  const BLAZE_Q = new URLSearchParams(location.search).get('blaze');
  const blz = { t: 1e9, last: -1e9, inB: false, k: 0, valid: 1 };
  let blzAt = null;   // ROUND7 ENGINE: where the reveal burns (CSS px) and its radius, for the page's measures
  // round 7 (H3): the embers' sway, in sphere units: about 6 css px on screen, whatever the sphere's size
  function embA(vp){ const P = [0, -1.6, 0], c = projPt(vp, P), e = projPt(vp, [0.1, -1.6, 0]), ppu = Math.max(1, Math.hypot(e[0] - c[0], e[1] - c[1])/0.1);
    return Math.max(0.02, 6/ppu); }
  // the knot of embers on screen (CSS px): the pole, swaying as the shader sways it, its reach breathing
  function emberBox(vp, b){
    const dn = b.poleD || [0, -1, 0], A = embA(vp), t1 = norm(cross(dn, [0, 0, 1]));
    const P = add(scl(dn, 1.6 + A*Math.sin(clock*2.83)), scl(t1, A*Math.cos(clock*2.83))), c = projPt(vp, P);
    const f = norm(sub(cam.t, camEye)), r = norm(cross(f, [0, 1, 0])), e = projPt(vp, add(P, scl(r, 0.1)));
    const rk = Math.max(5, Math.hypot(e[0] - c[0], e[1] - c[1]))*(1 + 0.12*Math.sin(clock*2.1)) + 6;
    return { x0: c[0] - rk, y0: c[1] - rk*0.75, x1: c[0] + rk, y1: c[1] + rk*0.75 };
  }
  function blazeTick(dt){
    if (reduced) { blz.k = 0; return; }
    if (BLAZE_Q !== null) { blz.k = clamp(+BLAZE_Q || 0, 0, 1); return; }
    const loop = Math.floor(simT/PERIOD), lt = simT - loop*PERIOD, isB = ((loop % 2) + 2) % 2 === 1;
    const born = isB && lt >= 0.0 && lt < 0.8;
    if (born && !blz.inB && clock - blz.last > 4) { blz.t = 0; blz.last = clock; }
    blz.inB = isB && lt < 3;
    blz.valid = isB ? 1 : blz.valid*Math.exp(-dt/0.3);   // ROUND7 ENGINE (T2): up at once in life B, so the peak is reached; let go over 0.3 s back in life A
    blz.t += dt;
    // round 7 (T2): by day the peak holds 1 s (0.25 to 1.25 s), settled by 1.95 s; by night as round 6 (0.3, 0.8, 1.5)
    const dk = LK.dayNow, up = 0.3 - 0.05*dk, top = 0.8 + 0.45*dk, end = 1.5 + 0.45*dk;
    const t = blz.t, env = smooth01(0, up, t)*(1 - smooth01(top, end, t));
    blz.k = env*blz.valid;
  }

  // ---------- what the page controls ----------
  let dim = 1, dimGoal = 1, speed = 1, speedGoal = 1, birdK = 1, birdGoal = 1, intro = (STILL !== null || reduced) ? 1 : 0;
  const fieldOn = opts.nofield ? 0 : 1;
  // v3-precision: opts.startT, where the hero's free loop begins (seconds), so the first seconds can show a chosen part of the lap
  let simT = STILL !== null ? STILL : (Number.isFinite(opts.startT) ? opts.startT : 1.5), seed = 1000, timeLock = null;

  function tick(dt){
    const k = 1 - Math.exp(-dt*3.0);
    dim += (dimGoal - dim)*k; speed += (speedGoal - speed)*k; birdK += (birdGoal - birdK)*k;
    intro = Math.min(1, intro + dt/1.4);
    { const d = LK.day - LK.dayNow; LK.dayNow = Math.abs(d) < 0.004 ? LK.day : LK.dayNow + d*(1 - Math.exp(-dt*12)); }
    clock += dt;
    const sdt = dt*speed;
    // round 8: a locked loop glides to its time over about a fifth of a second (a fast flick lands with the bird's state
    // caught up); a jump of more than 6 s cuts, and the bird fades back in over 0.35 s rather than popping
    if (timeLock !== null) simT -= 2*PERIOD*Math.round((simT - timeLock)/(2*PERIOD));   // the same life two loops on is the same place
    const sim0 = simT;
    if (timeLock === null) simT += sdt;
    else { const d = timeLock - simT; if (Math.abs(d) > 6 && !held()) { birdIn = 0; rig.resetChains(); }
      simT = Math.abs(d) > 6 || held() ? timeLock : simT + d*(1 - Math.exp(-dt*14)); }
    birdIn = Math.min(1, birdIn + dt/0.35);
    const dSim = Math.abs(simT - sim0) > 1 ? 0 : simT - sim0;   // no blur across a cut
    // the wingbeat's phase, integrated so it never jumps: on the loop's own time while it runs free, on real time (at
    // the lap's own rate) while the scroll holds the loop
    const tau0 = ((simT/PERIOD) % 1 + 1) % 1, dPh = 2*Math.PI*rig.flapHz(tau0, rig.lifeOf(simT))*(timeLock === null ? sdt : dt*Math.max(0.35, speed));
    phase += dPh;
    lifeK += (1 - lifeK)*(1 - Math.exp(-dt*0.5));
    inertia(dt);
    const ck = 1 - Math.exp(-dt*10), fk = 1 - Math.exp(-dt*glideK);
    for (const key of ['yaw', 'pitch', 'z', 'roll']) cam[key] += (goal[key] - cam[key])*ck;
    cam.t = cam.t.map((v, i) => v + (goal.t[i] - v)*ck);
    for (const key of ['x', 'y', 'r']) camF[key] += (frame[key] - camF[key])*fk;
    const pk = 1 - Math.exp(-dt*2);
    mx += ((parallax ? tmx : 0) - mx)*pk; my += ((parallax ? tmy : 0) - my)*pk;
    const eye = currentEye(); camEye = eye;
    rig.setLift(jl.lift);
    // v3-precision: birdScale, the bird's size against the sphere's (an oversized sphere keeps a bird of about the hero's size)
    const exitOf = b => { b.scale *= jl.birdScale; if (jl.exit > 0) {   // the close: the last pass drawn along the shell into the top pole
      const e = jl.exit; b.pullT = Math.max(b.pullT, e); b.absorb = Math.max(b.absorb, smooth01(0, 0.6, e)); b.poleD = [0, 1, 0]; b.pole = rig.TOP_IN; } return b; };
    bird = exitOf(rig.at(simT, phase));
    flyBird(eye, bird, dt);   // round 6 (U42): the close's flight, when the page asks for it
    blazeTick(dt);            // round 6 (M41): the white reveal
    // the plumes are simulated in the bird's own unfitted flight, then the fit to the flight box moves the whole bird
    // (plumes included: the shaders read them in the bird's frame), so the fit is exact in the frame it is made
    rig.simulate(dt, bird);
    const C0 = bird.C, s0 = bird.scale;
    keepBirdIn(eye, dt);
    // motion blur: the bird drawn at K moments across a half-frame shutter, each carrying the same fit to the flight box
    subs.length = 0;
    const K = fly.k < 0.001 && birdK*dim > 0.01 && (Math.abs(dSim) > 1e-4 || dPh > 1e-4) ? Math.min(phone ? 2 : 3, LEVELS[lvl].mb) : 1;
    if (K > 1) { const dC = sub(bird.C, C0), ks = bird.scale/s0;
      for (let j = K - 1; j >= 1; j--) { const b = exitOf(rig.at(simT - dSim*0.5*j/K, phase - dPh*0.5*j/K)); b.path = bird.path; b.C = add(b.C, dC); b.scale *= ks; subs.push(b); }
      subs.push(bird); }
    { // the mark's plane faces the camera through the sphere's centre, one grid unit = 3.2/28 of a sphere unit
      const f = norm(sub(cam.t, eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), g = SPHERE_R*2/28;
      mark = { C: cam.t.slice(), R: scl(r, g), U: scl(u, g), F: scl(f, g) }; }
    // the field is stepped and drawn in sub-steps when a frame runs long or the view is close, so its streams stay
    // continuous lines on screen; close up, the bird is drawn again with fresh particles (up to 8 times)
    const zf = 1/cam.z;
    const n = Math.min(5, Math.max(1, Math.ceil(sdt*60 - 0.25), Math.round(zf*0.9)));
    placeOrbit(eye);
    draw(dt, eye, n, sdt > 0 ? sdt*1.6/n : 0, Math.min(8, Math.max(1, Math.ceil(zf*zf*0.45))));
  }
  function draw(dt, eye, nSub, hSub, reps){
    const vp = viewProj(eye, cam.t, cam.roll);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const fade = 1 - Math.pow(1 - PAL.fade, dt*60);
    // the image moved (the page moved the sphere): carry the trails with it, then fade; otherwise fade in place
    const mvx = camF.x - carry.x, mvy = camF.y - carry.y, mk = carry.r/Math.max(camF.r, 1e-5);
    if (carry.on && (Math.abs(mvx)*vw > 0.25 || Math.abs(mvy)*vh > 0.25 || Math.abs(mk - 1) > 0.002)) {
      gl.disable(gl.BLEND); gl.useProgram(pCarry.p); bindTex(0, acc.t); gl.uniform1i(pCarry.u.uPrev, 0);
      gl.uniform2f(pCarry.u.uC0, carry.x, 1 - carry.y); gl.uniform2f(pCarry.u.uC1, camF.x, 1 - camF.y); gl.uniform1f(pCarry.u.uK, mk);
      // round 8: as the image grows, the old light spreads over more area (it keeps its energy, not its brightness), so a
      // far point pushed in never blooms into a white disc
      gl.uniform1f(pCarry.u.uKeep, (1 - fade)*Math.min(1, mk*mk)); quadTo(acc2); const t = acc; acc = acc2; acc2 = t; gl.enable(gl.BLEND);
    } else { gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(pFade.p); gl.uniform1f(pFade.u.uFade, fade); quadTo(acc); }
    carry.x = camF.x; carry.y = camF.y; carry.r = camF.r; carry.on = true;
    gl.blendFunc(gl.ONE, gl.ONE);
    const u = pPts.u; gl.useProgram(pPts.p); bindTex(0, st[cur]); gl.uniform1i(u.uState, 0);
    birdUniforms(u, bird, eye, vp); gl.uniform1f(u.uW, W);
    gl.uniform1f(u.uEmberA, BIRD.emberAlpha*(1 - smooth01(-0.9, 0, bird.pullT)));   // embers go dark before the death
    gl.uniform3fv(u.uTint, LK.tint); gl.uniform3fv(u.uPillarTint, LK.pillar); gl.uniform3fv(u.uSparkTint, LK.spark); gl.uniform1f(u.uAxisK, LK.axisK || 0);
    gl.uniform1f(u.uShimmer, jl.shimmer);
    gl.uniform1fv(u['uBandOff[0]'], jl.bandOff); gl.uniform1f(u.uBandFloor, jl.bandFloor);
    gl.uniform1f(u.uSpread, jl.spread); gl.uniform1f(u.uAxisOff, jl.axisOff); gl.uniform1fv(u['uLit[0]'], jl.lit); gl.uniform1f(u.uPillar, jl.pillar);
    gl.uniform1f(u.uClock, clock); gl.uniform1f(u.uEmber, jl.ember); gl.uniform1f(u.uOthers, jl.others); gl.uniform1f(u.uWhite, jl.white);
    { const f = norm(sub(cam.t, eye)), r = norm(cross(f, [0, 1, 0])), up = cross(r, f);
      gl.uniform3fv(u.uOR, r); gl.uniform3fv(u.uOU, up); gl.uniform3fv(u.uOF, f); gl.uniform3fv(u.uOSpan, [150*cw/ch, 150, 420]); }
    gl.uniform1f(u.uAlpha, fieldOn*PAL.alpha*(1 + 0.2*Math.sin(simT*0.9))*2.4*intro*intro*(3 - 2*intro)); gl.uniform1f(u.uFireA, FLAME.alpha);
    gl.uniform1f(u.uPass, 0); gl.uniform1f(u.uSub, 1/nSub); gl.uniform1f(u.uRep, 0);
    for (let k = 0; k < nSub; k++) {
      if (hSub > 0) { step(hSub, seed += 0.731); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(pPts.p); bindTex(0, st[cur]); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, acc.f); gl.viewport(0, 0, acc.w, acc.h);
      gl.bindVertexArray(empty); gl.drawArrays(gl.POINTS, 0, rows*W);
    }
    // the bird, crisp, in its own buffer: the sparks once at the frame's own moment (blurring glints would draw dashes),
    // then the plumage as hairlines at each motion-blur sub-moment, each at 1/K strength (r5)
    clearRT(birdRT); gl.viewport(0, 0, birdRT.w, birdRT.h);
    gl.uniform1f(u.uPass, 1); gl.uniform1f(u.uBirdA, BIRD.sparkA);
    if (birdK*birdIn > 0.003) for (let k = 0; k < reps; k++) { gl.uniform1f(u.uRep, k); gl.drawArrays(gl.POINTS, 0, rows*W/BIRD.share); }
    if (birdK*birdIn > 0.003 && !opts.nostroke) {
      const list = subs.length ? subs : [bird], wk = 1/list.length, v = pStr.u;
      gl.useProgram(pStr.p); gl.bindVertexArray(empty);
      gl.uniform2f(v.uVpx, birdRT.w, birdRT.h); gl.uniform1f(v.uFpx, (birdRT.h/2)/Math.tan(FOV/2)); gl.uniform1f(v.uStrA, BIRD.strokeA*wk);
      const lod = clamp(Math.round(Math.sqrt(1/cam.z)), 1, phone ? 2 : 3);   // close up, more barbs
      for (const b of list) {
        birdUniforms(v, b, eye, vp); gl.uniform1f(v.uRep, 0);
        for (const g of STROKES) {
          const nb = g.nb*lod, E = g.sr + nb*2*g.sb;
          gl.uniform1f(v.uGrp, g.grp); gl.uniform1f(v.uNF, g.nf); gl.uniform1f(v.uNb, nb); gl.uniform1f(v.uSR, g.sr); gl.uniform1f(v.uSB, g.sb);
          gl.uniform1f(v.uSlant, g.slant); gl.uniform1f(v.uRachA, g.ra || 1); gl.uniform1f(v.uWR, g.wr); gl.uniform1f(v.uWB, g.wb);
          const sc = rig.strokeCount ? rig.strokeCount(g, b.life || 0) : { n: (g.fh && (b.life || 0) < 1e-3) ? 0 : ((g.outer && (b.life || 0) < 1e-3) ? g.outer : g.count), foff: g.foff || 0 };   // gen3: the genome sets the crest's and inner plumes' counts
          if (!sc.n) continue;
          if (v.uFOff) gl.uniform1f(v.uFOff, sc.foff); if (v.uHeadG) gl.uniform1f(v.uHeadG, g.grp === 9 ? 2 : g.grp === 4 || g.grp === 8 ? 1 : 0);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sc.n*E);
        }
      }
    }
    composite();
  }
  // every uniform a bird shader reads, for one moment of the bird (the points pass and the stroke pass share them)
  function birdUniforms(u, b, eye, vp){
    gl.uniformMatrix4fv(u.uVP, false, vp); gl.uniform1f(u.uPx, px);
    gl.uniform1f(u.uTau, b.tau); gl.uniform1f(u.uPeriod, PERIOD); gl.uniform1f(u.uBurn, b.burn); gl.uniform1f(u.uForm, b.form);
    gl.uniform1f(u.uScale, b.scale); gl.uniform1f(u.uFlap, b.flap); gl.uniform1f(u.uT, b.T);
    gl.uniform3fv(u.uC, b.C); gl.uniform3fv(u.uF, b.F); gl.uniform3fv(u.uU, b.U); gl.uniform3fv(u.uS, b.S);
    gl.uniform3fv(u.uInk, LK.ink); gl.uniform3fv(u.uInk2, LK.ink2); gl.uniform3fv(u.uHot, FLAME.hot); gl.uniform3fv(u['uFl[0]'], FLAME.stops.flat());
    gl.uniform1f(u.uFireA, FLAME.alpha); gl.uniform1f(u.uBirdK, birdK*birdIn);
    if (u.uEt) { gl.uniform1f(u.uEt, clock); gl.uniform1f(u.uEmbA, embA(vp)); }   // ROUND7 ENGINE (H3): the embers' real time and sway
    rig.setNight && rig.setNight(1 - LK.dayNow);   // v3-r5: fh8's night-only touches (uNt)
    rig.uniforms(gl, u, b, eye);
  }
  function composite(){
    gl.disable(gl.BLEND);
    gl.useProgram(pDown.p); gl.uniform1i(pDown.u.uA, 0); gl.uniform1i(pDown.u.uB, 1);
    bindTex(0, acc.t); bindTex(1, birdRT.t); gl.uniform2f(pDown.u.uTx, 1/acc.w, 1/acc.h); gl.uniform1f(pDown.u.uTwo, 1); gl.uniform1f(pDown.u.uThr, PAL.thr); quadTo(half);
    bindTex(0, half.t); gl.uniform2f(pDown.u.uTx, 1/half.w, 1/half.h); gl.uniform1f(pDown.u.uTwo, 0); gl.uniform1f(pDown.u.uThr, 0); quadTo(q1);
    gl.useProgram(pBlur.p); gl.uniform1i(pBlur.u.uA, 0); gl.uniform2f(pBlur.u.uTx, 1/q1.w, 1/q1.h);
    // the glow's radius follows the zoom, but never reaches past GLOW_MAX_PX: one quarter-size texel is 4*vw/TW CSS px,
    // and the two downsamples and the upsample add about 1.5 texels of their own
    const tx = 4*vw/TW, room = Math.max(0.5, GLOW_MAX_PX/tx - 1.5);
    const bz = Math.min(clamp(Math.sqrt(1/cam.z), 0.8, 1.8), room/5);
    bindTex(0, q1.t); gl.uniform1f(pBlur.u.uR, 1.5*bz); quadTo(q2);
    bindTex(0, q2.t); gl.uniform1f(pBlur.u.uR, 3.5*bz); quadTo(q1);
    if (LK.dayNow > 0.001) {   // the bird alone, blurred about 6 CSS px: the light theme's watercolour wash under the line work
      gl.useProgram(pDown.p); bindTex(0, birdRT.t); gl.uniform2f(pDown.u.uTx, 1/birdRT.w, 1/birdRT.h); gl.uniform1f(pDown.u.uTwo, 0); gl.uniform1f(pDown.u.uThr, 0); quadTo(bq1);
      // v3-precision: a tighter wash (1.2 and 1.8 texels, was 1.5 and 2.5), so the colour hugs the plumage on paper
      gl.useProgram(pBlur.p); bindTex(0, bq1.t); gl.uniform2f(pBlur.u.uTx, 1/bq1.w, 1/bq1.h); gl.uniform1f(pBlur.u.uR, 1.2); quadTo(bq2);
      bindTex(0, bq2.t); gl.uniform1f(pBlur.u.uR, 1.8); quadTo(bq1);
    }
    const u = pFin.u; gl.useProgram(pFin.p);
    bindTex(0, acc.t); bindTex(1, birdRT.t); bindTex(2, q1.t); bindTex(3, bq1.t); gl.uniform1i(u.uAcc, 0); gl.uniform1i(u.uBird, 1); gl.uniform1i(u.uBloom, 2); gl.uniform1i(u.uBirdW, 3);
    { // the foot and crown pools (r5's climaxes): the foot gathers as the bird is drawn in and holds a moment after it has
      // gone; the crown swells just before the rebirth and fades as the wings unfold, in the coming life's colour
      const sx = cw/vw, pf = projPx([0, -1.6, 0]), pc = projPx([0, 1.6, 0]), o = sphereOnScreen(camEye, cam.t, cam.roll, 1);
      const t = bird.pullT, foot = jl.exit > 0 ? 0 : (t > -0.4 ? smooth01(-0.4, 0.55, t)*(1 - smooth01(0.9, 2.2, t)) : 0);
      const tau = bird.tau, crown = jl.exit > 0 ? smooth01(0.2, 0.6, jl.exit)*(1 - smooth01(0.7, 1, jl.exit)) : Math.min(1, smooth01(0.955, 1.0, tau) + (tau < 0.2 ? 1 - smooth01(0.0, 0.14, tau) : 0));
      const k = fieldOn*intro*(1 - jl.spread)*(1 - jl.others)*smooth01(14, 40, o.r)*dim;
      gl.uniform4f(u.uPools, pf[0]*sx, ch - pf[1]*sx, pc[0]*sx, ch - pc[1]*sx); gl.uniform1f(u.uPoolR, Math.max(2, o.r*0.3*sx));
      gl.uniform1f(u.uFootA, 0.32*foot*k*jl.fieldK); gl.uniform1f(u.uCrownA, 0.2*crown*k*jl.fieldK);   // round 7 (H2): the field's own strength
      gl.uniform3fv(u.uFootC, [0.93, 0.9, 0.82]); gl.uniform3fv(u.uCrownC, bird.nextB || (bird.life > 0.5 && tau < 0.3) || jl.exit > 0 ? [0.98, 0.9, 0.86] : [0.6, 0.66, 1.0]);
      gl.uniform1f(u.uShimK, Math.min(1, jl.shimmer*3));
      // fh11 (M40): the bead on the pillar, from the rig, projected onto the axis; off at the close and while the bird is hidden
      const bb = rig.beadAt && jl.exit <= 0 ? rig.beadAt(simT) : null;
      if (bb && u.uBead) { const q = projPx([0, bb.y, 0]), dx = pc[0] - pf[0], dy = pc[1] - pf[1], dl = Math.hypot(dx, dy) || 1;
        gl.uniform4f(u.uBead, q[0]*sx, ch - q[1]*sx, bb.a*k*jl.fieldK*Math.min(1, birdK*1.5), bb.tail); gl.uniform3fv(u.uBeadC, bb.col);
        gl.uniform2f(u.uBeadD, dx/dl, -dy/dl); gl.uniform1f(u.uBeadS, Math.max(2, 3*sx*bb.size*Math.max(1, o.r/220))); }
      else if (u.uBead) gl.uniform4f(u.uBead, 0, 0, 0, 0); }
    gl.uniform2f(u.uRes, cw, ch); gl.uniform1f(u.uBloomK, PAL.bloom*0.8); gl.uniform1f(u.uVig, LK.vig*(1 - LK.dayNow));
    const sx = cw/vw;
    gl.uniform4f(u.uBox, box.x0*sx, box.y0*sx, box.x1*sx, box.y1*sx); gl.uniform1f(u.uFeather, Math.max(1, box.f*sx));
    const hs = new Float32Array(MAX_HIDE*4); for (let i = 0; i < hideN*4; i++) hs[i] = hide[i]*sx;
    gl.uniform4fv(u['uHide[0]'], hs); gl.uniform1fv(u['uHideA[0]'], hideA); gl.uniform1i(u.uHideN, hideN);
    gl.uniform1f(u.uVeilF, VEIL_F*sx); gl.uniform1f(u.uVeilMax, VEIL_MAX);
    gl.uniform1f(u.uT, bird.T); gl.uniform1f(u.uDim, dim); gl.uniform3fv(u.uBgC, LK.bgC); gl.uniform3fv(u.uBgE, LK.bgE); gl.uniform1f(u.uCap, jl.cap); gl.uniform3fv(u.uPeak, LK.peak);
    { // v3-r4: life A only (bird.life 0 is the flame phoenix), night only
      // measured against the bird's own strength (birdK), so a bird the scene quietens (scene 2's 0.3) still reads
      const bk = Math.max(0.2, birdK*birdIn), fk = (1 - clamp(bird.life || 0, 0, 1))*(1 - LK.dayNow)*smooth01(0.05, 0.2, birdK*birdIn);
      gl.uniform1f(u.uFlK, fk); gl.uniform1f(u.uFlLo, FL_LO*bk); gl.uniform1f(u.uFlHi, FL_HI*bk); gl.uniform3fv(u.uFlTop, [1.0, 0x4D/255, 0x5A/255]); }   // B66: scarlet #FF4D5A (v3-r4 #FF9A7A)
    { // round 6: the bird's lift (U42) and the blaze (M41): where the bird is, and how far its light floods
      gl.uniform1f(u.uBirdLift, fly.k);
      let bzr = 1, bzx = 0, bzy = 0;
      // round 7 (H4, T2): the radius is the bird's own (half its box's diagonal), at most 0.32 of the screen's short side
      if (blz.k > 0.001) { const vpb = viewProj(camEye, cam.t, cam.roll), B = birdBox(vpb, bird), c0 = projPt(vpb, bird.C);
        const rb = Math.min(Math.max(28, Math.hypot(B.x1 - B.x0, B.y1 - B.y0)*0.5), 0.32*Math.min(vw, vh));
        bzr = rb*sx; bzx = c0[0]*sx; bzy = ch - c0[1]*sx; blzAt = { x: c0[0], y: c0[1], r: rb, k: blz.k }; } else blzAt = null;
      gl.uniform1f(u.uBlaze, blz.k*birdK*birdIn); gl.uniform1f(u.uBlazeR, bzr); gl.uniform2f(u.uBlazeP, bzx, bzy);
      gl.uniform1f(u.uGuardK, Math.max(jl.guard, blz.k*birdK*birdIn)); gl.uniform1f(u.uFieldK, jl.fieldK); }
    gl.uniform1f(u.uDay, LK.dayNow); gl.uniform3fv(u.uDayBg, LK.dayBg); gl.uniform3fv(u.uDayInk, LK.dayInk); gl.uniform3fv(u.uSignal, LK.signal || LK.dayInk);
    gl.uniform1f(u.uShellA, 0.22); gl.uniform1f(u.uRidgeK, 30.0); gl.uniform1f(u.uPilK, 3.0);
    gl.uniform4f(u.uAxis, axis.x0*sx, axis.y0*sx, axis.x1*sx, axis.y1*sx); gl.uniform1f(u.uAxisW, axis.on ? Math.max(1.5, axis.w*sx) : 0); gl.uniform1f(u.uWashT, 0.06);
    gl.uniform1f(u.uMorphK, morph.kind === 2 ? morph.amount : 0);
    gl.uniform2f(u.uPx1, 1/cw, 1/ch); gl.uniform2f(u.uRing, 2.5*sx/cw, 2.5*sx/ch);
    { // the rim: where the sphere's silhouette falls, in device px, while the sphere is whole and large enough to have one
      const o = sphereOnScreen(camEye, cam.t, cam.roll, 1), pres = fieldOn*intro*intro*(1 - jl.spread)*(1 - smooth01(0, 0.25, morph.kind === 2 ? morph.amount : 0))
        *(1 - 0.9*jl.ember)*(1 - jl.white)*(1 - jl.others)*smooth01(7, 16, o.r);   // v3-precision: from r 7 (was 10), so the phone's bead (scene 6) keeps its ink rim
      gl.uniform4f(u.uRim, o.x*sx, o.y*sx, o.r*sx, 0); gl.uniform1f(u.uRimA, 0.6*pres); }
    quadTo(null);
    if (probe && (probe.tick = (probe.tick || 0) + 1) % 3 === 0) sampleProbe();
  }

  // a held moment: clear the trails and simulate 1.5 s at 60 fps up to it (the still hook, reduced motion, a seek)
  // the flame strokes' range in the bird's own light (test hook ?fl=lo,hi)
  const FLQ = (new URLSearchParams(location.search).get('fl') || '').split(',').map(Number);
  const FL_LO = Number.isFinite(FLQ[0]) && FLQ.length === 2 ? FLQ[0] : 0.12, FL_HI = Number.isFinite(FLQ[1]) && FLQ.length === 2 ? FLQ[1] : 0.45;
  const REDUCED_T = Number.isFinite(opts.reducedT) ? opts.reducedT : 6.2;
  function hold(t){
    [acc, birdRT].forEach(clearRT);
    const s0 = speedGoal; speed = speedGoal = 1; dim = dimGoal; birdK = birdGoal; intro = 1; Object.assign(camF, frame);
    simT = t - 1.5; for (let i = 0; i < 90; i++) tick(1/60);
    speed = speedGoal = s0;
  }

  // the probe (?probe=1): the brightest light under each of the page's text boxes, over as long as it runs
  let probe = null;
  function sampleProbe(){
    const buf = new Uint8Array(4*64*64), sx = cw/vw, sy = ch/vh;
    for (const b of probe.boxes) {
      const x0 = Math.max(0, Math.floor(b.x*sx)), y0 = Math.max(0, Math.floor(b.y*sy)), x1 = Math.min(cw, Math.ceil((b.x + b.w)*sx)), y1 = Math.min(ch, Math.ceil((b.y + b.h)*sy));
      for (let ty = y0; ty < y1; ty += 64) for (let tx = x0; tx < x1; tx += 64) {
        const w = Math.min(64, x1 - tx), h = Math.min(64, y1 - ty);
        gl.readPixels(tx, ch - ty - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        for (let i = 0; i < w*h; i++) {
          const L = 0.2126*buf[i*4] + 0.7152*buf[i*4+1] + 0.0722*buf[i*4+2];
          if (L > b.max) { b.max = L; b.at = +simT.toFixed(2); }
          if (L > 60) b.hot++;
          b.n++;
        }
      }
    }
    probe.frames++;
  }

  // the loop: runs while the canvas is on screen and the tab is visible; reduced motion draws one held pose
  let running = false, raf = 0, last = 0, visible = !document.hidden, onScreen = true, slowFrame = false, skip = 0, lost = false;
  const times = []; let lastMs = 0, fastRuns = 0;
  function measure(ms){
    times.push(ms); if (times.length < 90) return;
    const sorted = times.slice().sort((a, b) => a - b), med = sorted[45], lo = sorted[9]; times.length = 0;
    const capped = Math.abs(med - 1000/30) < 2 && lo > 30;           // a steady 30 Hz is the display's pace, not load
    const zooming = performance.now() - zoomAt < 2500 || cam.z < 0.8;  // a zoom alone never costs resolution
    if (autoQ && med > 22 && !capped && !zooming && !slowFrame && lvl < LEVELS.length - 1) { lvl++; resize(); fastRuns = 0; }
    else if (autoQ && !phone && med < 11 && lvl > lvlFloor && ++fastRuns >= 3) { lvl--; resize(); fastRuns = 0; }
  }
  const held = () => STILL !== null || reduced;
  let needHold = false;
  const external = !!opts.external;   // the page drives frames (frame(now)), so the spine and the sphere move in one frame
  function loop(now){
    if (!external) raf = requestAnimationFrame(loop);
    if (lost || gl.isContextLost()) return;
    if (resize() && held()) { hold(STILL ?? REDUCED_T); return; }
    if (held()) { if (needHold) { needHold = false; hold(STILL ?? REDUCED_T); } else composite(); return; }
    // behind the sections the field runs at half the frame rate: it is faint and slow, so nobody sees the difference
    if (slowFrame && !drag && (skip = (skip + 1) % 2)) return;
    const ms = Math.min(now - last, 100); last = now; lastMs = ms; measure(ms);
    tick(Math.min(ms/1000, 0.05));
  }
  function start(){ if (external || running || !visible || !onScreen) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
  function stop(){ running = false; cancelAnimationFrame(raf); }
  function wake(){ if (held()) needHold = true; }
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; last = performance.now(); visible ? start() : stop(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { onScreen = es[0].isIntersecting; onScreen ? start() : stop(); }).observe(cv);
  // iOS can drop the GL context (memory pressure, a long time in the background): stop, then rebuild everything
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
  cv.addEventListener('webglcontextrestored', () => { probeFloat(); buildGL(); TW = TH = 0; acc = acc2 = birdRT = half = q1 = q2 = bq1 = bq2 = null; rig.resetChains(); resize();
    warm(WARM); lost = false; last = performance.now(); if (held()) needHold = true; });

  if (held()) hold(STILL ?? REDUCED_T);
  start();

  return {
    // where the sphere sits (CSS pixels of the viewport). glide: how fast the move eases (per second); Infinity cuts
    setFrame(cx, cy, rpx, glide = 6){
      frame.x = cx/vw; frame.y = cy/vh; frame.r = rpx/vh; glideK = glide;
      if (!framed || held() || glide === Infinity) Object.assign(camF, frame);   // the first framing is a cut, not a glide
      framed = true; orbBox = '';
      if (held()) needHold = true;
    },
    // the art box light may fall in (CSS pixels from the top left) and its feather
    setBox(x0, y0, x1, y1, f = 48){ Object.assign(box, { x0, y0, x1, y1, f }); orbBox = ''; },
    // text blocks light must stay off: [[x0, y0, x1, y1], ...] in CSS pixels, at most 24 (the rest are ignored)
    setHide(rects){ hideN = Math.min(MAX_HIDE, rects.length); for (let i = 0; i < hideN; i++) { const r = rects[i]; hide.set([r[0], r[1], r[2], r[3]], i*4); hideA[i] = r.length > 4 ? Math.max(0, Math.min(1, r[4])) : 1; } },
    setDim(k){ dimGoal = k; }, setBird(k){ birdGoal = k; },
    setSpeed(k){ speedGoal = k; slowFrame = k < 0.6; },
    // setFlight([x0, y0, x1, y1]) the box the bird stays inside (CSS px), or null for none (round 7)
    // setAxis([x0, y0, x1, y1], halfWidth) the pillar's light only on this segment (CSS px), or null to unclip (v3-r2, M33)
    setAxis(seg, w = 6){ if (!seg) { axis.on = false; return; } axis.on = true; [axis.x0, axis.y0, axis.x1, axis.y1] = seg; axis.w = w; },
    setFlight(r){ if (!r) { flight.on = false; return; } flight.on = true; [flight.x0, flight.y0, flight.x1, flight.y1] = r; },
    // round 7 (H3, M40): drawn into the pole the bird is still on screen: the rest of it streaming in, then the knot of
    // embers it leaves there until the rebirth's first frame
    get birdBox(){ const vp = viewProj(camEye, cam.t, cam.roll), F = birdBox(vp, bird);   /* v3-r5 (M40): also in a close-up */
      if (bird.absorb < 0.35) return F;
      const e = bird.emb || 0, m = smooth01(0.35, 1, bird.absorb); if (m >= 0.999 && e < 0.02) return null;
      const K = emberBox(vp, bird); return { x0: F.x0 + (K.x0 - F.x0)*m, y0: F.y0 + (K.y0 - F.y0)*m, x1: F.x1 + (K.x1 - F.x1)*m, y1: F.y1 + (K.y1 - F.y1)*m }; },
    get dimNow(){ return dim; }, get fieldK(){ return jl.fieldK; }, get emberK(){ return bird.emb || 0; },   // round 7 test hooks
    get blazeAt(){ return blzAt; },
    get flight(){ return flight.on ? [flight.x0, flight.y0, flight.x1, flight.y1] : null; },
    get birdShown(){ return birdK*dim; },
    setInteractive(on){ if (interactive === !!on) return; interactive = !!on; if (!on) { ptrs.clear(); drag = null; } orbBox = ''; },
    onFirstUse(f){ onUsed = f; },
    get sphere(){ return orbInfo; },
    // v3-r4: the shell's exact silhouette on screen now (CSS px), for the page's word clearance
    get silhouette(){ const o = sphereOnScreen(camEye, cam.t, cam.roll, 1); return { x: o.x, y: o.y, r: o.r }; },
    resetView(){ resetView(); wake(); },
    seek(t){ hold(t); },
    get frameMs(){ return lastMs; },
    get quality(){ return { level: lvl, target: TW + 'x' + TH, particles: rows*W, state: stateFmt === gl.RGBA32F ? 'RGBA32F' : 'RGBA16F' }; },
    bench(n = 120){
      const px1 = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);
      const a = performance.now(); for (let i = 0; i < n; i++) { tick(1/60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); }
      return { msPerFrame: +((performance.now() - a)/n).toFixed(2), particles: rows*W, target: TW + 'x' + TH, level: lvl, state: stateFmt === gl.RGBA32F ? 'RGBA32F' : 'RGBA16F' };
    },
    startProbe(boxes){ probe = { frames: 0, boxes: boxes.map(b => ({ ...b, max: 0, hot: 0, n: 0 })) }; },
    readProbe(){ return probe && { frames: probe.frames, boxes: probe.boxes.map(b => ({ name: b.name, max: Math.round(b.max), at: b.at, hotShare: +(b.hot/Math.max(1, b.n)).toFixed(5) })) }; },
    run(n, dt = 1/60){ for (let i = 0; i < n; i++) tick(dt); },
    // ---- the scroll API (for a scroll-driven story) ----
    // setCamera: any of { yaw, pitch, roll (radians), dist (a factor on the framed distance: 1 = home, 0.5 = twice as
    // close), target ([x, y, z] in sphere units, the point the camera orbits) }; cut true jumps, otherwise it eases (10/s)
    setCamera(v, cut = false){
      const g = { ...v }; if ('dist' in g) { g.z = clamp(g.dist, ZMIN(), ZMAX*2); delete g.dist; } if (g.target) { g.t = g.target.slice(); delete g.target; }
      Object.assign(goal, g); if (cut) Object.assign(cam, g, g.t ? { t: g.t.slice() } : {}); if (held()) needHold = true; },
    getCamera(){ return { yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll, dist: cam.z, target: cam.t.slice() }; },
    // setField: { dim (0..1 brightness of all light), speed (time scale of the flow and the bird), bird (0..1 the bird's
    // and its embers' brightness) }; each eases over about a third of a second
    setField({ dim: d, speed: s, bird: b } = {}){ if (d !== undefined) dimGoal = d; if (s !== undefined) speedGoal = s; if (b !== undefined) birdGoal = b; },
    // half the frame rate (only where the field is faint and slow, behind running text)
    setThrottle(on){ slowFrame = !!on; },
    // one frame, when the page drives (opts.external)
    frame(now){ if (visible) loop(now); else last = now; },
    // the whole journey pose at once, no easing (the page smooths the scroll): frame [cx, cy, rpx], cam { yaw, pitch,
    // roll, dist }, dim, speed, bird, lift, spread, lit [5], pillar, ember, others, morph (the mark), white, exit,
    // loopT (seconds or null), cap (the brightest any light may get, 0.72 to 1)
    setPose(P){
      if (P.frame) { frame.x = P.frame[0]/vw; frame.y = P.frame[1]/vh; frame.r = P.frame[2]/vh; Object.assign(camF, frame); framed = true; orbBox = ''; }
      if (P.cam) { const g = { yaw: P.cam.yaw, pitch: P.cam.pitch, roll: P.cam.roll || 0, z: clamp(P.cam.dist ?? 1, 0.2, 4) };
        Object.assign(goal, g); Object.assign(cam, g); goal.t = [0, 0, 0]; cam.t = [0, 0, 0]; spinV = pitchV = rollV = 0; }
      if (P.dim !== undefined) dim = dimGoal = P.dim;
      if (P.speed !== undefined) speed = speedGoal = P.speed;
      if (P.bird !== undefined) birdK = birdGoal = P.bird;
      for (const k of ['axisOff', 'spread', 'pillar', 'ember', 'others', 'white', 'exit', 'lift', 'cap', 'shimmer', 'birdScale', 'fieldK', 'guard']) if (P[k] !== undefined) jl[k] = P[k];
      if (P.lit) jl.lit.set(P.lit);
      if (P.bandOff) jl.bandOff.set(P.bandOff); if (P.bandFloor !== undefined) jl.bandFloor = P.bandFloor;
      if (P.morph !== undefined) { morph.kind = P.morph > 0 ? 2 : 0; morph.amount = clamp(P.morph, 0, 1); }
      if ('loopT' in P) timeLock = P.loopT === null ? null : +P.loopT;
      if (held()) needHold = true;
    },
    setParallax(on){ parallax = !!on; },
    // round 6 (U42): fly the bird along the page's path ({ k, x, y, dx, dy, w, bank }; k 0 gives it back to the lap)
    setFly(o){ Object.assign(fly, o || { k: 0 }); },
    get blaze(){ return +blz.k.toFixed(3); },
    // setLook (round 6): { day 0 or 1, ink, ink2, tint, pillar, spark, bgC, bgE, peak, dayBg, dayInk, halo, haloK,
    // inkMax, vig }; cut true switches at once (first paint, reduced motion), otherwise day fades over about 0.3 s
    setLook(L, cut = false){ Object.assign(LK, L); if (cut || held()) LK.dayNow = LK.day; if (held()) needHold = true; },
    // the trails cleared, for a cut between two scenes while the sphere is out (one sphere on screen at a time)
    clearTrails(){ [acc, acc2, birdRT].forEach(clearRT); },
    // where a point of the sphere's space lands on screen, in CSS pixels, with the pose set last
    project(p){
      const vp = viewProj(currentEye(), cam.t, cam.roll), w = vp[3]*p[0] + vp[7]*p[1] + vp[11]*p[2] + vp[15];
      return [((vp[0]*p[0] + vp[4]*p[1] + vp[8]*p[2] + vp[12])/w*0.5 + 0.5)*vw, (0.5 - (vp[1]*p[0] + vp[5]*p[1] + vp[9]*p[2] + vp[13])/w*0.5)*vh];
    },
    // the camera's right and up, for laying things beside the sphere
    get basis(){ const e = currentEye(), f = norm(sub(cam.t, e)), r = norm(cross(f, [0, 1, 0])); return { r, u: cross(r, f), f }; },
    // the framed radius (CSS px) at which one sphere unit is ppu pixels at the centre, for laying the mark on the page's
    radiusForUnitPx(ppu){ const D = (vh/2)/(ppu*Math.tan(FOV/2)), a = Math.tan(Math.asin(Math.min(0.999, SPHERE_R/D))); return a/(2*Math.tan(FOV/2))*vh; },
    get viewH(){ return vh; },
    // draws the current pose held (warm sim) and copies a region of it into a 2D canvas: for the reduced motion stills
    still(t, ctx2d, sx, sy, sw, sh){ hold(t); const k = cw/vw; ctx2d.drawImage(cv, sx*k, sy*k, sw*k, sh*k, 0, 0, ctx2d.canvas.width, ctx2d.canvas.height); },
    // setLoopTime: pin the bird's 16 s loop to a time in seconds (for scrubbing it from the scroll), or null to free it
    setLoopTime(t){ timeLock = t === null || t === undefined ? null : +t; if (held()) needHold = true; },
    get loopTime(){ return ((simT % PERIOD) + PERIOD) % PERIOD; },
    get simTime(){ return simT; },
    get lockT(){ return timeLock; },   // the loop's own clock (life A on even loops, B on odd: bird.js)
    // v3-r5 (camera.js, from wordmark-motion's engine): the bird's own frame in the sphere's space, for close-ups
    get birdFrame(){ return { C: bird.C.slice(), S: bird.S.slice(), U: bird.U.slice(), F: bird.F.slice(), scale: bird.scale, absorb: bird.absorb, life: bird.life || 0 }; },
    get birdState(){ return { T: +simT.toFixed(2), tau: +bird.tau.toFixed(3), life: +(bird.life || 0).toFixed(2), absorb: +bird.absorb.toFixed(2), form: +bird.form.toFixed(2), shown: +(birdK*birdIn*Math.max(dim, fly.k)).toFixed(2) }; },
    // setMorph: reshape the field's particle targets. kind 'bands' (the mark's five split bands) or 'none'; amount
    // 0..1 how strongly particles are pulled to the new shape (0 is the free flow; it eases back as it drops)
    // setMarkRects: the mark the field condenses into, as the page's mark file draws it: [{ x, y, w, h, rx }] in the
    // file's units (y down). Laid 28 grid units across its ink, centred on the ink; a thin rect (the spine's line) gets
    // 2.5 times its area's share of particles so it reads as a line of light, not a gap.
    setMarkRects(list){
      const rs = list.slice(0, MAX_MK); if (!rs.length) return;
      const x0 = Math.min(...rs.map(r => r.x)), x1 = Math.max(...rs.map(r => r.x + r.w));
      const y0 = Math.min(...rs.map(r => r.y)), y1 = Math.max(...rs.map(r => r.y + r.h));
      const g = (x1 - x0)/28, cx = (x0 + x1)/2, cy = (y0 + y1)/2;
      const wt = rs.map(r => r.w*r.h*(r.w < r.h*0.2 ? 2.5 : 1)), tot = wt.reduce((a, b) => a + b, 0);
      let acc = 0; mk.n = rs.length;
      rs.forEach((r, i) => { mk.r.set([(r.x - cx)/g, (cy - r.y - r.h)/g, (r.x + r.w - cx)/g, (cy - r.y)/g], i*4);
        mk.rx[i] = Math.min(r.rx || 0, r.h/2, r.w/2)/g; acc += wt[i]/tot; mk.w[i] = i === rs.length - 1 ? 1 : acc; });
    },
    setMorph(kind, amount = 1){ morph.kind = kind === 'bands' ? 1 : 0; morph.amount = morph.kind ? clamp(amount, 0, 1) : 0; },
    // test hook: turn and zoom the view at once (yaw and pitch in radians, z a zoom factor)
    view(v){ Object.assign(goal, v); Object.assign(cam, v); if (held()) needHold = true; },
  };
}
