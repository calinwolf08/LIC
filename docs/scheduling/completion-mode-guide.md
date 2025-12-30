# Completion Mode: Fill Gaps Without Regenerating

## Your Scenario - Detailed Solution

### Problem
```
Initial Generation:
✅ 450 assignments created
❌ 95% complete - 3 students have unmet requirements

Student A: Cardiology 7/10 days (missing 3)
Student B: Surgery 3/8 days (missing 5)
Student C: Complete ✅

Constraints were too strict:
- Max 2 students per preceptor
- Strict specialty matching
- Health system continuity required
```

### Goal
```
Keep: ALL 450 existing assignments
Adjust: Relax constraints ONLY for gap-filling
Generate: 8 new assignments (3 + 5)
Result: 100% completion
```

---

## Current System - Best Workaround

### Option 1: Use `bypassedConstraints` with Manual Filtering

**How It Works:**

The API already supports `bypassedConstraints`, but there's no "completion-only" mode yet. Here's the workaround:

1. **Don't use regenerate at all**
2. **Use the scheduling engine directly** for incomplete students only
3. **Manually merge** results with existing schedule

**Implementation Steps:**

#### Step 1: Identify Incomplete Students

```typescript
// On results page, you see:
studentsWithUnmet Requirement = [
  { student_id: 'student-a', missing: { 'clerkship-cardiology': 3 } },
  { student_id: 'student-b', missing: { 'clerkship-surgery': 5 } }
]
```

#### Step 2: Call Generation API with Bypassed Constraints

```typescript
// This is a NEW endpoint that needs to be created
POST /api/schedules/generate-completion
{
  "startDate": "2025-01-01",
  "endDate": "2025-12-31",
  "studentIds": ["student-a", "student-b"],  // Only these students
  "bypassedConstraints": ["preceptor-capacity", "specialty-match"]
}

Backend behavior:
1. Build context with ONLY specified students
2. Load ALL existing assignments into context
3. Credit existing work to these students' requirements
4. Generate ONLY for remaining requirements
5. Insert ONLY new assignments (don't touch existing)
```

### Option 2: Manual Assignment Creation (Current Workaround)

**Use the existing manual assignment UI:**

1. Go to Calendar page
2. For each missing assignment:
   - Click date cell
   - Select student
   - Select clerkship
   - Select preceptor (even if over capacity)
   - Save with constraint bypass

**Pros:**
- Works today with no code changes
- Full control over each assignment

**Cons:**
- Tedious for many gaps (e.g., 8 manual assignments)
- Error-prone
- No optimization

---

## Proper Solution: Implement "Completion Mode"

### What Needs to Be Added

#### 1. Schema Update (✅ DONE)

```typescript
// src/lib/features/scheduling/schemas.ts
strategy: z.enum([
  'full-reoptimize',
  'minimal-change',
  'completion'  // ✅ Already added
])
```

#### 2. Regeneration Service Function (❌ NEEDS IMPLEMENTATION)

```typescript
// src/lib/features/scheduling/services/regeneration-service.ts

export type RegenerationStrategy = 'minimal-change' | 'full-reoptimize' | 'completion';

/**
 * Prepare context for completion-only generation
 *
 * Keeps 100% of existing assignments and only generates for gaps
 */
export async function prepareCompletionContext(
  db: Kysely<DB>,
  context: SchedulingContext,
  startDate: string,
  endDate: string
): Promise<{
  totalExistingAssignments: number;
  studentsWithUnmetRequirements: string[];
  unmetRequirementsByStudent: Map<string, Map<string, number>>;
}> {
  log.debug('Preparing completion-only context');

  // Get ALL existing assignments (no date filtering)
  const allExistingAssignments = await getAssignmentsByDateRange(db, startDate, endDate);

  // Credit ALL existing work to requirements
  creditPastAssignmentsToRequirements(context, allExistingAssignments);

  // Add ALL existing assignments to context
  // This makes the engine aware of them and work around them
  for (const assignment of allExistingAssignments) {
    const preservedAssignment: Assignment = {
      studentId: assignment.student_id,
      preceptorId: assignment.preceptor_id,
      clerkshipId: assignment.clerkship_id,
      date: assignment.date,
      siteId: assignment.site_id || undefined
    };

    // Add to context
    context.assignments.push(preservedAssignment);

    // Update all tracking maps
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

  // Identify students with unmet requirements
  const studentsWithUnmetRequirements: string[] = [];
  const unmetRequirementsByStudent = new Map<string, Map<string, number>>();

  for (const student of context.students) {
    const requirements = context.studentRequirements.get(student.id!);
    if (!requirements) continue;

    const unmetForStudent = new Map<string, number>();
    let hasUnmet = false;

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
    studentsWithGaps: studentsWithUnmetRequirements.length,
    totalStudents: context.students.length
  });

  return {
    totalExistingAssignments: allExistingAssignments.length,
    studentsWithUnmetRequirements,
    unmetRequirementsByStudent
  };
}
```

