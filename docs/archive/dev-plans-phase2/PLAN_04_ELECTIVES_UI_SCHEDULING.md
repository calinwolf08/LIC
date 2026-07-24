# Development Plan: Electives UI and Scheduling

## Overview

Build UI for managing clerkship electives with required/optional toggle, update scheduling to handle electives first.

## Current State

- `clerkship_requirements` table has `requirement_type` enum: `'inpatient' | 'outpatient' | 'elective'`
- `clerkship_electives` table exists with `name`, `minimum_days`, `specialty`, `available_preceptor_ids`
- No UI for managing electives
- Scheduling engine doesn't handle electives specifically

## Requirements

- Electives are ALWAYS under a parent clerkship (not standalone)
- Clerkships can have multiple electives
- Toggle for "required elective" (default: true)
  - If required: student MUST complete this elective
  - If optional: student could get regular days or elective days
- If assigned to an elective, student must complete ALL minimum days
- Elective days count toward parent clerkship's required_days
- Electives have their own sites and preceptors
- Schedule electives FIRST, then fill remaining days with regular assignments

---

## Phase 1: Database Schema Updates

### 1.1 Update electives table

**File:** `src/lib/db/migrations/0XX_elective_enhancements.ts`

```sql
-- Add required flag to electives
ALTER TABLE clerkship_electives ADD COLUMN is_required INTEGER DEFAULT 1;

-- Verify minimum_days exists (should already be there)
-- If not: ALTER TABLE clerkship_electives ADD COLUMN minimum_days INTEGER NOT NULL;

-- Create elective-site associations
CREATE TABLE elective_sites (
  id TEXT PRIMARY KEY,
  elective_id TEXT NOT NULL REFERENCES clerkship_electives(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(elective_id, site_id)
);

CREATE INDEX idx_elective_sites_elective ON elective_sites(elective_id);
CREATE INDEX idx_elective_sites_site ON elective_sites(site_id);

-- Create elective-preceptor associations (if not using JSON column)
CREATE TABLE elective_preceptors (
  id TEXT PRIMARY KEY,
  elective_id TEXT NOT NULL REFERENCES clerkship_electives(id) ON DELETE CASCADE,
  preceptor_id TEXT NOT NULL REFERENCES preceptors(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(elective_id, preceptor_id)
);

CREATE INDEX idx_elective_preceptors_elective ON elective_preceptors(elective_id);
CREATE INDEX idx_elective_preceptors_preceptor ON elective_preceptors(preceptor_id);
```

### Testing

- Run migration
- Verify tables and columns created
- Run `npm run check`

---

## Phase 2: Service Layer

### 2.1 Enhance ElectivesService

**File:** `src/lib/features/scheduling-config/services/electives.service.ts`

Methods:
```typescript
// CRUD
createElective(clerkshipId: string, data: CreateElectiveInput): Promise<Elective>
updateElective(id: string, data: UpdateElectiveInput): Promise<Elective>
deleteElective(id: string): Promise<void>

// Queries
getElectivesForClerkship(clerkshipId: string): Promise<Elective[]>
getElectiveById(id: string): Promise<Elective | null>
getElectiveWithDetails(id: string): Promise<ElectiveWithDetails | null>
getRequiredElectivesForClerkship(clerkshipId: string): Promise<Elective[]>
getOptionalElectivesForClerkship(clerkshipId: string): Promise<Elective[]>

// Associations
getSitesForElective(electiveId: string): Promise<Site[]>
addSiteToElective(electiveId: string, siteId: string): Promise<void>
removeSiteFromElective(electiveId: string, siteId: string): Promise<void>
setSitesForElective(electiveId: string, siteIds: string[]): Promise<void>

getPreceptorsForElective(electiveId: string): Promise<Preceptor[]>
addPreceptorToElective(electiveId: string, preceptorId: string): Promise<void>
removePreceptorFromElective(electiveId: string, preceptorId: string): Promise<void>
setPreceptorsForElective(electiveId: string, preceptorIds: string[]): Promise<void>
```

### 2.2 Update validation

**File:** `src/lib/features/scheduling-config/schemas/electives.schemas.ts`

```typescript
export const createElectiveSchema = z.object({
  name: z.string().min(1).max(200),
  minimum_days: z.number().int().positive(),
  is_required: z.boolean().default(true),
  specialty: z.string().max(200).optional(),
  site_ids: z.array(z.string()).min(1, 'At least one site required'),
  preceptor_ids: z.array(z.string()).min(1, 'At least one preceptor required'),
});

export const updateElectiveSchema = createElectiveSchema.partial();
```

Validation rules:
- Elective minimum_days cannot exceed parent clerkship's available days
- At least one site required
- At least one preceptor required

### Testing

- Unit tests for all service methods
- Validation tests
- Run `npm run check` and `npm run test`

---

## Phase 3: API Routes

### 3.1 Elective CRUD endpoints

**File:** `src/routes/api/clerkships/[id]/electives/+server.ts`
- `GET` - List electives for clerkship (include site/preceptor counts)
- `POST` - Create elective with sites and preceptors

