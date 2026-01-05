# Completion Mode Implementation Plan

## Problem Statement

**User Scenario:**
- Generated schedule for full year but couldn't meet 100% requirements due to strict constraints
- Want to adjust constraints (relax rules or bypass some) to complete the schedule
- Need to keep ALL existing assignments unchanged (even for incomplete students)
- Only generate new assignments to fill gaps using adjusted constraints

**Example:**
```
Initial generation:
- Student A: Cardiology 7/10 days (missing 3 days)
- Student B: Surgery 3/8 days (missing 5 days)
- Student C: Complete

Current constraints:
- Max 2 students per preceptor
- No double-booking
- Specialty matching required

Desired: Relax constraints ONLY for filling gaps
- Keep all 450 existing assignments
- Generate 8 new assignments with relaxed constraints
- Achieve 100% completion
```

## Current Gap

The `minimal-change` strategy validates and potentially modifies existing assignments when constraints change. This doesn't work for "completion only" scenarios where users want:

1. **Zero modifications** to existing work
2. **Selective constraint relaxation** only for gap-filling
3. **Target-specific generation** only for incomplete students

## Proposed Solution

### 1. Add New Strategy: "completion"

**File:** `src/lib/features/scheduling/schemas.ts`

```typescript
strategy: z.enum([
  'full-reoptimize',
  'minimal-change',
  'completion'  // NEW
]).optional().default('full-reoptimize')
```

**Behavior:**
- **Preserves:** 100% of existing assignments (never validates, never deletes)
- **Credits:** Past work to requirements (like other strategies)
- **Generates:** ONLY for students with remaining requirements
- **Bypasses:** Respects `bypassedConstraints` parameter for new assignments only

### 2. Extend Regeneration Service

**File:** `src/lib/features/scheduling/services/regeneration-service.ts`

Add new function:

```typescript
/**
 * Prepare context for completion-only generation
 *
 * Unlike minimal-change, this strategy:
 * - Keeps 100% of existing assignments (no validation)
 * - Only generates for students with unmet requirements
 * - Uses bypassed constraints only for new assignments
 */
export async function prepareCompletionContext(
  db: Kysely<DB>,
  context: SchedulingContext,
  startDate: string,
  endDate: string
): Promise<{
  allExistingAssignments: Selectable<ScheduleAssignments>[];
  studentsWithUnmetRequirements: string[];
  unmetRequirementsByStudent: Map<string, Map<string, number>>;
}> {
  // Get ALL existing assignments
  const allExistingAssignments = await getAssignmentsByDateRange(db, startDate, endDate);

  // Credit ALL existing assignments to requirements (no date filtering)
  creditPastAssignmentsToRequirements(context, allExistingAssignments);

  // Add ALL existing assignments to context (engine will work around them)
  for (const assignment of allExistingAssignments) {
    const preservedAssignment: Assignment = {
      studentId: assignment.student_id,
      preceptorId: assignment.preceptor_id,
      clerkshipId: assignment.clerkship_id,
      date: assignment.date,
      siteId: assignment.site_id || undefined
    };

    context.assignments.push(preservedAssignment);

    // Update tracking maps
    if (!context.assignmentsByDate.has(assignment.date)) {
      context.assignmentsByDate.set(assignment.date, []);
    }
    context.assignmentsByDate.get(assignment.date)!.push(preservedAssignment);

    if (!context.assignmentsByStudent.has(assignment.student_id)) {
      context.assignmentsByStudent.set(assignment.student_id, []);
    }
    context.assignmentsByStudent.get(assignment.student_id)!.push(preservedAssignment);

    if (!context.assignmentsByPreceptor.has(assignment.preceptor_id)) {
      context.assignmentsByPreceptor.set(assignment.preceptor_id, []);
    }
    context.assignmentsByPreceptor.get(assignment.preceptor_id)!.push(preservedAssignment);
  }

  // Identify students who still have unmet requirements
  const studentsWithUnmetRequirements: string[] = [];
  const unmetRequirementsByStudent = new Map<string, Map<string, number>>();

  for (const student of context.students) {
    const requirements = context.studentRequirements.get(student.id!);
    if (!requirements) continue;

    let hasUnmet = false;
    const unmetForStudent = new Map<string, number>();

    for (const [clerkshipId, daysNeeded] of requirements.entries()) {
      if (daysNeeded > 0) {
        hasUnmet = true;
        unmetForStudent.set(clerkshipId, daysNeeded);
      }
    }

    if (hasUnmet) {
      studentsWithUnmetRequirements.push(student.id!);
      unmetRequirementsByStudent.set(student.id!, unmetForStudent);
    }
  }

  log.info('Completion context prepared', {
    totalExistingAssignments: allExistingAssignments.length,
    studentsWithUnmetRequirements: studentsWithUnmetRequirements.length,
    totalStudents: context.students.length,
    completionRate: ((context.students.length - studentsWithUnmetRequirements.length) / context.students.length * 100).toFixed(1) + '%'
  });

  return {
    allExistingAssignments,
    studentsWithUnmetRequirements,
    unmetRequirementsByStudent
  };
}
```

