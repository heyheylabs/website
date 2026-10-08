#!/usr/bin/env python3
"""Keep nginx.conf's Content-Security-Policy in step with docs/index.html. Usage: scripts/csp.py [--write]

The CSP admits no 'unsafe-inline'. Instead it lists a sha256 hash for each inline <script> in index.html (the theme
bootstrap in <head>) and for each distinct style="" attribute value (the scenes' --len). A browser refuses anything
whose hash is not listed, so a sync that changes either without updating nginx.conf would break the live page.
  --check (default): exit 1 unless nginx.conf carries exactly these hashes. CI runs this before the image build.
  --write: rewrite the two hash lists in nginx.conf. scripts/sync.sh runs this after every sync.
CSSOM writes (el.style.x = ..., GSAP's cssText) are not governed by CSP, so page.js and hero.js need nothing here.
"""
import base64, hashlib, html, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE, CONF = ROOT / 'docs/index.html', ROOT / 'nginx.conf'


def sha(text):
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode('utf-8')).digest()).decode() + "'"


def wanted():
    s = PAGE.read_text(encoding='utf-8')
    tags = re.findall(r'<script\b([^>]*)>(.*?)</script>', s, flags=re.S | re.I)
    # a script's hash covers the exact text between the tags; no entity decoding applies inside <script>
    scripts = [sha(body) for attrs, body in tags if not re.search(r'\bsrc\s*=', attrs, flags=re.I)]
    # an attribute is hashed after entity decoding, as the browser sees it
    styles = sorted({sha(html.unescape(v)) for v in re.findall(r'\sstyle\s*=\s*"([^"]*)"', s, flags=re.I)})
    if re.search(r"\sstyle\s*=\s*'", s, flags=re.I) or re.search(r'\son[a-z]+\s*=', s, flags=re.I):
        sys.exit('csp.py: index.html has a single-quoted style or an inline on* handler; extend this script first')
    return scripts, styles


def directive(conf, name):
    m = re.search(r"\b" + re.escape(name) + r"\s([^;\"]*)", conf)
    if not m:
        sys.exit(f'csp.py: nginx.conf CSP has no {name} directive')
    return m


def main():
    scripts, styles = wanted()
    conf = CONF.read_text(encoding='utf-8')
    want = {'script-src': ["'self'"] + scripts, 'style-src-attr': (["'unsafe-hashes'"] + styles) if styles else ["'none'"]}
    if '--write' in sys.argv[1:]:
        for name, tokens in want.items():
            m = directive(conf, name)
            conf = conf[:m.start(1)] + ' '.join(tokens) + conf[m.end(1):]
        CONF.write_text(conf, encoding='utf-8')
        print(f'csp.py: wrote {len(scripts)} script and {len(styles)} style-attribute hash(es) into nginx.conf')
        return
    bad = []
    for name, tokens in want.items():
        have = directive(conf, name).group(1).split()
        if have != tokens:
            bad.append(f'  {name}\n    nginx.conf: {" ".join(have)}\n    index.html: {" ".join(tokens)}')
    if bad:
        sys.exit('csp.py: nginx.conf CSP does not match docs/index.html; run scripts/csp.py --write\n' + '\n'.join(bad))
    print(f'csp.py: ok, {len(scripts)} inline script(s) and {len(styles)} style attribute value(s) hashed')


if __name__ == '__main__':
    main()
