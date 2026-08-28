#!/usr/bin/env bash
# deploy/update.sh — pull the latest code and roll the stack forward.
#
# Safe to run any time. Rebuilds both images (the web bundle MUST be rebuilt
# for any frontend or VITE_* change — Vite inlines those at build time),
# applies any new Prisma migrations on api start, and leaves the database
# volume untouched.
#
#   cd ~/chappter/deploy && ./update.sh

set -euo pipefail
cd "$(dirname "$0")"

echo "==> Backing up the database first"
./backup.sh

echo "==> Pulling latest code"
git -C .. pull --ff-only

echo "==> Rebuilding images"
docker compose build

echo "==> Restarting stack"
docker compose up -d

echo "==> Waiting for the API to report healthy"
for i in $(seq 1 30); do
  if docker compose exec -T api node -e \
      'fetch("http://localhost:4000/health").then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))' 2>/dev/null; then
    echo "    API healthy"
    break
  fi
  [ "$i" -eq 30 ] && { echo "!!! API did not become healthy — check: docker compose logs api"; exit 1; }
  sleep 2
done

echo "==> Cleaning up old images"
docker image prune -f >/dev/null

docker compose ps
echo "==> Done"
