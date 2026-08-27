#!/usr/bin/env bash
# deploy/backup.sh — timestamped, compressed pg_dump with 14-day retention.
#
# Run it by hand before anything risky, and nightly from cron:
#   0 3 * * * /home/YOU/chapterhub/deploy/backup.sh >> /var/log/chapterhub-backup.log 2>&1
#
# A dump on the same disk as the database protects you from a bad migration
# or a fat-fingered delete, NOT from the disk dying. Copy these off the box
# too — see the guide's Backups section.

set -euo pipefail
cd "$(dirname "$0")"

set -a; . ./.env; set +a

DEST="${BACKUP_DIR:-$HOME/chapterhub-backups}"
mkdir -p "$DEST"

STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT="$DEST/chapterhub_${STAMP}.sql.gz"

# --clean --if-exists so the dump can be restored over an existing database
# without hand-dropping objects first.
docker compose exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip -9 > "$OUT"

# A dump that is only a few hundred bytes means pg_dump failed and the pipe
# still produced a valid empty gzip. Catch that now, not during a restore.
SIZE=$(wc -c < "$OUT")
if [ "$SIZE" -lt 2000 ]; then
  echo "!!! Backup looks empty (${SIZE} bytes) — refusing to keep it"
  rm -f "$OUT"
  exit 1
fi

find "$DEST" -name 'chapterhub_*.sql.gz' -mtime +14 -delete

echo "Backup OK: $OUT ($(du -h "$OUT" | cut -f1))"
