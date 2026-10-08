#!/usr/bin/env bash
# Copy the landing page from a pulled heyheylabs/design clone into docs/.
# Usage: scripts/sync.sh [design-clone] [page folder inside 2026-10-07-hhl-landing-revive]
# The page on the site is variants/v3-r5-live (the Thu 8 Oct v3-r5 fix round; LIVE.md) since Fri 9 Oct 2026 (Tim: "push landing page designs that have done"):
# the fix round over v3, the blind-ranked winner. The favicon always comes from the folder's root (the t01 cut).
set -euo pipefail
R="${1:-$HOME/code/design}/2026-10-07-hhl-landing-revive"
V="${2:-variants/v3-r5-live}"
D="$R/$V"
cd "$(dirname "$0")/.."
git -C "$R/.." pull --rebase -q
rm -rf docs && mkdir -p docs/vendor
cp "$D"/{index.html,page.css,page.js,hero.js,bird.js,mark.svg} docs/
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
echo "synced $V from design $(git -C "$R/.." rev-parse --short HEAD)"
