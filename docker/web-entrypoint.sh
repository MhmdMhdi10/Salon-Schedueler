#!/usr/bin/env bash
# Web (Vite) development entrypoint.
#
# The web app imports the built @salon/shared package, so build it first (and
# keep it rebuilding on change), then start the Vite dev server bound to all
# interfaces so it is reachable from the host.
set -euo pipefail
cd /app

# Seed deps only if the node_modules volume is empty (first run on a fresh volume).
if [ ! -x node_modules/.bin/vite ]; then
  echo "[web] installing dependencies..."
  npm install
fi

echo "[web] building @salon/shared..."
npx tsc -b packages/shared
npx tsc -b packages/shared --watch --preserveWatchOutput &

echo "[web] starting Vite dev server on http://localhost:5173"
exec npm run dev --workspace @salon/web -- --host 0.0.0.0 --port 5173
