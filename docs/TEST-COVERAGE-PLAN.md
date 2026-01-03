# E2E Test Coverage Plan

**Last Updated:** 2026-01-03
**Branch:** `claude/expand-test-coverage-CZSmk`

This document tracks the current state of E2E test coverage and the plan for expanding it.

---

## Current Coverage Status

### ✅ Completed Tests

| Test File | Coverage | Status |
|-----------|----------|--------|
| `onboarding.ui.test.ts` | Complete end-to-end onboarding flow | ✅ Done |
| `preceptor-management.ui.test.ts` | CRUD, availability via API, validation | ✅ Done |
| `student-creation.ui.test.ts` | Basic student creation | ✅ Done |
| `health-systems.ui.test.ts` | CRUD with dependency checking | ✅ Done |
| `sites.ui.test.ts` | CRUD with optional fields | ✅ Done |
| `teams.ui.test.ts` | Create, edit, delete with members | ✅ Done |
| `blackout-dates.ui.test.ts` | Add, delete, view on calendar | ✅ Done |
| `calendar-editing.ui.test.ts` | View toggle, filters, navigation | ✅ Done |
| `schedule-regeneration.ui.test.ts` | Mode selection dialog (Full/Smart/Completion) | ✅ Done |
| `clerkship-config.ui.test.ts` | Basic info, settings, sites, electives | ✅ Done |
| `elective-management.ui.test.ts` | CRUD for electives | ✅ Done |
| `multi-schedule.ui.test.ts` | Create, set active, duplicate, delete | ✅ Done |

---

## Phase 1: Assignment Management (CRITICAL) 🔴

**Priority:** Highest - Core daily user workflow
**Status:** ❌ Not Started

### Tests Needed: `assignment-management.ui.test.ts`

| Test Case | Description | API Endpoint |
|-----------|-------------|--------------|
| Edit assignment date | Change date, validate constraints | `PATCH /api/schedules/assignments/[id]` |
| Delete assignment | Confirm dialog, verify removal from DB | `DELETE /api/schedules/assignments/[id]` |
| Reassign to different preceptor | Select new preceptor, check capacity | `POST /api/schedules/assignments/[id]/reassign` |
| Swap assignments | Two-way preceptor swap | `POST /api/schedules/assignments/swap` |
| Edit assignment via calendar card | Click card → modal → edit | UI flow |
| Validation errors on edit | Invalid date, unavailable preceptor | Error handling |

### Components to Test
- `src/lib/features/calendar/components/edit-assignment-modal.svelte`
- `src/lib/features/calendar/components/assignment-card.svelte`
- `src/routes/calendar/+page.svelte`

---

## Phase 2: Constraint Validation (HIGH) 🔴

**Priority:** High - Scheduling integrity
**Status:** ❌ Not Started

### Tests Needed: `schedule-constraints.ui.test.ts`

| Test Case | Description | Expected Behavior |
|-----------|-------------|-------------------|
| Preceptor capacity exceeded | Assign when at max_students | Show error, prevent assignment |
| Specialty mismatch | Schedule without matching specialty | Warning or prevention |
| Health system continuity | Student crosses health systems | Enforce or warn based on settings |
| Site continuity | Student moves between sites mid-block | Enforce or warn based on settings |
| Double-booking prevention | Same student, same date, two assignments | Prevent with clear error |
| Blackout date conflict | Assign on blackout date | Prevent with blackout reason |
| Preceptor unavailable | Assign when preceptor marked unavailable | Show availability conflict |

### Components to Test
- Constraint validation in assignment flows
- Error message display
- Warning indicators on calendar

---

## Phase 3: Schedule Views & Export (MEDIUM) 🟡

**Priority:** Medium - User visibility
**Status:** ❌ Not Started

### Tests Needed

#### `student-schedule-view.ui.test.ts`
| Test Case | Route |
|-----------|-------|
| View student's assigned schedule | `/students/[id]/schedule` |
| Filter by clerkship | Filter controls |
| Filter by date range | Date picker |
| Empty state (no assignments) | No data handling |

#### `preceptor-schedule-view.ui.test.ts`
| Test Case | Route |
|-----------|-------|
| View preceptor's daily load | `/preceptors/[id]/schedule` |
| View assigned students | Student list |
| View by week/month | Time navigation |

#### `schedule-export.ui.test.ts`
| Test Case | Description |
|-----------|-------------|
| Export to Excel | Click export, verify download |
| Export with filters applied | Filtered data in export |
| Export file format validation | Check .xlsx extension |

---

## Phase 4: Availability Pattern UI (MEDIUM) 🟡

