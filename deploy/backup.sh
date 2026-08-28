#!/usr/bin/env bash
# deploy/backup.sh — timestamped, compressed pg_dump with 14-day retention.
#
# Run it by hand before anything risky, and nightly from cron:
#   0 3 * * * /home/YOU/chappter/deploy/backup.sh >> /var/log/chappter-backup.log 2>&1
#
# A dump on the same disk as the database protects you from a bad migration
# or a fat-fingered delete, NOT from the disk dying. Copy these off the box
# too — see the guide's Backups section.

set -euo pipefail
cd "$(dirname "$0")"

set -a; . ./.env; set +a

# Default lives under $HOME specifically so a stock deploy never needs a
# manual `sudo mkdir` before its first backup — this script is also the
# first thing update.sh runs, so a directory only root can create here
# would fail every deploy, not just the first one. Set BACKUP_DIR in .env
# to something like /var/backups/chappter instead if you want backups
# outside your home directory — just create and chown it yourself first,
# since an unattended nightly cron run must never need sudo.
DEST="${BACKUP_DIR:-$HOME/chappter-backups}"
if ! mkdir -p "$DEST" 2>/tmp/chappter-backup-mkdir-err; then
  echo "!!! Could not create backup directory: $DEST"
  cat /tmp/chappter-backup-mkdir-err >&2
  echo "!!! If BACKUP_DIR points somewhere outside your home directory, create it once with:"
  echo "!!!   sudo mkdir -p '$DEST' && sudo chown \$USER:\$USER '$DEST'"
  rm -f /tmp/chappter-backup-mkdir-err
  exit 1
fi
rm -f /tmp/chappter-backup-mkdir-err

STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT="$DEST/chappter_${STAMP}.sql.gz"

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

find "$DEST" -name 'chappter_*.sql.gz' -mtime +14 -delete

echo "Backup OK: $OUT ($(du -h "$OUT" | cut -f1))"
