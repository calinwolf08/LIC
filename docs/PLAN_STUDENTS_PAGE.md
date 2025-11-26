# Implementation Plan: Students Page Changes

## Overview
Fix the health system onboarding feature and add onboarding completion ratio display.

## Changes Summary
1. Move `/api/scheduling-config/health-systems` to `/api/health-systems`
2. Create `/api/student-onboarding` endpoint
3. Fix `student-onboarding-form.svelte` to use correct endpoints
4. Add onboarding ratio column to student list
5. Fix related tests

---

## Step 1: Move Health Systems API Endpoint

### 1.1 Create new API route structure
**Create:** `src/routes/api/health-systems/+server.ts`
- Copy logic from `src/routes/api/scheduling-config/health-systems/+server.ts`
- Supports GET (list all) and POST (create)

**Create:** `src/routes/api/health-systems/[id]/+server.ts`
- Copy logic from `src/routes/api/scheduling-config/health-systems/[id]/+server.ts`
- Supports GET, PATCH, DELETE

**Create:** `src/routes/api/health-systems/[id]/dependencies/+server.ts`
- Copy from `src/routes/api/scheduling-config/health-systems/[id]/dependencies/+server.ts`

### 1.2 Delete old API routes
**Delete:**
- `src/routes/api/scheduling-config/health-systems/+server.ts`
- `src/routes/api/scheduling-config/health-systems/[id]/+server.ts`
- `src/routes/api/scheduling-config/health-systems/[id]/dependencies/+server.ts`

### 1.3 Update all references to old endpoint
**Files to update:**
- `src/routes/health-systems/+page.server.ts` - Change fetch URL
- `src/routes/preceptors/+page.ts` - Change fetch URL
- `src/lib/features/preceptors/components/preceptor-form.svelte` - Change fetch URL
- `src/lib/features/scheduling-config/components/student-onboarding-form.svelte` - Change fetch URL
- `src/routes/api/schedules/generate/+server.ts` - If it fetches health systems
- Any test files referencing the old endpoint

---

## Step 2: Create Student Onboarding API Endpoint

### 2.1 Create GET endpoint
**Create:** `src/routes/api/student-onboarding/+server.ts`

```typescript
// GET /api/student-onboarding
// Returns all student onboarding records with student and health system info
// Response: { data: Array<{ student_id, health_system_id, is_completed, completed_date, notes }> }

export async function GET({ locals }) {
  const db = locals.db;
  const records = await db
    .selectFrom('student_health_system_onboarding')
    .selectAll()
    .execute();
  return json({ data: records });
}
```

### 2.2 Create PUT endpoint for bulk updates
```typescript
// PUT /api/student-onboarding
// Body: { updates: Array<{ student_id, health_system_id, is_completed, notes? }> }
// Upserts onboarding records (creates if not exists, updates if exists)

export async function PUT({ request, locals }) {
  const db = locals.db;
  const { updates } = await request.json();

  for (const update of updates) {
    await db
      .insertInto('student_health_system_onboarding')
      .values({
        id: crypto.randomUUID(),
        student_id: update.student_id,
        health_system_id: update.health_system_id,
        is_completed: update.is_completed ? 1 : 0,
        completed_date: update.is_completed ? new Date().toISOString() : null,
        notes: update.notes || null
      })
      .onConflict((oc) => oc
        .columns(['student_id', 'health_system_id'])
        .doUpdateSet({
          is_completed: update.is_completed ? 1 : 0,
          completed_date: update.is_completed ? new Date().toISOString() : null,
          notes: update.notes || null,
          updated_at: new Date().toISOString()
        })
      )
      .execute();
  }

  return json({ success: true });
}
```

---

## Step 3: Fix Student Onboarding Form Component

### 3.1 Update fetch URLs
**File:** `src/lib/features/scheduling-config/components/student-onboarding-form.svelte`

**Change line 36:**
```typescript
// FROM:
fetch('/api/health-systems')
// TO:
fetch('/api/health-systems')  // Now correct after Step 1
```

**Change line 37:**
```typescript
// FROM:
fetch('/api/student-onboarding')
// TO:
fetch('/api/student-onboarding')  // Now exists after Step 2
```

### 3.2 Update save function (line ~79)
Ensure PUT request body matches new endpoint format.

---

## Step 4: Add Onboarding Ratio to Student List

