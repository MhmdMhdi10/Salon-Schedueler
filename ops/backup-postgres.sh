#!/usr/bin/env bash
set -euo pipefail

repo_dir="/opt/salon-schedueler"
backup_dir="$repo_dir/backups/postgres"
lock_file="$backup_dir/.backup.lock"
compose=(docker compose -f "$repo_dir/docker-compose.yml" -f "$repo_dir/docker-compose.server.yml")

umask 077
mkdir -p "$backup_dir"
exec 9>"$lock_file"
flock -n 9 || { echo "PostgreSQL backup already running" >&2; exit 1; }

stamp="$(date -u +%Y%m%d_%H%M%S)"
output="$backup_dir/salon_dev_${stamp}.sql.gz"
temporary="$(mktemp "$backup_dir/.salon_dev_${stamp}.XXXXXX.sql.gz")"
cleanup() { rm -f "$temporary"; }
trap cleanup EXIT

"${compose[@]}" exec -T postgres pg_dump \
  -U salon \
  -d salon_dev \
  --format=plain \
  --no-owner \
  --no-privileges \
  | gzip -9 > "$temporary"

gzip -t "$temporary"
mv "$temporary" "$output"
find "$backup_dir" -maxdepth 1 -type f -name 'salon_dev_*.sql.gz' -mtime +14 -delete

printf 'backup=%s size_bytes=%s\n' "$output" "$(stat -c '%s' "$output")"
