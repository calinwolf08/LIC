# Step 32 — Schedule Health: Accurate Counts, Stale Overrides, Pagination & Filtering

## Objective
Make the health panel trustworthy: count each problem once, stop listing exceptions that no longer
apply, present conflicts and overrides consistently, and make a long list navigable.

## Context (verified in code)
1. **Capacity is counted per assignment, not per over-subscribed slot.**
   `schedule-validation.ts:171-179` sits inside the per-assignment loop:
   ```ts
   const max = preceptorMaxStudents.get(a.preceptor_id) ?? 1;
   if ((occupancy.get(`${a.preceptor_id}:${a.date}`) ?? 0) > max) {
     all.push({ code: 'preceptor_capacity', … });
   }
   ```
   Two students sharing a max-1 preceptor on one day ⇒ **two** violations. Four such days ⇒ 8, which
   is exactly the reported "shows 8, should be 4". The top-level pill inherits the same inflation
   because it is `violations.length`.
2. **Overrides are never re-evaluated.** `listOverrides` (`assignment-service.ts` ~line 350) returns
   every row with non-empty `override_codes`, joined for display. Nothing re-checks whether the
   accepted condition still holds, so a `not_onboarded` exception persists after the student has
   been onboarded.
3. **The two sections are asymmetric.** "Conflicts by type" is fed by `validation.counts` (live
   violations) while "Overrides" is fed by the stored codes. An accepted override generally
   *silences* the live violation, which is why capacity — the one code still firing live — appears in
   both, and the rest only under Overrides. That is defensible behaviour, but it is not explained,
   so it reads as a bug.
4. **No pagination or filtering.** `schedule-health-panel.svelte` renders every override row; with a
   day-per-row list this overflows and buries the capacity entries the user went looking for.

## Prerequisites
Step 26 (health data must already be tenant-scoped).

## Scope
**In:** violation aggregation, override staleness, panel information architecture, pagination and
filtering. **Out:** the override *creation* flow (shipped in Round 2).

## Implementation

1. **Count each violation once per affected slot.** In `validateSchedule`, emit
   `preceptor_capacity` **once per (preceptor, date)** that exceeds capacity, not once per
   assignment. Keep the affected assignment ids on the violation (`assignment_ids: string[]` or a
   repeated `entity_refs`) so `byDate`/`byPreceptor` indexing and click-through still work — the
   goal is one *finding*, not the loss of detail.
   - Audit the other codes for the same shape while you are here: anything that describes a *slot*
     (capacity) rather than an *assignment* (onboarding, blackout, availability) should be
     slot-scoped. Say in the PR which codes you classified each way.
   - The top-level pill then counts findings, matching the by-type table by construction.
2. **Resolve stale overrides.** Re-evaluate each stored code against current state and return a
   status per override: `active` (condition still holds) or `resolved` (no longer applies — e.g. the
   student has since onboarded, or capacity was raised so the day is no longer over).
   - Default the panel to showing **active** overrides, with a toggle to include resolved ones.
     Don't silently delete history — an audit trail of "we knowingly did this" has value — but don't
     present resolved exceptions as outstanding either.
   - Implement in the service (`listOverrides` gains the status), not the component, so the
     semantics are testable without a browser.
3. **Explain the two sections.** Give each a one-line description: conflicts = problems live in the
   schedule right now; overrides = exceptions a user explicitly accepted (which is *why* most of
   them no longer appear as conflicts). This is a copy fix that removes most of the confusion.
4. **Group override rows.** Collapse consecutive days for the same
   (student, clerkship, preceptor, code) into one row with a date range and a day count, expandable
   to the individual days. A four-day double-booking should read as one entry, not four.
5. **Filter + paginate.** Add a type filter (by code, with counts) and a page size (~10–20) with
   simple next/previous, applied to both sections. Reflect the filter in the URL so a view can be
   shared/reloaded. Keep the panel collapsed by default as it is now.

## Testing
- **Unit — `validateSchedule`:** a max-1 preceptor with two students on each of four days yields
  **4** `preceptor_capacity` findings (not 8); `counts.preceptor_capacity === 4`;
  `violations.length` matches the sum of `counts`; each finding still references every affected
  assignment id; three students on one day is still **one** finding for that day.
- **Unit — `listOverrides`:** an override whose student has since onboarded is returned as
  `resolved`; one whose condition still holds is `active`; raising `max_students` above the
  occupancy flips a capacity override to `resolved`; default filtering returns active only.
- **Unit:** grouping collapses four consecutive days into one row with `days: 4` and the correct
  range, and does not merge across different codes or preceptors.
- **API:** `/api/schedules/overrides` supports the type filter and pagination params and reports a
  total; out-of-range pages return an empty list, not an error.
- **E2E:** double-book a preceptor across four days via the override flow → the pill reads **4**,
  "Conflicts by type" shows capacity **4**, and the Overrides list shows **one** grouped row for
  those four days. Then onboard a student who had a `not_onboarded` override → that row leaves the
  default (active) view and appears when "include resolved" is toggled. With more overrides than one
  page, pagination works and the type filter narrows to a single code.

## Acceptance criteria
- [ ] One finding per over-subscribed preceptor-day; pill, by-type table and list all agree.
- [ ] Overrides that no longer apply are marked resolved and hidden by default, not lost.
- [ ] The difference between conflicts and overrides is stated in the UI.
- [ ] Multi-day overrides read as one grouped row.
- [ ] The panel filters by type and paginates.
- [ ] Definition of done per GUIDELINES.md.
