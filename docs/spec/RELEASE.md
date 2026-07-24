# Release checklist

Operational notes for deploying the LIC Scheduling App (adapter-node).

## Environment

| Variable             | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| `DATABASE_PATH`      | SQLite file path (default `./sqlite.db`).                    |
| `PUBLIC_BASE_URL`    | Public origin, used for auth trusted origins.                |
| `BETTER_AUTH_SECRET` | Session signing secret (required in production).             |
| `E2E_TESTING`        | Test-only auth bypass for `/api/*`; never set in production. |

## Build & run

```bash
npm ci
npm run db:migrate                 # apply migrations to $DATABASE_PATH
# optional: npm run db:seed        # demo data — do NOT run against prod data
npm run build                      # adapter-node build
node build                         # serve the built app
```

## Database

- SQLite file lives at `$DATABASE_PATH`. Back it up before migrating.
- Migrations are additive and idempotent (`src/lib/db/migrations`). During this
  development phase existing data is disposable; a destructive reset is
  `rm -f $DATABASE_PATH && npm run db:migrate`.
- Start empty for a real tenant (skip `db:seed`); the first user registers via
  `/register` and gets a default schedule automatically.

## Entitlements (Stage 2 gating)

Auto-generation is gated by the per-user `autogen` entitlement (default off).

```bash
npx tsx scripts/set-entitlement.ts <email> autogen on      # grant
npx tsx scripts/set-entitlement.ts <email> autogen off     # revoke
```

Server-side enforcement lives in `src/lib/server/entitlements.ts`
(`requireAutogen`) and the `/generate` layout guard; UI is hidden via
`$page.data.entitlements`.

## Pre-deploy gates

```bash
npm run check
npm run test:unit -- --run
npm run build
npm run test:e2e        # optional; builds + previews, slower
```

## Post-deploy smoke test

1. Register a user → lands on the dashboard with the setup checklist.
2. Add a health system + site, a clerkship with required days, a preceptor with
   availability, and a student.
3. Add an assignment from the student page → appears on the calendar; requirement
   status updates.
4. Export to Excel → non-empty file.
5. As a non-entitled user, confirm `/generate` returns 403 and no Auto-Generate
   nav item appears.
