# Demo account

A ready-made account for exploring features without building schedules and
entities by hand. It has **four schedules**. Each has its own students,
preceptors, clerkships and sites, and is shaped to show a different family of
behaviour. None has any assignments, so you can auto-generate or hand-build
them, then clear them and start again.

| What            | Value                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Sign-in email   | `demo@demo.lic.test` (change with `--email`)                                                              |
| Password        | whatever you pass to `--password` (or `DEMO_PASSWORD`); there is no default                               |
| Organization    | Demo University LIC, on **Pro** (auto-generation on); `--plan=standard` for Basic                         |
| Active schedule | Demo A                                                                                                    |
| Dates           | every schedule starts on the first Monday at least 14 days after you seed, so nothing is ever in the past |

## The schedules

| Schedule                                           | What it's for                                                                                                                                                                                                                                                                                                         | What auto-generation shows (measured)                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Demo A · Core rotation (happy path)**            | Block (Internal Medicine) and scattered (Family Medicine, Pediatrics) clerkships, a minimum-required-days floor, clerkships restricted to sites, ample availability, everyone onboarded. 6 students, 4 preceptors, 12 weeks.                                                                                          | Every requirement met, no conflicts (168 assignment days). The baseline to compare against.                            |
| **Demo B · Electives & teams**                     | Internal Medicine with a **required** elective (Cardiology) and an **optional** one (Dermatology), each with its own preceptor pool and site; Surgery forced to the **team-continuity** strategy with a 3-preceptor team; two students with **core preceptors**; preceptors at different sites on different weekdays. | All requirements met, with `outside_core_preceptor` warnings for days a student spends away from their core preceptor. |
| **Demo C · Tight capacity & partial availability** | 7 students and 4 preceptors who take one student each. One works Mondays and Wednesdays only, one works **half days** (AM/PM, half credit), and one is available only **"in a pinch"**. Two preceptors are **mutually exclusive**. 8 weeks.                                                                           | Unmet requirements (6 in testing). Good for the unmet-requirements view, the health panel and manual fixes.            |
| **Demo D · Onboarding, blackouts & quarters**      | Two health systems. Two students are **not onboarded** at the second one, and a clerkship is restricted to that system's clinic. Two **holiday blackouts**, four **quarters**, 16 weeks.                                                                                                                              | `not_onboarded` warnings for the two students; blackout days skipped.                                                  |

Switch between them with the schedule selector at the top of the sidebar.

## Commands

Both commands use the database your environment points at (`DATABASE_URL` for
Postgres, else `DATABASE_PATH` for SQLite), the same as every other `db:`
command.

### Create or rebuild the account

```bash
npm run demo:seed -- --password='choose-a-password'
```

- Re-running it **rebuilds the account from scratch**. It deletes the demo user
  and everything only it owns, then creates it again. That also undoes any edits
  you made while exploring: renamed entities, changed availability, raised
  capacity.
- Options:
  - `--email=you@demo.lic.test` creates a separate demo account. Several can
    coexist; non-default accounts get a suffix on their clerkship names and
    emails.
  - `--plan=standard` starts the organization on Basic instead of Pro.
  - `--force` lets the seeder replace an existing account whose email is
    **not** `@demo.lic.test`. Without it, the seeder refuses, so a typo can't
    wipe a real account.

### Clear its assignments (keep everything else)

```bash
npm run demo:clear              # demo@demo.lic.test
npm run demo:clear -- --dry-run # show what would be removed
npm run demo:clear -- --email=you@demo.lic.test
```

This removes the account's assignments, planner drafts and generation history
in all four schedules. Students, preceptors, availability, electives, blackouts,
quarters and settings stay. Use `demo:seed` instead to undo edits as well.

## Running it on the deployed app (Coolify)

The scripts are in the Docker image, so you run them inside the running app
container. No local checkout is needed.

1. In Coolify, open the **LIC app** (the Docker Image resource) → **Terminal**.
2. Pick the app container and run:

   ```bash
   npm run demo:seed -- --password='choose-a-password'
   ```

   The container already has `DATABASE_URL`, so this writes to the production
   Postgres database. The output lists each schedule and what it contains.

3. Sign in at your app's URL as `demo@demo.lic.test` with that password.
4. To start over later, run `npm run demo:clear` the same way (assignments
   only) or `npm run demo:seed -- --password=…` again (everything).

The demo data never touches other accounts. Every demo email is on the
`demo.lic.test` domain, and both scripts only remove data owned by the demo
user.

## Switching tiers while testing

Set `ENABLE_TIER_TESTING=true` on the app (Coolify → app → Environment
Variables, then restart). Two temporary controls appear:

- a **Basic / Advanced** choice on the sign-up screen, and
- a **"Testing: tier"** switch in the sidebar that moves the current
  organization between Basic (Standard) and Advanced (Pro) immediately.

Remove the variable (or set it to anything but `true`) and restart to hide both.
The demo account starts on Pro either way. Use the sidebar switch to try it on
Basic.

## Changing the scenarios

The schedules are declared in
[`src/lib/db/scripts/demo-account/scenarios.ts`](../src/lib/db/scripts/demo-account/scenarios.ts):
plain data, one object per schedule. Add a scenario or tweak one, then re-run
`demo:seed`. The builder (`builder.ts`) turns each one into the same rows the
app's own create screens produce. The test (`demo-account.test.ts`) runs the
seeder on both SQLite and Postgres.
