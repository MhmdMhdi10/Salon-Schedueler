#!/usr/bin/env bash
set -euo pipefail
cd /app

echo "[notification-cron] waiting for compiled worker bundle..."
until [ -s backend/dist/notification-cron.js ]; do
  sleep 1
done

echo "[notification-cron] starting reminder/cancellation scheduler"
exec node backend/dist/notification-cron.js
