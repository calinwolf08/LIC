# Dev Plan: Conflict Visualization in Calendar

## Overview
Proactively display scheduling conflicts and issues directly in the calendar view, allowing coordinators to identify and resolve problems without navigating to the Schedule Results page.

## Problem Statement
Currently, to see schedule issues (preceptor unavailability conflicts, capacity violations, unmet student requirements), users must navigate to `/schedule/results`. Issues are discovered reactively rather than being visible at-a-glance in the primary calendar interface.

## Solution
Add visual indicators directly on calendar assignments and days to highlight:
1. Assignments where the preceptor is now unavailable
2. Preceptors who are at or over capacity
3. Students with unmet requirements
4. Days with constraint violations

---

## Conflict Types to Visualize

| Conflict Type | Visual Indicator | Location |
|---------------|------------------|----------|
| Preceptor unavailable on assigned date | Red border + warning icon | On assignment chip |
| Preceptor at capacity | Orange capacity badge | On assignment chip |
| Student has unmet requirements | Yellow warning dot | On student name in list view |
| Assignment on a blackout date | Red striped background | On calendar day (already exists) |
| Student double-booked | Red exclamation | On conflicting assignments |

---

## Implementation Steps

### Phase 1: Conflict Detection Service

**File: `src/lib/features/schedules/services/conflict-detection-service.ts`**

```typescript
export interface AssignmentConflict {
  assignmentId: string;
  type: 'preceptor_unavailable' | 'preceptor_over_capacity' | 'blackout_date' | 'student_double_booked';
  severity: 'error' | 'warning';
  message: string;
  details?: {
    preceptorId?: string;
    date?: string;
    currentCount?: number;
    maxCapacity?: number;
  };
}

export interface StudentRequirementStatus {
  studentId: string;
  studentName: string;
  hasUnmetRequirements: boolean;
  unmetClerkships: Array<{
    clerkshipId: string;
    clerkshipName: string;
    remaining: number;
  }>;
}

/**
 * Detect conflicts for assignments in a date range
 */
export async function detectConflicts(
  db: Kysely<DB>,
  startDate: string,
  endDate: string
): Promise<{
  assignmentConflicts: Map<string, AssignmentConflict[]>;
  studentStatus: Map<string, StudentRequirementStatus>;
}> {
  // Implementation steps:
  // 1. Fetch all assignments in date range
  // 2. Fetch preceptor availability for those dates
  // 3. Fetch capacity rules
  // 4. Fetch blackout dates
  // 5. Compare and detect conflicts
  // 6. Calculate student requirement status
}

/**
 * Check single assignment for conflicts (for real-time validation)
 */
export async function checkAssignmentConflicts(
  db: Kysely<DB>,
  assignmentId: string
): Promise<AssignmentConflict[]> {
  // Quick check for a single assignment
}
```

### Phase 2: Conflict API Endpoint

**File: `src/routes/api/calendar/conflicts/+server.ts`**

```typescript
// GET /api/calendar/conflicts?start_date=X&end_date=Y
export async function GET({ url, locals }) {
  const startDate = url.searchParams.get('start_date');
  const endDate = url.searchParams.get('end_date');

  const conflicts = await detectConflicts(locals.db, startDate, endDate);

  return json({
    assignmentConflicts: Object.fromEntries(conflicts.assignmentConflicts),
    studentStatus: Object.fromEntries(conflicts.studentStatus),
    summary: {
      totalConflicts: conflicts.assignmentConflicts.size,
      studentsWithUnmetRequirements: [...conflicts.studentStatus.values()]
        .filter(s => s.hasUnmetRequirements).length
    }
  });
}
```

### Phase 3: Extend Calendar Types

**File: `src/lib/features/schedules/types/schedule-views.ts`**

Add conflict info to existing types:

```typescript
export interface CalendarDayAssignment {
  id: string;
  clerkshipId: string;
  clerkshipName: string;
  // ... existing fields ...

  // NEW: Conflict indicators
  conflicts?: AssignmentConflict[];
  hasConflict?: boolean;
  conflictSeverity?: 'error' | 'warning' | null;
}

export interface CalendarDay {
  // ... existing fields ...

  // NEW: Day-level conflict summary
  conflictCount?: number;
  hasErrors?: boolean;
  hasWarnings?: boolean;
}
```

