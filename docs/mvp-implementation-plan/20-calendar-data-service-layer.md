# Step 20: Calendar Data - Service Layer

## Overview
Implement the service layer for aggregating and formatting schedule data for calendar display. This includes functions to retrieve assignments with related entity data (student names, preceptor names, clerkship names) and filter/group data for various calendar views.

## Dependencies
- ✅ Step 01: Kysely Database Setup
- ✅ Step 02: Database Schema & Migrations
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 18: Schedule Assignments - Service Layer

## Requirements

### Data Aggregation
Implement functions to retrieve enriched assignment data:
- Get schedule with all related entity data (JOIN queries)
- Filter by student, preceptor, clerkship, date range
- Group assignments by day/week/month for calendar views
- Format data for calendar component consumption

### Business Logic
- Combine assignment data with student/preceptor/clerkship names
- Calculate date ranges for calendar views
- Handle empty states (no assignments for date range)
- Optimize queries for calendar performance

### Data Structures
- Enriched assignment type (includes entity names)
- Calendar event type (for calendar component)
- Grouped assignments by time period

## Implementation Details

### File Structure
```
/src/lib/features/schedules/
├── services/
│   ├── assignment-service.ts       # (Existing)
│   ├── calendar-service.ts         # Calendar data functions (NEW)
│   └── calendar-service.test.ts    # Calendar service tests (NEW)
└── types.ts                         # Calendar types (NEW)
```

---

## Files to Create

### 1. `/src/lib/features/schedules/types.ts`

Type definitions for calendar data.

**Exports:**
```typescript
import type { ScheduleAssignmentsTable } from '$lib/db/types';

// Enriched assignment with entity names
export interface EnrichedAssignment extends ScheduleAssignmentsTable {
  student_name: string;
  student_email: string;
  preceptor_name: string;
  preceptor_email: string;
  preceptor_specialty: string;
  clerkship_name: string;
  clerkship_specialty: string;
  clerkship_required_days: number;
}

// Calendar event format
export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO date
  end: string; // ISO date
  description: string;
  color: string;
  assignment: EnrichedAssignment;
}

// Grouped assignments by date
export interface DailyAssignments {
  date: string; // YYYY-MM-DD
  assignments: EnrichedAssignment[];
  count: number;
}

// Calendar filters
export interface CalendarFilters {
  student_id?: string;
  preceptor_id?: string;
  clerkship_id?: string;
  start_date: string;
  end_date: string;
}
```

---

### 2. `/src/lib/features/schedules/services/calendar-service.ts`

Service functions for calendar data aggregation.

**Exports:**
```typescript
import type { Kysely } from 'kysely';
import type { Database } from '$lib/db/types';
import type { EnrichedAssignment, CalendarEvent, DailyAssignments, CalendarFilters } from '../types';

export async function getEnrichedAssignments(
  db: Kysely<Database>,
  filters: CalendarFilters
): Promise<EnrichedAssignment[]>

export async function getCalendarEvents(
  db: Kysely<Database>,
  filters: CalendarFilters
): Promise<CalendarEvent[]>

export async function getDailyAssignments(
  db: Kysely<Database>,
  filters: CalendarFilters
): Promise<DailyAssignments[]>

export async function getAssignmentsByStudent(
  db: Kysely<Database>,
  studentId: string,
  startDate?: string,
  endDate?: string
): Promise<EnrichedAssignment[]>

export async function getAssignmentsByPreceptor(
  db: Kysely<Database>,
  preceptorId: string,
  startDate?: string,
  endDate?: string
): Promise<EnrichedAssignment[]>

export async function getScheduleSummary(
  db: Kysely<Database>,
  startDate: string,
  endDate: string
): Promise<{
  total_assignments: number;
  active_students: number;
  active_preceptors: number;
  assignments_by_clerkship: { clerkship_name: string; count: number }[];
}>
```

---

## Business Logic Functions

### 1. `getEnrichedAssignments(db, filters): Promise<EnrichedAssignment[]>`

Get assignments with all related entity data via JOINs.

