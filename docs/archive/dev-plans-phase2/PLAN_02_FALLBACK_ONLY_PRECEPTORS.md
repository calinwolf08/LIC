# Development Plan: Fallback-Only Preceptors

## Overview

Add `is_fallback_only` flag to team members and preceptors, update scheduling engine to respect it, ensure first assignment is never a fallback.

## Current State

- Teams have members with `priority` (lower = primary)
- `FallbackGapFiller` fills gaps using a 3-tier system
- `preceptor_fallbacks` table exists for explicit fallback chains
- No concept of "fallback-only" preceptors

## Requirements

- Preceptors can be marked as "global fallback only" (never primary for any team)
- Team members can be marked as "fallback only" for that specific team
- First assignment for a student-clerkship must NEVER be a fallback-only preceptor
- Fallbacks used only after primary preceptor(s) capacity is exhausted
- If primary has zero availability, do not assign student to that team

---

## Phase 1: Database Schema

### 1.1 Add migration

**File:** `src/lib/db/migrations/0XX_add_fallback_only_flag.ts`

```sql
-- Add to preceptor_team_members table
ALTER TABLE preceptor_team_members ADD COLUMN is_fallback_only INTEGER DEFAULT 0;

-- Add to preceptors table
ALTER TABLE preceptors ADD COLUMN is_global_fallback_only INTEGER DEFAULT 0;
```

### 1.2 Update types

- Run `npm run db:generate` to regenerate `src/lib/db/types.ts`
- Update `PreceptorTeamMember` interface in `src/lib/features/scheduling-config/types/teams.ts`
- Update `Preceptor` interface as needed

### Testing

- Run migration on test database
- Verify columns exist with correct defaults
- Run `npm run check`

---

## Phase 2: Service Layer Updates

### 2.1 Update TeamService

**File:** `src/lib/features/scheduling-config/services/teams.service.ts`

- Accept `is_fallback_only` when adding team members
- Add validation: team must have at least one non-fallback member
- Update `getTeamMembers` to include fallback flag

### 2.2 Update PreceptorService

**File:** `src/lib/features/preceptors/services/preceptor-service.ts`

- Add method to set/get `is_global_fallback_only` flag
- Update preceptor queries to include this field

### 2.3 Update schemas

**File:** `src/lib/features/scheduling-config/schemas/teams.schemas.ts`

- Add `is_fallback_only` to team member schemas (boolean, default false)

**File:** `src/lib/features/preceptors/schemas.ts`

- Add `is_global_fallback_only` to preceptor schemas

### Testing

- Unit tests for service methods
- Test validation (team must have at least one primary member)
- Run `npm run check` and `npm run test`

---

## Phase 3: Scheduling Engine Updates

### 3.1 Update team continuity strategy

**File:** `src/lib/features/scheduling/strategies/team-continuity.strategy.ts`

Modifications:
- When getting team members, separate into:
  - Primary members (`is_fallback_only = false`)
  - Fallback-only members (`is_fallback_only = true`)
- Assign to primary members first
- Only use fallback-only members after ALL primary capacity exhausted
- **Critical:** First assignment must always be from primary members

Logic flow:
```
1. Get team members sorted by priority
2. Filter out fallback-only members for initial assignment
3. Assign first day to highest-priority primary member
4. Continue assigning to primary members
5. When primary capacity exhausted, use fallback-only members
```

### 3.2 Update FallbackPreceptorResolver

**File:** `src/lib/features/scheduling/fallback/preceptor-resolver.ts`

- Include `is_fallback_only` team members in fallback pool
- Respect global `is_global_fallback_only` flag
- Fallback-only members should be preferred in fallback scenarios

### 3.3 Add first-assignment constraint

**File:** `src/lib/features/scheduling/constraints/first-assignment.constraint.ts` (new)

```typescript
/**
 * Ensures first assignment for a student-clerkship is not a fallback-only preceptor
 */
export class FirstAssignmentConstraint implements Constraint {
  name = 'FirstAssignment';
  priority = 2;
  bypassable = false;

  validate(assignment, context, violationTracker): boolean {
    // Check if this is the first assignment for student-clerkship
    // If so, verify preceptor is not fallback-only
  }
}
```

