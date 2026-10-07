# Sign-up, Organizations & Billing — Implementation Plan

**Status:** Proposed
**Last updated:** 2026-10-07

## 1. Goals

1. New users register **as part of an organization** (a program / school) and
   pick a **tier** at sign-up.
2. Two tiers, billed per organization, monthly or annual:

   | Tier         | Includes                                                            |
   | ------------ | ------------------------------------------------------------------- |
   | **Standard** | Stage 1: manual scheduling, validation, requirement tracking, export |
   | **Pro**      | Standard + Stage 2 auto-generation (`autogen` entitlement)          |

3. Payment infrastructure exists behind a **`PaymentProvider` interface** so a
   Stripe (or other) implementation can be dropped in later. Until then a
   **`manual` provider** activates whichever tier the user picks, for free and
   immediately.
4. Org owners can **change tier after sign-up** from a billing settings page.
5. Auth stays on **better-auth**, but app code talks to an **identity
   abstraction**, so we can migrate off better-auth later without rewriting the
   app.
6. The org model is designed for the roadmap: **additional admins per org**,
   and **student** and **preceptor** accounts with limited access. Those
   accounts are *not* built in this plan, but nothing here should block them.

### Decisions captured from the requirements interview

| Question                     | Decision                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| Tiers                        | 2: Standard, Pro (Pro = auto-generation)                           |
| Billing unit                 | Organization                                                       |
| Pre-payment behaviour        | Picking either tier activates it immediately, free (`manual` provider) |
| Tier changes                 | Yes, through `/settings/billing`                                   |
| Org implementation           | better-auth organization plugin, wrapped by our own abstraction    |
| Sign-up entry points         | Public `/pricing` page that deep-links to `/register`, where the tier can still be changed |
| Billing intervals            | Monthly and annual                                                 |
| Existing users               | Backfill one org per user; Pro if they hold `autogen` today, else Standard |
| Published pricing            | None: enterprise-style "contact us for pricing"                     |
| Grace period (lapsed payment) | 30 days (arbitrary for now; one constant)                          |
| Email verification           | Not needed yet                                                     |

### Out of scope

- A real Stripe integration (only the interface and a stub are built here; the
  follow-up is outlined in §10).
- Inviting more members, and preceptor or student logins (roadmap, §11).
- Moving domain data scoping from `user_id` to `organization_id` (roadmap, §11).
- A comp or admin-override mechanism. It wasn't requested; see open questions
  in §12.

## 2. Current state (relevant pieces)

- `src/lib/auth.ts`: better-auth with email/password. `user.additionalFields`
  holds `active_schedule_id` and `entitlements` (JSON string array). A
  `user.create.after` hook creates a default schedule.
- `src/lib/db/scripts/ensure-auth-tables.ts` hand-maintains the better-auth DDL
  for each engine (SQLite and Postgres need different column types).
- `src/hooks.server.ts` resolves the session, then reads `user.entitlements`
  into `locals.entitlements`. It enforces the 401 API default-deny and the
  `autogen` prefix gate (`src/lib/server/api-auth.ts`).
- `src/lib/server/entitlements.ts` provides `hasAutogen` and `requireAutogen`
  (used by handlers as defence in depth).
- `/register` is client-side only (`authClient.signUp`). Its server load is
  empty.
- Domain data is scoped by `user_id`, and the account-based
  `DESIGN_MULTI_TENANCY.md` was never built. The existing `account` table is
  better-auth's credential table, **not** an organization.
- Migrations: engine-specific history in `migrations/sqlite` and
  `migrations/postgres`. Every new migration goes in `migrations/shared/` and
  is numbered `1xx` (the next free number is 112).
- `scripts/set-entitlement.ts` flips `autogen` by hand. The seed creates
  `admin@example.com` (autogen) and `basic@example.com` (no autogen).

## 3. Architecture overview

