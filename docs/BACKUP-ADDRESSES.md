# Backup addresses

How the site keeps working if riftn.com (or dehub.io) stops pointing at us.

## What is ready in code

- **One API setting.** Every web call to the API goes through
  `src/lib/api/api-origin.ts`. Production uses `https://api.dehub.io`. A
  build with `VITE_API_ORIGIN=https://<backup api>` talks to a backup
  address instead. `VITE_API_RELAY_BASE` overrides the `/_api` relay.
- **Backup site build.** Actions > "Backup site build (IPFS)" builds the
  site, adds an IPFS `_redirects` file so every path opens the app, and packs
  it into `site.car` with its CID. Nothing live changes. Pin the CAR on an
  IPFS service, then set riftn.eth's content hash to `ipfs://<CID>`.
- **API side.** The backend accepts extra site addresses from the
  `BACKUP_SITE_ORIGINS` env var (comma-separated https origins), so a backup
  site can sign in and load data after an env edit and a restart.
- **Cloudflare outage.** Separate from this: see `ops/STANDBY.md` for the
  standby copy on the server and the one-tap switch.

## If riftn.com is lost

1. Point a backup domain at the standby copy on the server (same nginx, new
   `server_name` + certificate), or share the riftn.eth.limo address.
2. Add the backup addresses to `BACKUP_SITE_ORIGINS` on the server and
   restart the API.
3. Add them to Supabase Auth redirect URLs and to
   `supabase/functions/_shared/own-origins.ts`.
4. Run "Backup site build (IPFS)", pin it, update riftn.eth.
5. Apps keep working (they use api.dehub.io). Ship an app update only to
   change share links.

## If dehub.io is lost too

1. Put the API on a backup hostname (DNS to the server, nginx
   `server_name`, certificate).
2. Web: build with `VITE_API_ORIGIN` set to it.
3. App: change `API_URL` / `APP_ORIGIN` in the Expo production environment
   and run "Manual mobile update" for both platforms. Updates come from
   Expo, not our domains. Never change `runtimeVersion` for this.
4. Passkeys are tied to dehub.io; those users sign in with wallet, email or
   password until it is back.
