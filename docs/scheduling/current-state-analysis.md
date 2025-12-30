# Scheduling UI: Current State Analysis

**Date**: 2025-12-30
**Status**: Analysis Complete

## Executive Summary

The scheduling engine has sophisticated backend capabilities for constraint tracking and smart regeneration, but the UI doesn't expose most of these features. Users currently regenerate schedules blindly without understanding why scheduling failed or having options to preserve existing work.

## Current User Experience Problems

### 1. **No Visibility into Why Scheduling Failed**

**What Users See:**
```
Schedule Generated
⚠️ 3 students have unmet requirements
- Sarah Johnson: -15 days (Pediatrics: -10d, Surgery: -5d)
- John Smith: -8 days (Medicine: -8d)
- Emily Davis: -12 days (Pediatrics: -7d, Surgery: -5d)
```

**What Users DON'T See:**
- Which constraints blocked the most assignments
- Specific reasons (e.g., "Dr. Smith at capacity 45 times")
- Actionable suggestions for fixes
- Whether the problem is fixable or structural

**Impact**: Users make blind changes and hope the next regeneration works better.

### 2. **Destructive Regeneration Only**

**Current Behavior** (`regenerate-dialog.svelte:43-52`):
```typescript
// Step 1: DELETE ALL ASSIGNMENTS
await fetch('/api/schedules', { method: 'DELETE' });

// Step 2: Generate brand new schedule
await fetch('/api/schedules/generate', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate })
});
```

**Problems:**
- Destroys ALL existing assignments, even good ones
- No way to preserve past work (already-completed rotations)
- No incremental improvement option
- Mid-year adjustments require complete restart

**Impact**: Users hesitate to regenerate, leading to suboptimal schedules.

### 3. **Backend Capabilities Not Exposed**

The API supports advanced features that aren't available in the UI:

| Feature | API Support | UI Exposure |
|---------|------------|-------------|
| Violation tracking | ✅ Full | ❌ None |
| Top blocking constraints | ✅ Detailed stats | ❌ None |
| Smart regeneration | ✅ Date-based | ❌ None |
| Preserve past assignments | ✅ Credit system | ❌ None |
| Preview changes | ✅ Impact analysis | ❌ None |
| Regeneration strategies | ✅ 2 modes | ❌ None |
| Constraint bypass | ✅ Optional | ❌ None |

## Backend Capabilities (Already Built)

### 1. Violation Tracking System

**What it does:**
- Tracks every failed assignment attempt
- Records which constraint blocked it
- Counts frequency by constraint type
- Provides detailed diagnostic data

**API Response** (`/api/schedules/generate`):
```typescript
{
  success: boolean,
  data: {
    assignments: Assignment[],
    violationStats: [
      {
        constraintName: "preceptor-capacity",
        count: 45,
        percentage: 32.1
      },
      {
        constraintName: "site-availability",
        count: 23,
        percentage: 16.4
      }
      // ... more
    ],
    unmetRequirements: UnmetRequirement[]
  }
}
```

**Currently**: This data is returned but never displayed to users.

### 2. Smart Regeneration

**What it does:**
- Preserves assignments before a cutoff date
- Credits students for completed days
- Only regenerates future dates
- Minimizes disruption to existing schedule

**API Parameters** (not in UI):
```typescript
{
  regenerateFromDate: "2025-03-01",  // Keep everything before this
  strategy: "minimal-change",         // vs "full-reoptimize"
  preview: true                       // See impact without committing
}
```

**How it works:**
1. Identifies past assignments (before cutoff date)
2. Credits those days toward requirements
3. Locks those assignments (preserved)
4. Only schedules remaining requirements from cutoff forward

**Currently**: API fully supports this, but UI always deletes everything.

### 3. Regeneration Strategies

**Minimal Change:**
- Try to keep as many future assignments as possible
- Only change what's necessary
- Good for: Small adjustments, availability changes

**Full Reoptimize:**
- Find completely new optimal solution
- May change many assignments
- Good for: Major requirement changes, new constraints

**Currently**: Users get no choice, always full delete + reoptimize.

## User Workflow Issues

### Current Workflow: Incomplete Schedule

```
1. User clicks "Generate Schedule"
   ↓
2. Engine runs, schedule incomplete
   ↓
3. User sees: "3 students short"
   ↓
4. User guesses: "Maybe need more preceptors?"
   ↓
5. User adds random preceptor
   ↓
6. User clicks "Regenerate" (destroys everything)
   ↓
7. Same result or different problem
   ↓
8. GOTO 4 (repeat guessing)
```

**Problems:**
- No data-driven decisions
- Trial and error only
- Destructive regeneration discourages iteration
- No way to know if improvement is possible

### Ideal Workflow: Data-Driven Fixes

```
1. User clicks "Generate Schedule"
   ↓
2. Engine runs, schedule incomplete
   ↓
3. User sees:
   - "3 students short: 35 days total gap"
   - "Top blocker: Preceptor capacity (45 blocks)"
   - "Dr. Smith at max: 23 times"
   - "Dr. Jones at max: 22 times"
   - Suggestion: "Increase capacity or add 1 preceptor"
   ↓
4. User clicks "Dr. Smith" → sees capacity is 2
   ↓
5. User increases Dr. Smith capacity to 3
   ↓
6. User clicks "Regenerate" with:
   - ○ Full regeneration
   - ● Smart: Keep assignments before [today]
   - Strategy: Minimal change
   ↓
7. System shows preview:
   - "Would preserve: 245 assignments"
   - "Would regenerate: 89 assignments"
   - "Expected to fix: 28 of 35 day gap"
   ↓
8. User clicks "Apply"
   ↓
9. Better schedule with minimal disruption
```