#### 3. Update API Handler (❌ NEEDS IMPLEMENTATION)

```typescript
// src/routes/api/schedules/generate/+server.ts

// Add after line 98 where strategy is determined
if (strategy === 'completion') {
  log.info('Using completion-only strategy');

  // Prepare completion context
  const completionResult = await prepareCompletionContext(
    db,
    context,
    validatedData.startDate,
    validatedData.endDate
  );

  if (completionResult.studentsWithUnmetRequirements.length === 0) {
    return successResponse({
      assignments: [],
      success: true,
      unmetRequirements: [],
      violations: [],
      summary: {
        totalAssignments: 0,
        totalViolations: 0,
        strategiesUsed: []
      },
      strategy: 'completion',
      message: 'All students already have complete schedules. No gaps to fill.'
    });
  }

  // Run engine with bypassed constraints
  const engine = new ConfigurableSchedulingEngine();

  // Pass bypassed constraints to engine
  const result = engine.generateSchedule(context, {
    startDate: validatedData.startDate,
    endDate: validatedData.endDate,
    bypassedConstraints: validatedData.bypassedConstraints || []
  });

  // Filter: only keep NEW assignments (not the preserved ones)
  const existingSet = new Set(
    result.assignments
      .slice(0, completionResult.totalExistingAssignments)
      .map(a => `${a.studentId}-${a.date}-${a.clerkshipId}`)
  );

  const newAssignmentsOnly = result.assignments.filter(
    a => !existingSet.has(`${a.studentId}-${a.date}-${a.clerkshipId}`)
  );

  log.info('Completion generation complete', {
    existingPreserved: completionResult.totalExistingAssignments,
    newGenerated: newAssignmentsOnly.length,
    studentsCompleted: completionResult.studentsWithUnmetRequirements.length
  });

  // Save ONLY new assignments
  if (newAssignmentsOnly.length > 0) {
    const saveResult = await bulkCreateAssignments(db, newAssignmentsOnly);
    if (!saveResult.success) {
      return errorResponse(saveResult.error);
    }
  }

  // Create audit log
  await createRegenerationAuditLog(db, {
    strategy: 'completion',
    startDate: validatedData.startDate,
    endDate: validatedData.endDate,
    preservedCount: completionResult.totalExistingAssignments,
    generatedCount: newAssignmentsOnly.length,
    deletedCount: 0,
    bypassedConstraints: validatedData.bypassedConstraints || []
  });

  return successResponse({
    ...result,
    assignments: newAssignmentsOnly,
    strategy: 'completion',
    existingAssignmentsPreserved: completionResult.totalExistingAssignments,
    newAssignmentsGenerated: newAssignmentsOnly.length,
    studentsCompleted: completionResult.studentsWithUnmetRequirements.length,
    bypassedConstraints: validatedData.bypassedConstraints,
    unmetRequirementsAfter: completionResult.unmetRequirementsByStudent
  });
}
```

#### 4. Update UI (❌ NEEDS IMPLEMENTATION)

```svelte
<!-- src/lib/features/schedules/components/regenerate-dialog.svelte -->

<script lang="ts">
  // Add completion mode
  let regenerationMode = $state<'full' | 'smart' | 'completion'>('smart');
  let bypassedConstraints = $state<string[]>([]);

  const availableConstraints = [
    { name: 'preceptor-capacity', label: 'Preceptor Capacity (allow exceeding max)' },
    { name: 'site-capacity', label: 'Site Capacity (allow exceeding max)' },
    { name: 'specialty-match', label: 'Specialty Matching (allow mismatches)' },
    { name: 'health-system-continuity', label: 'Health System Continuity (allow switches)' },
    { name: 'no-double-booking', label: 'Double Booking (allow same-day assignments)' }
  ];
</script>

<!-- Add completion mode option -->
<label>
  <input type="radio" value="completion" bind:group={regenerationMode} />
  <div>
    <p class="font-medium">Completion Mode (Fill Gaps Only)</p>
    <p class="text-sm text-muted-foreground">
      Keep ALL existing assignments. Only generate new assignments for students
      with unmet requirements. Use this after adjusting constraints to complete
      an incomplete schedule.
    </p>
  </div>
</label>

{#if regenerationMode === 'completion'}
  <div class="completion-options">
    <h4>Constraints to Relax (for new assignments only)</h4>

    {#each availableConstraints as constraint}
      <label>
        <input
          type="checkbox"
          value={constraint.name}
          bind:group={bypassedConstraints}
        />
        {constraint.label}
      </label>
    {/each}

    <div class="info-box">
      ℹ️ Completion Mode:
      - Preserves 100% of existing assignments
      - Generates only for students with gaps
      - Relaxed constraints apply ONLY to new assignments
    </div>
  </div>
{/if}

<!-- Update handleRegenerate -->
async function handleRegenerate() {
  const requestBody: any = {
    startDate,
    endDate
  };

  if (regenerationMode === 'completion') {
    requestBody.strategy = 'completion';
    requestBody.bypassedConstraints = bypassedConstraints;
  } else if (regenerationMode === 'smart') {
    requestBody.strategy = 'minimal-change';
    requestBody.regenerateFromDate = regenerateFromDate;
    requestBody.strategy = strategy;
  }

  const response = await fetch('/api/schedules/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  // Handle response...
}
```

