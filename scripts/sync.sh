#!/usr/bin/env bash
# Copy the landing page from a pulled heyheylabs/design clone into docs/. Usage: scripts/sync.sh [design-clone]
set -euo pipefail
D="${1:-$HOME/code/design}/2026-10-07-hhl-landing-revive"
cd "$(dirname "$0")/.."
git -C "$D/.." pull --rebase -q
rm -rf docs && mkdir -p docs/vendor
cp "$D"/{index.html,page.css,page.js,hero.js,bird.js,favicon.svg,mark.svg} docs/
cp "$D"/vendor/*.js docs/vendor/
python3 - docs/index.html <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s, n = re.subn(r'\s*<!-- review only:.*?</fieldset>', '', s, flags=re.S)
assert n == 1, 'the review-only scheme switch was not found exactly once'
open(p, 'w').write(s)
PY
echo heyheylabs.com.au > docs/CNAME
touch docs/.nojekyll
# the CSP admits the inline script and style attributes by hash: rewrite those hashes in nginx.conf
python3 scripts/csp.py --write
echo "synced from design $(git -C "$D/.." rev-parse --short HEAD)"