```
 routes / loaders / API handlers
        │  depend only on ↓
 ┌──────────────────────────────────────────────────────────────┐
 │ $lib/server/identity   IdentityService  (sessions, sign-up,  │
 │                        orgs, memberships, roles)             │
 │ $lib/server/authz      Role → Permission map, can()/require()│
 │ $lib/server/billing    BillingService, plan catalog,         │
 │                        EntitlementService                    │
 │                        PaymentProvider ← ManualProvider      │
 │                                        ← StripeProvider (later)
 └──────────────────────────────────────────────────────────────┘
        │ implemented by
 better-auth (+ organization plugin)      our own billing tables
```

Rules:

- **Only** `src/lib/auth.ts`, `src/lib/auth-client.ts` and
  `src/lib/server/identity/better-auth/**` may import from `better-auth`. A
  unit test scans `src/` and fails on any other import (the repo has no ESLint,
  so a test is the enforcement point).
- App code works with our own types (`AppSession`, `AppUser`, `OrgMembership`,
  `Role`), never better-auth's `Session` or `User`.
- **Entitlements are derived, not stored**: `entitlements = plan.features` of
  the org's active subscription. `user.entitlements` stops being the source of
  truth.

## 4. Data model

### 4.1 Organizations and membership (better-auth organization plugin)

Enable `organization()` in `createAuth` and `organizationClient()` in
`auth-client.ts`. The plugin owns these tables:

| Table          | Key columns                                                          |
| -------------- | -------------------------------------------------------------------- |
| `organization` | `id`, `name`, `slug`, `logo`, `metadata`, `createdAt`                |
| `member`       | `id`, `organizationId`, `userId`, `role`, `createdAt`                |
| `invitation`   | `id`, `organizationId`, `email`, `role`, `status`, `expiresAt`, `inviterId` (unused for now; created so invites need no schema change) |
| `session`      | + `activeOrganizationId`                                             |

These tables go into `ensure-auth-tables.ts` with the same per-engine type
profile as the existing auth tables (idempotent `ifNotExists`, plus a guarded
`ALTER` for `session.activeOrganizationId`). Before writing DDL, generate the
reference schema with `npx @better-auth/cli generate` against the pinned
better-auth version and copy its columns exactly (see step 2.1).

**Roles** are stored as strings in `member.role`. Our role set:

| Role        | Now   | Purpose                                              |
| ----------- | ----- | ---------------------------------------------------- |
| `owner`     | ✅    | Created at sign-up; full access including billing    |
| `admin`     | later | Additional org admins; full access including billing |
| `preceptor` | later | Limited: view own schedule/availability              |
| `student`   | later | Limited: view own schedule/requirements              |

Roles are registered with the plugin through `createAccessControl`, so
better-auth accepts them. **Permission checks still go through our own
`$lib/server/authz`**, so they survive a move off better-auth.

### 4.2 Billing (our tables, shared migration `112_billing.ts`)

```text
billing_customers
  organization_id      text PK         -- one billing customer per org
  provider             text            -- 'manual' | 'stripe'
  provider_customer_id text null
  created_at, updated_at

subscriptions
  id                       text PK
  organization_id          text not null  (index; at most one non-canceled row per org)
  plan_id                  text not null  -- 'standard' | 'pro'
  billing_interval         text not null  -- 'month' | 'year'
  status                   text not null  -- 'active' | 'trialing' | 'past_due'
                                           --  | 'incomplete' | 'canceled'
  provider                 text not null
  provider_subscription_id text null      (unique when not null)
  current_period_end       text null      -- ISO; null for manual
  grace_ends_at            text null      -- ISO; set on entering past_due (30 days)
  cancel_at_period_end     integer not null default 0
  created_at, updated_at

billing_events                                  -- webhook idempotency + audit
  id                text PK
  provider          text not null
  provider_event_id text not null              (unique with provider)
  type              text not null
  payload           text not null              -- raw JSON
  processed_at      text null
  created_at
```

Use text and 0/1 integer columns, following the app-wide portable convention
(`DdlTypeMap`). Also add to `migrations.equivalence.test.ts` and regenerate
`src/lib/db/types.ts` (`npm run db:types`).