- Add to constraint pipeline in `src/lib/features/scheduling/constraints/index.ts`

### 3.4 Update context builder

**File:** `src/lib/features/scheduling/services/context-builder.ts`

- Include `is_fallback_only` and `is_global_fallback_only` flags in preceptor data
- Preceptors with global fallback flag should be excluded from primary selection

### Testing

- Unit tests for modified strategies
- Integration test: schedule with fallback-only preceptors
- Test first assignment is never fallback
- Test fallback used only after primary exhausted
- Test global fallback-only excludes from all primary assignments
- Run `npm run check` and `npm run test`

---

## Phase 4: API Updates

### 4.1 Update team endpoints

**File:** `src/routes/api/preceptors/teams/+server.ts`

- Accept `is_fallback_only` in POST requests when creating team with members
- Return flag in GET responses

**File:** `src/routes/api/preceptors/teams/[id]/+server.ts`

- Accept `is_fallback_only` in PUT/PATCH requests
- Include in team member responses

### 4.2 Update preceptor endpoints

**File:** `src/routes/api/preceptors/[id]/+server.ts`

- Accept `is_global_fallback_only` in PATCH requests
- Include in GET response

### Testing

- API integration tests for both endpoints
- Test validation errors for invalid configurations
- Run `npm run check` and `npm run test`

---

## Phase 5: UI Updates

### 5.1 Update team creation/edit form

**File:** `src/lib/features/scheduling-config/components/team-form.svelte` (or equivalent)

- Add checkbox "Fallback only" per team member row
- Visual distinction for fallback-only members (e.g., muted styling, badge)
- Validation message if all members are fallback-only

### 5.2 Update preceptor form

**File:** `src/lib/features/preceptors/components/preceptor-form.svelte`

- Add checkbox "Global fallback only (never assigned as primary)"
- Help text explaining the behavior

### 5.3 Update team list display

**File:** `src/lib/features/scheduling-config/components/team-list.svelte` (or equivalent)

- Show fallback-only indicator on team member listings
- Badge or icon to distinguish fallback-only members

### Testing

- Component tests for updated forms
- E2E: create team with fallback member -> verify scheduling behavior
- Run `npm run check` and `npm run test`

---

## Files to Create/Modify

| Action | File Path |
|--------|-----------|
| Create | `src/lib/db/migrations/0XX_add_fallback_only_flag.ts` |
| Create | `src/lib/features/scheduling/constraints/first-assignment.constraint.ts` |
| Modify | `src/lib/db/types.ts` (regenerate) |
| Modify | `src/lib/features/scheduling-config/types/teams.ts` |
| Modify | `src/lib/features/scheduling-config/services/teams.service.ts` |
| Modify | `src/lib/features/scheduling-config/schemas/teams.schemas.ts` |
| Modify | `src/lib/features/preceptors/services/preceptor-service.ts` |
| Modify | `src/lib/features/preceptors/schemas.ts` |
| Modify | `src/lib/features/scheduling/strategies/team-continuity.strategy.ts` |
| Modify | `src/lib/features/scheduling/fallback/preceptor-resolver.ts` |
| Modify | `src/lib/features/scheduling/services/context-builder.ts` |
| Modify | `src/lib/features/scheduling/constraints/index.ts` |
| Modify | `src/routes/api/preceptors/teams/+server.ts` |
| Modify | `src/routes/api/preceptors/teams/[id]/+server.ts` |
| Modify | `src/routes/api/preceptors/[id]/+server.ts` |
| Modify | Team form component(s) |
| Modify | Preceptor form component |

---

## Validation Checklist

- [ ] Migration creates columns with correct defaults
- [ ] Team must have at least one non-fallback member (validation)
- [ ] First assignment is never a fallback-only preceptor
- [ ] Fallback-only preceptors used only after primary capacity exhausted
- [ ] Global fallback-only preceptors never assigned as primary
- [ ] UI shows fallback-only status clearly
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] TypeScript build passes (`npm run check`)
- [ ] Production build succeeds (`npm run build`)
