#!/usr/bin/env bash
set -euo pipefail

if [ "${CONFIRM_RESTORE:-}" != "I_UNDERSTAND_RESTORE" ]; then
  echo "Refusing restore. Set CONFIRM_RESTORE=I_UNDERSTAND_RESTORE explicitly." >&2
  exit 2
fi

backup="${1:-}"
case "$backup" in
  /opt/salon-schedueler/backups/postgres/salon_dev_*.sql.gz) ;;
  *)
    echo "Backup must be an exact file under /opt/salon-schedueler/backups/postgres/" >&2
    exit 2
    ;;
esac

[ -f "$backup" ] || { echo "Backup not found: $backup" >&2; exit 1; }
gzip -t "$backup"

cd /opt/salon-schedueler
docker compose -f docker-compose.yml -f docker-compose.server.yml exec -T postgres \
  psql -U salon -d salon_dev -v ON_ERROR_STOP=1 < <(gzip -cd "$backup")
