#!/usr/bin/env bash
# Mobile (Expo / React Native) development entrypoint.
#
# Builds the shared package the screens import, then starts the Expo dev server
# (Metro) bound to all interfaces. Metro must advertise the HOST's LAN IP — not
# the container IP — so a phone running Expo Go can reach it; compose passes the
# host IP via REACT_NATIVE_PACKAGER_HOSTNAME (see docker-compose.yml / .env).
set -euo pipefail
cd /app

# Reinstall when the node_modules volume is empty (fresh volume) or the relevant
# manifests/lockfile changed since the last install — mirrors the web guard so
# Expo/RN deps added after the volume was first seeded aren't missed.
deps_fingerprint() {
  cat package-lock.json packages/mobile/package.json packages/shared/package.json 2>/dev/null \
    | sha256sum | cut -d' ' -f1
}
STAMP_FILE=node_modules/.salon-mobile-deps-stamp
CURRENT_FINGERPRINT="$(deps_fingerprint)"
if [ ! -x node_modules/.bin/expo ] \
  || [ ! -e node_modules/expo/package.json ] \
  || [ "$(cat "$STAMP_FILE" 2>/dev/null)" != "$CURRENT_FINGERPRINT" ]; then
  echo "[mobile] installing dependencies (manifest change or fresh volume)..."
  # Be resilient to flaky networks/registry mirrors: more retries, longer
  # timeouts, and a few whole-command attempts before giving up. Without this a
  # single transient ECONNRESET/TLS blip would fail the install and (because the
  # container restarts) loop forever on a fresh volume.
  export npm_config_fetch_retries=5
  export npm_config_fetch_retry_factor=2
  export npm_config_fetch_retry_mintimeout=20000
  export npm_config_fetch_retry_maxtimeout=120000
  export npm_config_fetch_timeout=600000
  install_ok=""
  for attempt in 1 2 3 4 5; do
    echo "[mobile] npm install attempt ${attempt}/5..."
    if npm install --legacy-peer-deps --no-audit --no-fund; then
      install_ok="yes"
      break
    fi
    echo "[mobile] install attempt ${attempt} failed (likely network); retrying in 10s..."
    sleep 10
  done
  if [ -z "$install_ok" ]; then
    echo "[mobile] ERROR: dependency install failed after 5 attempts. Check network/registry and restart the service." >&2
    exit 1
  fi
  deps_fingerprint > "$STAMP_FILE"
fi

echo "[mobile] building @salon/shared..."
npx tsc -b packages/shared
npx tsc -b packages/shared --watch --preserveWatchOutput &

EXP_URL="exp://${REACT_NATIVE_PACKAGER_HOSTNAME:-localhost}:8081"
echo "[mobile] starting Expo (Metro) on http://localhost:8081"
echo "[mobile] phone (Expo Go) URL: ${EXP_URL}"

# Expo runs without an interactive TTY inside the container, so it never draws
# the QR block itself (it only logs "Waiting on..."). Render the QR for the
# exp:// URL ourselves so it shows up directly in `docker compose logs mobile`.
echo "[mobile] scan this QR with Expo Go (Android) / Camera (iOS):"
node -e "require('qrcode-terminal').generate(process.argv[1], { small: true })" "$EXP_URL" || true

# --lan so the QR/connection URL uses the advertised host IP. Run from the
# mobile workspace so Expo picks up app.config.js / metro.config.js.
exec npm run start --workspace @salon/mobile -- --lan
