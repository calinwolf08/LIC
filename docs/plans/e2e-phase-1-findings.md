# E2E Phase 1 — findings

Findings surfaced while writing the Phase 1 journeys (identity, schedules, the
navigation shell). Each is either **fixed** in this phase (with a regression
test) or **deferred** with a recommendation for the phase that owns it.

## Fixed in Phase 1

### P1-a — Duplicating a schedule always failed validation _(product bug, fixed)_

`duplicateScheduleSchema` required `year` (an integer 2000–2100), but the
new-schedule wizard's duplicate path never sends a `year` (a schedule is defined
by its date range; `year` is a legacy nullable column). Every "Duplicate →
Create Schedule" therefore returned `400 Validation failed` and the user was
stranded on the prefilled wizard. The legacy e2e only checked that the wizard
_opened_ prefilled, so this shipped broken.

- Fix: `year` is now `.nullish()` in `duplicateScheduleSchema`;
  `duplicateToNewSchedule` accepts `number | null | undefined` and writes
  `year ?? null`.
- Regression: `schedule-duplication.service.test.ts` → "duplicates without a
  year (the wizard does not collect one) — regression P1-a".
- Covered e2e by J1.2 (both tiers).

### P1-d — A malformed entity id rendered a 500, not a not-found page _(product bug, fixed)_

Detail-page loads (`students`, `preceptors`, `sites`, `health-systems`) mapped
only `status === 404` to the not-found page. A malformed id (e.g. a mistyped or
stale link) makes the API return `400` from `cuid2Schema`, which fell through to
a generic `throw` → the SvelteKit **500** error page — a dead end that violates
R10.2/R10.6. Each load now treats `400` the same as `404` (a bad id reads as "no
such entity"). `clerkships` already did the robust thing. Covered e2e by J1.4.

### P1-f — `redirectTo` dropped the query string _(product bug, fixed)_

The app layout built `redirectTo` from `url.pathname` only, so a deep link like
`/students?tab=progress` taken while logged out came back as `/students` after
login. Now uses `url.pathname + url.search`. Covered e2e by J1.1.

## Deferred (recommendation noted)

### P1-b — The schedule wizard shows the **Teams** step to non-entitled users _(gating gap)_

`new-schedule-wizard.svelte` renders a fixed 8-step flow including **Teams**
(step index 5) for every user. Teams are a Stage 2 concept (spec G-7: "non-
entitled users see … no team requirements"). The fix (drop the Teams step for
non-entitled users) touches the wizard's hard-coded step indices
(`getCurrentStepSelections`, `case 5/6`, the template's `currentStep` branches),
so it is a small but index-fragile refactor. **Recommendation:** do it in
**Phase 6 / J6.2** ("wizard has no Teams step"), where all gating fixes land and
are asserted in both directions together. J1.2 walks the wizard on both tiers
today and simply passes through whatever steps are present.

### P1-c — Deleting the active schedule drops to an empty state instead of selecting another _(UX gap)_

`deleteSchedulingPeriod` clears `active_schedule_id` when the deleted schedule
was active but does not promote a remaining schedule, so the user lands on the
"No active schedule" empty state even when other schedules exist. This is the
behaviour the existing `empty-states.spec` already relies on, and J1.2 asserts
it as current behaviour. **Recommendation:** decide whether delete-active should
auto-select the most-recent remaining schedule; if so, implement in the schedule
service and update J1.2. Low severity (one click via the empty-state CTA
recovers).

Related: the service refuses to delete a schedule whose **legacy** `is_active`
column is 1 (only the seeded Demo Schedule), which is a different notion from the
per-user `active_schedule_id`. The two "active" concepts are worth reconciling
but are out of scope for Phase 1.

### P1-e — No form guards navigation away from unsaved edits (spec R10.3) _(spec vs. impl gap)_

`FormShell` implements a `beforeNavigate` + native `beforeunload` guard with a
"Discard unsaved changes?" dialog, but it is imported by **zero** forms. The
availability builder shows an "Unsaved changes" text indicator yet still does
not block navigation. So R10.3 ("unsaved-changes warning on all multi-field
forms") is effectively unimplemented — navigating away from a half-filled
student/preceptor/clerkship/schedule form silently loses the input.

J1.5's last test documents the current (unguarded) behaviour so it flips the day
a guard is wired in. **Recommendation:** this is a cross-cutting feature (wrap
each `FormShell`-eligible form and pass an `isDirty` predicate); schedule it as
its own hardening task rather than folding it into an e2e phase, since it spans
every entity form. R10.6 (no `alert()`/`confirm()` in the app UI) is satisfied
today — the only `confirm()` calls are in CLI reset scripts.