### 4.3 Plan catalog (code, not DB): `src/lib/billing/plans.ts`

```ts
export type PlanId = 'standard' | 'pro';
export type BillingInterval = 'month' | 'year';

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  features: readonly Entitlement[];          // pro: ['autogen']
  pricing:                                    // enterprise: no list price today
    | { kind: 'contact' }
    | { kind: 'listed'; prices: Record<BillingInterval, { amountCents: number; currency: 'usd' }> };
  rank: number;                               // for upgrade/downgrade wording
}
```

Both plans start as `{ kind: 'contact' }`, so the UI shows "Contact us for
pricing" (`PUBLIC_SALES_CONTACT_EMAIL`) instead of a price. The
`billing_interval` stays in the data model so a provider can bill monthly or
annually. Subscriptions default to `year`, and the interval toggle only shows
for a plan with `kind: 'listed'`. Switching to published prices later is a
catalog edit, not a schema change.

The catalog is shared by client and server (pricing page, register form,
settings). Processor price IDs are **not** in the catalog: each provider maps
`(planId, interval)` to its own IDs from env (for example
`STRIPE_PRICE_PRO_YEAR`), so the catalog never depends on a provider.

## 5. Service interfaces

### 5.1 Identity: `src/lib/server/identity/`

```ts
export interface AppUser    { id: string; email: string; name: string }
export interface AppSession { user: AppUser; activeOrganizationId: string | null }
export type Role = 'owner' | 'admin' | 'preceptor' | 'student';
export interface OrgMembership { organizationId: string; organizationName: string; role: Role }

export interface IdentityService {
  getSession(headers: Headers): Promise<AppSession | null>;
  signUpWithEmail(input: { name: string; email: string; password: string }):
    Promise<{ user: AppUser; responseHeaders: Headers }>;      // carries Set-Cookie
  createOrganization(input: { name: string; ownerUserId: string }): Promise<{ id: string }>;
  listMemberships(userId: string): Promise<OrgMembership[]>;
  getMembership(userId: string, organizationId: string): Promise<OrgMembership | null>;
  setActiveOrganization(headers: Headers, organizationId: string): Promise<void>;
}
```

`better-auth/identity.ts` implements this with `auth.api.*`. `hooks.server.ts`
and loaders use `identity`, not `auth`, except for `svelteKitHandler`, which
lives behind the same adapter.

### 5.2 Authorization: `src/lib/server/authz/`

```ts
export type Permission =
  | 'billing:manage' | 'org:manage_members'
  | 'schedule:edit'  | 'schedule:view_own';

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner:     ['billing:manage', 'org:manage_members', 'schedule:edit'],
  admin:     ['billing:manage', 'org:manage_members', 'schedule:edit'],
  preceptor: ['schedule:view_own'],
  student:   ['schedule:view_own'],
};
export function can(m: OrgMembership | null, p: Permission): boolean;
export function requirePermission(locals: App.Locals, p: Permission): void; // 403
```

For now only `billing:manage` is enforced (on billing routes). The rest
document where future roles plug in.

### 5.3 Payments: `src/lib/server/billing/providers/`

```ts
export interface PaymentProvider {
  readonly id: 'manual' | 'stripe';

  ensureCustomer(org: { id: string; name: string; email: string }):
    Promise<{ providerCustomerId: string | null }>;

  /** Start a subscription. Either it is active now, or the user must be sent to a hosted checkout. */
  startSubscription(input: {
    organizationId: string; providerCustomerId: string | null;
    planId: PlanId; interval: BillingInterval;
    successUrl: string; cancelUrl: string;
  }): Promise<
    | { kind: 'activated'; subscription: ProviderSubscription }
    | { kind: 'redirect'; url: string }
  >;

  changeSubscription(input: {
    subscription: SubscriptionRecord; planId: PlanId; interval: BillingInterval;
  }): Promise<{ kind: 'updated'; subscription: ProviderSubscription } | { kind: 'redirect'; url: string }>;

  cancelSubscription(input: { subscription: SubscriptionRecord; atPeriodEnd: boolean }):
    Promise<ProviderSubscription>;

  /** Hosted "manage payment method / invoices" page; null when unsupported. */
  getCustomerPortalUrl(input: { providerCustomerId: string; returnUrl: string }): Promise<string | null>;

  /** Verify and normalize a webhook. Returns null for ignorable events; throws on a bad signature. */
  parseWebhook(request: Request): Promise<BillingEvent | null>;
}

export type BillingEvent =
  | { type: 'subscription.updated'; providerEventId: string; subscription: ProviderSubscription }
  | { type: 'subscription.canceled'; providerEventId: string; providerSubscriptionId: string }
  | { type: 'payment.failed';        providerEventId: string; providerSubscriptionId: string };
```

