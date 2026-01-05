# Dev Plan: Display Violation Statistics

**Feature**: Show constraint violation data in schedule results
**Priority**: High
**Effort**: Small (2-3 hours)
**Value**: High - Enables data-driven problem solving

## Overview

Display violation statistics returned by the scheduling engine to help users understand why scheduling failed and what to fix.

## Current State

**API Response** (`/api/schedules/generate`):
```typescript
{
  success: boolean,
  data: {
    assignments: Assignment[],
    unmetRequirements: UnmetRequirement[],
    violationStats: [              // ← Currently ignored by UI
      {
        constraintName: "preceptor-capacity",
        count: 45,
        percentage: 32.1
      },
      // ...
    ]
  }
}
```

**Results Page**: Only shows unmet requirements, not violations.

## Goal

Add a "Constraint Violations" section to the schedule results page showing:
- Top blocking constraints
- How many times each constraint blocked assignments
- Percentage breakdown
- Visual indicator of severity

## Implementation

### 1. Update Type Definitions

**File**: `src/lib/features/schedules/types/schedule-views.ts`

Add violation stats to results summary:

```typescript
export interface ScheduleResultsSummary {
  // ... existing fields
  violationStats?: ViolationStat[];  // Add this
}

export interface ViolationStat {
  constraintName: string;
  count: number;
  percentage: number;
}
```

### 2. Update Server Load Function

**File**: `src/routes/schedule/results/+page.server.ts`

Currently loads schedule summary. Need to enhance to include violations.

**Check**: Does the current summary query include violation data?
- If yes: Pass it through
- If no: Query from database or regenerate

**Approach**: Violations are only available immediately after generation, not stored.

**Solution**: Store violation stats when schedule is generated, or accept they're only available during generation flow.

**Recommendation**: For now, only show violations in the generation response flow. Add storage later.

### 3. Create Violation Stats Card Component

**New File**: `src/lib/features/schedules/components/violation-stats-card.svelte`