### Phase 4: Calendar Grid Visual Updates

**File: `src/lib/features/schedules/components/schedule-calendar-grid.svelte`**

Update assignment chip rendering:

```svelte
<button
  type="button"
  class="w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate
         hover:opacity-80 transition-opacity
         {assignment.hasConflict ? 'ring-2' : ''}
         {assignment.conflictSeverity === 'error' ? 'ring-red-500' : ''}
         {assignment.conflictSeverity === 'warning' ? 'ring-amber-500' : ''}"
  style="background-color: {assignment.color}20; color: {assignment.color};
         border-left: 2px solid {assignment.color};"
  title="{assignment.clerkshipName} - {assignment.preceptorName}
         {assignment.conflicts?.map(c => '\n⚠️ ' + c.message).join('') || ''}"
  onclick={(e) => handleAssignmentClick(e, day, assignment)}
>
  {#if mode === 'student'}
    {assignment.clerkshipAbbrev || assignment.clerkshipName.slice(0, 3)}
  {:else}
    {assignment.studentInitials || assignment.studentName?.split(' ').map(n => n[0]).join('')}
  {/if}

  <!-- Conflict indicator -->
  {#if assignment.hasConflict}
    <span class="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center
                 {assignment.conflictSeverity === 'error' ? 'bg-red-500' : 'bg-amber-500'}">
      <svg class="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
        <path d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"/>
      </svg>
    </span>
  {/if}
</button>
```

Add day-level conflict indicator:

```svelte
<!-- Day header with conflict count -->
<span class="text-xs font-medium {day.isToday ? 'text-primary' : ''}">
  {day.dayOfMonth}
  {#if day.conflictCount && day.conflictCount > 0}
    <span class="ml-1 inline-flex items-center justify-center w-4 h-4 text-[9px]
                 rounded-full {day.hasErrors ? 'bg-red-500' : 'bg-amber-500'} text-white">
      {day.conflictCount}
    </span>
  {/if}
</span>
```

### Phase 5: Conflict Summary Banner

**File: `src/routes/calendar/+page.svelte`**

Add a conflicts summary banner above the calendar:

```svelte
{#if conflictSummary && conflictSummary.totalConflicts > 0}
  <Card class="p-4 mb-6 border-red-500 bg-red-50 dark:bg-red-950/20">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="text-red-600 dark:text-red-400">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
        <div>
          <p class="font-medium text-red-800 dark:text-red-200">
            {conflictSummary.totalConflicts} Scheduling Conflict{conflictSummary.totalConflicts === 1 ? '' : 's'}
          </p>
          <p class="text-sm text-red-700 dark:text-red-300">
            {#if conflictSummary.preceptorUnavailable > 0}
              {conflictSummary.preceptorUnavailable} preceptor availability issue{conflictSummary.preceptorUnavailable === 1 ? '' : 's'}
            {/if}
            {#if conflictSummary.capacityExceeded > 0}
              • {conflictSummary.capacityExceeded} capacity violation{conflictSummary.capacityExceeded === 1 ? '' : 's'}
            {/if}
          </p>
        </div>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" onclick={showConflictDetails}>
          View Details
        </Button>
        <Button variant="destructive" size="sm" onclick={handleRegenerateClick}>
          Fix with Regeneration
        </Button>
      </div>
    </div>
  </Card>
{/if}
```

### Phase 6: Conflict Details Panel

**File: `src/lib/features/schedules/components/conflict-details-panel.svelte`**

Expandable panel showing all conflicts:

