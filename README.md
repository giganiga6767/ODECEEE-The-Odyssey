# WATT A PLAY 3.0 · THE ODECEEE

A mobile-first, no-map GPS treasure hunt presented by IET NITK, with a live volunteer console.

## Run locally in this Repl

The project has two registered app services:

- **Web app:** `artifacts/odyssey-hunt` at `/`
- **API:** `artifacts/api-server` at `/api`; Socket.IO uses `/api/socket.io`

Start or restart the managed `artifacts/odyssey-hunt: web` and `artifacts/api-server: API Server` workflows from Replit. The API workflow generates Prisma Client, applies development migrations, runs the idempotent development seed, and starts the server. Do not create a second workflow for either service.

Useful commands:

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run db:generate
pnpm --filter @workspace/api-server run db:migrate
pnpm --filter @workspace/api-server run seed
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-spec run codegen
```

`lib/api-spec/openapi.yaml` is the REST contract source of truth. Regenerate the React Query client and Zod schemas after changing it.

## Before an event

1. In **Admin → Checkpoints**, replace every seed entry prefixed `REPLACE WITH REAL LOCATIONS` with verified campus coordinates, names, hints, and radii. The seed coordinates are placeholders and must not be used for a real event.
2. Add enough active checkpoints for the planned routes. Checkpoint deactivation is a soft delete; teams skip inactive stops.
3. In **Admin → Teams**, create or bulk-create crews. Download or print the generated codes immediately and give one privately to each captain; codes are shown only when issued.
4. Each captain enters only the team code. The first captain claims it with their name on one phone; later logins must use that same phone. In the admin console, **Release phone** unlocks a lost-device team without changing progress. **New code · keep progress** also preserves progress; **Reset progress** is the destructive route reset.
5. Review **Admin → Settings**. Defaults are a 30 m checkpoint radius, 40 m accuracy slack, and 200 m maximum accepted GPS accuracy. The overview counts an active crew as stalled after 90 seconds without a location update.
6. Test on the actual phones and browsers participants will use. The player flow needs a secure HTTPS page, precise location permission, and (when supported) motion/orientation permission. Confirm audible output and screen wake behavior.
7. Start the event from **Admin → Settings** only when volunteers are ready. Pause or end it there; export results as CSV after the event.
8. The IET NITK logo supplied for this event is fixed at `artifacts/odyssey-hunt/public/branding/iet-nitk-logo.png`. Keep the supplied artwork intact.

The player route never displays a map or future checkpoint coordinates. The volunteer-only **God’s Eye** view can show the live campus map and team positions.

## Event-day checklist

- [ ] Verify the event date, operator/admin login, real checkpoint coordinates, hints, route order, and capture radii.
- [ ] Test the website on the actual event phones over mobile data and campus Wi-Fi; grant precise location and motion permissions.
- [ ] Check that the Siren is audible, the 39-second compass updates, the display stays awake, and checkpoint capture succeeds inside the real radius.
- [ ] Confirm that the login screen rejects an unknown code, asks for the captain’s name only on first use, and resumes the same team on its claimed phone.
- [ ] Keep the admin console open on a volunteer device. Use **Release phone** for a lost/replaced handset; use **New code · keep progress** only if a code must change.
- [ ] Print or download slips securely, hand each code to one captain, and do not display/export codes on a public screen.
- [ ] Start the event only after the volunteer team is ready. Keep an operator available to pause, end, or help a captain regain access.
- [ ] At close, end the event, export the results CSV, and securely dispose of any temporary code slips or CSV files.

## Environment and data

The API requires the Replit-managed `DATABASE_URL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` secrets. Set `JWT_SECRET` if desired; otherwise the server uses the existing `SESSION_SECRET`. The selected signing secret must be at least 32 characters. Do not put real credentials in `.env.example` or source control.

PostgreSQL and Prisma schema:

- Prisma model: `artifacts/api-server/prisma/schema.prisma`
- Versioned migrations: `artifacts/api-server/prisma/migrations/`
- Development seed: `artifacts/api-server/prisma/seed.mjs`

The seed is idempotent. It creates the administrator, shared settings and event state, four sample teams, and eight clearly marked placeholder checkpoints. It does not print sample team passcodes; create or reset teams in the admin console to issue usable one-time passes.

The development workflow applies migrations and seed data to the development database. Keep production schema changes in reviewed, versioned migrations and apply them to the intended production database through the approved database release procedure before routing event traffic. Do not run development seed data against production.

## Publishing and runtime

Use a deployment configuration that keeps the API to one instance for the event. The game requires persistent PostgreSQL data and Socket.IO connections; the consecutive-location anti-cheat window is process-local, so running multiple API instances would split that validation state. If horizontal scaling is needed, move Socket.IO delivery and capture-window state to shared infrastructure first. Confirm the `/api/healthz` startup check succeeds.

The API’s production build generates Prisma Client and bundles the service; it does not migrate the production database or seed it during build. Apply production migrations separately before publishing schema-dependent code. Confirm production credentials and real checkpoint coordinates are in the correct environment before opening the event.

## Product routes

- `/` — team pass entry and event waiting state
- `/voyage` — team compass, 39-second oracle, Siren’s Song, and progress
- `/admin/login` — volunteer sign-in
- `/admin` — live overview and volunteer-only map
- `/admin/checkpoints` — checkpoint and route management
- `/admin/teams` — one-time code slips, captain/device status, phone release, progress-preserving code regeneration, and route reset
- `/admin/settings` — event controls, capture thresholds, and CSV export

In development only, `/voyage?debug=1` enables the local GPS simulator.
