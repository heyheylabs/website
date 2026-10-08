#!/usr/bin/env bash
# Copy the landing page from a pulled heyheylabs/design clone into docs/. Usage: scripts/sync.sh [design-clone]
set -euo pipefail
D="${1:-$HOME/code/design}/2026-10-07-hhl-landing-revive"
cd "$(dirname "$0")/.."
git -C "$D/.." pull --rebase -q
rm -rf docs && mkdir -p docs/vendor
cp "$D"/{index.html,page.css,page.js,hero.js,bird.js,favicon.svg,mark.svg} docs/
cp "$D"/vendor/*.js docs/vendor/
# This repo's own files: robots.txt, sitemap.xml, llms.txt, .well-known/security.txt, og.png
cp -R static/. docs/
# Drop the review-only scheme switch; add this repo's search and sharing tags (head-seo.html) before </head>
python3 - docs/index.html head-seo.html <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read(); seo = open(sys.argv[2]).read()
s, n = re.subn(r'\s*<!-- review only:.*?</fieldset>', '', s, flags=re.S)
assert n == 1, 'the review-only scheme switch was not found exactly once'
assert s.count('</head>') == 1 and 'rel="canonical"' not in s, 'expected one </head> and no canonical from design'
s = s.replace('</head>', seo + '</head>')
open(p, 'w').write(s)
PY
echo heyheylabs.com.au > docs/CNAME
touch docs/.nojekyll
echo "synced from design $(git -C "$D/.." rev-parse --short HEAD)"
