# Step 08 — Clerkships Module Rework

## Objective
Separate clerkship **requirements** (Stage 1) from **auto-generation configuration** (Stage 2), give every visible option a clear meaning, and untangle teams from the core flow.

## Context
DESIGN_REVIEW A3, D2, D3, B4. The config page mixes core fields with engine settings; three assignment-strategy options share one identical description; "Max Students Per Day/Year" is ambiguous; global engine defaults sit on the Clerkships list; teams are presented as mandatory.

## Prerequisites
Steps 01, 03 (entitlement gating), 04.

## Scope
**In:** `/clerkships` list, `/clerkships/[id]` detail, relocation of engine settings behind the gate, team UI relocation. **Out:** the Stage 2 hub content itself (step 13 builds `/generate`; this step moves clerkship-level engine config into a gated tab and leaves global defaults for step 13).

## Implementation

1. **List `/clerkships`**: remove the "Default Scheduling Rules" tab (its content moves to the Stage 2 hub in step 13; until then it is reachable only for entitled users via a temporary link from the clerkship page — do not leave it as a top-level tab). Table: Name (link), Type, Required days, Sites count, Students on track / at risk (from step 10 service; stub allowed). "Add clerkship" → **dialog is replaced by a full page** `/clerkships/new` (complex entity per spec grammar: name, type, required days, description, allowed sites multi-select).
2. **Detail `/clerkships/[id]`** (rename from `/clerkships/[id]/config`, redirect old URL) — `PageHeader` + `EntityTabs`:
   - **Overview**: requirement summary (type, required days), aggregate student progress for this clerkship (N complete / N on track / N at risk, each linking to filtered student list), preceptors who have assignments in it.
   - **Details**: inline edit of name/type/required days/description with unsaved-changes guard. Copy explains what "required days" means for validation ("Each student must complete this many days").
   - **Sites**: current allowed-sites management (dialog to add, dependency-guarded remove) — keep behavior, restyle with shared primitives.
   - **Electives**: keep `ElectivesManager`, restyled; ensure elective concepts are explained in plain language ("Optional sub-rotations that count toward this clerkship's required days").
   - **Auto-scheduling** *(entitled users only; tab hidden otherwise)*: the engine settings, rebuilt for clarity:
     - Collapse the three redundant continuity strategies into one **"Continuity (recommended)"** option; keep **"Block-based"** and **"Daily rotation"**. Persist as `team_continuity` internally; write a data migration/normalization for existing rows (`continuous_single`/`continuous_team` → `team_continuity`). Each option gets one distinct sentence describing its effect on generated schedules.
     - Rename ambiguous labels with explicit units: "Max students per preceptor per day", "Max students per preceptor per year". Verify against engine semantics in `features/scheduling/` before finalizing wording — labels must state what the engine actually enforces.
     - Group: Strategy / Capacity / Blocks (inpatient only) / Teams / Backup preceptors (use "Backup preceptor (fallback)" wording, U3) / Health system continuity. Every control has help text.
     - Keep the inherit-vs-override model with the existing badge + "Return to defaults", plus one sentence explaining it ("These override the global defaults set in Auto-Generate → Settings").
3. **Teams**: remove the Teams tab from `/preceptors` and the `?fromClerkship` query-param round-trips. Teams management moves under the gated area: route `/generate/teams` (stub page acceptable until step 13 fills the hub; the existing `/preceptors/teams/*` pages are moved/redirected there and gated with `requireAutogen` on their APIs already handled in step 03). The clerkship **Auto-scheduling** tab links to `/generate/teams?clerkship=<id>`. All copy stating teams are required disappears from Stage 1 surfaces.
4. Grep sweep: no remaining links to `/clerkships/[id]/config`, `/preceptors?tab=teams`, `fromClerkship` params.

## Testing
- Unit: strategy normalization migration/util (`continuous_single→team_continuity` etc.); any new service functions.
- API: clerkship CRUD unaffected for basic users; settings write remains 403 for non-entitled (regression from step 03).
- E2E: non-entitled user sees Overview/Details/Sites/Electives only; entitled user sees Auto-scheduling with the 3 strategies, distinct descriptions, renamed capacity labels; create clerkship via `/clerkships/new`; old `/clerkships/[id]/config` URL redirects; teams pages unreachable and un-linked for non-entitled users.

## Acceptance criteria
- [ ] A non-entitled user managing a clerkship sees only options whose meaning is fully explained in the UI and that affect Stage 1 behavior (R4.2).
- [ ] Strategy list has no redundant options; every engine setting has distinct, accurate help text.
- [ ] Teams absent from all Stage 1 navigation and copy.
- [ ] Definition of done per GUIDELINES.md.
