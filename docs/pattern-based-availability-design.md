# Pattern-Based Availability Design

## Overview

This document describes the design for a pattern-based availability system that allows preceptors to set their availability for extended time periods (months or years) using intuitive patterns instead of selecting individual dates.

## Background

### Current Implementation

The existing system (`enhanced-availability-manager.svelte`) provides:
- Weekly repeating patterns
- Date range blocks
- Individual date selection
- In-memory pattern generation
- Bulk save to `preceptor_availability` table

**Limitations:**
- Patterns not persisted (cannot edit after saving)
- No monthly pattern support
- No override hierarchy
- No visual calendar preview
- No global scheduling period management

### New Design Goals

1. **Persistent Patterns**: Store pattern definitions for later editing
2. **Rich Pattern Types**: Support weekly, monthly, block, and individual patterns
3. **Specificity Hierarchy**: Apply patterns in order of specificity
4. **Visual Preview**: 12-month calendar showing generated availability
5. **Global Periods**: Admin-defined scheduling periods (e.g., academic year)
6. **Available/Unavailable**: Support both types of patterns

## Data Model

### Database Schema

#### 1. Scheduling Periods Table

Global time periods for scheduling operations.

```sql
CREATE TABLE scheduling_periods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ensure only one active period at a time
CREATE UNIQUE INDEX idx_active_period ON scheduling_periods(is_active) WHERE is_available = 1;
```

**Purpose**: Defines the time scope for all scheduling operations. For example:
- "Academic Year 2025-2026" (Sep 1, 2025 - Jun 30, 2026)
- "Calendar Year 2025" (Jan 1, 2025 - Dec 31, 2025)
- "Spring Semester 2025" (Jan 15, 2025 - May 15, 2025)

#### 2. Preceptor Availability Patterns Table

Stores pattern definitions for generating availability dates.

```sql
CREATE TABLE preceptor_availability_patterns (
  id TEXT PRIMARY KEY,
  preceptor_id TEXT NOT NULL,
  pattern_type TEXT NOT NULL CHECK(pattern_type IN ('weekly', 'monthly', 'block', 'individual')),
  is_available INTEGER NOT NULL DEFAULT 1,
  specificity INTEGER NOT NULL,
  date_range_start TEXT NOT NULL,
  date_range_end TEXT NOT NULL,
  config TEXT, -- JSON configuration
  reason TEXT, -- Optional reason (for individual overrides)
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (preceptor_id) REFERENCES preceptors(id) ON DELETE CASCADE
);

CREATE INDEX idx_patterns_preceptor ON preceptor_availability_patterns(preceptor_id);
CREATE INDEX idx_patterns_enabled ON preceptor_availability_patterns(enabled);
CREATE INDEX idx_patterns_specificity ON preceptor_availability_patterns(specificity);
```

**Pattern Types:**

1. **Weekly** (`specificity = 1`)
   ```json
   {
     "days_of_week": [1, 3, 5] // Mon, Wed, Fri (0=Sun, 6=Sat)
   }
   ```

2. **Monthly** (`specificity = 1`)
   ```json
   {
     "monthly_type": "first_week" | "last_week" | "first_business_week" | "specific_days",
     "week_definition": "calendar" | "business" | "seven_days",
     "specific_days": [1, 15] // For monthly_type = "specific_days"
   }
   ```

3. **Block** (`specificity = 2`)
   ```json
   {
     "exclude_weekends": true | false
   }
   ```

4. **Individual** (`specificity = 3`)
   ```json
   null // No additional config needed
   ```

#### 3. Preceptor Availability Table (Existing)

No changes to the existing table. Generated dates are stored here.

```sql
-- Existing table structure
CREATE TABLE preceptor_availability (
  id TEXT PRIMARY KEY,
  preceptor_id TEXT NOT NULL,
  date TEXT NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (preceptor_id) REFERENCES preceptors(id) ON DELETE CASCADE
);
```

## Pattern Generation Algorithm

### Specificity-Based Application

Patterns are applied in order of specificity (least to most specific):

1. **Specificity 1**: Repeating patterns (weekly, monthly)
2. **Specificity 2**: Block patterns (date ranges)
3. **Specificity 3**: Individual overrides (specific dates)

**Example Scenario:**

```
Pattern 1 (Weekly, Spec 1): Available Mon-Wed-Fri for Jan 1 - Dec 31, 2025
Pattern 2 (Block, Spec 2): Unavailable Feb 1 - Feb 14, 2025
Pattern 3 (Individual, Spec 3): Available Feb 3, 4, 5, 2025
```

**Result:**
- All Mon-Wed-Fri in 2025 are marked available
- Feb 1-14 are marked unavailable (overrides weekly pattern)
- Feb 3, 4, 5 are marked available (overrides block pattern)

