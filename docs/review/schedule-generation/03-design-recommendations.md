# Design recommendations: making generation robust and correct

This document proposes how the engine should be structured so that the defects in `02-findings-and-bugs.md` cannot recur, and so that the engine can be reasoned about and tested as a unit. It is written to be implementable incrementally on the current codebase (see `07-implementation-roadmap.md` for ordering).

---

## 1. Guiding principles

1. **One source of truth per concept.** One place resolves configuration, one place resolves capacity, one place validates an assignment. Today each of these exists two or three times with different answers (F-07, F-08, F-10).
2. **The engine is a pure function of a snapshot.** Load a fully scoped, immutable `GenerationSnapshot` once; the engine never touches the database during search. This kills the N+1 query storm, makes dry-run trivially safe, and makes every scenario unit-testable without SQLite.
3. **Existing assignments are first-class input.** Locked, past, preserved and manually created rows enter the engine as _occupancy + credit_, not as something the route hopes the engine will notice (F-01, F-12, F-13).
4. **Every proposal goes through the same validator as manual creation.** Stage 1 `validateCandidateWithContext()` already encodes the product's rules (hard vs. soft, codes, messages). Generation should call it, so a generated day can never be something the health panel immediately flags (F-05, F-20).
5. **Report, never swallow.** Anything that reduces a student's days must surface as an unmet requirement with a reason (F-06, F-17).
6. **Scope is decided at the boundary.** Routes resolve the active schedule and hand the engine ids; the engine never queries "all students" (F-02, F-03, F-04, F-27).

---

## 2. Target architecture

```
route (+server.ts)
 ├─ requireAutogen(locals) ; scheduleId = requireActiveScheduleId(locals)
 ├─ options = parse(body) ; assert range ⊆ schedule range
 ├─ snapshot = loadGenerationSnapshot(db, scheduleId, options)      ← the ONLY DB reads
 ├─ plan     = planRegeneration(snapshot, options)                  ← decides keep/delete/credit (pure)
 ├─ result   = generate(snapshot, plan, options)                    ← pure; no I/O
 ├─ if !preview: applyGenerationResult(db, scheduleId, plan, result) ← ONE transaction: delete + insert + run record
 └─ return result + run id
```

### 2.1 `GenerationSnapshot` (new module `engine/snapshot.ts`)

Loaded with a handful of batched queries, all filtered through the `schedule_*` junctions:

- students, clerkships (with resolved config, §3), electives (+ sites, preceptors), preceptors (+ sites, health system, `max_students`, `is_global_fallback_only`), teams + members, capacity rules, availability rows in range (and, if adopted, materialised patterns), blackout dates, onboarding, `clerkship_sites`, existing assignments for the schedule's students in range (with `locked`, `source`, `date`).
- Pre-indexed maps: `availabilityByPreceptor: Map<preceptorId, Map<date, siteId>>`, `occupancy: Map<'preceptor:date', count>`, `studentDates: Map<studentId, Set<date>>`, `creditByStudentClerkship`, `creditByStudentElective`.

Everything downstream reads from the snapshot; `StrategyContextBuilder` becomes a pure projection of it (no `db` parameter).

### 2.2 `planRegeneration()` (pure)

Replaces `prepareRegenerationContext` / `prepareCompletionContext` / `analyzeRegenerationImpact` with one function that classifies every existing assignment into exactly one bucket:

| Bucket                                                          | full-reoptimize | minimal-change                      | completion                               |
| --------------------------------------------------------------- | --------------- | ----------------------------------- | ---------------------------------------- |
| `date < cutoff` (past)                                          | keep + credit   | keep + credit                       | keep + credit                            |
| `locked = 1`                                                    | keep + credit   | keep + credit                       | keep + credit                            |
| future, valid today (validator returns no hard/soft violations) | delete          | keep + credit                       | keep + credit                            |
| future, invalid                                                 | delete          | delete (+ try in-place replacement) | keep + credit (completion never deletes) |

The plan is what **preview returns** and what **apply executes**, so they cannot disagree (F-12). Deletion happens _after_ planning, inside the apply transaction.

### 2.3 `generate()` (pure)

Same greedy skeleton as today but:

- `requiredDays = resolved.requiredDays − credit` per student/clerkship and per student/elective, floored at 0 (F-01).
- Candidate ordering (see §4) instead of table order.
- A **`ProposalValidator`** wraps Stage 1's `validateCandidateWithContext()` plus engine-only rules (fallback-only, team continuity, health-system rule, site continuity, block shape). Every strategy calls `validator.canPlace(student, preceptor, clerkship, date)` while building, and the engine calls `validator.check(batch)` once more before accepting. Hard violations are impossible by construction; soft ones are either forbidden (default) or allowed per `bypassedConstraints` — using the **same codes** the UI already knows (`preceptor_capacity`, `not_onboarded`, …). A bypassed soft code is persisted on the generated row as `override_codes` with `override_note = 'auto-generation bypass'`, so the health panel shows it exactly like a manual override (F-11).
- Accepting a batch mutates the in-memory occupancy/studentDates only.
- Unmet requirements are computed from **accepted** days, never from proposals (F-06).

### 2.4 `applyGenerationResult()` (one transaction)

- Delete the plan's delete-set (`WHERE id IN (...)` — never a date-range delete, F-02/F-04).
- Insert generated rows with `site_id` (from availability), `elective_id`, `source = 'generated'`, `override_codes`, `updated_at` (F-14).
- Insert a `generation_runs` row (`04-schema-alignment.md` §3) with options, counts, unmet requirements, violations and the plan summary; return its id so the Results page can render diagnostics (F-25) and the audit is persisted (F-24).

---

## 3. One configuration resolver

Delete `resolveClerkshipConfiguration()` / `resolveElectiveConfiguration()` from the engine and `resolveConfiguration()` from `ConstraintFactory`. Use `ClerkshipSettingsService.getClerkshipSettings()` (already correct: global defaults by type → `clerkship_configurations` overrides) and add the analogous `getElectiveSettings()` (`global_elective_defaults` → `clerkship_electives.override_*`). Return `ResolvedRequirementConfiguration` from these so the type stays the engine's contract.

Fix the DB CHECK constraints so the resolver can store what the UI offers: either add `team_continuity` to the allowed list (SQLite: recreate the three defaults tables in a migration; Postgres: alter the check) or remove `team_continuity` from the UI and make `continuous_single` the labelled default. Recommend the former, and drop `continuous_team` (no strategy exists).

---

## 4. Smarter, still explainable, search

The product does not need an optimiser, but the greedy pass should stop being order-dependent and blind:

1. **Order work by scarcity.** Sort `(student, clerkship)` pairs by `remainingDays / candidateDays` descending so the tightest requirements are placed first; break ties by student creation order for determinism. Document the rule so results are explainable to a coordinator.
2. **Sliding block windows.** For block-based, generate candidate windows from the preceptor's actual available days (weekday-only unless the clerkship says otherwise), allow windows to start on any available day, and check daily capacity for every day (F-15, F-16).
3. **Consistent partial policy.** All strategies return the best partial result plus a reason; the engine records the gap. Remove the all-or-nothing early returns from block-based and daily-rotation (F-21).
4. **Fallback with context.** Carry `primaryTeamId` / health system from the primary placement into the gap filler; skip dates the student has for **any** clerkship (F-17); respect `is_global_fallback_only` ordering; honour `fallbackRequiresApproval` by writing `status = 'pending_approval'` (or drop the flag from the UI).
5. **Deterministic tie-breaks and a seed.** Sort candidates by (load, priority, id). Optional `seed` option for reproducible runs in tests.
6. **Budget.** A hard cap on proposals evaluated (e.g. students × clerkships × range days × candidates) with a clear "budget exhausted" unmet reason, so a mis-configured 3-year range cannot hang the request.

Longer-term (only if coordinators ask for better quality): replace the per-pair greedy with a two-phase approach — greedy construction followed by a bounded local search (swap/relocate moves scored on continuity, load balance and health-system continuity). The snapshot/validator split in §2 is exactly what makes that a drop-in later.

---

## 5. Capacity: one model

| Concept                             | Source                                                             | Default   |
| ----------------------------------- | ------------------------------------------------------------------ | --------- |
| Students per preceptor per **day**  | `preceptor_capacity_rules` (hierarchy) → `preceptors.max_students` | 1         |
| Students per preceptor per **year** | `preceptor_capacity_rules` only                                    | unlimited |
| Site per day / year                 | `site_capacity_rules`                                              | unlimited |