**Priority:** Medium - Complex setup flow
**Status:** ❌ Not Started

### Tests Needed: `availability-patterns.ui.test.ts`

| Test Case | Description |
|-----------|-------------|
| Create weekly pattern | Set available days of week |
| Create date range pattern | Specific date range availability |
| Add exception dates | Mark specific dates unavailable |
| Edit existing pattern | Modify pattern settings |
| Delete pattern | Remove with confirmation |
| Pattern conflict detection | Overlapping patterns warning |
| Generate availability from pattern | Pattern → actual dates |

### Route
- `/preceptors/[id]/availability`

### Components
- `src/lib/features/preceptors/components/availability-pattern-form.svelte`
- `src/lib/features/preceptors/components/availability-calendar.svelte`

---

## Phase 5: Student Management Advanced (LOW) 🟢

**Priority:** Low - Less frequent operations
**Status:** ❌ Not Started

### Tests Needed: `student-management.ui.test.ts`

| Test Case | Description |
|-----------|-------------|
| Edit student details | Update name, email |
| Bulk student import | CSV upload (if exists) |
| Student deactivation | Mark inactive |
| View student history | Past assignments |

---

## Implementation Notes

### Test Pattern (API-Based Setup)
All UI tests should use API calls for setup, not direct DB inserts:

```typescript
test('example test', async ({ page, request }) => {
  // Create entities via API
  const response = await request.post('/api/entity', {
    data: { name: 'Test' }
  });
  const data = await response.json();
  const entityId = data.data.id;

  // Navigate and test UI
  await page.goto(`/entity/${entityId}`);

  // Validate in DB after UI action
  const dbEntity = await executeWithRetry(() =>
    db.selectFrom('entities').where('id', '=', entityId).executeTakeFirst()
  );
  expect(dbEntity).toBeDefined();
});
```

### Key API Endpoints for Testing

| Entity | Create | Update | Delete |
|--------|--------|--------|--------|
| Health Systems | `POST /api/health-systems` | `PUT /api/health-systems/[id]` | `DELETE /api/health-systems/[id]` |
| Sites | `POST /api/sites` | `PUT /api/sites/[id]` | `DELETE /api/sites/[id]` |
| Preceptors | `POST /api/preceptors` | `PUT /api/preceptors/[id]` | `DELETE /api/preceptors/[id]` |
| Students | `POST /api/students` | `PUT /api/students/[id]` | `DELETE /api/students/[id]` |
| Clerkships | `POST /api/clerkships` | `PUT /api/clerkships/[id]` | `DELETE /api/clerkships/[id]` |
| Teams | `POST /api/preceptors/teams` | `PUT /api/preceptors/teams/[id]` | `DELETE /api/preceptors/teams/[id]` |
| Schedules | `POST /api/scheduling-periods` | `PUT /api/scheduling-periods/[id]` | `DELETE /api/scheduling-periods/[id]` |
| Blackout Dates | `POST /api/blackout-dates` | - | `DELETE /api/blackout-dates/[id]` |
| Electives | `POST /api/scheduling-config/electives` | `PUT /api/scheduling-config/electives/[id]` | `DELETE /api/scheduling-config/electives/[id]` |

---

## Coverage Summary

| Phase | Tests | Priority | Status | Est. Effort |
|-------|-------|----------|--------|-------------|
| Phase 1 | Assignment Management | 🔴 Critical | ❌ Not Started | 8-10 hours |
| Phase 2 | Constraint Validation | 🔴 High | ❌ Not Started | 6-8 hours |
| Phase 3 | Schedule Views & Export | 🟡 Medium | ❌ Not Started | 4-6 hours |
| Phase 4 | Availability Patterns | 🟡 Medium | ❌ Not Started | 4-6 hours |
| Phase 5 | Student Management | 🟢 Low | ❌ Not Started | 2-4 hours |

**Current Coverage:** ~50% of major workflows
**Target Coverage:** 80%+ of critical user paths

---

## Progress Log

| Date | Action | Commit |
|------|--------|--------|
| 2026-01-03 | Initial UI tests created (7 files) | `632ab09` |
| 2026-01-03 | Fixed preceptor management tests (API-based setup) | `8662414` |
| 2026-01-03 | Refactored all UI tests to use API-based setup | `1a27364` |
| 2026-01-03 | Created this coverage plan document | - |

---

## Next Steps

1. **Immediate:** Implement Phase 1 (Assignment Management) tests
2. **Short-term:** Implement Phase 2 (Constraint Validation) tests
3. **Medium-term:** Complete Phases 3-4
4. **Ongoing:** Update this document as tests are completed