**File:** `src/routes/api/clerkships/[id]/electives/[electiveId]/+server.ts`
- `GET` - Get elective with full details
- `PATCH` - Update elective
- `DELETE` - Delete elective

### 3.2 Elective association endpoints

**File:** `src/routes/api/clerkships/[id]/electives/[electiveId]/sites/+server.ts`
- `GET` - List sites for elective
- `POST` - Add site to elective
- `DELETE` - Remove site from elective (use query param for site_id)

**File:** `src/routes/api/clerkships/[id]/electives/[electiveId]/preceptors/+server.ts`
- `GET` - List preceptors for elective
- `POST` - Add preceptor to elective
- `DELETE` - Remove preceptor from elective

### Testing

- API integration tests for all endpoints
- Test validation errors
- Run `npm run check` and `npm run test`

---

## Phase 4: UI Components

### 4.1 Create ElectiveList component

**File:** `src/lib/features/scheduling-config/components/elective-list.svelte`

Table columns:
| Name | Min Days | Required | Sites | Preceptors | Actions |

Features:
- "Required" shown as badge (green for required, gray for optional)
- Sites/Preceptors show counts
- Actions: Edit, Delete
- Click row to navigate to detail page
- Add Elective button

### 4.2 Create ElectiveForm component

**File:** `src/lib/features/scheduling-config/components/elective-form.svelte`

Fields:
- Name (text input, required)
- Minimum Days (number input, required, positive)
- Required (toggle switch, default: true)
- Specialty (text input, optional)
- Sites (multi-select or transfer list)
- Preceptors (multi-select or transfer list)

Features:
- Site selector shows only sites associated with parent clerkship (or all?)
- Preceptor selector shows all preceptors (filtered by site if applicable)
- Save/Cancel buttons
- Validation errors displayed inline

### 4.3 Create ElectiveDetailPage

**File:** `src/routes/clerkships/[id]/electives/[electiveId]/+page.svelte`

Three tabs:
1. **Details** - Edit form for elective properties
2. **Sites** - List of associated sites with add/remove
3. **Preceptors** - List of associated preceptors with add/remove

### Testing

- Component tests for list, form, detail page
- Test multi-select functionality
- Run `npm run check` and `npm run test`

---

## Phase 5: Clerkship Page Integration

### 5.1 Add Electives tab to clerkship config

**File:** `src/routes/clerkships/[id]/config/+page.svelte`

Add "Electives" tab alongside existing tabs (basic-info, scheduling, sites, teams)

Tab content:
- ElectiveList component
- "Add Elective" button
- Summary: "X electives (Y required, Z optional)"

### 5.2 Update clerkship data loader

**File:** `src/routes/clerkships/[id]/config/+page.ts`

- Fetch electives for clerkship
- Include site/preceptor counts

### 5.3 Update clerkship list display

**File:** `src/lib/features/clerkships/components/clerkship-list.svelte` (or equivalent)

- Show elective count badge on clerkship cards/rows
- Visual indicator: "Has 3 electives"

### Testing

- Integration tests for clerkship config with electives tab
- Run `npm run check` and `npm run test`

---

## Phase 6: Scheduling Engine Updates

### 6.1 Create ElectiveSchedulingStrategy

**File:** `src/lib/features/scheduling/strategies/elective.strategy.ts`

```typescript
export class ElectiveSchedulingStrategy implements SchedulingStrategy {
  name = 'elective';

  async schedule(
    student: Student,
    clerkship: Clerkship,
    context: SchedulingContext
  ): Promise<Assignment[]> {
    const assignments: Assignment[] = [];

    // 1. Get required electives for this clerkship
    const requiredElectives = context.getRequiredElectivesForClerkship(clerkship.id);

    // 2. Schedule each required elective
    for (const elective of requiredElectives) {
      const electiveAssignments = await this.scheduleElective(
        student,
        elective,
        context
      );
      assignments.push(...electiveAssignments);
    }

    return assignments;
  }

  private async scheduleElective(
    student: Student,
    elective: Elective,
    context: SchedulingContext
  ): Promise<Assignment[]> {
    // Get available preceptors for this elective
    const preceptors = context.getPreceptorsForElective(elective.id);

    // Get available sites for this elective
    const sites = context.getSitesForElective(elective.id);

    // Schedule minimum_days using team continuity approach
    // but restricted to elective's preceptors/sites
  }
}
```

### 6.2 Update main scheduling flow

**File:** `src/lib/features/scheduling/services/scheduling-engine.ts`

Update scheduling order:
```typescript
async scheduleStudent(student: Student, clerkship: Clerkship): Promise<Assignment[]> {
  const allAssignments: Assignment[] = [];
  let remainingDays = clerkship.required_days;

  // Step 1: Schedule REQUIRED electives first
  const electiveStrategy = new ElectiveSchedulingStrategy();
  const electiveAssignments = await electiveStrategy.schedule(student, clerkship, context);
  allAssignments.push(...electiveAssignments);
  remainingDays -= electiveAssignments.length;

  // Step 2: Fill remaining days with regular assignments
  // (may include optional electives in the pool)
  if (remainingDays > 0) {
    const regularAssignments = await this.scheduleRegularDays(
      student,
      clerkship,
      remainingDays,
      context
    );
    allAssignments.push(...regularAssignments);
  }

  return allAssignments;
}
```

