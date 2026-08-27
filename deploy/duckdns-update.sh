#!/usr/bin/env bash
# deploy/duckdns-update.sh — point the DuckDNS name at this machine's current
# public IP. Residential IPs usually change only on a modem reboot or an ISP
# maintenance window, but when it happens the app is unreachable until DNS
# catches up, so this runs every 5 minutes from cron:
#
#   */5 * * * * /home/YOU/chapterhub/deploy/duckdns-update.sh >/dev/null 2>&1
#
# Leaving ip= empty tells DuckDNS to use the source IP of this request, which
# is exactly the address the outside world would need.

set -euo pipefail
cd "$(dirname "$0")"

set -a; . ./.env; set +a

if [ -z "${DUCKDNS_TOKEN:-}" ]; then
  echo "DUCKDNS_TOKEN not set in deploy/.env — skipping"
  exit 0
fi

RESPONSE=$(curl -fsS \
  "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=")

# DuckDNS answers with the literal string "OK" or "KO" — not an HTTP status,
# so curl -f alone will not catch a bad token.
if [ "$RESPONSE" != "OK" ]; then
  echo "$(date -Is) DuckDNS update failed: $RESPONSE"
  exit 1
fi

echo "$(date -Is) DuckDNS OK"