- **`ManualProvider`**: `startSubscription` and `changeSubscription` return
  `activated`/`updated` with `status: 'active'`, no period end and no customer
  ID. `getCustomerPortalUrl` returns `null`. `parseWebhook` throws, because
  there are no webhooks.
- **Factory** `getPaymentProvider()` reads `PAYMENT_PROVIDER` (default
  `manual`). An unknown value fails at startup.

### 5.4 BillingService and EntitlementService: `src/lib/server/billing/`

`BillingService` is the only code that writes the billing tables. It takes
`(db, provider)` as constructor dependencies so it can be tested with a fake
provider.

- `subscribe(orgId, planId, interval, urls)`: `ensureCustomer`, then
  `startSubscription`. If `activated`, it upserts the `subscriptions` row. If
  `redirect`, it writes an `incomplete` row and returns the URL.
- `changePlan(orgId, planId, interval)`: rejects a no-op change, then delegates
  to the provider and writes the result.
- `cancel(orgId)`: not exposed in the UI yet; tested only.
- `handleWebhook(event)`: inserts into `billing_events`. A unique-key conflict
  means a duplicate, which is a no-op. Otherwise it applies the change and
  stamps `processed_at`.
- `getSubscription(orgId)`: returns the current non-canceled row.

`EntitlementService.forOrganization(orgId)` returns `plan.features` when the
status is `active` or `trialing`, or `past_due` while `now < grace_ends_at`.
Otherwise it returns `[]`.

**Grace period:** `BILLING_GRACE_DAYS = 30` (one constant in
`src/lib/billing/policy.ts`). When `BillingService` first moves a subscription
to `past_due`, it stamps `grace_ends_at = now + 30 days`, and clears it when the
subscription returns to `active`. This needs a `grace_ends_at text null` column
on `subscriptions` (§4.2).

## 6. Request flow changes

### 6.1 `hooks.server.ts`

1. `identity.getSession()` sets `locals.session: AppSession | null`.
2. Resolve the active org: the session's `activeOrganizationId` if the user is
   still a member, else the user's only membership (persisted back with
   `setActiveOrganization`), else `null`. This sets
   `locals.organization: { id, name, role } | null`.
3. `locals.entitlements = organization ? await entitlements.forOrganization(org.id) : []`.
4. The existing 401 and autogen gates are unchanged (they read
   `locals.entitlements`).

`App.Locals` changes: `session` is retyped to `AppSession` and `organization`
is added. The existing `hasAutogen`, `requireAutogen` and all
`locals.session.user.id` call sites keep working, because `AppSession.user.id`
keeps the same shape. Run `npm run check` to catch any use of better-auth-only
fields.

### 6.2 `(app)/+layout.server.ts` guard order

1. No session: redirect to `/login`. *(existing)*
2. **No organization: redirect to `/onboarding/organization`.** *(new)* This
   catches half-finished sign-ups and backfill gaps, and later serves
   invite-accepting users.
3. **No usable subscription (not active, not trialing, and not past_due within the 30-day grace period):
   redirect to `/settings/billing`.** *(new; can't happen with the `manual`
   provider, but required for Stripe)*
4. No schedule: redirect to `/schedules/new`. *(existing)*

