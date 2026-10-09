// camera.js (v3-r5, Fri 9 Oct 2026): the phoenix is the hero throughout (ledger M38). Between the scenes' wide shots
// the camera leaves the sphere and goes in close on the bird, then comes back out to the next scene's wide shot, so the
// bird carries every hand-over:
//   2 to 3  the flame phoenix's head, as it comes down to circle the pillar
//   3 to 4  its plumes, the long silk tail streaming behind it before the fall
//   4 to 5  the rebirth: the fenghuang's head and crest as it rises whole over the top pole
//   6 to 7  the fenghuang's last pass, head and plumes, before the sphere becomes the mark
// How: a close-up scales the whole pose's frame (the sphere, its axis and the bird together, one camera) about the
// subject, so the subject lands on a fixed point of the screen and grows ZOOM times. The subject's place is read from
// the engine every frame as an offset from the sphere's centre in units of its radius (independent of the zoom, so
// there is no feedback), and the close-up's weight rises and falls inside the hand-over's middle: the wide shots at
// either end are exactly the scenes' own poses. The words: every block of copy is in transit during a hand-over and is
// faded by page.js's clearWords long before the enlarged sphere reaches it (M19, M33: never over text), and the flight
// box is released during a close-up (a close camera crops the bird; the box would shrink it back).
// The spine stays the sphere's axis (M33): it is drawn from the same projection, so it scales with the shot.
// Test hooks: ?cam=0 turns the close-ups off (the v3-r4 hand-overs, for comparison); ?camk=<0..2> scales every zoom.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const lerp = (a, b, t) => a + (b - a)*t;

// the shots: hand-over (from scene a to b) -> subject, zoom, where the subject lands (fractions of the screen), and the
// close-up's rise and fall inside the hand-over's progress t (0..1)
export const SHOTS = {
  '2>3': { subject: 'head', zoom: 3.0, at: [0.5, 0.46], rise: [0.12, 0.42], fall: [0.62, 0.9] },
  // '3>4' (the plumes) is off: that hand-over runs behind the stack section, its art held at 22%
  '4>5': { subject: 'crown', zoom: 2.6, at: [0.5, 0.42], rise: [0.1, 0.4], fall: [0.6, 0.9] },
  '6>7': { subject: 'head', zoom: 2.8, at: [0.5, 0.44], rise: [0.08, 0.4], fall: [0.58, 0.88] },
};

// the subject's point in the sphere's space, from the bird's own frame (hero.birdFrame): C, S, U, F, scale, life
function subjectPoint(kind, b){
  if (!b) return null;
  const at = (x, y, z) => [0, 1, 2].map(i => b.C[i] + (b.S[i]*x + b.U[i]*y + b.F[i]*z)*b.scale);
  const life = b.life || 0;
  if (kind === 'head') return at(0, lerp(0.135, 0.33, life), lerp(0.54, 0.585, life));       // bird.js headPos
  if (kind === 'plumes') return at(0, 0.02, -1.25 - 0.6*life);                              // a third down the tail
  if (kind === 'crown') return life > 0.5 && b.absorb < 0.2 ? at(0, 0.3, 0.45) : [0, 1.66, 0];   // the new bird, else the top pole
  return b.C;
}

export function createCamera({ hero, query }){
  const off = query.get('cam') === '0', K = query.has('camk') ? clamp(+query.get('camk'), 0, 2) : 1;
  let last = null, weight = 0, shotKey = '';
  const st = { weight: 0, shot: '', zoom: 1 };
  // pose: the page's pose for this frame (frame [x, y, r] in CSS px); g: the segment (kind 'blend', a, b), t its progress
  function apply(pose, g, t, vw, vh){
    weight = 0; shotKey = '';
    if (off || !hero || !pose.frame || g.kind !== 'blend') { last = pose.frame.slice(); st.weight = 0; st.shot = ''; st.zoom = 1; return pose; }
    const key = `${g.a}>${g.b}`, S = SHOTS[key];
    if (!S) { last = pose.frame.slice(); st.weight = 0; st.shot = ''; st.zoom = 1; return pose; }
    // on a phone the words sit under the sphere, so a close-up empties the screen of words: there it is shorter (the
    // middle third of the hand-over) and closer to the wide shot (60% of the zoom), to keep the wordless stretch short
    const ph = vw < 600, R0 = ph ? [0.3, 0.45] : S.rise, F0 = ph ? [0.55, 0.7] : S.fall;
    const w = smooth(R0[0], R0[1], t)*(1 - smooth(F0[0], F0[1], t));
    const bf = hero.birdFrame, P = subjectPoint(S.subject, bf);
    if (!P || w < 1e-3) { last = pose.frame.slice(); st.weight = 0; st.shot = key; st.zoom = 1; return pose; }
    // the subject's offset from the sphere's centre, in radii, under the frame drawn last frame
    const ref = last || pose.frame, s = hero.project(P);
    const o = [(s[0] - ref[0])/Math.max(1, ref[2]), (s[1] - ref[1])/Math.max(1, ref[2])];
    if (!o.every(Number.isFinite) || Math.hypot(o[0], o[1]) > 6) { last = pose.frame.slice(); return pose; }
    const Z = 1 + (S.zoom*K - 1)*(ph ? 0.6 : 1)*w, r = pose.frame[2]*Z;
    const T = [S.at[0]*vw, S.at[1]*vh];
    const cx = lerp(pose.frame[0], T[0] - o[0]*r, w), cy = lerp(pose.frame[1], T[1] - o[1]*r, w);
    const out = { ...pose, frame: [cx, cy, r], closeUp: w };
    last = out.frame.slice(); weight = w; shotKey = key;
    st.weight = +w.toFixed(3); st.shot = key; st.zoom = +Z.toFixed(2);
    return out;
  }
  return { apply, get state(){ return { ...st }; }, get weight(){ return weight; }, get shot(){ return shotKey; } };
}
