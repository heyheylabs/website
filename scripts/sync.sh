#!/usr/bin/env bash
# Copy the landing page from a pulled heyheylabs/design clone into docs/.
# Usage: scripts/sync.sh [design-clone] [page folder inside 2026-10-07-hhl-landing-revive]
# The page on the site is variants/v3-r5 (the integration round: T2c type, Hairline wordmark, fh8 bird, Glint close) since
# Fri 9 Oct 2026 ~14:3x (Tim: "Push latest designs and update site"); before that variants/v3-r5-live.
# the fix round over v3, the blind-ranked winner. The favicon always comes from the folder's root (the t01 cut).
set -euo pipefail
R="${1:-$HOME/code/design}/2026-10-07-hhl-landing-revive"
V="${2:-variants/v3-r5}"
D="$R/$V"
cd "$(dirname "$0")/.."
# Pull when the design clone is on a branch; a detached worktree at origin/main is already the source wanted
if git -C "$R/.." symbolic-ref -q HEAD >/dev/null; then git -C "$R/.." pull --rebase -q; fi
rm -rf docs && mkdir -p docs/vendor
cp "$D"/index.html "$D"/page.css "$D"/*.js "$D"/mark.svg docs/
# v3-r5 vendors its fonts (OFL, latin) and reads two logos from the design folder's shared assets/
if [ -d "$D/fonts" ]; then mkdir -p docs/fonts && cp "$D"/fonts/*.woff2 "$D"/fonts/*.css docs/fonts/; fi
if [ -d "$D/wordmark" ]; then mkdir -p docs/wordmark && cp "$D"/wordmark/*.svg docs/wordmark/; fi
if grep -q '\.\./\.\./assets/' "$D/index.html"; then
  mkdir -p docs/assets
  for f in $(grep -oE '\.\./\.\./assets/[A-Za-z0-9._-]+' "$D/index.html" | sort -u); do cp "$R/${f#../../}" docs/assets/; done
  sed -i.bak 's|\.\./\.\./assets/|assets/|g' docs/index.html && rm docs/index.html.bak
fi
cp "$R"/favicon.svg docs/
cp "$D"/vendor/*.js docs/vendor/
# This repo's own files: robots.txt, sitemap.xml, llms.txt, .well-known/security.txt, og.jpg, the icon set
cp -R static/. docs/
# Drop the review-only scheme switch if the page has one; add this repo's search and sharing tags (head-seo.html)
python3 - docs/index.html head-seo.html <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read(); seo = open(sys.argv[2]).read()
s, n = re.subn(r'\s*<!-- review only:.*?</fieldset>', '', s, flags=re.S)
assert n <= 1, 'more than one review-only scheme switch'
assert s.count('</head>') == 1 and 'rel="canonical"' not in s, 'expected one </head> and no canonical from design'
s = s.replace('</head>', seo + '</head>')
open(p, 'w').write(s)
PY
echo heyheylabs.com.au > docs/CNAME
touch docs/.nojekyll
# the CSP admits the inline script and style attributes by hash: rewrite those hashes in nginx.conf
python3 scripts/csp.py --write
echo "synced $V from design $(git -C "$R/.." rev-parse --short HEAD)"