Exempt `/onboarding/*` from guards 2–4 and `/settings/billing` from guards 3–4.

## 7. UX

### 7.1 `/pricing` (public, new)

- Two tier cards with a feature comparison. Each card reads "Contact us for
  pricing" with a mailto link to `PUBLIC_SALES_CONTACT_EMAIL`. A
  Monthly/Annual toggle shows only once a plan has `kind: 'listed'` pricing.
- Each card also has a "Get started" CTA linking to `/register?plan=<id>`
  (plus `&interval=` when prices are listed). Until payments go live,
  registering is free on either tier.
- Link it from the public landing page (`(public)/+page.svelte`) and the login
  page.

### 7.2 `/register` (reworked)

- Fields: name, email, password, **organization / program name**, and a **tier
  selector** (two compact cards plus an interval toggle). The selector is
  preselected from `?plan=&interval=`, defaulting to Standard/annual, and can
  be changed on the page.
- Move submission from the client-only `authClient.signUp` to a **SvelteKit
  form action** (zod-validated, with superforms, which the app already uses).
  The action runs:
  1. `identity.signUpWithEmail`, forwarding `Set-Cookie` to the response
  2. `identity.createOrganization({ name: orgName, ownerUserId })`, which adds
     the `owner` member
  3. `identity.setActiveOrganization`
  4. `billing.subscribe(orgId, plan, interval, …)`
  5. On `redirect`, go to the checkout URL (future Stripe). On `activated`, go
     to `/schedules/new` (today's flow).
- Failure handling: if step 1 fails, re-render the form with the error
  (duplicate email and so on). If any later step fails, the user exists and is
  logged in, so redirect to `/onboarding/organization?plan=…`, which can resume
  steps 2–4. No compensating delete.
- The default-schedule `user.create.after` hook stays. The schedule is still
  `user_id`-scoped, so this is unchanged.

### 7.3 `/onboarding/organization` (new)

A minimal form (org name, tier, interval) that performs steps 2–4 of the
register action for a logged-in user with no org. It shares a single
`completeOrganizationSignup()` server function with `/register`.

### 7.4 `/settings/billing` (new, requires `billing:manage`)

- Current plan, interval, status, renewal date (if any) and provider.
- Change plan/interval: the same plan-card component, confirmed with
  `confirm-dialog.svelte`. A form action calls `billing.changePlan` and follows
  a returned `redirect` URL.
- A "Manage payment method" button appears only when `getCustomerPortalUrl`
  returns a URL, so it's hidden while the provider is `manual`.
- Downgrading Pro to Standard: the warning text explains that generated
  assignments stay and remain editable by hand (spec G8 parity). Only
  generation and Stage 2 config are hidden.
- Add a sidebar or user-menu link in the `(app)` layout. Show a "Pro" badge
  next to the org name.

### 7.5 Upgrade prompts

Wherever Stage 2 is gated today (the `/generate` nav item and 403 responses),
show "Upgrade to Pro" linking to `/settings/billing`, for users holding
`billing:manage`.

## 8. Webhook endpoint (stub)

`POST /api/billing/webhooks/[provider]`

- Add `/api/billing/webhooks/` to `PUBLIC_API_PREFIXES`. Providers authenticate
  with signatures, not sessions.
- Return 404 when `[provider]` is not the configured provider. Otherwise call
  `provider.parseWebhook`, then `billing.handleWebhook`. Return 400 on a
  signature error and 200 on success or duplicate.
- Under `manual` the route always returns 404, but the route and its tests
  exist so the Stripe work only adds a provider.

## 9. Delivery phases

Each phase is one PR, and green on `npm run check`, `test:unit`, `test:pg` and
the e2e smoke run.

### Phase 1: Identity abstraction (no behaviour change) ✅ Done

What shipped:

- `src/lib/server/identity/`: `types.ts` (`AppUser`, `AppSession`,
  `IdentityService`, `IdentityError`), `better-auth/identity.ts` (the adapter,
  which maps better-auth `APIError` codes onto `email_taken`, `invalid_input`
  and `invalid_credentials`) and `index.ts` (the `identity` singleton). It
  uses relative imports so the seed script still runs under `tsx`.
- `src/lib/identity-client.ts`: the browser wrapper (`signInWithEmail`,
  `signUpWithEmail`, `signOut`, each returning a result object). The login
  form, register form and app-layout logout use it.
- `hooks.server.ts` uses `identity.getSession` and `identity.handleRequest`.
  Entitlements are now always read from the `user` row, because `AppUser` no
  longer carries better-auth's additional fields.
- `App.Locals.session` is `AppSession`. `/api/scheduling-periods` reads
  `locals.session` instead of calling better-auth again. The seed uses
  `identity.signUpWithEmail`.
- `import-boundary.test.ts`: fails on any non-test import of `better-auth*`,
  `$lib/auth` or `$lib/auth-client` outside the identity layer.
- Adapter tests on SQLite and PGlite (in `auth.signup.test.ts`).

Original steps:

1. Add `identity/types.ts`, the `IdentityService` interface and its
   better-auth implementation, wrapping today's `getSession` and sign-up.
2. Switch `hooks.server.ts`, `app.d.ts`, `(app)/+layout.server.ts` and the
   other `auth.api` callers to `identity`.
3. Add the import-boundary test (better-auth imported only from the allowlist).
4. Tests: identity adapter against SQLite and PGlite (extend
   `auth.signup.test.ts`).

### Phase 2: Organizations, roles and backfill ✅ Done

What shipped (and where it differs from the steps below):

- **Spike result:** better-auth 1.3.34's `organization()` plugin. Its schema
  was read from `getAuthTables({ plugins: [organization()] })`:
  `organization.slug` is required and unique (we add a random suffix),
  `member` has no `updatedAt`, `invitation` has no `createdAt`. Server-side
  `createOrganization` accepts `userId` without a session; with session
  headers it also sets `session.activeOrganizationId`. The plugin rejects
  unknown roles, so all four are registered in
  `identity/better-auth/access.ts` (owner and admin use the plugin's
  owner/admin statements; preceptor and student get plain-member statements).
- **Tables:** `ensure-auth-tables.ts` creates `organization`, `member` (plus a
  unique index on `userId, organizationId`) and `invitation`, and adds
  `session.activeOrganizationId`. `src/lib/db/types.ts` gained the three
  tables, edited by hand: full regeneration would have rewritten unrelated
  hand-tuned auth types. `test-utils.ts` now builds auth tables with
  `ensureAuthTables`, so tests use the production DDL.
- **IdentityService:** `createOrganization` and `listMemberships`.
  `AppSession.activeOrganizationId`. Roles are `ROLES`/`Role`/`OrgMembership`
  in `identity/types.ts`. `pickActiveMembership` and `organizationSlug` live in
  `identity/memberships.ts`. `organizationClient()` was **not** added; nothing
  in the browser needs it until invites exist.
- **authz:** `src/lib/server/authz` (`PERMISSIONS`, `ROLE_PERMISSIONS`, `can`,
  `requirePermission`).
- **Request flow:** the hook sets `locals.organization` (membership re-checked
  every request; a stale active org falls back to the oldest membership). The
  root layout exposes `organization` to pages. `(app)` redirects org-less users
  to `/onboarding/organization`, a new route group with a form action that
  makes the user the `owner`. Until Phase 4 adds the org name to `/register`,
  every new account passes through this page. The e2e
  `registerViaForm` fills it in.
- **Backfill is a setup step, not a migration.** Shared migrations may only
  import `kysely` and can't create rows through better-auth (which handles
  per-engine dates). So `src/lib/server/organizations/backfill.ts` runs from
  both `db:setup` and `db:migrate`, after migrations, through
  `IdentityService`. It's idempotent. `db:migrate` now also runs
  `ensureAuthTables` first. Anyone it misses still hits onboarding.
