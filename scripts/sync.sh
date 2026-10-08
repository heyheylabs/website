#!/usr/bin/env bash
# Copy the landing page from a pulled heyheylabs/design clone into site/. Usage: scripts/sync.sh [design-clone]
set -euo pipefail
D="${1:-$HOME/code/design}/2026-10-07-hhl-landing-revive"
cd "$(dirname "$0")/.."
git -C "$D/.." pull --rebase -q
rm -rf site && mkdir -p site/vendor
cp "$D"/{index.html,page.css,page.js,hero.js,bird.js,favicon.svg,mark.svg} site/
cp "$D"/vendor/*.js site/vendor/
python3 - site/index.html <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s, n = re.subn(r'\s*<!-- review only:.*?</fieldset>', '', s, flags=re.S)
assert n == 1, 'the review-only scheme switch was not found exactly once'
open(p, 'w').write(s)
PY
echo heyheylabs.com.au > site/CNAME
touch site/.nojekyll
echo "synced from design $(git -C "$D/.." rev-parse --short HEAD)"