### 3. Update API Handler

**File:** `src/routes/api/schedules/generate/+server.ts`

Update the POST handler to support completion mode:

```typescript
// After line 98 (strategy determination)
if (strategy === 'completion') {
  log.info('Using completion-only strategy', {
    startDate: validatedData.startDate,
    endDate: validatedData.endDate,
    bypassedConstraints: validatedData.bypassedConstraints
  });

  // Prepare completion context
  const completionResult = await prepareCompletionContext(
    db,
    context,
    validatedData.startDate,
    validatedData.endDate
  );

  log.info('Completion context ready', {
    existingAssignments: completionResult.allExistingAssignments.length,
    studentsWithGaps: completionResult.studentsWithUnmetRequirements.length
  });

  // Run engine with bypassed constraints for gap-filling
  const engine = new ConfigurableSchedulingEngine({
    bypassedConstraints: validatedData.bypassedConstraints || []
  });

  const result = engine.generateSchedule(context, {
    startDate: validatedData.startDate,
    endDate: validatedData.endDate
  });

  // Filter out preserved assignments from result
  // (engine includes them in output, but we don't want to re-insert)
  const existingIds = new Set(completionResult.allExistingAssignments.map(a =>
    `${a.student_id}-${a.date}-${a.clerkship_id}`
  ));

  const newAssignmentsOnly = result.assignments.filter(a =>
    !existingIds.has(`${a.studentId}-${a.date}-${a.clerkshipId}`)
  );

  // Save ONLY new assignments (don't touch existing)
  const saveResult = await bulkCreateAssignments(db, newAssignmentsOnly);

  return successResponse({
    ...result,
    strategy: 'completion',
    existingAssignmentsPreserved: completionResult.allExistingAssignments.length,
    newAssignmentsGenerated: newAssignmentsOnly.length,
    studentsCompleted: completionResult.studentsWithUnmetRequirements.length,
    bypassedConstraints: validatedData.bypassedConstraints
  });
}
```

### 4. Update UI - Regenerate Dialog

**File:** `src/lib/features/schedules/components/regenerate-dialog.svelte`

Add completion mode option:

```svelte
<label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
  <input
    type="radio"
    value="completion"
    bind:group={regenerationMode}
    disabled={isRegenerating}
    class="mt-1"
  />
  <div class="flex-1">
    <p class="font-medium">Completion Mode (Fill Gaps Only)</p>
    <p class="text-sm text-muted-foreground mt-1">
      Keep ALL existing assignments unchanged. Only generate new assignments to complete
      students with unmet requirements. Use this after adjusting constraints to finish
      an incomplete schedule.
    </p>
  </div>
</label>

{#if regenerationMode === 'completion'}
  <div class="space-y-4 mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
    <h4 class="font-semibold text-blue-900 dark:text-blue-100">
      Completion Mode Options
    </h4>

    <div>
      <Label for="bypassed-constraints">Constraints to Relax (for new assignments only)</Label>
      <p class="text-sm text-muted-foreground mb-2">
        Select which constraints to bypass when filling gaps:
      </p>

      {#each availableConstraints as constraint}
        <label class="flex items-center gap-2 py-1">
          <input
            type="checkbox"
            value={constraint.name}
            bind:group={bypassedConstraints}
            disabled={isRegenerating}
          />
          <span class="text-sm">{constraint.label}</span>
        </label>
      {/each}
    </div>

    <div class="bg-blue-100 dark:bg-blue-900/30 p-3 rounded border border-blue-300 dark:border-blue-700">
      <p class="text-sm font-medium text-blue-900 dark:text-blue-100">
        ℹ️ Completion Mode Behavior:
      </p>
      <ul class="text-sm text-blue-800 dark:text-blue-200 mt-2 space-y-1 list-disc list-inside">
        <li>Preserves 100% of existing assignments</li>
        <li>Generates only for students with unmet requirements</li>
        <li>Relaxed constraints apply ONLY to new assignments</li>
        <li>No deletions or modifications to current schedule</li>
      </ul>
    </div>
  </div>
{/if}
```

### 5. Example Usage Workflow

**Scenario: Initial generation 95% complete**

#### Step 1: Review Results
```
Results Page shows:
- 95% complete
- 3 students with unmet requirements
- Violations show "preceptor-capacity" was main blocker
```

#### Step 2: Adjust Constraints
User decides to relax capacity constraint for gap-filling:
```
Options:
1. Increase preceptor capacity permanently (affects future generations)
   OR
2. Use completion mode to bypass capacity ONLY for filling gaps
```

#### Step 3: Trigger Completion Mode
```
Calendar Page → Regenerate Schedule

Mode: ● Completion Mode (Fill Gaps Only)

Constraints to Relax:
☑ Preceptor Capacity (allow exceeding max for completion)
☐ Double Booking
☐ Specialty Match
☐ Health System Continuity

[Apply Regeneration]
```

#### Step 4: Backend Processing
```typescript
POST /api/schedules/generate
{
  "startDate": "2025-01-01",
  "endDate": "2025-12-31",
  "strategy": "completion",
  "bypassedConstraints": ["preceptor-capacity"]
}

Backend:
1. Load ALL existing assignments: 450
2. Credit all to requirements
3. Identify incomplete students: 3 students, 8 days needed
4. Add all 450 to context (engine will work around them)
5. Generate with capacity bypassed: 8 new assignments
6. Save ONLY new assignments: 8 inserts
7. Existing 450 assignments: NEVER TOUCHED
```

#### Step 5: Result
```
Before:
- 450 assignments
- 95% complete
- 3 students incomplete

After Completion Mode:
- 458 assignments (450 preserved + 8 new)
- 100% complete ✅
- All 3 students now complete
- Original schedule integrity maintained
```

## Implementation Checklist

- [ ] Update schema with 'completion' strategy
- [ ] Add `prepareCompletionContext()` function to regeneration-service.ts
- [ ] Update API handler to support completion mode
- [ ] Add completion mode UI to regenerate dialog
- [ ] Add constraint selection UI (checkboxes for bypassed constraints)
- [ ] Create tests for completion mode
- [ ] Update documentation with completion mode workflow

## Benefits

1. **Zero Risk to Existing Work**: No validation = no accidental deletions
2. **Selective Constraint Relaxation**: Bypass rules only where needed
3. **Efficient**: Only generates what's missing (not the whole schedule)
4. **Clear Intent**: Explicit "fill gaps" mode vs. "regenerate" modes
5. **Audit Trail**: Clearly shows which constraints were bypassed for completion

## Alternative: Workaround with Current System

If implementing completion mode is too complex right now, users can achieve similar results with this workflow:

1. Don't regenerate at all
2. Manually identify students with gaps
3. Use manual assignment creation with constraint bypass
4. Repeat until complete

But this is tedious and error-prone compared to automated completion mode.