- **Seed:** `admin@example.com` owns "Demo Program", `basic@example.com` owns
  "Tenant B Program".
- **Resets:** `resetUser` deletes the user's memberships and invitations, and
  any organization they were the only member of. `resetAll` empties the org
  tables.

Original steps:

1. **Spike:** confirm the organization plugin API and schema for the locked
   better-auth version (`package-lock` resolves `^1.3.4`; code comments
   reference 1.3.34). Generate the reference schema with the better-auth CLI.
2. Enable `organization()` with `createAccessControl` roles (owner, admin,
   preceptor, student) and `organizationClient()`.
3. Add the org plugin tables to `ensure-auth-tables.ts` for both engines.
   Confirm the `db:setup`/e2e bootstrap order (ensure-auth-tables runs before
   migrations).
4. Implement org methods on `IdentityService`; add `authz/` with `can` and
   `requirePermission`.
5. Resolve `locals.organization` in the hook; add the no-org guard and the
   `/onboarding/organization` route (name only for now).
6. Backfill migration `112_backfill_organizations.ts` (shared, idempotent,
   guarded on the existence of the `organization` table). For each user without
   a `member` row: create an org named after the user (`"<name>'s Program"`,
   falling back to email) and an `owner` member. Existing `session` rows are left alone.
   The hook sets the active org lazily on the next request.