```svelte
<script lang="ts">
  import type { ViolationStat } from '../types/schedule-views';
  import { Card } from '$lib/components/ui/card';

  interface Props {
    violations: ViolationStat[];
  }

  let { violations }: Props = $props();

  // Format constraint names for display
  function formatConstraintName(name: string): string {
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Get severity class based on percentage
  function getSeverityClass(percentage: number): string {
    if (percentage > 30) return 'bg-red-100 text-red-800';
    if (percentage > 15) return 'bg-orange-100 text-orange-800';
    return 'bg-yellow-100 text-yellow-800';
  }

  let topViolations = $derived(violations.slice(0, 5));
</script>

<Card class="overflow-hidden">
  <div class="bg-muted/50 px-4 py-3 border-b">
    <h3 class="font-semibold">Top Blocking Constraints</h3>
    <p class="text-sm text-muted-foreground mt-1">
      Constraints that prevented the most assignments
    </p>
  </div>

  {#if violations.length === 0}
    <div class="p-8 text-center">
      <div class="text-green-600 text-lg font-medium">
        No Constraint Violations
      </div>
      <p class="text-sm text-muted-foreground mt-1">
        All attempted assignments passed constraint validation.
      </p>
    </div>
  {:else}
    <div class="divide-y">
      {#each topViolations as violation, index}
        <div class="px-4 py-3 hover:bg-muted/30 transition-colors">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="text-lg font-bold text-muted-foreground">
                #{index + 1}
              </div>
              <div>
                <p class="font-medium">
                  {formatConstraintName(violation.constraintName)}
                </p>
                <p class="text-sm text-muted-foreground">
                  {violation.count} assignment{violation.count !== 1 ? 's' : ''} blocked
                </p>
              </div>
            </div>
            <div class="text-right">
              <span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityClass(violation.percentage)}`}>
                {violation.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      {/each}
    </div>

    {#if violations.length > 5}
      <div class="px-4 py-3 bg-muted/30 text-sm text-muted-foreground text-center">
        +{violations.length - 5} more constraint types
      </div>
    {/if}
  {/if}
</Card>
```

### 4. Add Component to Results Page

**File**: `src/routes/schedule/results/+page.svelte`

Update layout to include violations:

```svelte
<div class="space-y-6">
  <!-- Stats Overview -->
  <ScheduleStatsCard stats={data.summary.stats} isComplete={data.summary.isComplete} />

  <!-- NEW: Violation Stats (only show if available) -->
  {#if data.summary.violationStats && data.summary.violationStats.length > 0}
    <ViolationStatsCard violations={data.summary.violationStats} />
  {/if}

  <div class="grid gap-6 lg:grid-cols-2">
    <!-- Unmet Requirements -->
    <div class="lg:col-span-1">
      <UnmetRequirementsTable
        students={data.summary.studentsWithUnmetRequirements}
        onStudentClick={handleStudentClick}
      />
    </div>

    <!-- Clerkship Breakdown -->
    <div class="lg:col-span-1">
      <ClerkshipBreakdownTable breakdown={data.summary.clerkshipBreakdown} />
    </div>
  </div>
</div>
```

### 5. Alternative: Store Violations in Database

For persistent access to violation data:

**Migration**: Add `schedule_generation_log` table

```sql
CREATE TABLE schedule_generation_log (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  total_assignments INTEGER NOT NULL,
  total_violations INTEGER NOT NULL,
  violation_data TEXT NOT NULL, -- JSON
  success INTEGER NOT NULL,
  FOREIGN KEY (period_id) REFERENCES scheduling_periods(id)
);
```

**Service**: Save violations when generating

```typescript
// In /api/schedules/generate
const result = await engine.generateSchedule(...);

await db.insertInto('schedule_generation_log').values({
  id: nanoid(),
  period_id: activePeriod.id,
  generated_at: new Date().toISOString(),
  total_assignments: result.assignments.length,
  total_violations: result.violationStats.reduce((sum, v) => sum + v.count, 0),
  violation_data: JSON.stringify(result.violationStats),
  success: result.success ? 1 : 0
}).execute();
```

**Load**: Retrieve latest violations for display

```typescript
// In +page.server.ts
const latestLog = await db
  .selectFrom('schedule_generation_log')
  .where('period_id', '=', activePeriod.id)
  .orderBy('generated_at', 'desc')
  .selectAll()
  .executeTakeFirst();

const violationStats = latestLog
  ? JSON.parse(latestLog.violation_data)
  : [];
```

## Testing

### Manual Testing

1. Generate incomplete schedule (limit preceptor capacity)
2. Check results page shows violation stats
3. Verify top blockers are correct
4. Verify percentages add up correctly
5. Check UI handles 0 violations gracefully

### Test Cases

```typescript
describe('ViolationStatsCard', () => {
  it('should display violations with correct formatting', () => {
    const violations = [
      { constraintName: 'preceptor-capacity', count: 45, percentage: 32.1 },
      { constraintName: 'site-availability', count: 23, percentage: 16.4 }
    ];
    // Test rendering
  });

  it('should show "no violations" message when empty', () => {
    const violations = [];
    // Test empty state
  });

  it('should limit display to top 5', () => {
    const violations = Array(10).fill({...});
    // Test truncation
  });
});
```

## Files to Modify

1. **Type definitions**: `src/lib/features/schedules/types/schedule-views.ts`
2. **Component (new)**: `src/lib/features/schedules/components/violation-stats-card.svelte`
3. **Component exports**: `src/lib/features/schedules/components/index.ts`
4. **Results page**: `src/routes/schedule/results/+page.svelte`
5. **Server load** (if storing): `src/routes/schedule/results/+page.server.ts`

## Optional Enhancements

1. **Clickable constraints**: Click violation to see details
2. **Suggested fixes**: Auto-generate suggestions per constraint type
3. **Trend chart**: Show violations over multiple generation attempts
4. **Export**: Download violation report as CSV

## Success Criteria

- ✅ Violation stats visible on results page after generation
- ✅ Top 5 blocking constraints shown
- ✅ Percentages displayed accurately
- ✅ UI handles edge cases (0 violations, many violations)
- ✅ Component is reusable for other pages

## Timeline

- **Type definitions**: 15 min
- **Component creation**: 45 min
- **Integration**: 30 min
- **Testing**: 30 min
- **Polish**: 30 min

**Total**: ~2.5 hours
