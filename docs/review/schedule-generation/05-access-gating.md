# Access-level gating review (Stage 1 vs Stage 2)

**Model.** Two levels: every signed-in user can build schedules by hand (Stage 1); users whose `user.entitlements` JSON contains `"autogen"` additionally get auto-generation (Stage 2). Enforcement is server-side via `requireAutogen(locals)` (`src/lib/server/entitlements.ts`), fed by `hooks.server.ts`, with UI hiding on top (`$page.data.entitlements`). Session presence itself is enforced centrally for every `/api/*` path except `/api/auth/*` (`src/lib/server/api-auth.ts`).

## 1. What is gated correctly

| Surface                                                                                                                                                     | Guard                                                | Test                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `POST /api/schedules/generate`                                                                                                                              | `requireAutogen` first statement                     | `stage2-gating.test.ts`, `gating.spec.ts` (e2e: 403 for `basic@example.com`) |
| `POST /api/scheduling/execute`                                                                                                                              | `requireAutogen`                                     | `stage2-gating.test.ts`                                                      |
| `/generate/**` pages                                                                                                                                        | `+layout.server.ts` → `requireAutogen`               | `gating.spec.ts` (direct URL → 403)                                          |
| `/api/scheduling-config/capacity-rules[/id]`, `/fallbacks[/id]`, `/global-defaults/{inpatient,outpatient,elective}`                                         | `requireAutogen` on write handlers                   | `stage2-gating.test.ts` (3 of them)                                          |
| `PUT/DELETE /api/clerkships/[id]/settings`                                                                                                                  | `requireAutogen`; `GET` open (Stage 1 page reads it) | `stage2-gating.test.ts`                                                      |
| Nav item "Auto-Generate", calendar "Generate/Regenerate" buttons, `RegenerateDialog`, results banner, clerkship Auto-scheduling tab, "Lock this assignment" | `hasAutogen` in Svelte                               | `gating.spec.ts` (nav only)                                                  |
| Readiness checklist item "Configure auto-generation"                                                                                                        | `hasAutogen(locals)` on the dashboard loader         | `readiness.ts` unit tests                                                    |
| `entitlements` parsing (malformed JSON → `[]`)                                                                                                              | `parseEntitlements`                                  | `entitlements.test.ts`                                                       |

## 2. Gaps

### G-1 · `DELETE /api/schedules` — Stage 1 users can wipe all assignments of all tenants (F-04)

No `requireAutogen`, no schedule scope. It exists only to serve the Stage 2 dialog's "Full" mode. **Fix:** scope to the active schedule (through `schedule_students` or the new `schedule_id`), and either gate it with `requireAutogen` or turn it into an explicit Stage 1 "Clear this schedule" action with `ConfirmDialog`. Add it to `stage2-gating.test.ts` (if gated) and to `tenant-isolation-mutations.test.ts` (either way).

### G-2 · Entitled users are not scoped either (F-02, F-03)

Gating answers "may this user generate?" but not "for whom?". An entitled user's run rewrites other tenants' schedules. Entitlement checks must be paired with `requireActiveScheduleId(locals)` and schedule-scoped loaders (see `03 §2`, `04 §1`). `/api/scheduling/execute` must validate every id in the body against the schedule or be removed.

### G-3 · Ungated Stage 2 configuration routes

Not guarded by `requireAutogen`:

- `GET/POST /api/scheduling-config/electives`, `GET/PUT/DELETE /electives/[id]`, `/electives/[id]/{preceptors,sites,available-preceptors}`, `/electives/summary` — electives are a Stage 1 clerkship concept (spec R4.1), so leaving reads **and** basic CRUD open is consistent with the Step 03 rule "reads stay open, engine-only writes gated". But `elective_preceptors` and the `override_*` engine settings are Stage 2 semantics. **Recommendation:** keep elective CRUD and `sites` open; gate `POST/DELETE …/preceptors` (elective preceptor pools only matter to the engine) and any write of `override_*` fields. Document the split in the route headers.
- `GET/POST /api/scheduling-config/requirements[/id]` — deprecated service on a dropped table; delete the routes.
- `GET /api/scheduling-config/clerkships/[id]` — read-only, schedule-scoped; acceptable open, but nothing Stage 1 uses it. Gate for tidiness or delete.

### G-4 · `preview: true` bypasses nothing, but costs everything

Preview is gated, fine — but the preview path loads the whole database (F-02) for a non-entitled-looking "just looking" request. After scoping this is moot; noted so the scoped loader is used for preview too.

### G-5 · UI gating is per-component, not per-route

`hasAutogen` is recomputed in 5 Svelte files from `$page.data.entitlements`. That is acceptable, but the calendar still renders a `RegenerateDialog` and a results banner that duplicate `/generate` (Step 13 intended to remove them). Keep one entry point (`/generate`) to shrink the gated surface and the number of places a future change can forget the check.

### G-6 · Missing tests

- e2e: entitled user completes a **full generation** (currently `gating.spec.ts` only opens the hub); non-entitled user gets no Regenerate/Lock controls on calendar/assignment dialog; `DELETE /api/schedules` from `basic@example.com`.
- API: parameterised 403 table should include every route in §1 plus the ones fixed in G-1/G-3, and assert the error envelope shape (`{ success: false, error: { message } }`) rather than only the status.
- Hook test: `entitlements` sourced from the DB when the session user lacks the field (the fallback branch in `hooks.server.ts` is untested).

## 3. Recommended enforcement pattern (so a new route cannot forget)

Extend the central hook: keep `requiresApiAuthChallenge` for 401, and add a declarative allow-list for Stage 2 prefixes (`/api/schedules/generate`, `/api/scheduling/`, `/api/generate/`, `/api/scheduling-config/global-defaults/`, `/api/scheduling-config/capacity-rules/`, `/api/scheduling-config/fallbacks/`) that returns 403 in the hook when the caller lacks `autogen`. Handlers keep `requireAutogen` as defence in depth. The unit test then asserts the table of prefixes, and `stage2-gating.test.ts` stays as the handler-level check.

## 4. Product-rule reminders that gating must honour

- Stage 1 must be fully usable without teams (R3.5, G5). The engine requiring teams is fine **only** if the readiness checklist for entitled users says so explicitly and Stage 1 surfaces never mention teams (F-28).
- Locked assignments exist for Stage 2's benefit but are created in Stage 1 UI only when entitled ("Lock this assignment" hidden otherwise) — consistent with the spec; keep it.
- Generated assignments must never be modified by Stage 1 users in a way that silently un-generates them; `source` stays `generated` on edit (verify in assignment PATCH — out of this review's scope but worth a test).