7. Tests: role/permission matrix; hook org resolution (member, stale active
   org, no org); backfill on both engines, run twice to show idempotency.

### Phase 3: Billing domain and derived entitlements

1. `src/lib/billing/plans.ts` catalog (both plans `kind: 'contact'`) and
   `src/lib/billing/policy.ts` (`BILLING_GRACE_DAYS = 30`).
2. Migration `112_billing.ts` (tables in §4.2). Regenerate `types.ts` and
   extend the equivalence test.
3. `PaymentProvider` interface, `ManualProvider`, the `getPaymentProvider()`
   factory and the `PAYMENT_PROVIDER` env var (document in README and
   `.env.example`).
4. `BillingService` and `EntitlementService`. Switch the hook to org-derived
   entitlements.
5. Subscription backfill as a **setup step** (like the Phase 2 org backfill,
   and run right after it in `db:setup`/`db:migrate`): create a `manual`
   subscription for every org without one. Pro/annual if the owner's
   `user.entitlements` contains `autogen`, else Standard/annual.
6. Retire `user.entitlements` as a source: remove it from `additionalFields`
   and stop reading it in the hook. Keep the column, and drop it in a later
   cleanup migration once data is verified.
7. Replace `scripts/set-entitlement.ts` with `scripts/set-plan.ts <email> standard|pro [month|year]`,
   which calls `BillingService.changePlan` on the user's org.
8. Tests: catalog invariants (Pro ⊇ Standard features, a `listed` plan prices
   both intervals); grace period (past_due within 30 days is entitled, past it
   is not, and returning to active clears it);
   ManualProvider; BillingService with a fake provider covering activated,
   redirect leading to an incomplete row, change, no-op change, cancel, and
   webhook idempotency; entitlement status matrix; the existing
   `requiresAutogenEntitlement` and hook tests updated to set up an org and
   subscription instead of `user.entitlements`.

### Phase 4: Sign-up UX

1. Shared `plan-card` and `plan-picker` components (Svelte 5 runes,
   shadcn-svelte `card` and `badge`).
2. `/pricing` page.
3. Rework `/register`: new fields and a form action calling
   `completeOrganizationSignup()`.
4. Extend `/onboarding/organization` with the plan picker.
5. Tests: component tests for the plan picker (query preselection, interval
   toggle); form action integration tests (Standard results in no autogen; Pro
   results in autogen; duplicate email; org failure redirecting to
   onboarding).

### Phase 5: Billing settings, webhook stub and upgrade prompts

1. `/settings/billing` page and actions guarded by `billing:manage`.
2. `/api/billing/webhooks/[provider]` route and public-prefix entry.
3. "Upgrade to Pro" affordances at the existing Stage 2 gates.
4. Tests: action authorization (a non-`billing:manage` role gets a 403, using
   a synthetic `admin` or `student` member); upgrade grants `autogen` on the
   next request; downgrade revokes it; webhook route returns 404 under
   `manual`; `api-auth` public-prefix test updated.

