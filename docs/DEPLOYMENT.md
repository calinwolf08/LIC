# Deployment: build on GitHub, run on Coolify

Coolify never builds the app. GitHub Actions builds a Docker image and pushes
it to GitHub Container Registry (GHCR). Coolify pulls that image and runs it.

```
push / merge to master
  └─ CI workflow (lint, type check, unit, e2e, build) ── must pass
       └─ Deploy workflow (.github/workflows/deploy.yml)
            ├─ docker build  →  ghcr.io/calinwolf08/lic:latest  (+ :sha-<commit>)
            └─ call Coolify's deploy webhook  →  Coolify pulls :latest and restarts
```

The container starts with `npm run db:setup && node build`. `db:setup` is
idempotent and safe on every start. It does three things:

- creates the auth tables if they're missing
- applies migrations
- backfills an organization and a subscription for any account missing one

The server then listens on port **3000**.

---

## One-time setup

### 1. GitHub: get CI green and merge

CI runs on Node 22 (from `.nvmrc`). Merge the PR into `master` once the CI
checks pass. The Deploy workflow only exists on GitHub after it's on
`master`; `workflow_run` workflows run from the default branch.

### 2. Coolify: enable the API and create a token (optional)

Only needed for **automatic** deploys. Without it, GitHub still builds and
publishes the image on every merge, and you click **Deploy** in Coolify to roll
it out. That's how the HSP app is set up. Skip this step and step 5 if that
suits you.

1. **Settings → Configuration → Advanced** (or **Settings → Advanced** in
   some versions): turn on **API Access**.
2. **Keys & Tokens → API Tokens**: create a token with the **deploy**
   permission. Copy it now; it's shown only once.

### 3. Coolify: create the app from the image

Create a new resource in the same project and environment as your Postgres
database: **+ New → Docker Image**.

| Setting       | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Image         | `ghcr.io/calinwolf08/lic`                                              |
| Tag           | `latest`                                                               |
| Ports Exposes | `3000`                                                                 |
| Domains       | your domain, e.g. `https://lic.example.com` (move it from the old app) |

**Environment variables:**

| Variable             | Value                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | the Postgres **internal** URL from the Coolify database page                                                                                 |
| `BETTER_AUTH_SECRET` | the same secret as today (changing it signs everyone out)                                                                                    |
| `BETTER_AUTH_URL`    | `https://your-domain`                                                                                                                        |
| `PUBLIC_BASE_URL`    | `https://your-domain`                                                                                                                        |
| `PAYMENT_PROVIDER`   | `manual` (optional; it's the default)                                                                                                        |
| `ORIGIN`             | optional: `https://your-domain`. The image already trusts the proxy's `X-Forwarded-Proto`/`X-Forwarded-Host`, so form posts work without it. |

Copy these from the existing Coolify app where they already exist.

Then **stop and delete the old git-based app**, or at least turn off its
auto-deploy and remove its domain. Otherwise two apps serve the same domain.

### 4. Let Coolify pull the image (private repository only)

If the repository is private, the image on GHCR is private too. Pick one:

- **Make the package public:** on GitHub go to your profile → **Packages** →
  `lic` → **Package settings** → **Change visibility → Public**. The image
  contains the app's code but no secrets; all secrets are environment
  variables in Coolify.
- **Or log the Coolify server in to GHCR:**
  1. Create a GitHub personal access token (classic) with only the
     `read:packages` scope.
  2. SSH into the Coolify server as the user Coolify uses (usually `root`)
     and run:

     ```bash
     echo <TOKEN> | docker login ghcr.io -u calinwolf08 --password-stdin
     ```

  Repeat this on every server that runs the app.

The package appears after the Deploy workflow's first run. You can start it
by hand: **Actions → Deploy → Run workflow**.

### 5. GitHub: add the deploy secrets

In Coolify, open the new app → **Webhooks** and copy the **Deploy Webhook**
URL.

In GitHub, go to **Settings → Secrets and variables → Actions → New
repository secret** and add:

| Secret            | Value                     |
| ----------------- | ------------------------- |
| `COOLIFY_WEBHOOK` | the Deploy Webhook URL    |
| `COOLIFY_TOKEN`   | the API token from step 2 |

Without these, the workflow still publishes the image but skips the deploy
and shows a warning.

### 6. First deploy

Run **Actions → Deploy → Run workflow** on `master`, or push to `master`.

**Before the first deploy of this release, back up the database**
(Coolify → your Postgres → Backups). On first start, `db:setup` applies the
new migrations (organizations, billing) and backfills:

- every existing user gets an organization they own, named "<name>'s Program"
- every organization gets a free `manual` subscription: Pro if its owner had
  `autogen` before, Standard otherwise

Nobody gains or loses access.

---

## Day to day

- **Deploy:** merge to `master`. When CI passes, the Deploy workflow builds and
  ships automatically.
- **Redeploy or retry:** Actions → Deploy → Run workflow.
- **Roll back:** in Coolify, set the app's tag to a previous `sha-<commit>`
  (every build is tagged with its commit) and redeploy. Set it back to
  `latest` afterwards.
- **Logs:** Coolify → app → Logs. A failed `db:setup` stops the container
  before the server starts, so its error is the last thing logged.

## Optional settings

| Variable              | Effect                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ENABLE_TIER_TESTING` | `true` shows a temporary Basic/Advanced choice on sign-up and a tier switch in the sidebar, for testing both plans without payments. Remove it and restart to hide them. |
| `PAYMENT_PROVIDER`    | `manual` (default): plans activate free and immediately.                                                                                                                 |

For a ready-made account with test schedules, see
[`DEMO-ACCOUNT.md`](DEMO-ACCOUNT.md). It's seeded from the app container's
terminal.

## Troubleshooting: "column … does not exist"

Errors like `column "min_required_days" of relation "clerkships" does not exist`
or `column preceptors.phone_type does not exist` (often a 500 on `/plan`) mean
the database was created by an **older** version of the Postgres baseline
migration. That file was later edited, and migrations that have already run
never run again. Editing it is now blocked by a test (`frozen-history.test.ts`),
so this won't recur. A database that's already affected needs rebuilding.

**If the data is disposable** (testing, demos), reset the schema:

1. In Coolify, **stop** the LIC app.
2. Open the **Postgres** resource → **Terminal**, pick the database container,
   and run:

   ```bash
   psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
   ```

   This deletes **every table and row** in that database: users,
   organizations, schedules, everything.

3. **Start** (or redeploy) the LIC app. On start, `npm run db:setup` creates
   the auth tables and runs every migration against the empty schema. Check the
   app's logs for `✅ Database setup complete`.
4. Everyone signs up again. To get test data back quickly, run
   `npm run demo:seed -- --password='…'` from the app's terminal (see
   [`DEMO-ACCOUNT.md`](DEMO-ACCOUNT.md)).

Alternatively, delete the Postgres resource, create a new one, and point the
app's `DATABASE_URL` at it. The effect is the same.

**If the data must be kept**, don't reset. Ask for an in-place catch-up step
that adds the missing tables and columns without touching existing rows.

## Building the image locally

```bash
docker build -t lic .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgres://user:pass@host:5432/db \
  -e BETTER_AUTH_SECRET=change-me -e BETTER_AUTH_URL=http://localhost:3000 \
  lic
```
