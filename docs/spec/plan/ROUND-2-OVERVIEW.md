# Round 2 — Post-Beta Fixes (Steps 15–24)

Steps 01–14 built the two-stage product. Round 2 addresses issues found during first real use of the app on a fresh account. Read `GUIDELINES.md` first — it binds every step.

> **Picking this up mid-round?** Start with **`HANDOFF.md`** — it records what is already shipped
> (steps 15–23), what remains (24), and the operational gotchas (build/seed loop,
> the real seeded schedule name and date range, hand-built test schemas) that cost real time to
> rediscover.

## Execution order

Steps are ordered by dependency. **15 must run first** (it fixes a root cause behind several symptoms). 17 → 18 is a hard chain (backend before the dialog that consumes it). 22 and 23 are independent and may run in parallel.

```
15 ─┬─> 16 ─┐
    │       ├─> 17 ─> 18 ─┬─> 19
    │       │             ├─> 20
    │       └─────────────┴─> 21
    └─> 23
22 (independent)
                      all ─> 24
```

| Step | Title | Depends on | Status |
|---|---|---|---|
| 15 | Schedule scoping correctness & range foundation | — | ✅ shipped |
| 16 | Preceptor availability: crash fix, wizard, layout | 15 | ✅ shipped |
| 17 | Assignment eligibility, day states, override model (backend) | 15, 16 | ✅ shipped |
| 18 | One assignment dialog everywhere | 17 | ✅ shipped |
| 19 | Student page rework | 15, 17, 18 | ✅ shipped |
| 20 | Calendar page rework | 15, 17, 18 | ✅ shipped |
| 21 | Preceptor page assignments | 16, 17, 18 | ✅ shipped |
| 22 | Entity consistency: "Manage" + read-only overviews | — | ✅ shipped |
| 23 | Navigation: fold Schedules into the switcher | 15 | ✅ shipped |
| 24 | Integrated regression | all | ⬜ next |

## Root causes worth knowing before you start

Three findings explain a disproportionate number of the reported symptoms. Read these before picking up any step.

1. **Two competing definitions of "active schedule."** `getActiveSchedulingPeriod(db)` resolves the working schedule from the **global** `scheduling_periods.is_active = 1` flag, while the rest of the app uses the **per-user** `user.active_schedule_id`. New users' schedules are created with `is_active = 0`, so this lookup returns nothing and `schedule-views-service.ts` falls back to a **whole calendar year** (`YYYY-01-01`…`YYYY-12-31`). That single fallback produces the "full year calendar" and "capacity months outside my range" reports. It is also a cross-tenant leak — with a seeded row flagged active, one user's views can adopt another's date range. **Step 15.**

2. **A camelCase/snake_case mismatch.** `getStudentScheduleData` returns `clerkshipName`/`preceptorName`; the student schedule table reads `clerkship_name`/`preceptor_name`. Hence the blank Clerkship and Preceptor columns. **Step 19.**

3. **An unguarded prop.** `pattern-form.svelte:31` dereferences `sites.length` at init, and its caller passes a preceptor payload that doesn't always carry `sites` — the exact `TypeError` reported. The deeper issue is that the API's preceptor shape is not guaranteed. **Step 16.**

Also relevant: `schedule_assignments` has **no `schedule_id` column**; assignments are scoped only transitively via `schedule_students`. Don't assume direct scoping when writing queries.

## Issue → step traceability

Every issue reported from the beta session, mapped to where it is fixed. Step 24 requires each row to have a test that fails before the fix.

| # | Reported issue | Step |
|---|---|---|
| 1 | Schedule rename doesn't update the sidebar dropdown until refresh | 15 |
| 2 | Preceptor wizard step 3: no way to actually set availability | 16 |
| 3 | Wizard says "no sites" though a site was chosen on the previous step | 16 |
| 4 | Capacity Overview shows months outside the schedule range | 15, 16 |
| 5 | Availability/schedule tabs show a full year, not the schedule range | 15, 16 |
| 6 | Must scroll to the bottom to edit availability | 16 |
| 7 | `TypeError: can't access property "length", $$props.sites is undefined` | 16 |
| 8 | Details-tab info not visible (read-only) on Overview | 22 |
| 9 | Add-assignment doesn't filter clerkship/preceptor/site to valid combinations | 17, 18 |
| 10 | Dates ignore preceptor availability; don't show already-scheduled days | 17, 18 |
| 11 | No range/block/individual day selection when assigning | 18 |
| 12 | No availability override prompt (+ option to update the preceptor's availability) | 17, 18 |
| 13 | No double-book prompt (double-book / move other student; raise limit vs one-time) | 17, 18 |
| 14 | "Lock this assignment" visible without the autogen entitlement | 18 |
| 15 | Can't see student progress + assigned preceptors while assigning | 18, 19 |
| 16 | No warning when assigning more days than a clerkship requires | 17, 18 |
| 17 | No onboarding warning (linking to the Onboarding tab) on the student page | 19 |
| 18 | Student schedule tab: Clerkship/Preceptor columns empty | 19 |
| 19 | Student schedule should default to calendar, with a list toggle | 19 |
| 20 | Assignments can only be removed, not edited | 19, 20, 21 |
| 21 | Past-dated assignments: need an override to remove/replace | 17, 19 |
| 22 | Lists say "View"/"Edit" — should be "Manage"; drop the locations edit dialog | 22 |
| 23 | Calendar opens in list view | 20 |
| 24 | Calendar day cells show "Int" instead of student·clerkship·preceptor | 20 |
| 25 | Calendar edit popup should be the full assignment dialog (single day) | 20 |
| 26 | Calendar add-assignment = student-page dialog + a student dropdown | 20 |
| 27 | Preceptor page add-assignment needs the same logic and context | 21 |
| 28 | Schedule health not visible from the calendar | 20 |
| 29 | Overrides aren't tracked or reviewable | 17, 20 |
| 30 | `/schedules` vs `/calendar` is confusing; move to the switcher | 23 |
| 31 | All of the above need real test coverage | every step + 24 |

## Standing requirements

- Follow `GUIDELINES.md`: shared primitives only (`PageHeader`, `EntityTabs`, `ConfirmDialog`, `EmptyState`, `toast`, `FormShell`), no hand-rolled modals, no `window.confirm`, no `window.location.reload()`.
- Every step ships unit tests for new/changed services **and** at least one e2e journey proving the user-visible behaviour.
- Write the failing test first for each bug fix (7, 18, 24 especially) so the regression is provably caught.
- Stage 2 gating is enforced **server-side**, not by hiding UI.
- Regenerate DB types after any migration (`npm run db:types`) and update the hand-built test schemas that create `schedule_assignments`.
