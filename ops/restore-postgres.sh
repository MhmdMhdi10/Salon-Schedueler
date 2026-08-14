#!/usr/bin/env bash
set -euo pipefail

if [ "${CONFIRM_RESTORE:-}" != "I_UNDERSTAND_RESTORE" ]; then
  echo "Refusing restore. Set CONFIRM_RESTORE=I_UNDERSTAND_RESTORE explicitly." >&2
  exit 2
fi

backup="${1:-}"
case "$backup" in
  /opt/salon-schedueler/backups/postgres/postgres_*.sql.gz|/opt/salon-schedueler/backups/postgres/salon_dev_*.sql.gz) ;;
  *)
    echo "Backup must be an exact file under /opt/salon-schedueler/backups/postgres/" >&2
    exit 2
    ;;
esac

[ -f "$backup" ] || { echo "Backup not found: $backup" >&2; exit 1; }
gzip -t "$backup"

cd /opt/salon-schedueler
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

docker compose -f docker-compose.yml -f docker-compose.server.yml exec -T postgres \
  psql -U "$pg_user" -d "$pg_db" -v ON_ERROR_STOP=1 < <(gzip -cd "$backup")
