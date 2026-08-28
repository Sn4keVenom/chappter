#!/usr/bin/env bash
# deploy/restore.sh — restore a backup created by backup.sh.
#
#   ./restore.sh /var/backups/chappter/chappter_2026-08-25_030000.sql.gz
#
# DESTRUCTIVE: overwrites the live database. Requires typing the word RESTORE.

set -euo pipefail
cd "$(dirname "$0")"

FILE="${1:-}"
[ -z "$FILE" ] && { echo "Usage: ./restore.sh <backup.sql.gz>"; exit 1; }
[ -f "$FILE" ] || { echo "No such file: $FILE"; exit 1; }

set -a; . ./.env; set +a

echo "This OVERWRITES the live '$POSTGRES_DB' database with:"
echo "  $FILE"
read -r -p "Type RESTORE to continue: " CONFIRM
[ "$CONFIRM" = "RESTORE" ] || { echo "Aborted."; exit 1; }

# Stop the API so nothing writes mid-restore.
docker compose stop api

gunzip -c "$FILE" | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

docker compose start api
echo "Restore complete."