### Phase 6: Seed, e2e and docs

1. Seed: `admin@example.com` gets org "Demo Program" on Pro;
   `basic@example.com` gets "Tenant B Program" on Standard. Update the README
   login table.
2. E2E journeys (Playwright `journeys` project):
   - `@smoke` registering from `/pricing` with Pro: lands on schedule creation
     with the `/generate` nav visible.
   - Registering with Standard: no `/generate` nav, and `/api/schedules/generate`
     returns 403.
   - Standard upgrading to Pro in `/settings/billing`: `/generate` becomes
     available. Downgrading reverses it.
   - Run `npm run coverage:map` and update the coverage map.
3. Docs: update `PRODUCT_SPEC.md` (tiers), the README (env vars, scripts,
   seed logins), and mark this plan Implemented.

## 10. Follow-up: Stripe provider (later, not in this plan)

- `StripeProvider implements PaymentProvider`:
  - Customers are created on `ensureCustomer`.
  - `startSubscription` creates a Checkout Session (`mode: 'subscription'`)
    and returns `redirect`.
  - `changeSubscription` calls `subscriptions.update` with proration.
  - `getCustomerPortalUrl` uses the Billing Portal.
  - `parseWebhook` verifies `stripe-signature` with `STRIPE_WEBHOOK_SECRET` and
    maps `customer.subscription.*` and `invoice.payment_failed` to
    `BillingEvent`.
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_{STANDARD,PRO}_{MONTH,YEAR}`.
- Migrate existing `manual` subscriptions with a script that creates Stripe
  customers and subscriptions, or by prompting owners to enter a card before a
  cutoff date.
- Consider better-auth's `@better-auth/stripe` plugin only if it can sit behind
  `PaymentProvider`. The interface above deliberately doesn't assume it.

## 11. Roadmap this plan prepares for

| Future feature                  | What's already in place                                         | What it will add                                            |
| ------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Additional org admins           | `admin` role, `invitation` table, `org:manage_members` permission | Invite UI and accept flow (onboarding guard already handles it) |
| Preceptor and student accounts  | Roles and `schedule:view_own` permission; `IdentityService` memberships | Linking a member to a `preceptors.id`/`students.id` row, read-only portals, and route-level permission checks |
| Org-scoped data (true multi-tenancy) | `locals.organization` on every request; one owner per org today means `user_id` scoping ≡ org scoping | Migrations adding `organization_id` to domain tables, and switching scope helpers from `user_id` to org |
| Seat-based pricing              | Plan catalog in code; provider maps prices                       | A `seats` quantity on subscriptions                          |
| Leaving better-auth             | All app code uses `IdentityService` and our own types; import-boundary test | A new adapter plus a data migration of the auth and org tables |

## 12. Open questions and risks

1. **Sales contact (placeholder for now).** "Contact us for pricing" doesn't
   need to work yet. It links to `PUBLIC_SALES_CONTACT_EMAIL`, defaulting to
   the placeholder `mailto:sales@example.com`. Swap in the real address or
   form when sales is ready.
2. **Comp / pilot accounts.** Once Stripe is live, how should pilot schools get
   Pro without paying? Options: keep those orgs on the `manual` provider, or
   use a 100% coupon in Stripe. No schema change is needed either way.
3. **Institutional invoicing.** Medical schools often pay by PO or invoice
   rather than card. Stripe Invoicing (`collection_method: send_invoice`) fits
   the same interface, but confirm the need.
4. **After the grace period.** The grace period is 30 days (decided). Once it
   ends, or on `canceled`/`incomplete`, the app locks to `/settings/billing`.
   Should Standard data stay read-only instead of being locked?
5. **better-auth version.** The organization plugin's schema and API differ
   across 1.x minors. Phase 2's spike pins this down before any DDL is written.
