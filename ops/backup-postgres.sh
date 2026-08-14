#!/usr/bin/env bash
set -euo pipefail

repo_dir="/opt/salon-schedueler"
backup_dir="$repo_dir/backups/postgres"
lock_file="$backup_dir/.backup.lock"
compose=(docker compose -f "$repo_dir/docker-compose.yml" -f "$repo_dir/docker-compose.server.yml")

cd "$repo_dir"

env_value() {
  local key="$1" value
  value="$(printenv "$key" 2>/dev/null || true)"
  if [[ -z "$value" && -f .env ]]; then
    value="$(sed -n "s/^${key}=//p" .env | head -n 1 || true)"
  fi
  value="${value#\"}"
  value="${value%\"}"
  printf '%s' "$value"
}

pg_user="$(env_value POSTGRES_USER)"
pg_db="$(env_value POSTGRES_DB)"
[[ -n "$pg_user" && -n "$pg_db" ]] || {
  echo "POSTGRES_USER and POSTGRES_DB are required" >&2
  exit 1
}

umask 077
mkdir -p "$backup_dir"
exec 9>"$lock_file"
flock -n 9 || { echo "PostgreSQL backup already running" >&2; exit 1; }

stamp="$(date -u +%Y%m%d_%H%M%S)"
output="$backup_dir/postgres_${stamp}.sql.gz"
temporary="$(mktemp "$backup_dir/.postgres_${stamp}.XXXXXX.sql.gz")"
cleanup() { rm -f "$temporary"; }
trap cleanup EXIT

"${compose[@]}" exec -T postgres pg_dump \
  -U "$pg_user" \
  -d "$pg_db" \
  --format=plain \
  --no-owner \
  --no-privileges \
  | gzip -9 > "$temporary"

gzip -t "$temporary"
mv "$temporary" "$output"
find "$backup_dir" -maxdepth 1 -type f -name 'postgres_*.sql.gz' -mtime +14 -delete

printf 'backup=%s size_bytes=%s\n' "$output" "$(stat -c '%s' "$output")"