### Generation Algorithm

```typescript
function generateAvailabilityDates(patterns: Pattern[]): AvailabilityDate[] {
  // Sort patterns by specificity
  const sorted = patterns
    .filter(p => p.enabled)
    .sort((a, b) => a.specificity - b.specificity);

  // Map to store final availability state for each date
  const dateMap = new Map<string, boolean>();

  // Apply patterns in order of specificity
  for (const pattern of sorted) {
    const dates = generateDatesForPattern(pattern);

    for (const date of dates) {
      dateMap.set(date, pattern.is_available);
    }
  }

  // Convert map to array
  return Array.from(dateMap.entries()).map(([date, is_available]) => ({
    date,
    is_available
  }));
}
```

### Pattern-Specific Date Generators

#### Weekly Pattern

```typescript
function generateWeeklyDates(
  startDate: string,
  endDate: string,
  daysOfWeek: number[]
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (daysOfWeek.includes(dayOfWeek)) {
      dates.push(formatDate(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}
```

#### Monthly Pattern

```typescript
function generateMonthlyDates(
  startDate: string,
  endDate: string,
  config: MonthlyConfig
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Get all months in range
  const months = getMonthsInRange(start, end);

  for (const month of months) {
    switch (config.monthly_type) {
      case 'first_week':
        dates.push(...getFirstWeekDates(month, config.week_definition));
        break;
      case 'last_week':
        dates.push(...getLastWeekDates(month, config.week_definition));
        break;
      case 'first_business_week':
        dates.push(...getFirstBusinessWeekDates(month));
        break;
      case 'specific_days':
        dates.push(...getSpecificDaysOfMonth(month, config.specific_days));
        break;
    }
  }

  return dates.filter(date => date >= startDate && date <= endDate);
}
```

**Week Definitions:**

1. **Seven Days**: First 7 days (1-7) or last 7 days
2. **Calendar Week**: First Sunday-Saturday week or last Sunday-Saturday week
3. **Business Week**: First 5 business days (Mon-Fri) or last 5 business days

#### Block Pattern

```typescript
function generateBlockDates(
  startDate: string,
  endDate: string,
  excludeWeekends: boolean
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!excludeWeekends || !isWeekend) {
      dates.push(formatDate(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}
```

#### Individual Pattern

```typescript
function generateIndividualDate(
  startDate: string // Same as endDate for individual
): string[] {
  return [startDate];
}
```

## User Interface

### Component Architecture

```
pattern-availability-builder.svelte (main)
├── availability-pattern-form.svelte (add/edit patterns)
├── year-calendar-preview.svelte (visual calendar)
└── pattern-list.svelte (manage patterns)
```

### UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│                 AVAILABILITY PATTERNS                        │
│                                                              │
│  [+ Add Pattern ▼]  [Weekly | Monthly | Block | Individual] │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ✓ Pattern 1: Weekly - Mon, Wed, Fri                  │  │
│  │   Available • Jan 1 - Dec 31, 2025                   │  │
│  │   Specificity: 1 • ~156 dates                        │  │
│  │   [Edit] [Disable] [Delete]                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ✓ Pattern 2: Block - Feb 1 - Feb 14, 2025           │  │
│  │   Unavailable • Overrides 14 weekly dates            │  │
│  │   Specificity: 2 • 14 dates                          │  │
│  │   [Edit] [Disable] [Delete]                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                   CALENDAR PREVIEW                           │
│  Showing: Jan 2025 - Dec 2025                               │
│                                                              │
│  [12-month mini-calendar grid]                              │
│  • 🟢 Green = Available (156 days)                          │
│  • 🔴 Red = Unavailable (14 days)                           │
│  • ⚪ Gray = Not set (195 days)                             │
│                                                              │
│  Click any date to add individual override                  │
├─────────────────────────────────────────────────────────────┤
│                   ACTIONS                                    │
│  [Cancel]                              [Preview] [Save All] │
└─────────────────────────────────────────────────────────────┘
```

### Pattern Add/Edit Form

**Weekly Pattern:**
```
┌─────────────────────────────────────────────┐
│ Weekly Pattern                               │
│                                              │
│ Availability: ○ Available  ● Unavailable    │
│                                              │
│ Days of Week:                               │
│ [☐ Sun] [☑ Mon] [☑ Tue] [☑ Wed]            │
│ [☑ Thu] [☑ Fri] [☐ Sat]                    │
│                                              │
│ Date Range:                                  │
│ Start: [Jan 1, 2025▼]                       │
│ End:   [Dec 31, 2025▼]                      │
│                                              │
│ [Cancel] [Add Pattern (156 dates)]          │
└─────────────────────────────────────────────┘
```

**Monthly Pattern:**
```
┌─────────────────────────────────────────────┐
│ Monthly Pattern                              │
│                                              │
│ Availability: ● Available  ○ Unavailable    │
│                                              │
│ Pattern Type:                               │
│ ● First week of month                       │
│ ○ Last week of month                        │
│ ○ First business week                       │
│ ○ Last business week                        │
│ ○ Specific days (1st, 15th, etc.)          │
│                                              │
│ Week Definition (for week patterns):        │
│ ○ First 7 days                              │
│ ● First calendar week (Sun-Sat)            │
│ ○ First business week (5 days)             │
│                                              │
│ Date Range:                                  │
│ Start: [Jan 1, 2025▼]                       │
│ End:   [Dec 31, 2025▼]                      │
│                                              │
│ [Cancel] [Add Pattern (84 dates)]           │
└─────────────────────────────────────────────┘
```

**Block Pattern:**
```
┌─────────────────────────────────────────────┐
│ Block Pattern                                │
│                                              │
│ Availability: ○ Available  ● Unavailable    │
│                                              │
│ Date Range:                                  │
│ Start: [Feb 1, 2025▼]                       │
│ End:   [Feb 14, 2025▼]                      │
│                                              │
│ ☑ Exclude weekends                          │
│                                              │
│ [Cancel] [Add Pattern (10 dates)]           │
└─────────────────────────────────────────────┘
```

**Individual Override:**
```
┌─────────────────────────────────────────────┐
│ Individual Date                              │
│                                              │
│ Availability: ● Available  ○ Unavailable    │
│                                              │
│ Date: [Feb 3, 2025▼]                        │
│                                              │
│ Reason (optional):                          │
│ [Personal availability exception          ] │
│                                              │
│ [Cancel] [Add Override]                     │
└─────────────────────────────────────────────┘
```

## API Design

### Patterns API

#### GET /api/preceptors/[id]/patterns

Get all patterns for a preceptor.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "pattern-1",
      "preceptor_id": "preceptor-1",
      "pattern_type": "weekly",
      "is_available": true,
      "specificity": 1,
      "date_range_start": "2025-01-01",
      "date_range_end": "2025-12-31",
      "config": {
        "days_of_week": [1, 3, 5]
      },
      "enabled": true,
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/preceptors/[id]/patterns

Create a new pattern.

**Request:**
```json
{
  "pattern_type": "weekly",
  "is_available": true,
  "date_range_start": "2025-01-01",
  "date_range_end": "2025-12-31",
  "config": {
    "days_of_week": [1, 3, 5]
  }
}
```

#### PUT /api/preceptors/[id]/patterns/[pattern_id]

Update an existing pattern.

#### DELETE /api/preceptors/[id]/patterns/[pattern_id]

Delete a pattern.

#### POST /api/preceptors/[id]/patterns/generate

Generate availability dates from all enabled patterns.

**Response:**
```json
{
  "success": true,
  "data": {
    "generated_dates": 156,
    "available_dates": 142,
    "unavailable_dates": 14,
    "preview": [
      {
        "date": "2025-01-01",
        "is_available": true,
        "source_pattern_id": "pattern-1",
        "source_pattern_type": "weekly"
      }
    ]
  }
}
```

#### POST /api/preceptors/[id]/patterns/save

Generate and save availability dates from patterns to `preceptor_availability` table.

### Scheduling Periods API

#### GET /api/scheduling-periods

Get all scheduling periods.

#### GET /api/scheduling-periods/active

Get the currently active scheduling period.

#### POST /api/scheduling-periods

Create a new scheduling period.

#### PUT /api/scheduling-periods/[id]

Update a scheduling period.

#### POST /api/scheduling-periods/[id]/activate

Set a period as active (deactivates others).

## Implementation Plan

### Phase 1: Database & Core Services

1. **Database Migration**
   - Create `scheduling_periods` table
   - Create `preceptor_availability_patterns` table
   - Update TypeScript types

2. **Pure Functions**
   - `generateWeeklyDates()`
   - `generateMonthlyDates()`
   - `generateBlockDates()`
   - `generateIndividualDate()`
   - `applyPatternsBySpecificity()`

3. **Service Layer**
   - `pattern-service.ts` - CRUD for patterns
   - `pattern-generator-service.ts` - Date generation logic
   - `scheduling-period-service.ts` - Period management

### Phase 2: API Routes

1. **Pattern Routes**
   - GET/POST/PUT/DELETE `/api/preceptors/[id]/patterns`
   - POST `/api/preceptors/[id]/patterns/generate`
   - POST `/api/preceptors/[id]/patterns/save`

2. **Period Routes**
   - GET/POST/PUT `/api/scheduling-periods`
   - GET `/api/scheduling-periods/active`
   - POST `/api/scheduling-periods/[id]/activate`

### Phase 3: UI Components

1. **Replace** `enhanced-availability-manager.svelte` with new pattern builder
2. **Create** `pattern-availability-builder.svelte`
3. **Create** `availability-pattern-form.svelte`
4. **Create** `year-calendar-preview.svelte`
5. **Create** `pattern-list.svelte`

### Phase 4: Testing

1. **Unit Tests**
   - Test all pure date generation functions
   - Test specificity application logic
   - Test pattern validation

2. **Integration Tests**
   - Test pattern CRUD operations
   - Test date generation and saving
   - Test period management

3. **E2E Tests** (optional)
   - Test full user workflow
   - Test pattern editing
   - Test calendar preview

## Migration Strategy

### Backward Compatibility

Existing availability data remains intact:
- Current `preceptor_availability` records are preserved
- New pattern system adds features without breaking existing data
- Users can choose to create patterns or continue using existing data

### Data Migration

No migration needed for existing data. New features are additive:
1. Existing availability dates remain in `preceptor_availability`
2. New patterns are stored in `preceptor_availability_patterns`
3. Users can create patterns that generate new availability dates
4. Patterns can be disabled without deleting generated dates

## Example User Workflows

### Workflow 1: Set Year-Long Availability

1. User opens preceptor availability manager
2. Clicks "Add Pattern" → "Weekly Pattern"
3. Selects Mon-Wed-Fri, sets date range Jan 1 - Dec 31, 2025
4. Marks as "Available"
5. Previews 156 dates in calendar
6. Clicks "Add Pattern"
7. Pattern appears in list
8. Clicks "Save All"
9. System generates 156 availability records

### Workflow 2: Add Vacation Block

1. User has existing weekly pattern (Mon-Wed-Fri available)
2. Clicks "Add Pattern" → "Block Pattern"
3. Selects Feb 1 - Feb 14, 2025
4. Marks as "Unavailable"
5. Previews calendar: 14 days turn from green to red
6. Clicks "Add Pattern"
7. Clicks "Save All"
8. System regenerates dates with block override applied

### Workflow 3: Add Individual Exception

1. User has weekly pattern and vacation block
2. Needs to be available on Feb 3, 4, 5 during vacation
3. Clicks on calendar dates or "Add Pattern" → "Individual"
4. Selects Feb 3, marks "Available", adds reason
5. Repeats for Feb 4 and Feb 5
6. Previews calendar: 3 days turn from red to green
7. Clicks "Save All"
8. System regenerates with individual overrides at highest specificity

### Workflow 4: Edit Existing Pattern

1. User realizes they need to extend vacation
2. Clicks "Edit" on vacation block pattern
3. Changes end date from Feb 14 to Feb 21
4. Previews calendar: 7 more days turn red
5. Clicks "Update Pattern"
6. Clicks "Save All"
7. System regenerates all dates with updated pattern

### Workflow 5: Disable Pattern Temporarily

1. User wants to temporarily remove weekly pattern
2. Clicks "Disable" on weekly pattern
3. Pattern grays out in list
4. Calendar preview updates: weekly dates turn gray
5. Clicks "Save All"
6. System regenerates without disabled pattern
7. Later, user clicks "Enable" to restore pattern

## Security Considerations

1. **Authorization**: Only authorized users can modify patterns
2. **Validation**: All pattern configurations validated server-side
3. **Conflict Detection**: Warn about pattern conflicts before saving
4. **Audit Trail**: Track pattern changes via created_at/updated_at
5. **Cascade Delete**: Patterns deleted when preceptor deleted

## Performance Considerations

1. **Batch Operations**: Generate all dates in single transaction
2. **Indexing**: Index on preceptor_id, specificity, enabled
3. **Caching**: Cache active scheduling period
4. **Lazy Loading**: Load calendar preview only for visible months
5. **Debounce**: Debounce calendar preview updates during editing

## Future Enhancements

1. **Pattern Templates**: Save and reuse common patterns
2. **Bulk Apply**: Apply same patterns to multiple preceptors
3. **Import/Export**: Import patterns from CSV or calendar files
4. **Recurring Exceptions**: "Unavailable every 2nd Tuesday"
5. **Team Patterns**: Coordinate availability across preceptor teams
6. **Conflict Alerts**: Notify when patterns create scheduling conflicts
7. **Undo/Redo**: Pattern editing history with rollback
8. **Preview Diff**: Show exactly what will change before saving

## Success Metrics

1. **Usability**: Time to set year-long availability < 2 minutes
2. **Flexibility**: Support 95% of real-world availability patterns
3. **Accuracy**: Zero date generation errors
4. **Performance**: Generate 365 days from patterns < 500ms
5. **Adoption**: 80% of preceptors use pattern system within 3 months