### 4.1 Create enhanced student fetch function
**File:** `src/lib/features/students/services/student-service.ts`

```typescript
export async function getStudentsWithOnboardingStats(
  db: Kysely<DB>
): Promise<Array<Selectable<Students> & {
  completed_onboarding: number;
  total_health_systems: number
}>> {
  // Get total health systems count
  const healthSystemCount = await db
    .selectFrom('health_systems')
    .select(db.fn.count('id').as('count'))
    .executeTakeFirst();

  const totalHealthSystems = Number(healthSystemCount?.count || 0);

  // Get students with completed onboarding count
  const students = await db
    .selectFrom('students')
    .leftJoin(
      'student_health_system_onboarding',
      'students.id',
      'student_health_system_onboarding.student_id'
    )
    .select([
      'students.id',
      'students.name',
      'students.email',
      'students.created_at',
      'students.updated_at',
      db.fn.count(
        db.case()
          .when('student_health_system_onboarding.is_completed', '=', 1)
          .then(1)
          .end()
      ).as('completed_onboarding')
    ])
    .groupBy('students.id')
    .orderBy('students.name', 'asc')
    .execute();

  return students.map(s => ({
    ...s,
    completed_onboarding: Number(s.completed_onboarding),
    total_health_systems: totalHealthSystems
  }));
}
```

### 4.2 Update Students API endpoint
**File:** `src/routes/api/students/+server.ts`

Update GET handler to use new function and return onboarding stats.

### 4.3 Update Student List component
**File:** `src/lib/features/students/components/student-list.svelte`

Add new column after Email:
```svelte
<th class="px-4 py-3 text-left text-sm font-medium">Onboarding</th>

<!-- In table body -->
<td class="px-4 py-3 text-sm">
  <Badge variant={student.completed_onboarding === student.total_health_systems ? 'default' : 'secondary'}>
    {student.completed_onboarding}/{student.total_health_systems}
  </Badge>
</td>
```

### 4.4 Update Students page data loading
**File:** `src/routes/students/+page.svelte`

Ensure the page passes the new data structure to the StudentList component.

---

## Step 5: Fix Tests

### 5.1 Update API test files
**Files to check/update:**
- `e2e/api/health-systems.api.test.ts` - Update endpoint URLs
- `e2e/api/students.api.test.ts` - Add onboarding ratio tests
- Any unit tests for health systems service

### 5.2 Add new tests for student onboarding endpoint
**Create or update:** Tests for `/api/student-onboarding` endpoint
- Test GET returns all records
- Test PUT creates new records
- Test PUT updates existing records
- Test validation errors

---

## Step 6: Fix Build and Type Errors

### 6.1 Run type check
```bash
npm run check
```

### 6.2 Fix any TypeScript errors
- Update type definitions if needed
- Ensure all components receive correct props

### 6.3 Run build
```bash
npm run build
```

---

## Files Changed Summary

### New Files:
- `src/routes/api/health-systems/+server.ts`
- `src/routes/api/health-systems/[id]/+server.ts`
- `src/routes/api/health-systems/[id]/dependencies/+server.ts`
- `src/routes/api/student-onboarding/+server.ts`

### Modified Files:
- `src/lib/features/students/services/student-service.ts`
- `src/lib/features/students/components/student-list.svelte`
- `src/lib/features/scheduling-config/components/student-onboarding-form.svelte`
- `src/routes/api/students/+server.ts`
- `src/routes/students/+page.svelte`
- `src/routes/health-systems/+page.server.ts`
- `src/routes/preceptors/+page.ts`
- `src/lib/features/preceptors/components/preceptor-form.svelte`

### Deleted Files:
- `src/routes/api/scheduling-config/health-systems/+server.ts`
- `src/routes/api/scheduling-config/health-systems/[id]/+server.ts`
- `src/routes/api/scheduling-config/health-systems/[id]/dependencies/+server.ts`

---

## Testing Checklist
- [ ] Health systems CRUD works at new endpoint
- [ ] Student onboarding form loads without error
- [ ] Student onboarding form saves changes
- [ ] Student list shows onboarding ratio column
- [ ] Ratio displays correctly (e.g., "3/5")
- [ ] Badge color changes based on completion status
- [ ] All TypeScript/Svelte checks pass
- [ ] Build succeeds
- [ ] Related tests pass