```svelte
<script lang="ts">
  import type { AssignmentConflict, StudentRequirementStatus } from '../services/conflict-detection-service';

  interface Props {
    conflicts: Map<string, AssignmentConflict[]>;
    studentStatus: Map<string, StudentRequirementStatus>;
    onAssignmentClick: (assignmentId: string) => void;
    onStudentClick: (studentId: string) => void;
  }

  let { conflicts, studentStatus, onAssignmentClick, onStudentClick }: Props = $props();

  // Group conflicts by type
  let groupedConflicts = $derived(() => {
    const groups = {
      preceptor_unavailable: [] as Array<{ assignmentId: string; conflict: AssignmentConflict }>,
      preceptor_over_capacity: [] as Array<{ assignmentId: string; conflict: AssignmentConflict }>,
      blackout_date: [] as Array<{ assignmentId: string; conflict: AssignmentConflict }>,
      student_double_booked: [] as Array<{ assignmentId: string; conflict: AssignmentConflict }>
    };

    for (const [assignmentId, assignmentConflicts] of conflicts) {
      for (const conflict of assignmentConflicts) {
        groups[conflict.type].push({ assignmentId, conflict });
      }
    }

    return groups;
  });
</script>

<div class="space-y-4">
  <!-- Preceptor Unavailable -->
  {#if groupedConflicts().preceptor_unavailable.length > 0}
    <div class="border rounded-lg p-4">
      <h4 class="font-medium text-red-600 mb-2 flex items-center gap-2">
        <span class="w-2 h-2 bg-red-500 rounded-full"></span>
        Preceptor Unavailable ({groupedConflicts().preceptor_unavailable.length})
      </h4>
      <ul class="space-y-1 text-sm">
        {#each groupedConflicts().preceptor_unavailable as { assignmentId, conflict }}
          <li>
            <button class="text-primary hover:underline" onclick={() => onAssignmentClick(assignmentId)}>
              {conflict.message}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Capacity Exceeded -->
  {#if groupedConflicts().preceptor_over_capacity.length > 0}
    <div class="border rounded-lg p-4">
      <h4 class="font-medium text-amber-600 mb-2 flex items-center gap-2">
        <span class="w-2 h-2 bg-amber-500 rounded-full"></span>
        Capacity Exceeded ({groupedConflicts().preceptor_over_capacity.length})
      </h4>
      <ul class="space-y-1 text-sm">
        {#each groupedConflicts().preceptor_over_capacity as { assignmentId, conflict }}
          <li>
            <button class="text-primary hover:underline" onclick={() => onAssignmentClick(assignmentId)}>
              {conflict.message}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Students with Unmet Requirements -->
  {#if [...studentStatus.values()].filter(s => s.hasUnmetRequirements).length > 0}
    <div class="border rounded-lg p-4">
      <h4 class="font-medium text-amber-600 mb-2 flex items-center gap-2">
        <span class="w-2 h-2 bg-amber-500 rounded-full"></span>
        Students with Unmet Requirements
      </h4>
      <ul class="space-y-2 text-sm">
        {#each [...studentStatus.values()].filter(s => s.hasUnmetRequirements) as student}
          <li class="flex justify-between items-start">
            <button class="text-primary hover:underline" onclick={() => onStudentClick(student.studentId)}>
              {student.studentName}
            </button>
            <span class="text-muted-foreground text-xs">
              {student.unmetClerkships.map(c => `${c.clerkshipName}: ${c.remaining} days`).join(', ')}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
```

### Phase 7: Calendar Page Integration

**File: `src/routes/calendar/+page.svelte`**

Add conflict loading and state:

```svelte
<script>
  // Conflict state
  let conflictData = $state<{
    assignmentConflicts: Map<string, AssignmentConflict[]>;
    studentStatus: Map<string, StudentRequirementStatus>;
    summary: { totalConflicts: number; studentsWithUnmetRequirements: number };
  } | null>(null);
  let showConflictPanel = $state(false);

  // Load conflicts when calendar loads
  async function loadConflicts() {
    try {
      const response = await fetch(`/api/calendar/conflicts?start_date=${startDate}&end_date=${endDate}`);
      const result = await response.json();

      conflictData = {
        assignmentConflicts: new Map(Object.entries(result.assignmentConflicts)),
        studentStatus: new Map(Object.entries(result.studentStatus)),
        summary: result.summary
      };

      // Merge conflict data into calendar events
      enrichEventsWithConflicts();
    } catch (err) {
      console.error('Failed to load conflicts:', err);
    }
  }

  function enrichEventsWithConflicts() {
    if (!conflictData) return;

    events = events.map(event => {
      const conflicts = conflictData.assignmentConflicts.get(event.assignment.id);
      if (conflicts && conflicts.length > 0) {
        return {
          ...event,
          assignment: {
            ...event.assignment,
            conflicts,
            hasConflict: true,
            conflictSeverity: conflicts.some(c => c.severity === 'error') ? 'error' : 'warning'
          }
        };
      }
      return event;
    });
  }

  // Load conflicts after calendar loads
  $effect(() => {
    if (events.length > 0) {
      loadConflicts();
    }
  });
</script>
```