**Logic:**
- Query schedule_assignments table
- JOIN with students table (for student name, email)
- JOIN with preceptors table (for preceptor name, email, specialty)
- JOIN with clerkships table (for clerkship name, specialty, required_days)
- Apply filters (student_id, preceptor_id, clerkship_id, date range)
- Order by start_date ascending
- Return enriched assignment array

**Parameters:**
- `filters`: Object with filter criteria

**Returns:** Array of enriched assignments

**Errors:** None (returns empty array if no matches)

**Example:**
```typescript
const assignments = await getEnrichedAssignments(db, {
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  student_id: 'student-123'
});

console.log(assignments[0].student_name); // "John Doe"
console.log(assignments[0].preceptor_name); // "Dr. Smith"
console.log(assignments[0].clerkship_name); // "Internal Medicine"
```

---

### 2. `getCalendarEvents(db, filters): Promise<CalendarEvent[]>`

Convert assignments to calendar event format.

**Logic:**
- Call `getEnrichedAssignments()` with filters
- Transform each assignment to calendar event:
  - id: assignment.id
  - title: "{student_name} - {clerkship_name}"
  - start: assignment.start_date
  - end: assignment.end_date
  - description: "with {preceptor_name}"
  - color: determined by clerkship (future: color mapping)
  - assignment: full enriched assignment object
- Return array of calendar events

**Parameters:**
- `filters`: Calendar filter criteria

**Returns:** Array of calendar events

**Errors:** None

**Example:**
```typescript
const events = await getCalendarEvents(db, {
  start_date: '2024-01-01',
  end_date: '2024-12-31'
});

// Format for calendar component
// [
//   {
//     id: 'assignment-123',
//     title: 'John Doe - Internal Medicine',
//     start: '2024-01-01',
//     end: '2024-01-28',
//     description: 'with Dr. Smith',
//     color: '#3b82f6',
//     assignment: { ... full data ... }
//   }
// ]
```

---

### 3. `getDailyAssignments(db, filters): Promise<DailyAssignments[]>`

Group assignments by day for daily view.

**Logic:**
- Call `getEnrichedAssignments()` with filters
- For each day in date range:
  - Find assignments that include this date
  - Group into DailyAssignments object
- Return array of daily assignments

**Parameters:**
- `filters`: Calendar filter criteria

**Returns:** Array of daily assignments

**Errors:** None

**Example:**
```typescript
const daily = await getDailyAssignments(db, {
  start_date: '2024-01-01',
  end_date: '2024-01-07'
});

// [
//   { date: '2024-01-01', assignments: [...], count: 3 },
//   { date: '2024-01-02', assignments: [...], count: 2 },
//   ...
// ]
```

---

### 4. `getAssignmentsByStudent(db, studentId, startDate?, endDate?): Promise<EnrichedAssignment[]>`

Get all assignments for a specific student.

**Logic:**
- Call `getEnrichedAssignments()` with student filter
- Optionally filter by date range
- Return enriched assignments

**Parameters:**
- `studentId`: Student UUID
- `startDate`: Optional start date filter
- `endDate`: Optional end date filter

**Returns:** Array of enriched assignments for student

**Errors:** None

**Example:**
```typescript
const studentSchedule = await getAssignmentsByStudent(
  db,
  'student-123',
  '2024-01-01',
  '2024-12-31'
);
```

---

### 5. `getAssignmentsByPreceptor(db, preceptorId, startDate?, endDate?): Promise<EnrichedAssignment[]>`

Get all assignments for a specific preceptor.

**Logic:**
- Call `getEnrichedAssignments()` with preceptor filter
- Optionally filter by date range
- Return enriched assignments

**Parameters:**
- `preceptorId`: Preceptor UUID
- `startDate`: Optional start date filter
- `endDate`: Optional end date filter

**Returns:** Array of enriched assignments for preceptor

**Errors:** None

**Example:**
```typescript
const preceptorSchedule = await getAssignmentsByPreceptor(
  db,
  'preceptor-456',
  '2024-01-01',
  '2024-12-31'
);
```

---

### 6. `getScheduleSummary(db, startDate, endDate): Promise<SummaryData>`

Get summary statistics for a date range.

