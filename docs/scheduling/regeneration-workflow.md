# Schedule Regeneration Workflow

## Overview

This document explains how users can regenerate schedules while preserving past work and addressing constraint violations.

## User Workflow: Minimal Regeneration with High Impact Constraints Adjusted

### Step 1: Review Schedule Results

**Location**: `/schedule/results`

The user sees:
1. **Stats Overview**: Total assignments, completion percentage, students with unmet requirements
2. **Violation Statistics** (if schedule incomplete):
   - Top 5 blocking constraints
   - Violation counts and percentages
   - Severity indicators (red/orange/yellow)
3. **Suggested Fixes**:
   - High/medium/low impact suggestions
   - Specific actions to take
   - Direct links to fix the issues

**Example Violation Display**:
```
┌─────────────────────────────────────────┐
│ Top Blocking Constraints                 │
├─────────────────────────────────────────┤
│ #1 Preceptor Capacity                   │
│    45 assignments blocked               │
│    [32.1%]                              │
│                                         │
│ #2 Specialty Match                      │
│    25 assignments blocked               │
│    [18.0%]                              │
└─────────────────────────────────────────┘
```

**Example Suggestions Display**:
```
┌─────────────────────────────────────────┐
│ Suggested Fixes                          │
├─────────────────────────────────────────┤
│ 🔴 High Impact Fixes                     │
│                                         │
│ 1. Increase Preceptor Capacity          │
│    Preceptors reached max capacity      │
│    45 times.                            │
│    → Review preceptor capacity          │
│      settings and increase where        │
│      possible                           │
│    [View Preceptors →]                  │
│                                         │
│ 2. Add Specialized Preceptors           │
│    Specialty requirements couldn't be   │
│    met 25 times.                        │
│    → Add preceptors with needed         │
│      specialty certifications           │
│    [Add Preceptor →]                    │
└─────────────────────────────────────────┘
```

### Step 2: Adjust High Impact Constraints

User clicks action links from suggestions:

#### Example: Increase Preceptor Capacity

1. Click **"View Preceptors →"** button
2. Navigate to `/preceptors` page
3. Find busy preceptors (e.g., Dr. Smith, Dr. Jones)
4. Edit their capacity:
   - Dr. Smith: Change `max_students` from 2 to 3
   - Dr. Jones: Change `max_students` from 2 to 3
5. Save changes

#### Example: Add Specialized Preceptors

1. Click **"Add Preceptor →"** button
2. Navigate to `/preceptors?action=add`
3. Add new preceptor with required specialty
4. Set availability and capacity
5. Save new preceptor

### Step 3: Trigger Smart Regeneration

**Location**: `/calendar` page

1. Click **"Regenerate Schedule"** button
2. RegenerateDialog opens with options:

**UI State**:
```
┌─────────────────────────────────────────────────┐
│ Regenerate Schedule                              │
├─────────────────────────────────────────────────┤
│ Regeneration Mode:                               │
│                                                  │
│ ○ Full Regeneration (Start Over)                │
│   Deletes ALL assignments and starts fresh      │
│                                                  │
│ ● Smart Regeneration (Preserve Past) [SELECTED] │
│   Keeps completed work, only regenerates future  │
│                                                  │
│ ┌───────────────────────────────────────────┐  │
│ │ Smart Mode Options                         │  │
│ │                                            │  │
│ │ Regenerate From Date:                      │  │
│ │ [2025-06-15] ← Today's date                │  │
│ │                                            │  │
│ │ Strategy:                                  │  │
│ │ ● Minimal Change                           │  │
│ │   Keep as many existing assignments as     │  │
│ │   possible                                 │  │
│ │                                            │  │
│ │ ○ Full Reoptimize                          │  │
│ │   Find completely new optimal solution     │  │
│ └───────────────────────────────────────────┘  │
│                                                  │
│ Start Date: [2025-01-01]                         │
│ End Date:   [2025-12-31]                         │
│                                                  │
│           [Cancel]  [Apply Regeneration]         │
└─────────────────────────────────────────────────┘
```

3. User configuration:
   - **Mode**: Smart Regeneration (default if mid-year)
   - **Regenerate From**: 2025-06-15 (today)
   - **Strategy**: Minimal Change (preserve existing assignments where possible)

4. Click **"Apply Regeneration"**

### Step 4: Backend Processing

When user clicks "Apply Regeneration", the following happens:

#### API Request

```typescript
POST /api/schedules/generate
{
  "startDate": "2025-01-01",
  "endDate": "2025-12-31",
  "regenerateFromDate": "2025-06-15",
  "strategy": "minimal-change"
}
```

#### Backend Logic Flow

1. **Skip Deletion** (smart mode):
   - NO assignments are deleted
   - Past assignments (before 2025-06-15) remain in database

2. **Prepare Regeneration Context** (`prepareRegenerationContext`):
   ```typescript
   // Get all assignments before cutoff date
   pastAssignments = getAssignmentsBefore("2025-06-15")

   // Credit past work to student requirements
   // Student had 10 days required, completed 3 → now needs 7
   creditPastAssignmentsToRequirements(context, pastAssignments)

   // Get assignments after cutoff (to be replaced)
   futureAssignments = getAssignmentsAfter("2025-06-15")

   // Analyze which future assignments can be preserved
   if (strategy === "minimal-change") {
     // Categorize future assignments
     preservableAssignments = futureAssignments.filter(a =>
       isPreceptorStillAvailable(a) &&
       isWithinNewCapacity(a) &&
       passesAllConstraints(a)
     )

     affectedAssignments = futureAssignments.filter(a =>
       !preservableAssignments.includes(a)
     )

     // Try to find replacements for affected assignments
     preserved = applyMinimalChangeStrategy(
       context,
       preservableAssignments,
       affectedAssignments,
       unavailablePreceptors
     )

     // Add preserved assignments to context
     context.assignments = preserved
   }
   ```

