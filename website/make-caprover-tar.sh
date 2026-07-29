#!/bin/bash
#
# make-caprover-tar.sh — build the CapRover deployment tarball for the Zariia website.
#
#   ./make-caprover-tar.sh          builds zariia.tar
#   caprover deploy -n blevn -a zariia -t zariia.tar
#
# Follows the koher convention (stage into a temp dir, tar from inside it) with one
# deliberate difference: **missing critical files are a hard failure, not a warning.**
# The koher scripts skip-with-warning, which is right for optional content. Here it is
# not: if lib/ is missing the tarball still deploys, the site still loads, and only the
# player is dead — the exact shape of failure nobody notices until someone tries to
# unlock a track. So this script exits non-zero rather than printing something.

set -euo pipefail

APP_NAME="zariia"
TAR_FILE="${APP_NAME}.tar"
TMP_DIR="/tmp/${APP_NAME}_deploy_$$"
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR"

cd "$(dirname "$0")"
echo "[build] staging $APP_NAME from $(pwd)"

# ── required: absence of any of these is a broken deploy ────────────────────
REQUIRED_FILES=(
  captain-definition
  Dockerfile
  nginx.conf
  headers.conf
  index.html
  the-object.html
  the-name.html
  historicising.html
  releases.html
  player.html
  curatorial.html
  artists.html
  credits.html
  contact.html
  zariia.css
  fonts.css
  zariia-symbol.svg
  og.png
  favicon.ico
  favicon-source.svg
  favicon-32.png
  apple-touch-icon.png
  icon-512.png
  site.webmanifest
)
REQUIRED_DIRS=( fonts lib img demo )

# ── every required file and directory must ALSO be in the Dockerfile ───────
# 🔴 This is the check that matters most, because the other checks cannot see the
# failure. Three times now (img/ 27 Jul, artists.html 28 Jul, demo/ 29 Jul) something
# was added HERE and not to the Dockerfile. Each time the tarball was correct, every
# tarball guard passed, the deploy said "Deployed successfully", and the file 404'd
# on the live site. Staging a file is not serving it.
dockerfile_missing=0
for f in "${REQUIRED_FILES[@]}"; do
  # nginx.conf/headers.conf are copied by their own line; skip the two config files
  [[ "$f" == "captain-definition" || "$f" == "Dockerfile" || "$f" == "nginx.conf" || "$f" == "headers.conf" ]] && continue
  grep -qF -- "$f" Dockerfile || { echo "[FATAL] $f is required here but absent from the Dockerfile — it would 404 live"; dockerfile_missing=1; }
done
for d in "${REQUIRED_DIRS[@]}"; do
  grep -qE "^COPY[[:space:]]+$d/" Dockerfile || { echo "[FATAL] $d/ is required here but has no COPY line in the Dockerfile — every file in it would 404 live"; dockerfile_missing=1; }
done
[[ $dockerfile_missing -eq 0 ]] || { echo "[FATAL] the tarball and the image would disagree; refusing to build"; exit 11; }
echo "[build] Dockerfile covers every required file and directory"

fail=0
for f in "${REQUIRED_FILES[@]}"; do
  if [[ -f "$f" ]]; then rsync -a "$f" "$TMP_DIR/"; else echo "[FATAL] missing file: $f"; fail=1; fi
done
for d in "${REQUIRED_DIRS[@]}"; do
  if [[ -d "$d" ]]; then rsync -a "$d" "$TMP_DIR/"; else echo "[FATAL] missing directory: $d/"; fail=1; fi
done
[[ $fail -eq 0 ]] || { echo "[FATAL] refusing to build an incomplete tarball"; exit 3; }

# ── checks that have actually caught real breakage ─────────────────────────
# 1. The player is ES modules. No .mjs, no player — and the page looks fine.
mjs_count=$(find "$TMP_DIR/lib" -name '*.mjs' | wc -l | tr -d ' ')
if [[ "$mjs_count" -lt 6 ]]; then
  echo "[FATAL] expected 6 .mjs modules in lib/, found $mjs_count — the player would be dead"; exit 4
fi

