# LIC — Client-Feedback Roadmap (finalized)

**Date:** 2026-09-21
**Source:** Notes taken while a prospective client (Basic tier, auto-generation
disabled) evaluated the app. Deduped, grouped, and tier-assigned via interview
with the product owner.
**Status:** Authoritative input to
[`client-feedback-implementation-plan.md`](./client-feedback-implementation-plan.md).

**Legend**

- **Type:** `BUG` · `UX` (clarity/copy/flow) · `FEAT` (new capability) · `EPIC`
- **Priority:** `P0` breaks a core flow or data integrity · `P1` blocks
  comprehension/adoption or is a core gap · `P2` enhancement / larger feature
- **Tier:** **Basic** (Stage 1, all users) · **Gated** (Stage 2 auto-gen) ·
  **Basic→Gated** (Basic owns the data + the warning; Gated owns the automation) ·
  **Split** (parts in each) · **Scope?** (needs its own scoping pass)

---

## A. Auth & sign-up

| ID  | Type/Pri | Tier  | Item                                                                                                                              |
| --- | -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `BUG P0` | Basic | "Sign up" from the sign-in form carries an **invalid email** and silently does nothing → validate on hand-off, show field error. |

## B. Onboarding & the "default vs. new schedule" trap _(root cause of a whole cluster)_

| ID  | Type/Pri | Tier  | Item                                                                                                                                                                                   |
| --- | -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `BUG P0` | Basic | **Finishing the wizard doesn't activate the new schedule** (`is_active:false`, no activation) → user stranded in the default schedule with the old date range + all entities. _Confirmed `new-schedule-wizard.svelte:372-417`._ |
| B2  | `UX P1`  | Basic | User thought they needed a **"new schedule"** vs. finishing the **initial/default** one → explain the distinction.                                                                     |
| B3  | `UX P1`  | Basic | Dashboard "finish setting up" says _"still need to name schedule"_ while the user thinks they did (caused by B1) → reconcile checklist state with the active schedule.                 |
| B4  | `UX P1`  | Basic | Not obvious you **can return and edit entities** after the wizard → explicit affordance / entry points.                                                                               |

## C. New-schedule wizard

| ID  | Type/Pri | Tier  | Item                                                                                                                                                       |
| --- | -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `BUG P0` | Basic | Invalid **end date** rejected with **no form warning** → inline validation.                                                                               |
| C2  | `UX P1`  | Basic | "**Add health system first**" ordering feels awkward → reconsider step order / make skippable.                                                            |
| C3  | `UX P1`  | Basic | Entity **table lacks disambiguating details** (multiple "Kaiser" look identical) → show health-system / location columns.                                 |
| C4  | `UX P1`  | Basic | Newly-created entities **not auto-selected** → auto-select on create.                                                                                     |
| C5  | `UX P1`  | Basic | **Selection meaning unclear** — user thought selecting a site meant being "in" it, not choosing what's _included in this schedule_ → relabel + help text. |

## D. Sites & health systems

| ID  | Type/Pri | Tier  | Item                                                                             |
| --- | -------- | ----- | ------------------------------------------------------------------------------- |
| D1  | `UX P1`  | Basic | **Health system vs. site** meaning unclear → hierarchy explainer (spec U10/R5.1). |
| D2  | `UX P1`  | Basic | Health system **shouldn't carry a location** field (belongs on site) → remove/relocate. |

## E. Clerkships

| ID  | Type/Pri  | Tier  | Item                                                                                                                        |
| --- | --------- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| E1  | `UX P1`   | Basic | Clerkship **name** ambiguity (internal label vs. official course name) → help text; optional separate display/official name. |
| E2  | `FEAT P1` | Basic | **Allowed missed days** (e.g. 28 of 30 acceptable) → per-clerkship minimum / allowable-miss threshold in completion math.   |
| E3  | `FEAT P2` | Basic | **Standalone / optional electives** not tied to a clerkship _(gap: electives with no parent; `is_required=0` already exists)_. |

## F. Preceptors