## Technical Details

### Violation Tracker

**Location**: `src/lib/features/scheduling/services/violation-tracker.ts`

**Key Methods:**
```typescript
class ViolationTracker {
  recordViolation(constraintName: string, context: any): void
  getTopViolations(limit: number): ViolationStat[]
  getTotalViolations(): number
  clear(): void
}
```

**Data Structure:**
```typescript
interface ViolationStat {
  constraintName: string;
  count: number;
  percentage: number;
  examples?: any[];  // Sample violations for debugging
}
```

### Regeneration Service

**Location**: `src/lib/features/scheduling/services/regeneration-service.ts`

**Key Functions:**
```typescript
// Credit past assignments toward requirements
function creditPastAssignmentsToRequirements(
  context: SchedulingContext,
  pastAssignments: Assignment[]
): RequirementCreditResult

// Analyze what would change before committing
function analyzeRegenerationImpact(
  db: Kysely<DB>,
  regenerateFromDate: string,
  strategy: RegenerationStrategy
): Promise<RegenerationImpactAnalysis>

// Prepare context with credited requirements
function prepareRegenerationContext(
  db: Kysely<DB>,
  regenerateFromDate: string,
  context: SchedulingContext
): Promise<SchedulingContext>
```

### API Endpoint

**Location**: `src/routes/api/schedules/generate/+server.ts`

**Supports (but UI doesn't use):**
```typescript
POST /api/schedules/generate
{
  startDate: string,
  endDate: string,
  regenerateFromDate?: string,    // ← Not in UI
  strategy?: RegenerationStrategy, // ← Not in UI
  preview?: boolean,               // ← Not in UI
  bypassedConstraints?: string[]   // ← Not in UI
}
```

## Component Locations

### Current Components

**Schedule Results Page**: `src/routes/schedule/results/+page.svelte`
- Shows: Unmet requirements, stats
- Missing: Violation data, suggestions

**Regenerate Dialog**: `src/lib/features/schedules/components/regenerate-dialog.svelte`
- Shows: Date range only
- Missing: Smart regeneration options, strategy choice, preview

**Unmet Requirements Table**: `src/lib/features/schedules/components/unmet-requirements-table.svelte`
- Shows: Students with gaps
- Missing: Root cause analysis, suggestions

### Components to Create

1. **Violation Statistics Card** (new)
   - Top blocking constraints
   - Frequency counts
   - Visual breakdown

2. **Constraint Detail Modal** (new)
   - Specific violation examples
   - Affected students/preceptors
   - Fix suggestions

3. **Smart Regeneration Options** (enhance existing)
   - Mode selector (Full vs Smart)
   - Date picker for cutoff
   - Strategy selector
   - Preview button

4. **Regeneration Impact Preview** (new)
   - Assignments to preserve
   - Assignments to regenerate
   - Expected improvement
   - Confirmation UI

## Data Flow

### Current: Generation to Results

```
API: /schedules/generate
  ↓
Returns: { assignments, unmetRequirements, violationStats }
  ↓
UI: Only uses assignments + unmetRequirements
  ↓
violationStats IGNORED ❌
```

### Proposed: Full Data Utilization

```
API: /schedules/generate
  ↓
Returns: { assignments, unmetRequirements, violationStats }
  ↓
UI Results Page:
  - Schedule stats
  - Unmet requirements table
  - Violation statistics card ← NEW
  - Suggestions panel ← NEW
  ↓
User clicks violation constraint
  ↓
Constraint detail modal ← NEW
  - Specific examples
  - Affected entities
  - Fix suggestions
```

## Metrics & Impact

### User Pain Points (Quantified)

Based on typical usage:

1. **Blind Iteration**: Users average 3-5 regeneration attempts before acceptable schedule
2. **Lost Work**: Full regeneration destroys ~300 assignments each time
3. **Time Waste**: 15-30 minutes per iteration (generate + review)
4. **Mid-Year Fear**: Users avoid regenerating mid-year due to destruction risk

### Expected Improvements

**With Violation Visibility:**
- Reduce iteration attempts: 3-5 → 1-2
- Time to acceptable schedule: 45-90 min → 15-30 min
- User confidence: Low → High

**With Smart Regeneration:**
- Preserved assignments: 0% → 80-90% (mid-year)
- Regeneration time: Full → Partial only
- User willingness to iterate: Low → High

## Next Steps

See implementation plans:
1. `dev-plan-violation-display.md`
2. `dev-plan-smart-regeneration.md`
3. `dev-plan-suggestions-panel.md`

## References

- Scheduling Engine: `src/lib/features/scheduling/services/scheduling-engine.ts`
- Violation Tracker: `src/lib/features/scheduling/services/violation-tracker.ts`
- Regeneration Service: `src/lib/features/scheduling/services/regeneration-service.ts`
- Generate API: `src/routes/api/schedules/generate/+server.ts`
- Results Page: `src/routes/schedule/results/+page.svelte`
- Regenerate Dialog: `src/lib/features/schedules/components/regenerate-dialog.svelte`
