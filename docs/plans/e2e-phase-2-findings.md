# E2E Phase 2 — findings

Findings from the Phase 2 entity-management journeys (locations, preceptors,
students, clerkships, drill-through, list views). No product bugs surfaced this
phase; the notes below are one deferred gap and the behaviours/decisions the
journeys pinned down.

## Deferred (recommendation noted)

### P2-a — List pages have no search box _(spec/plan gap)_

The plan's J2.6 calls for "searching by partial name filters all three" lists,
but the student, preceptor and clerkship list pages have no search input — the
student list offers column sort only, and none offers a text filter. So the
search assertion is not implementable today. **Recommendation:** decide whether
list search is in scope; if so, add a shared search box to the list components
and extend J2.6 to cover it. Low severity — the lists are short and sortable,
and the calendar has its own filters. Recorded here rather than asserted.

## Decisions confirmed (no change needed)

- **`/students/[id]/edit` redirects to `/students/[id]`** (both a load redirect
  and a client fallback). Editing is inline on the detail page, matching spec §6
  — the route is a compatibility redirect, not a dead route. J2.3 asserts the
  redirect. No fix needed (this resolves the Phase 1 open question about the
  route).
- **Clerkship detail correctly gates the Stage 2 tabs.** Auto-scheduling and
  Preceptor teams are pushed onto the tab list only when the caller has the
  `autogen` entitlement; a basic user sees only Overview / Details / Allowed
  sites / Electives. J2.4 asserts both tiers. (Contrast the _new-schedule
  wizard_, which still shows the Teams step to everyone — that is Phase-1
  finding P1-b, to be fixed in Phase 6 / J6.2.)
- **Dependency-aware deletes are consistent and safe.** The health-system row
  Delete button and the Delete Site / Delete Student / Delete Preceptor dialogs
  each pre-check dependencies and either disable the confirm (with a tooltip /
  message naming the blockers) or surface the refusal in-context — never a
  silent failure or an `alert()`. J2.1 and J2.3 assert the block-then-resolve
  path.

## Test-infrastructure notes (in `e2e/journeys/phase-2/helpers.ts`)

- **Hydration race on list-page controls.** Buttons and tabs that open dialogs
  or navigate are wired only after hydration; a click landing in the gap between
  first paint and hydration is silently lost, which surfaced as
  "Target page … has been closed" when a later step then timed out. The app has
  no per-control hydration signal (unlike its forms' `data-hydrated`), so the
  helpers `openDialog` / `openCustomModal` / `clickToNavigate` retry the click
  until the dialog appears or the URL changes. Later phases should route
  dialog/navigation clicks through these helpers. Consideration for the app
  team: a lightweight post-hydration marker on interactive shells would let
  tests wait deterministically instead of retrying.
- **Custom overlay dialogs are not `role="dialog"`.** The Delete Site / Student
  / Preceptor dialogs are hand-rolled `.fixed` overlays (some with the content
  in a separate centered panel beside an inset backdrop). `customModal(page,
heading)` scopes to the overlay by its heading so the confirm button and
  messages can be targeted without colliding with a row's own Delete button.