| ID  | Type/Pri  | Tier  | Item                                                                                                                     |
| --- | --------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| F1  | `UX P2`   | Basic | **Phone type** (cell / office / home).                                                                                  |
| F2  | `UX P1`   | Basic | **Site-on-preceptor** confused with the Sites-tab site; **"max students"** scope ambiguous (preceptor vs. site) → clarify. |
| F3  | `FEAT P1` | Basic | **Role field** on preceptor (custom names); currently only in Teams.                                                    |
| F4  | `FEAT P2` | Basic | **Variable day credit** (12-hr day worth more) — see M1.                                                                |
| F5  | `FEAT P1` | Basic | **Core preceptor(s)** per student + **bypassable warning** when assigning outside the core preceptor/team.              |

## G. Teams _(kept in Basic, redesigned for clarity)_

| ID  | Type/Pri     | Tier  | Item                                                                                                                                                              |
| --- | ------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `BUG P0`     | Basic | **"Same health system" error blocks team creation** even with one member → fix; constraints become optional guides, not hard blocks. _Confirmed `team-validator.ts:225`._ |
| G2  | `UX P1`      | Basic | **Explain what a team is/does**: a **coverage group** of preceptors for a clerkship's days (primary + backups). Define "Admin" (= the user), define "same specialty", remove jargon. |
| G3  | `FEAT/UX P1` | Basic | **Membership-first model**: serveable clerkships **inferred from members' eligibility** and **listed** on the team; the team is **always selectable** (never hidden). |
| G4  | `FEAT P1`    | Basic | **Overlap warning + override**: if members don't share a clerkship/specialty (e.g. family-medicine + surgery), warn and require an explicit user override.        |
| —   | —            | Gated | _Automatic fallback down the team list stays a Gated behavior._                                                                                                  |

## H. Availability _(highest-confusion area)_

| ID  | Type/Pri  | Tier         | Item                                                                                                                                              |
| --- | --------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | `BUG P0`  | Basic        | **Pattern + non-matching dates → zero days added, silently** (W/Th/F over a Sunday) → warn when a pattern yields no days.                         |
| H2  | `UX P1`   | Basic        | **"Available/unavailable" + "Add pattern" unclear**; user thought day-of-week = "always available," not "a rule applied to a date range" → rewrite flow/copy. |
| H3  | `UX P1`   | Basic        | Pattern pills **"available"/"repeating"** meaning unclear.                                                                                        |
| H4  | `UX P1`   | Basic        | Post-add **"save X dates? / open slots"** unclear.                                                                                                |
| H5  | `UX P1`   | Basic        | Consider **dropping the word "pattern"**; label the _type_ (Weekly / Monthly / …).                                                                |
| H6  | `FEAT P1` | Basic        | **Full availability calendar** to plan against + **notes**.                                                                                       |
| H7  | `FEAT P2` | Basic        | **Block-first workflow**: place assignment blocks (knowing health system/location) and assign the preceptor _later_ → unassigned/placeholder blocks. |
| H8  | `FEAT P2` | Basic→Gated  | **Preference levels** (preferred / in-a-pinch): Basic tags + shows; Gated auto-weights.                                                           |

## I. Assignment creation & calendar interaction

| ID  | Type/Pri     | Tier  | Item                                                                                                                                                                                          |
| --- | ------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | `BUG P0`     | Basic | **Out-of-availability assignment corrupts preceptor page math.** Basic _should_ allow it (R3.6 permissive) → require explicit **override**, **flag on preceptor page**, and make capacity/availability math account for it instead of breaking. |
| I2  | `UX P1`      | Basic | Assigning to a preceptor with **no availability** is opaque ("can't select any dates") → explain + offer override.                                                                           |
| I3  | `UX/FEAT P1` | Basic | Calendar **can't select a date range**; **"range vs. individual days"** in the dialog is unexplained → range selection + clear copy.                                                          |
| I4  | `UX P1`      | Basic | Student schedule **doesn't signal it's a single student** → page context (see N1).                                                                                                           |

## J. Calendar views & filters

| ID  | Type/Pri  | Tier  | Item                                                                                          |
| --- | --------- | ----- | -------------------------------------------------------------------------------------------- |
| J1  | `FEAT P1` | Basic | **Filters** (students/preceptors/etc.) + **toggles** "show availability" / "show assigned days". |
| J2  | `FEAT P1` | Basic | **List view = table under each date**; current view too broad (less legible than Excel).      |
| J3  | `FEAT P2` | Basic | **Block/grid view**: rows = students, columns = dates, cells = highlighted blocks (requested 3rd view). |

