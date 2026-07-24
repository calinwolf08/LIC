# Step 24 — Integrated Regression: Prove the Whole Flow

## Objective
Verify steps 15–23 hold together for a real user, not just in isolation. Every earlier step ships its own tests; this step exists so nobody can call the round done while the end-to-end experience is broken.

## Prerequisites
Steps 15–23.

## Scope
**In:** cross-cutting e2e journeys, fixture/seed alignment, suite health.
**Out:** new features.

## Implementation

1. **Fix the seed's split personality.** `src/lib/db/scripts/seed.ts` defines `TEST_SCHEDULE = { name: 'Demo Schedule 2025', 2025-01-06 → 2025-06-30 }`, but because `createDefaultScheduleForUser` (auth) already made a schedule, the seed **reuses that row** and the admin's active schedule is really **"My Schedule", 2026-07-01 → 2027-06-30**. The seed's stated intent and its result disagree, which has already misled test authors. Make the seed authoritative: rename/redate the reused row, or skip the auth-created one and own its own schedule. Update `e2e/journeys/*` constants accordingly.
2. **Extend the end-to-end journey** (`e2e/journeys/end-to-end.spec.ts`) to start by **creating a schedule with a deliberately short range (e.g. 2 months) and switching into it**, then run the existing arc. That makes the range-bounding fixes (step 15) part of the main flow rather than a side test.
3. **New cross-cutting journey — "fresh signup to first valid assignment"**, mirroring the user's actual session:
   register → edit the schedule name and range → **assert the sidebar dropdown updates without refresh** → add health system + site → add preceptor **with a site** → set availability in the wizard → add clerkship → add student → complete onboarding → open the calendar → create an assignment on an available day via the unified dialog → verify the day cell shows student·clerkship·preceptor → check schedule health shows no violations.
4. **New journey — "override lifecycle"**: force an assignment onto an unavailable day choosing "mark available"; double-book choosing "raise limit"; then open the calendar's Overrides list, confirm both are listed with their codes, and open one for editing.
5. **Suite health.** Run the whole Playwright suite from a **cold, freshly seeded database** at least twice, plus `--repeat-each=2` on the new journeys, and fix flakes at the source (await real signals, not `waitForTimeout`). Keep worker count at 1 while the suite shares one DB, or give each spec its own schedule.
6. **Unit sweep.** `npx vitest run` fully green, including every hand-built `schedule_assignments` test schema updated for the step-17 columns. `npx svelte-check` clean.
7. **Docs.** Update `docs/spec/DESIGN_REVIEW.md` with a "Round 2" status table mapping each reported issue → step → resolved/deferred, so the next reader can see what this round did.

## Testing
This step *is* testing. Required evidence before sign-off:
- Full Playwright suite green from a cold seeded DB, twice, zero flakes.
- Full Vitest suite green; `svelte-check` clean; production build succeeds.
- Each of the user's reported issues has at least one automated test that **fails on the pre-fix commit and passes after** — record the mapping in the Round 2 status table.

## Acceptance criteria
- [ ] Seed intent matches seed reality; no test relies on an accidental schedule name or range.
- [ ] Fresh-signup and override-lifecycle journeys pass reliably.
- [ ] Every reported issue is covered by a test that demonstrably catches the regression.
- [ ] Whole suite green cold, twice, with no flaky retries.
- [ ] Definition of done per GUIDELINES.md.