**Logic:**
- Query schedule_assignments within date range
- Calculate:
  - Total number of assignments
  - Number of unique students with assignments
  - Number of unique preceptors with assignments
  - Count of assignments grouped by clerkship
- Return summary object

**Parameters:**
- `startDate`: Range start date
- `endDate`: Range end date

**Returns:** Object with summary statistics

**Errors:** None

**Example:**
```typescript
const summary = await getScheduleSummary(db, '2024-01-01', '2024-12-31');

// {
//   total_assignments: 150,
//   active_students: 50,
//   active_preceptors: 30,
//   assignments_by_clerkship: [
//     { clerkship_name: 'Internal Medicine', count: 50 },
//     { clerkship_name: 'Surgery', count: 40 },
//     ...
//   ]
// }
```

---

## Testing Requirements

### Unit Tests

#### `/src/lib/features/schedules/services/calendar-service.test.ts`

**getEnrichedAssignments():**
- ✅ Returns enriched assignments with all entity data
- ✅ Filters by student_id
- ✅ Filters by preceptor_id
- ✅ Filters by clerkship_id
- ✅ Filters by date range
- ✅ Combines multiple filters
- ✅ Returns empty array when no matches
- ✅ Orders by start_date

**getCalendarEvents():**
- ✅ Transforms assignments to calendar event format
- ✅ Sets correct title format
- ✅ Sets correct description
- ✅ Includes full assignment data
- ✅ Returns empty array when no assignments

**getDailyAssignments():**
- ✅ Groups assignments by day
- ✅ Includes assignments spanning multiple days
- ✅ Calculates correct counts
- ✅ Returns all days in range (even with 0 assignments)

**getAssignmentsByStudent():**
- ✅ Returns all assignments for student
- ✅ Filters by date range when provided
- ✅ Returns enriched data
- ✅ Returns empty array for student with no assignments

**getAssignmentsByPreceptor():**
- ✅ Returns all assignments for preceptor
- ✅ Filters by date range when provided
- ✅ Returns enriched data
- ✅ Returns empty array for preceptor with no assignments

**getScheduleSummary():**
- ✅ Calculates total assignments correctly
- ✅ Counts unique students correctly
- ✅ Counts unique preceptors correctly
- ✅ Groups by clerkship correctly
- ✅ Handles empty schedule

---

### Testing Strategy

1. **JOIN Testing:**
   - Verify all JOINs return correct data
   - Test with missing related entities
   - Verify no duplicate rows

2. **Filtering:**
   - Test each filter independently
   - Test filter combinations
   - Test edge cases (empty results)

3. **Performance:**
   - Test with large datasets
   - Verify query optimization
   - Consider indexing strategies

---

## Acceptance Criteria

- [ ] types.ts created with all calendar types
- [ ] calendar-service.ts created with all 6 functions
- [ ] All functions use JOIN queries for enriched data
- [ ] Filtering logic works correctly
- [ ] Daily grouping logic works correctly
- [ ] Calendar event formatting correct
- [ ] Summary calculations accurate
- [ ] All unit tests passing (100% coverage)
- [ ] All functions properly typed
- [ ] Query performance acceptable (< 100ms for 1000 assignments)

---

## Usage Example

```typescript
import { db } from '$lib/db';
import {
  getCalendarEvents,
  getScheduleSummary
} from '$lib/features/schedules/services/calendar-service';

// Get calendar events for display
const events = await getCalendarEvents(db, {
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  student_id: 'student-123'
});

// Get summary statistics
const summary = await getScheduleSummary(db, '2024-01-01', '2024-12-31');
console.log(`Total assignments: ${summary.total_assignments}`);
```

---

## Notes

- JOIN queries are more efficient than separate queries
- Consider database indexes on foreign keys
- Calendar event color coding can be based on clerkship
- Future: Add caching for frequently accessed date ranges
- Future: Add aggregation views (weekly, monthly)
- Consider materialized views for performance

---

## References

- [Kysely Joins](https://kysely.dev/docs/examples/joins)
- [Calendar Event Format Standards](https://fullcalendar.io/docs/event-object)
- [SQL JOIN Types](https://www.w3schools.com/sql/sql_join.asp)