Implement once (`capacity/capacity-resolver.ts`, pure over the snapshot) and use it from the validator; delete `CapacityChecker`'s DB-backed checks and the ad-hoc numbers in `StrategyContextBuilder` (F-07). Stage 1's `validateAssignmentCandidate` should call the same resolver so manual and generated assignments agree on what "over capacity" means.

---

## 6. Eligibility model (who may teach what, where)

Make the rule explicit and single-sourced:

```
eligible(preceptor, clerkship, date) :=
   preceptor ∈ schedule.preceptors
∧ (preceptor ∈ team(clerkship).members  ∨  (no teams for clerkship ∧ preceptor has availability))   ← decide
∧ availability(preceptor, date) = site
∧ (clerkship_sites(clerkship) = ∅ ∨ site ∈ clerkship_sites(clerkship))
∧ student onboarded at site.health_system (soft; bypassable)
```

Spec R3.5 says a preceptor is schedulable manually with only a name; G5 says teams are a Stage 2 concept. Recommend: with teams configured, teams define primary eligibility; **without any team for the clerkship, fall back to preceptors with availability at an allowed site**, so a Stage 1 user who upgrades gets a useful first run instead of "No preceptors available" for everything (F-19, F-28). Whatever is decided, the readiness checklist must test the same predicate.

Also decide the availability default (F-18). Recommend: the engine only places days on explicit `is_available = 1` rows (coordinators must materialise patterns), and the checklist blocks generation for preceptors with neither rows nor patterns. If patterns should count, add a `resolveAvailability(scheduleId)` that expands patterns into the snapshot, and use it in Stage 1 validation too.

---

## 7. Observability and safety rails

- **Structured run record** (`generation_runs`) with inputs, plan, per-student outcome, timing.
- **Dry-run everywhere by default** in the service layer; only `applyGenerationResult` writes.
- **Idempotency key** on the request (dialog generates one) so a double-click cannot delete twice.
- **Timeouts**: the request must fail with a clear message rather than the Node process pegging; budget from §4.6.
- **Logging**: replace `console.log` in the engine with the project logger; log a per-run summary, not per-student lines.

---

## 8. Code to delete once the above lands

`services/scheduling-engine.ts` (legacy engine) and its exports, `fallback/fallback-resolver.ts`, `team-formation/*`, `engine/result-builder.ts` statistics (recompute from the snapshot), `services/regeneration-service.ts` (replaced by the planner), `services/audit-service.ts` (replaced by `generation_runs`), the three `resolve*Configuration` copies, `/api/scheduling/execute` (or scope it and keep it as an admin tool), `/api/scheduling-config/requirements/*`, `e2e/api/**` and `e2e/ui/**` (stale, unrun), `docs/scheduling/test-coverage-summary.md`.

---

## 9. Interface sketch

```ts
// engine/snapshot.ts
export interface GenerationSnapshot {
	/* §2.1 */
}
export async function loadGenerationSnapshot(db, scheduleId, range): Promise<GenerationSnapshot>;

// engine/planner.ts
export type RegenerationMode = 'full-reoptimize' | 'minimal-change' | 'completion';
export interface RegenerationPlan {
	keep: ExistingAssignment[]; // credited + occupancy
	delete: ExistingAssignment[];
	credit: Map<`${studentId}:${clerkshipId}`, number>;
	creditElective: Map<`${studentId}:${electiveId}`, number>;
}
export function planRegeneration(s: GenerationSnapshot, mode, cutoff: string): RegenerationPlan;

// engine/validator.ts
export interface ProposalValidator {
	canPlace(p: Proposal): { ok: true } | { ok: false; codes: ViolationCode[] };
}
export function createValidator(
	s: GenerationSnapshot,
	plan: RegenerationPlan,
	bypass: Set<OverrideCode>
): ProposalValidator;

// engine/generate.ts
export function generate(
	s: GenerationSnapshot,
	plan: RegenerationPlan,
	opts: GenerateOptions
): GenerationResult;

// engine/apply.ts
export async function applyGenerationResult(
	db,
	scheduleId,
	plan,
	result,
	meta
): Promise<{ runId: string }>;
```

All four middle pieces are pure and can be tested with hand-built snapshots in milliseconds; the two I/O pieces get thin integration tests against the migrated in-memory database.
