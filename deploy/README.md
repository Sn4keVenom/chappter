# deploy/ — self-hosted Chappter

Everything needed to run the full stack on one machine: Postgres, the Express
API, and Caddy serving the built React bundle behind automatic HTTPS.

The **step-by-step first-time setup guide** (OS install through first admin)
is a separate document. This file is the operator reference for a box that is
already running.

## What's here

| File | Purpose |
|---|---|
| `docker-compose.yml` | The three services + named volumes. Compose auto-loads `.env` from this directory. |
| `Dockerfile.api` | Node 22 → `prisma generate` → `tsc`. Runs `prisma migrate deploy` on every container start. |
| `Dockerfile.web` | Node builds the Vite bundle → copied into a Caddy image at `/srv`. |
| `Caddyfile` | One host serving the SPA at `/` and proxying `/api/*` to `api:4000`. |
| `.env.example` | Template. Copy to `.env` (gitignored) and fill in. |
| `update.sh` | Backup → pull → rebuild → restart → wait for health. The normal way to deploy. |
| `backup.sh` | Compressed `pg_dump`, 14-day retention, refuses to keep an empty dump. |
| `restore.sh` | Restores a dump over the live database. Requires typing `RESTORE`. |
| `duckdns-update.sh` | Keeps the dynamic-DNS record pointed here. Run from cron every 5 min. |

## Architecture

```
phone ──▶ router :80/:443 ──▶ Caddy ──┬──▶ /srv        (static React bundle)
                                       └──▶ api:4000   ──▶ db:5432
```

Only `web` publishes ports. Postgres and the API are reachable solely on the
internal Docker network. The client is served from the same origin as the API,
so the browser never makes a cross-origin request — `VITE_API_URL` is the
relative path `/api/v1`, which is also why moving to a different hostname needs
no frontend code change.

## Daily commands

```bash
cd ~/chappter/deploy

./update.sh                          # deploy the latest commit
docker compose ps                    # what's running
docker compose logs -f api           # tail the API
./backup.sh                          # dump now
docker compose exec db psql -U chappter -d chappter
```

Never `docker compose down -v` — the `-v` deletes the database and TLS
certificate volumes. Plain `down` is safe.

## Bootstrapping a fresh database

Ordering matters; each step depends on the one before it.

```bash
docker compose exec api node dist/prisma/seed.js              # chapter, semester, channels, permissions
# → now sign up in the browser, choosing PNM (an empty roster rejects Active/Alumni)
docker compose exec api node dist/scripts/bootstrap-admin.js you@example.com
```

`bootstrap-admin.ts` exists because a fresh database has no way in: join
requests need an approver, invite codes need a generator, and roster entries are
foreign-keyed to an existing `ChapterMembership`. It writes the first membership
directly. Everyone after the first admin joins through roster verification.

To promote anyone later, use the pre-existing `promote-admin.js` instead.

## Environment

`APP_HOSTNAME` is the single source of truth for the public name — Caddy
requests its certificate for it and the API's `CORS_ORIGIN` is derived from it.
`CLERK_SECRET_KEY` and `DATABASE_URL` are the two variables the server refuses
to boot without (`backend/lib/env.ts`). Stripe variables are genuinely optional;
leaving them blank disables card payments and nothing else.

**`VITE_*` values are build-time, not runtime.** Vite inlines them into the
bundle, so changing the Clerk publishable key requires a rebuild, not a restart.
`update.sh` always rebuilds.

## Moving to a real domain

Both `docker-compose.yml` and `Caddyfile` carry comments at the exact lines that
change. In short: set `APP_HOSTNAME` and `CLOUDFLARE_TUNNEL_TOKEN` in `.env`,
drop the `web` service's `ports:` block, uncomment `cloudflared`, change the
Caddyfile site opener to `:80`, remove the router's port forwards, and run
`./update.sh`. Clerk production keys swap in the same way — but note that Clerk
cannot migrate users between development and production instances.
