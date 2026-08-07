#!/usr/bin/env bash
set -euo pipefail
cd /app

echo "[notification-cron] waiting for compiled worker bundle..."
until [ -s packages/backend/dist/notification-cron.js ]; do
  sleep 1
done

echo "[notification-cron] starting reminder/cancellation scheduler"
exec node packages/backend/dist/notification-cron.js
