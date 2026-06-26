#!/usr/bin/env bash
# Web (Vite) development entrypoint.
#
# The web app imports the built @salon/shared package, so build it first (and
# keep it rebuilding on change), then start the Vite dev server bound to all
# interfaces so it is reachable from the host.
set -euo pipefail
cd /app

# Install dependencies when the node_modules volume is empty (first run on a
# fresh volume) OR when the manifests/lockfile have changed since the last
# install. The node_modules live in a named volume that outlives image rebuilds,
# so a guard that only checks for `vite` would skip installing dependencies
# added after the volume was first seeded (e.g. tailwindcss/postcss/radix added
# by the UI redesign), leaving the dev server to crash on a missing module.
# We fingerprint the lockfile (falling back to the manifests) and reinstall
# whenever it differs from the fingerprint recorded after the last install.
deps_fingerprint() {
  cat package-lock.json packages/web/package.json packages/shared/package.json 2>/dev/null \
    | sha256sum | cut -d' ' -f1
}
STAMP_FILE=node_modules/.salon-web-deps-stamp
CURRENT_FINGERPRINT="$(deps_fingerprint)"
if [ ! -x node_modules/.bin/vite ] \
  || [ ! -e node_modules/tailwindcss/package.json ] \
  || [ "$(cat "$STAMP_FILE" 2>/dev/null)" != "$CURRENT_FINGERPRINT" ]; then
  echo "[web] installing dependencies (manifest change or fresh volume)..."
  npm install
  deps_fingerprint > "$STAMP_FILE"
fi

echo "[web] building @salon/shared..."
npx tsc -b packages/shared
npx tsc -b packages/shared --watch --preserveWatchOutput &

echo "[web] starting Vite dev server on http://localhost:5173"
exec npm run dev --workspace @salon/web -- --host 0.0.0.0 --port 5173
