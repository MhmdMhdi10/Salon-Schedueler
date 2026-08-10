#!/usr/bin/env bash
set -euo pipefail

repo_dir="/opt/salon-schedueler"
cd "$repo_dir"
failures=0

env_value() {
  local key="$1" value
  value="$(sed -n "s/^${key}=//p" .env | head -n 1 || true)"
  value="${value#\"}"
  value="${value%\"}"
  printf '%s' "$value"
}

pass_check() { printf 'PASS  %s\n' "$1"; }
fail_check() { printf 'FAIL  %s\n' "$1"; failures=$((failures + 1)); }

value="$(env_value PUBLIC_BASE_URL)"
[[ "$value" == https://* ]] && pass_check "PUBLIC_BASE_URL uses HTTPS" || fail_check "PUBLIC_BASE_URL must use HTTPS"

value="$(env_value PAYMENT_CALLBACK_BASE_URL)"
[[ "$value" == https://*/api ]] && pass_check "payment callback points to HTTPS /api" || fail_check "PAYMENT_CALLBACK_BASE_URL must end in /api and use HTTPS"

value="$(env_value DEV_OTP_AUTO_FILL)"
[[ "$value" == "false" ]] && pass_check "OTP auto-fill disabled" || fail_check "DEV_OTP_AUTO_FILL must be false"

for key in JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
  value="$(env_value "$key")"
  [[ "${#value}" -ge 32 ]] && pass_check "$key length is >= 32" || fail_check "$key is missing or too short"
done

if [[ -n "$(env_value KAVENEGAR_API_KEY)" || -n "$(env_value SMSIR_API_KEY)" ]]; then
  pass_check "real SMS provider configured"
else
  fail_check "real SMS provider key missing (KAVENEGAR_API_KEY or SMSIR_API_KEY)"
fi

if [[ -n "$(env_value ZARINPAL_MERCHANT_ID)" || -n "$(env_value IDPAY_API_KEY)" ]]; then
  pass_check "real payment gateway configured"
else
  fail_check "real payment gateway credential missing (ZARINPAL_MERCHANT_ID or IDPAY_API_KEY)"
fi

docker compose -f docker-compose.yml -f docker-compose.server.yml config --quiet \
  && pass_check "compose configuration is valid" \
  || fail_check "compose configuration is invalid"

for service in backend sms-worker notification-cron web; do
  if docker compose -f docker-compose.yml -f docker-compose.server.yml ps --status running --format '{{.Service}}' | grep -qx "$service"; then
    pass_check "$service is running"
  else
    fail_check "$service is not running"
  fi
done

if compgen -G "$repo_dir/backups/postgres/salon_dev_*.sql.gz" >/dev/null; then
  pass_check "PostgreSQL backup exists"
else
  fail_check "PostgreSQL backup missing"
fi

if [ -s /etc/letsencrypt/live/45.94.213.94/fullchain.pem ] && [ -s /etc/letsencrypt/live/45.94.213.94/privkey.pem ]; then
  pass_check "Let's Encrypt IP certificate is installed"
else
  fail_check "TLS certificate is missing"
fi

if [ "$failures" -eq 0 ]; then
  printf 'READY: production gates passed\n'
else
  printf 'NOT READY: %s gate(s) failed\n' "$failures"
fi
exit "$failures"