3. **Run Scheduling Engine**:
   ```typescript
   engine = new ConfigurableSchedulingEngine()

   // Engine only schedules for dates >= regenerateFromDate
   // Past assignments are already in the context
   result = engine.generateSchedule(context, {
     startDate: "2025-06-15",  // Only schedule from here forward
     endDate: "2025-12-31"
   })

   // Combine past + preserved + newly generated assignments
   finalAssignments = [
     ...pastAssignments,          // Kept unchanged
     ...preservedFutureAssignments, // Validated and kept
     ...newlyGeneratedAssignments   // Just created
   ]
   ```

4. **Save to Database**:
   ```typescript
   // Delete only future assignments that weren't preserved
   deleteAssignmentsAfter("2025-06-15", excludeIds: preservedIds)

   // Insert new and preserved assignments
   bulkCreateAssignments(newlyGeneratedAssignments)

   // Audit log
   createRegenerationAuditLog({
     regeneratedFrom: "2025-06-15",
     strategy: "minimal-change",
     preservedCount: preservedFutureAssignments.length,
     deletedCount: affectedAssignments.length - preservedCount,
     newCount: newlyGeneratedAssignments.length
   })
   ```

#### API Response

```json
{
  "success": true,
  "data": {
    "assignments": [...],
    "success": true,
    "unmetRequirements": [...],
    "violations": [...],
    "summary": {
      "totalAssignments": 543,
      "totalViolations": 12,
      "strategiesUsed": ["continuous_single", "team_continuity"]
    },
    "regeneratedFrom": "2025-06-15",
    "strategy": "minimal-change",
    "preservedPastAssignments": true,
    "totalPastAssignments": 245,
    "preservedFutureAssignments": 78,
    "deletedFutureAssignments": 22,
    "newlyGenerated": 198
  }
}
```

### Step 5: Review Updated Results

1. Dialog closes automatically
2. Calendar reloads with updated assignments
3. User navigates to `/schedule/results`
4. Sees improved completion percentage
5. Violation stats show reduced counts for adjusted constraints

**Expected Improvement**:
```
Before:
- 45 preceptor-capacity violations
- 25 specialty-match violations
- 78% complete

After adjustments + smart regeneration:
- 5 preceptor-capacity violations (90% reduction)
- 8 specialty-match violations (68% reduction)
- 95% complete
```

## Key Differences: Full vs Smart Regeneration

### Full Regeneration (Start Over)

```typescript
// Deletes EVERYTHING
DELETE FROM schedule_assignments;

// Generates from scratch
generateSchedule(context, { startDate: "2025-01-01", endDate: "2025-12-31" })

// Use case: Major structural changes (new clerkship requirements, etc.)
```

### Smart Regeneration with Minimal Change

```typescript
// Deletes NOTHING before cutoff
// Only deletes future assignments that can't be preserved

// Credits past work
creditPastAssignmentsToRequirements(context, pastAssignments)

// Preserves valid future assignments
preservedAssignments = validateAndPreserve(futureAssignments)

// Only generates for missing requirements
generateSchedule(context, {
  startDate: regenerateFromDate,
  endDate: "2025-12-31",
  existingAssignments: preservedAssignments
})

// Use case: Mid-year adjustments (capacity changes, availability tweaks)
```

### Smart Regeneration with Full Reoptimize

```typescript
// Deletes NOTHING before cutoff
// Deletes ALL future assignments

// Credits past work
creditPastAssignmentsToRequirements(context, pastAssignments)

// Generates completely new optimal solution for future
generateSchedule(context, {
  startDate: regenerateFromDate,
  endDate: "2025-12-31"
})

// Use case: Major future changes but want to keep past work
```

## API Capabilities

The `/api/schedules/generate` endpoint supports:

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | string | YYYY-MM-DD - Period start |
| `endDate` | string | YYYY-MM-DD - Period end |
| `regenerateFromDate` | string? | YYYY-MM-DD - Only regenerate from this date forward (optional, defaults to today) |
| `strategy` | string? | `"minimal-change"` or `"full-reoptimize"` (optional, defaults to `"full-reoptimize"`) |
| `preview` | boolean? | If true, returns impact analysis without making changes (optional) |
| `bypassedConstraints` | string[]? | Constraints to bypass during generation (optional) |

## Testing

See test coverage:
- Unit tests: `src/lib/features/scheduling/services/regeneration-service.test.ts`
- Integration tests: `src/routes/api/schedules/generate/+server.test.ts`
- Component tests: `src/lib/features/schedules/components/regenerate-dialog.test.ts`

## Summary

**Workflow for minimal regeneration with high impact constraints adjusted:**

1. View results → See violations and suggestions
2. Click suggestion links → Adjust preceptor capacity, add preceptors, etc.
3. Navigate to calendar → Click "Regenerate Schedule"
4. Select "Smart Regeneration" mode
5. Choose "Minimal Change" strategy
6. Set cutoff date (defaults to today)
7. Click "Apply Regeneration"
8. Backend preserves past work, validates future assignments, generates only what's needed
9. View improved results with reduced violations

**Time savings**: From 3-5 blind iterations (30-60 min) to 1-2 targeted adjustments (10-15 min).
