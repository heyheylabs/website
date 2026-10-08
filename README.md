# heyheylabs.com.au

The public HEY HEY LABS website, served by GitHub Pages from `docs/`. Interim hosting (Tim, Thu 8 Oct 2026: "Pages now,
Asimov later"); the page moves to an Asimov tenant later, and the registrar records move with it.

The source of truth is `heyheylabs/design`, folder `2026-10-07-hhl-landing-revive/`. Never edit `docs/` by hand:
run `scripts/sync.sh` from a pulled design clone, commit, push. The sync drops the review-only colour scheme switch.

## The Asimov image (HHL-WEB-4)

The same `docs/` also ships as an nginx image, for the move to Asimov. Nothing here changes Pages.

1. **Build.** `Dockerfile` copies `docs/` (minus `CNAME` and `.nojekyll`, see `.dockerignore`) onto
   `nginxinc/nginx-unprivileged`, pinned by tag and digest. It serves on 8080 as uid 101, and writes only under `/tmp`,
   so it runs with a read-only root filesystem. Try it: `docker build -t site . && docker run --rm -p 8080:8080
   --read-only --tmpfs /tmp site`.
2. **Headers.** `nginx.conf` sets them in one server block: `no-cache` plus ETag on the page, an hour on css, js and
   svg, nosniff, a referrer policy, HSTS for a year (no subdomains, no preload) and a CSP with no `unsafe-inline`.
3. **CSP hashes.** The inline theme script and the scenes' `style="--len: …"` attributes are admitted by sha256.
   `scripts/sync.sh` rewrites the hashes (`scripts/csp.py --write`); CI refuses to build when they drift
   (`scripts/csp.py`). Never edit the hash lists by hand.
4. **Push.** `.github/workflows/image.yml` runs on a push to main touching the site or the image files. It signs in to
   Google Cloud as `web-ci-push@asimov-d78f` through workload identity (repo variables `HHL_WEB_WIF_PROVIDER`,
   `HHL_WEB_PUSH_SA`) and pushes `australia-southeast1-docker.pkg.dev/asimov-d78f/platform-web/site:<git sha>`. The
   digest is in the run's summary. It is skipped until the repo variable `HHL_WEB_IMAGE_CD` is `on`.
5. **Deploy.** A push deploys nothing. Copy the digest into a digest-bump PR in `heyheylabs/asimov-platform`
   (`clusters/asimov/platform-web`); once it merges, an operator runs
   `kubectl apply --server-side -k clusters/asimov`.
