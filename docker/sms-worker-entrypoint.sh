#!/usr/bin/env bash
# SMS worker development entrypoint.
#
# The `backend` service owns dependency install + the tsc-watch build (it
# compiles src/sms-worker.ts → dist/sms-worker.js into the shared bind mount).
# This worker simply waits for that bundle to appear, then runs it under
# `node --watch` so it restarts when the backend rebuilds.
set -euo pipefail
cd /app

echo "[sms-worker] waiting for the compiled worker bundle (built by backend)..."
until [ -f packages/backend/dist/sms-worker.js ]; do
  sleep 2
done

echo "[sms-worker] starting on broker ${RABBITMQ_URL:-<unset>}"
exec node --watch packages/backend/dist/sms-worker.js
