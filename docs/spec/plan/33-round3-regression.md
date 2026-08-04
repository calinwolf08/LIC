# Step 33 — Round 3 Integrated Regression

## Objective
Prove Round 3 holds together — above all that the tenant boundary is real — and leave the repo's
status docs accurate.

## Prerequisites
Steps 25–32.

## Scope
**In:** cross-cutting journeys, suite health, documentation. **Out:** new features.

## Implementation

1. **Make the two-tenant fixture the backbone.** The fixture from step 26 should be used by the
   isolation tests in both 26 and 27; confirm there is one implementation, not two. Extend the seed
   (or a dedicated e2e setup) so a **second seeded account with clearly-marked data** exists in the
   e2e database — isolation cannot be tested against a single-tenant fixture.
2. **`tenant-isolation.spec.ts` is the flagship journey.** Signed in as tenant A:
   - every surface (Dashboard, Students, Preceptors, Clerkships, Locations both tabs, Calendar grid
     **and** list, a student's Progress tab, Schedule health) contains **no** tenant-B marker string;
   - A's dashboard totals equal A's own entity counts exactly;
   - deep links to B's entity ids render a not-found state;
   - `page.request` PATCH/DELETE against B's ids return 404 and B's data is intact afterwards.
   Assert *absence of B's marker* rather than *presence of A's* — the former catches leaks through
   widgets nobody thought to check.
3. **Extend the existing whole-app journey** (`end-to-end.spec.ts`) with the Round 3 behaviours it
   naturally touches: site now required when assigning; editing an assignment shows no self-conflict;
   the calendar cell names the student.
4. **Verify the dev commands against the e2e database** (step 25): `db:reset-user` on tenant A's
   email leaves tenant B's rows untouched — the same invariant, checked at the CLI layer.
5. **Suite health.** Full Playwright suite from a **cold, freshly seeded database, twice, with
   `--retries=0`**, plus `--repeat-each=2` on the new journeys. Fix flakes at the source (await real
   signals, not `waitForTimeout`); keep specs self-isolating (unique names, own entities, restore
   shared state in `finally`).
6. **Unit sweep.** `npx vitest run` fully green, `npx svelte-check` clean, `npm run build` succeeds.
7. **Docs.** Add a Round 3 section to `docs/spec/DESIGN_REVIEW.md` mirroring Round 2's: the root
   causes, the 22-row issue→step table marked resolved, anything found while testing, and the
   verification evidence. Mark steps 25–33 shipped in `ROUND-3-OVERVIEW.md`, and refresh
   `HANDOFF.md` with any new operational facts (e.g. the two-tenant e2e seed, the reset commands).

## Testing
This step *is* testing. Required evidence before sign-off:
- Full Playwright suite green from a cold seeded DB, **twice**, zero flaky retries.
- Full Vitest suite green; `svelte-check` clean; production build succeeds.
- **Every issue in the Round 3 table has at least one automated test that fails on the pre-fix
  commit and passes after** — record the mapping. For steps 26/27 specifically, demonstrate the
  failing state: check out the pre-fix commit, run the isolation tests, and confirm they fail. A
  privacy fix whose test never failed is not evidence of anything.

## Acceptance criteria
- [ ] Tenant isolation is proven by a journey that fails on the pre-fix commit.
- [ ] All Round 3 issues covered by tests, with the mapping recorded.
- [ ] Whole suite green cold, twice, no flakes.
- [ ] `DESIGN_REVIEW.md`, `ROUND-3-OVERVIEW.md` and `HANDOFF.md` reflect reality.
- [ ] Definition of done per GUIDELINES.md.