## K. Sharing, export & compliance

| ID  | Type/Pri  | Tier   | Item                                                                                                                    |
| --- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| K1  | `FEAT P2` | Basic  | **Send schedule to multiple** selected preceptors/students/sites.                                                      |
| K2  | `FEAT P1` | Scope? | **FERPA compliance** for student privacy → dedicated scoping pass (data handling, access, what "send" exposes) before K1 ships. |

## L. Conflict visibility & manual planning

| ID  | Type/Pri  | Tier        | Item                                                                                                                                                                                                                                                              |
| --- | --------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | `FEAT P1` | Basic       | **See/manage cross-clerkship conflicts & overlaps without generation** (preceptor A Mondays in clerkship 1 vs. preceptor B in clerkship 2) — _client's headline ask_.                                                                                            |
| L2  | `FEAT P2` | Basic→Gated | **Mutual-exclusion** (two preceptors can't both take a student the same day): Basic defines + warns; Gated auto-avoids.                                                                                                                                          |
| L3  | `FEAT P1` | Basic→Gated | **Block (inpatient) vs. scattered (outpatient) day-types, mixed.** Outpatient week availability is **derived** — weeks consumed by a student's inpatient blocks aren't available for outpatient days (no separate cap setting). Basic models + validates; Gated auto-places. |
| L4  | `EPIC P2` | Split       | **Manual schedule-building assistant**: filter to a clerkship → pick preceptor → **pin** → next clerkship → repeat per student → carry prior students forward → **custom patterns + override any validation** → **one button to create all pinned assignments**. Basic = pin/override/batch-create (depends on L1, L2, L3, H7, I3); Gated = auto-suggesting _who_ to pin. |

## M. Half-days, credit, exams, quarters, free days

| ID  | Type/Pri  | Tier  | Decision                                                                                                        |
| --- | --------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| M1  | `FEAT P2` | Basic | **Assignment credit value** (half / variable / on-the-fly) → **pull forward** (small; unblocks F4 + day math). |
| —   | `FEAT`    | Basic | **Full AM/PM half-day slotting** → **fast-follow** M1 (larger data-model change).                              |
| M2  | `FEAT P2` | Basic | **Non-clinical "free day" assignments** (no preceptor/clerkship, e.g. pre-exam study) → **pull forward**.      |
| M3  | `FEAT P2` | Basic | **Exam-as-assignment-type** → **pull forward** as a special case of M2.                                        |
| M4  | `FEAT P2` | Basic | **Quarter date definitions** → **pull forward** (small); the **"1 exam per quarter" requirement rule** → **backlog** (optional per user). |

## N. Cross-cutting orientation _(dissolves many separate "unclear" notes)_

| ID  | Type/Pri | Tier  | Item                                                                                                                                                                                                                                  |
| --- | -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | `UX P1`  | Basic | Users can't tell **which entity page they're on** or **whose numbers** they see (capacity on preceptor page — for the student?) → persistent page-context header ("You are viewing **Preceptor: Dr. X**") + label every metric with its subject. Resolves I4, F2, and several availability confusions. |

---

## Rollup by priority

- **P0 (6 bugs — fix first):** A1, B1, C1, G1, H1, I1
- **P1 (adoption/comprehension):** B2–B4, C2–C5, D1–D2, E1–E2, F2–F3, F5,
  G2–G4, H1–H6, I1–I4, J1–J2, K2, L1, L3, N1
- **P2 (features/epics/deferred):** E3, F1, F4, H7–H8, J3, K1, L2, L4, M1–M4

## Cross-cutting notes

- **B1 is the single highest-leverage fix** — it alone caused B2/B3 and the
  "wrong dates / all entities still there" reports. Sequence first.
- **N1 (page context + metric labeling)** is a cheap, wide-impact fix that clears
  a cluster of "unclear" notes at once.
- **"Basic owns data + warning, Gated owns automation"** (H8, L2, L3,
  L4-optimization) is the clean tier line — keep it consistent when implementing.
- **K2 (FERPA)** gates K1 — scope privacy before building distribution.
- **L1 → L2 → L3 → L4** form a dependency chain; L1 (conflict visibility) is the
  foundation and the client's headline need.