# 2. Fonts are self-hosted on purpose: no third-party request, nothing blockable,
#    renders with the network down. A stray Google Fonts <link> silently undoes that.
if grep -rl 'fonts.googleapis.com\|fonts.gstatic.com' "$TMP_DIR"/*.html >/dev/null 2>&1; then
  echo "[FATAL] a page still links Google Fonts — self-hosting is deliberate, see DEPLOY.md"; exit 5
fi
#    Three faces now, split across nine subsets: Antic Didone (display), EB Garamond
#    (running text, six subsets), Cutive Mono (labels). See fonts.css.
woff_count=$(find "$TMP_DIR/fonts" -name '*.woff2' | wc -l | tr -d ' ')
if [[ "$woff_count" -lt 9 ]]; then
  echo "[FATAL] expected 9 woff2 subsets in fonts/, found $woff_count —"
  echo "        a missing EB Garamond subset means running text silently falls back"; exit 6
fi

# 2b. Every ground photograph referenced by a page must actually be in the tarball.
#     img/ was NOT in REQUIRED_DIRS when the photographs were added on 27 July 2026,
#     so the first build after them would have shipped a site with every <img> broken
#     and every band a flat colour — and nothing would have failed. Check the refs,
#     not just the directory, because a page can name a file that was never generated.
missing_img=0
for ref in $(grep -ho "img/[A-Za-z0-9_-]*\.jpg" "$TMP_DIR"/*.html "$TMP_DIR"/*.css | sort -u); do
  [[ -f "$TMP_DIR/$ref" ]] || { echo "[FATAL] page references $ref, which is not staged"; missing_img=1; }
done
[[ $missing_img -eq 0 ]] || exit 8
img_count=$(find "$TMP_DIR/img" -name '*.jpg' | wc -l | tr -d ' ')
echo "[build] $img_count ground images staged"

# 3. headers.conf must be present AND included by nginx.conf in every add_header
#    location, or the CSP silently vanishes from those responses. See headers.conf.
inc=$(grep -c 'include /etc/nginx/conf.d/headers.conf' "$TMP_DIR/nginx.conf" || true)
adds=$(grep -c 'add_header Cache-Control' "$TMP_DIR/nginx.conf" || true)
if [[ "$inc" -lt $((adds + 1)) ]]; then
  echo "[FATAL] nginx.conf has $adds Cache-Control location(s) but only $inc headers.conf include(s)."
  echo "        nginx does NOT inherit add_header into a location that sets its own —"
  echo "        those responses would ship with no CSP. Add the include."; exit 7
fi

# 3b. The demo record must exist AND actually carry a sealed channel. A plain .flac here
#     would look fine, load fine, and simply never show the sealed vessel — the player
#     would appear to work while demonstrating nothing. 'ZRK1' is the sealed-blob magic
#     (carrier/src/zariia-crypto.mjs), so this checks the property, not the filename.
DEMO="$TMP_DIR/demo/zariia-demo.flac"
if [[ ! -f "$DEMO" ]]; then
  echo "[FATAL] demo/zariia-demo.flac is missing — the player page offers a demo that 404s"; exit 9
fi
if ! LC_ALL=C grep -qa 'ZRK1' "$DEMO"; then
  echo "[FATAL] demo/zariia-demo.flac carries no sealed channel (no ZRK1 block)."
  echo "        It would load and show only the open vessel, demonstrating nothing."; exit 9
fi
echo "[build] demo record staged, sealed channel present"

# 3c. The CSP is strictly same-origin on purpose (headers.conf). A third-party origin
#     creeping back in is how the 29 July 2026 breakage happened: an allow-list of CDN
#     hostnames that was already wrong. Fail rather than ship one.
#     Check the DIRECTIVE, not the file — headers.conf and player.html both discuss the
#     old origins in comments, and a guard that trips on its own documentation gets
#     deleted, which is worse than no guard.
csp_line=$(grep -h 'add_header Content-Security-Policy' "$TMP_DIR/headers.conf" || true)
if [[ -z "$csp_line" ]]; then
  echo "[FATAL] no Content-Security-Policy directive found in headers.conf"; exit 10
fi
if LC_ALL=C grep -qE 'https?://' <<<"$csp_line"; then
  echo "[FATAL] the CSP names an off-site origin:"; echo "        $csp_line"
  echo "        The policy is strictly same-origin. See DEPLOY.md."; exit 10
fi
#     And no page may import, script-src or fetch anything off zariia.org.
#     An <a href> is a link and fetches nothing — only resource loads count: script/img
#     src, module imports, fetch(), and <link> (stylesheets, preloads).
offsite=$(LC_ALL=C grep -hoE "(src=|from[[:space:]]+|import\(|fetch\()[\"'(]?https://[^\"')]+|<link[^>]+href=[\"']https://[^\"']+" \
            "$TMP_DIR"/*.html 2>/dev/null | grep -v 'zariia\.org' || true)
if [[ -n "$offsite" ]]; then
  echo "[FATAL] a page loads something off-site:"; sed 's/^/        /' <<<"$offsite"; exit 10
fi
echo "[build] CSP strictly same-origin, no off-site loads"

# 4. Never ship secrets or local cruft.
find "$TMP_DIR" \( -name '.env' -o -name '*.bak' -o -name '.DS_Store' \) -delete

echo "[build] staged:"
( cd "$TMP_DIR" && find . -type f | sed 's|^\./|       |' | sort )

TAR_PATH="$(pwd)/$TAR_FILE"
rm -f "$TAR_PATH"
tar -cf "$TAR_PATH" -C "$TMP_DIR" .

SIZE=$(du -h "$TAR_PATH" | cut -f1 | tr -d ' ')
echo ""
echo "✓ Created $TAR_FILE ($SIZE)"
echo "  Deploy:  caprover deploy -n blevn -a $APP_NAME -t $TAR_FILE"
echo "  Then:    enable HTTPS + force-redirect in the CapRover panel —"
echo "           the player needs a secure context or crypto.subtle is undefined."
