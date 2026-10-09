/* HEY HEY LABS landing: "the stack" section, the art veil hook (round 4, round 6; ledger B52, B67). README.md, "The art veil".
   While any of the section's content (.stack-in: heading, logo plate, claims, certifications) is on screen, the host's
   sphere art must read at no more than 25% of its normal strength behind it; off screen it returns to full. The module
   cannot reach the host's art layer (a canvas, a still, another stacking context), so it announces the state three ways
   and the host applies it to its own layer:
     1. <html data-stack-veil="on|deep|off">
     2. <html style="--stack-art: 0.22 | 0.1 | 1"> (0.22 measures at most 25% of full once composited in 8 bits): multiply the art layer's opacity by it, e.g.
        .sphere { opacity: calc(0.42 * var(--stack-art, 1)); transition: opacity 400ms cubic-bezier(0, 0, 0.2, 1); }
     3. window event "stack:veil", detail { on, strength }: for a WebGL uniform or an opacity set from script.
   Round 6: in the night theme the sphere's lit spine is the brightest thing in the art, and at 0.22 it still ran through
   the claim headings. While the claims list is on screen in a dark theme (the section's ink lighter than mid grey), the
   veil goes deeper, to 0.1 ("deep"), so the spine sits under the headings instead of cutting them.
   Round 9: under 600 px the deep veil is 1/7 (about 0.143), so the host's 0.42 night art composites at 0.06, not 0.042:
   at 0.042 a dim phone lost the sphere (B52). Still about 14% of full, inside the 25% ceiling.
   Call HHLStack.init() after the fragment is in the DOM (it runs by itself on DOMContentLoaded when it already is). */
(function () {
  var STRENGTH = 0.22, DEEP = 0.1, DEEP_PHONE = 1 / 7, root = document.documentElement, state = null, level = null, io = null, mo = null;
  var phone = window.matchMedia ? matchMedia('(max-width: 599.98px)') : null;
  var seen = { content: false, claims: false }, section = null;
  function dark() {
    var c = section && getComputedStyle(section).color.match(/\d+(\.\d+)?/g);
    if (!c) return false;
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 128;   // light ink means a dark ground
  }
  function update() {
    var next = !seen.content ? 'off' : (seen.claims && dark() ? 'deep' : 'on');
    var s = next === 'off' ? 1 : next === 'deep' ? (phone && phone.matches ? DEEP_PHONE : DEEP) : STRENGTH;
    if (next === state && s === level) return;
    state = next; level = s;
    root.setAttribute('data-stack-veil', next);
    root.style.setProperty('--stack-art', String(s));
    window.dispatchEvent(new CustomEvent('stack:veil', { detail: { on: next !== 'off', strength: s } }));
  }
  function init() {
    var content = document.querySelector('.stack .stack-in'), claims = document.querySelector('.stack .stack-claims');
    if (!content) return false;
    section = content.closest('.stack');
    if (io) io.disconnect();
    if (mo) mo.disconnect();
    if (!('IntersectionObserver' in window)) { seen.content = true; update(); return true; }   // no observer: hold the art faint
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { seen[e.target === content ? 'content' : 'claims'] = e.isIntersecting; });
      update();
    }, { threshold: 0 });
    io.observe(content);
    if (claims) io.observe(claims);
    // the theme can change under the section (a toggle, the system setting): re-read the ink when it does
    if ('MutationObserver' in window) { mo = new MutationObserver(update); mo.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class'] }); }
    if (window.matchMedia) { var mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', update); if (phone && phone.addEventListener) phone.addEventListener('change', update); }
    return true;
  }
  window.HHLStack = { init: init, strength: STRENGTH, deep: DEEP, deepPhone: DEEP_PHONE, get veiled() { return state; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
