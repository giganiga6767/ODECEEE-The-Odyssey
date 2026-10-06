# WATT A PLAY 3.0 · THE ODECEEE

Mobile-first NITK GPS treasure hunt presented by IET NITK, with a separate volunteer console.

## Event-specific product rules

- The supplied IET NITK logo at `artifacts/odyssey-hunt/public/branding/iet-nitk-logo.png` is fixed artwork; do not redraw, recolor, or replace it.
- Players enter a team code only. First use records the captain’s name and binds that code to one browser/device; reuse on that device resumes the team.
- Releasing a phone or issuing a replacement code preserves checkpoint progress. Route reset is separate, destructive, and must remain clearly labeled.
- Keep the volunteer-only map and future checkpoint locations out of the player experience.
- Keep the API single-instance for the event while GPS capture-window state and Socket.IO delivery are process-local.

## Run & operate

- The managed `artifacts/odyssey-hunt: web` and `artifacts/api-server: API Server` workflows serve the app and API.
- `pnpm run typecheck` checks shared libraries, the API, and the web app.
- `pnpm --filter @workspace/api-spec run codegen` regenerates API hooks and Zod schemas from `lib/api-spec/openapi.yaml`.
- `pnpm --filter @workspace/api-server run db:migrate` and `run seed` target the development database through the workflow environment.
- Required secrets: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` (or a `JWT_SECRET` of at least 32 characters). `DATABASE_URL` is Replit-managed.

## Source of truth

- Web and game screens: `artifacts/odyssey-hunt/src/App.tsx`
- Player theme and motion preferences: `artifacts/odyssey-hunt/src/index.css`
- Persistent logo path: `artifacts/odyssey-hunt/public/branding/iet-nitk-logo.svg`
- REST contract: `lib/api-spec/openapi.yaml`
- PostgreSQL schema and migrations: `artifacts/api-server/prisma/`
- REST and Socket.IO server: `artifacts/api-server/src/`

## Product behavior

- Teams see only their current checkpoint. The volunteer-only admin view contains team positions and assigned routes.
- The oracle direction and distance band refresh on a 39-second cycle; GPS fixes update refs and server telemetry between cycles.
- The server validates capture distance and accuracy from consecutive location updates; clients cannot submit a capture directly.
- Event status, passcodes, teams, checkpoints, settings, and result export are managed in the admin console.

## Operational constraints

- The seed’s eight `REPLACE WITH REAL LOCATIONS` entries are not event locations. Replace them before testing outdoors or publishing.
- Keep the event API single-instance: Socket.IO and the consecutive-ping anti-cheat window use in-process state.
- Keep REST routed through `/api` and WebSockets through `/api/socket.io`; both paths must remain listed in `artifacts/api-server/.replit-artifact/artifact.toml`.
- Do not migrate or seed production during a build. Review and apply production Prisma migrations to the intended database before publishing code that depends on them.
- See `README.md` for the event checklist, route table, local commands, and publishing notes.