---

## Data Flow

```
Calendar page loads
         │
         ▼
┌─────────────────────────────────┐
│  GET /api/calendar              │
│  (loads assignments)            │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  GET /api/calendar/conflicts    │
│  (detects conflicts)            │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Merge conflict data into       │
│  assignment objects             │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Render calendar with           │
│  conflict indicators            │
└─────────────────────────────────┘
         │
         ▼
User sees conflicts at-a-glance
         │
         ▼
User clicks conflict → Edit modal opens
```

---

## Visual Design

### Assignment Chip with Conflict

```
Normal:
┌─────────────┐
│ FM          │  (Family Medicine abbreviation)
└─────────────┘

With Warning (capacity):
┌─────────────┐
│ FM       ⚠️ │  (Orange warning badge)
└─────────────┘

With Error (unavailable):
┌─────────────┐
│ FM       ⚠️ │  (Red warning badge + red ring)
└─────────────┘
```

### Day Cell with Conflicts

```
┌─────────────────┐
│ 15 ③           │  ← Red badge showing 3 conflicts
├─────────────────┤
│ [FM]           │  ← Normal assignment
│ [IM] ⚠️        │  ← Assignment with conflict
│ [SU] ⚠️        │  ← Assignment with conflict
│ +1 more        │
└─────────────────┘
```

### Conflict Summary Banner

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠️  3 Scheduling Conflicts                                         │
│     2 preceptor availability issues • 1 capacity violation         │
│                                          [View Details] [Fix]      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/lib/features/schedules/services/conflict-detection-service.ts` | Create | Core conflict detection logic |
| `src/routes/api/calendar/conflicts/+server.ts` | Create | Conflicts API endpoint |
| `src/lib/features/schedules/types/schedule-views.ts` | Modify | Add conflict fields to types |
| `src/lib/features/schedules/components/schedule-calendar-grid.svelte` | Modify | Add visual conflict indicators |
| `src/lib/features/schedules/components/conflict-details-panel.svelte` | Create | Detailed conflict list panel |
| `src/routes/calendar/+page.svelte` | Modify | Load conflicts, show banner/panel |
| `src/routes/calendar/+page.server.ts` | Modify | Optionally preload conflicts SSR |

---

## Testing Plan

### Unit Tests
- `detectConflicts` identifies preceptor unavailable on assigned date
- `detectConflicts` identifies capacity exceeded
- `detectConflicts` identifies blackout date violations
- `detectConflicts` calculates student requirement status correctly
- Multiple conflicts on same assignment are all detected

### Integration Tests
- Conflict API returns correct data structure
- Conflicts update when preceptor availability changes
- Conflicts update when capacity rules change
- Conflicts update when blackout dates are added

### E2E Tests
- Conflict badge appears on assignments with issues
- Conflict count badge appears on days with conflicts
- Clicking conflict opens edit modal for that assignment
- Conflict banner shows correct summary counts
- Conflict details panel lists all conflicts grouped by type
- Resolving a conflict (e.g., reassigning) removes the indicator

---

## Performance Considerations

1. **Caching**: Cache conflict detection results for 30 seconds to avoid repeated queries
2. **Incremental Updates**: When single assignment changes, only recheck that assignment
3. **Lazy Loading**: Only load conflicts for visible month, not entire year
4. **Background Refresh**: Poll for conflicts every 60 seconds if page is active

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Conflict Detection Service | Medium |
| Phase 2: API Endpoint | Small |
| Phase 3: Type Extensions | Small |
| Phase 4: Calendar Grid Visuals | Medium |
| Phase 5: Summary Banner | Small |
| Phase 6: Details Panel | Medium |
| Phase 7: Page Integration | Medium |
| Testing | Medium |

**Total: ~4-5 days of development**

---

## Future Enhancements

1. **Auto-Fix Suggestions**: "Click to reassign to Dr. Smith who is available"
2. **Conflict Notifications**: Email coordinators when new conflicts arise
3. **Historical Conflict Tracking**: Log when conflicts were introduced and resolved
4. **Conflict Prevention**: Warn before saving changes that would create conflicts
5. **Bulk Conflict Resolution**: "Fix all capacity issues" button that reassigns optimally