---

## Usage Workflow

### Step 1: Initial Generation (95% complete)

```bash
POST /api/schedules/generate
{
  "startDate": "2025-01-01",
  "endDate": "2025-12-31"
}

Response:
{
  "success": true,
  "data": {
    "assignments": [...],  // 450 assignments
    "unmetRequirements": [
      { studentId: "student-a", clerkshipId: "cardiology", daysNeeded: 3 },
      { studentId: "student-b", clerkshipId: "surgery", daysNeeded: 5 }
    ]
  }
}
```

### Step 2: Review Results

User sees:
- 95% complete
- Violation stats show "preceptor-capacity" blocked 45 attempts
- Suggestions say "Increase preceptor capacity"

### Step 3: Decide on Approach

**Option A**: Permanently increase capacity
- Edit preceptors, increase max_students from 2 to 3
- Use full-reoptimize to regenerate everything

**Option B**: One-time bypass for completion
- Keep capacity at 2 for future
- Use completion mode to fill gaps with capacity bypass

User chooses Option B (completion mode)

### Step 4: Trigger Completion Mode

```bash
Calendar → Regenerate Schedule

Mode: ● Completion Mode (Fill Gaps Only)

Constraints to Relax:
☑ Preceptor Capacity
☐ Double Booking
☐ Specialty Match

[Apply Regeneration]

API Call:
POST /api/schedules/generate
{
  "startDate": "2025-01-01",
  "endDate": "2025-12-31",
  "strategy": "completion",
  "bypassedConstraints": ["preceptor-capacity"]
}
```

### Step 5: Backend Processing

```typescript
Backend Flow:
1. Load 450 existing assignments
2. Add all 450 to context (engine sees them as constraints)
3. Credit existing work:
   - Student A: 10 needed - 7 completed = 3 remaining
   - Student B: 8 needed - 3 completed = 5 remaining
4. Generate with capacity bypassed:
   - Student A: 3 Cardiology days (allow Dr. Smith to take 3rd student)
   - Student B: 5 Surgery days (allow Dr. Jones to take 3rd student)
5. Save ONLY 8 new assignments
6. Return success

Database Changes:
- 0 deletions
- 8 inserts
- 450 existing unchanged
```

### Step 6: Result

```
Before:
- 450 assignments
- 95% complete
- Violations: preceptor-capacity x45

After Completion Mode:
- 458 assignments (450 + 8)
- 100% complete ✅
- Violations: 0
- Preceptor capacity exceeded ONLY for the 8 gap-filling assignments
- Original schedule integrity maintained
```

---

## Implementation Status

| Component | Status | Priority |
|-----------|--------|----------|
| Schema update | ✅ Complete | - |
| `prepareCompletionContext()` | ❌ Needs implementation | High |
| API handler update | ❌ Needs implementation | High |
| UI completion mode | ❌ Needs implementation | Medium |
| Constraint checkboxes | ❌ Needs implementation | Medium |
| Tests | ❌ Needs implementation | Medium |
| Documentation | ✅ Complete | - |

---

## Next Steps

1. **Immediate workaround**: Use manual assignment creation for gaps
2. **Short-term**: Implement `prepareCompletionContext()` and API handler
3. **Medium-term**: Add UI for completion mode with constraint selection
4. **Long-term**: Add preview mode for completion to show what will be generated

---

## Summary

**Your scenario requires "Completion Mode"** - a third strategy alongside full-reoptimize and minimal-change.

**Key differences:**

| Feature | Full Reoptimize | Minimal Change | Completion |
|---------|----------------|----------------|------------|
| Keeps past | ✅ | ✅ | ✅ |
| Keeps future | ❌ | ✅ Some | ✅ ALL |
| Validates | N/A | ✅ Yes | ❌ No |
| Generates | Everything | Gaps + replacements | Gaps only |
| Bypassed constraints | ❌ | ❌ | ✅ For new only |

**Implementation needed**: ~4 hours of development + 2 hours testing

**Until then**: Use manual assignment creation as workaround (tedious but works)