### 6.3 Add elective constraints

**File:** `src/lib/features/scheduling/constraints/elective.constraint.ts`

```typescript
/**
 * If student is assigned to an elective, they must complete ALL minimum days
 */
export class ElectiveCompletionConstraint implements Constraint {
  name = 'ElectiveCompletion';
  priority = 5;
  bypassable = false;

  validate(assignment: Assignment, context: SchedulingContext): boolean {
    // Check if this is an elective assignment
    // If so, verify student will complete minimum_days
  }
}

/**
 * Elective assignments must use elective's preceptors
 */
export class ElectivePreceptorConstraint implements Constraint {
  name = 'ElectivePreceptor';
  priority = 3;
  bypassable = false;

  validate(assignment: Assignment, context: SchedulingContext): boolean {
    if (!assignment.elective_id) return true;
    return context.isPreceptorInElective(assignment.preceptor_id, assignment.elective_id);
  }
}

/**
 * Elective assignments must use elective's sites
 */
export class ElectiveSiteConstraint implements Constraint {
  name = 'ElectiveSite';
  priority = 3;
  bypassable = false;

  validate(assignment: Assignment, context: SchedulingContext): boolean {
    if (!assignment.elective_id) return true;
    return context.isSiteInElective(assignment.site_id, assignment.elective_id);
  }
}
```

### 6.4 Update scheduling context

**File:** `src/lib/features/scheduling/services/context-builder.ts`

Add elective data to context:
```typescript
interface SchedulingContext {
  // ... existing fields ...

  // Elective data
  electivesByClerkship: Map<string, Elective[]>;
  electivePreceptors: Map<string, string[]>;  // elective_id -> preceptor_ids
  electiveSites: Map<string, string[]>;        // elective_id -> site_ids

  // Helper methods
  getRequiredElectivesForClerkship(clerkshipId: string): Elective[];
  getOptionalElectivesForClerkship(clerkshipId: string): Elective[];
  getPreceptorsForElective(electiveId: string): Preceptor[];
  getSitesForElective(electiveId: string): Site[];
  isPreceptorInElective(preceptorId: string, electiveId: string): boolean;
  isSiteInElective(siteId: string, electiveId: string): boolean;
}
```

### 6.5 Update assignment model

**File:** `src/lib/db/migrations/0XX_assignment_elective.ts`

```sql
ALTER TABLE schedule_assignments ADD COLUMN elective_id TEXT REFERENCES clerkship_electives(id);
CREATE INDEX idx_assignments_elective ON schedule_assignments(elective_id);
```

### Testing

- Unit tests for ElectiveSchedulingStrategy
- Unit tests for elective constraints
- Integration test: schedule with required electives
- Integration test: schedule with optional electives
- Test elective days count toward clerkship total
- Test minimum_days enforcement
- Run `npm run check` and `npm run test`

---

## Files to Create/Modify

| Action | File Path |
|--------|-----------|
| Create | `src/lib/db/migrations/0XX_elective_enhancements.ts` |
| Create | `src/lib/db/migrations/0XX_assignment_elective.ts` |
| Create | `src/lib/features/scheduling-config/components/elective-list.svelte` |
| Create | `src/lib/features/scheduling-config/components/elective-form.svelte` |
| Create | `src/lib/features/scheduling/strategies/elective.strategy.ts` |
| Create | `src/lib/features/scheduling/constraints/elective.constraint.ts` |
| Create | `src/routes/clerkships/[id]/electives/+page.svelte` |
| Create | `src/routes/clerkships/[id]/electives/[electiveId]/+page.svelte` |
| Create | `src/routes/api/clerkships/[id]/electives/+server.ts` |
| Create | `src/routes/api/clerkships/[id]/electives/[electiveId]/+server.ts` |
| Create | `src/routes/api/clerkships/[id]/electives/[electiveId]/sites/+server.ts` |
| Create | `src/routes/api/clerkships/[id]/electives/[electiveId]/preceptors/+server.ts` |
| Modify | `src/lib/features/scheduling-config/services/electives.service.ts` |
| Modify | `src/lib/features/scheduling-config/schemas/electives.schemas.ts` |
| Modify | `src/lib/features/scheduling/services/scheduling-engine.ts` |
| Modify | `src/lib/features/scheduling/services/context-builder.ts` |
| Modify | `src/lib/features/scheduling/constraints/index.ts` |
| Modify | `src/routes/clerkships/[id]/config/+page.svelte` |

---

## Validation Checklist

- [ ] Migration creates required tables and columns
- [ ] Elective CRUD works correctly
- [ ] Site and preceptor associations work
- [ ] Required/optional toggle functions correctly
- [ ] Electives tab shows on clerkship config page
- [ ] Scheduling prioritizes required electives
- [ ] Minimum days enforced for elective assignments
- [ ] Elective days count toward clerkship total
- [ ] Elective assignments use only elective's preceptors/sites
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] TypeScript build passes (`npm run check`)
- [ ] Production build succeeds (`npm run build`)
