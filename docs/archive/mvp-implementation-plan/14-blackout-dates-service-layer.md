# Step 14: Blackout Dates - Service Layer

## Overview
Implement the service layer for managing blackout dates (holidays, breaks, non-teaching days). This includes creating, retrieving, and deleting blackout periods with date range validation and overlap detection.

## Dependencies
- ✅ Step 01: Kysely Database Setup
- ✅ Step 02: Database Schema & Migrations
- ✅ Step 03: Shared Utilities & Test Helpers

## Requirements

### Database Operations
Implement blackout date management operations:
- Get all blackout dates
- Get single blackout date by ID
- Get blackout dates by date range
- Create new blackout date
- Delete blackout date
- Check for date overlaps

### Business Rules
- start_date must be before or equal to end_date
- Blackout dates can overlap (e.g., individual + institutional holidays)
- Date format must be ISO 8601 (YYYY-MM-DD)
- Reason/description is required
- Blackout dates affect schedule generation (no assignments on these dates)

### Validation
- Zod schemas for create operations
- Date format validation (YYYY-MM-DD)
- Date range validation (start before or equal to end)
- Reason is required (non-empty string)

## Implementation Details

### File Structure
```
/src/lib/features/blackout-dates/
├── services/
│   ├── blackout-date-service.ts       # Service functions (NEW)
│   └── blackout-date-service.test.ts  # Service tests (NEW)
└── schemas.ts                          # Zod schemas (NEW)
```

---

## Files to Create

### 1. `/src/lib/features/blackout-dates/schemas.ts`

Zod validation schemas for blackout date operations.

**Exports:**
```typescript
import { z } from 'zod';
import { dateStringSchema, uuidSchema } from '$lib/validation/common-schemas';

export const createBlackoutDateSchema = z.object({
  start_date: dateStringSchema,
  end_date: dateStringSchema,
  reason: z.string().min(1, 'Reason is required'),
}).refine(data => data.start_date <= data.end_date, {
  message: 'start_date must be before or equal to end_date',
});

export const dateRangeSchema = z.object({
  start_date: dateStringSchema,
  end_date: dateStringSchema,
}).refine(data => data.start_date <= data.end_date, {
  message: 'start_date must be before or equal to end_date',
});

export const blackoutDateIdSchema = z.object({
  id: uuidSchema,
});

export type CreateBlackoutDateInput = z.infer<typeof createBlackoutDateSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
```

**Requirements:**
- Use common date validation schemas
- Validate date ordering (start <= end)
- Require reason field
- Export TypeScript types

---

### 2. `/src/lib/features/blackout-dates/services/blackout-date-service.ts`

Service functions for blackout date operations.

**Exports:**
```typescript
import type { Kysely } from 'kysely';
import type { Database, BlackoutDatesTable } from '$lib/db/types';
import type { CreateBlackoutDateInput, DateRangeInput } from '../schemas';

export async function getBlackoutDates(db: Kysely<Database>): Promise<BlackoutDatesTable[]>

export async function getBlackoutDateById(
  db: Kysely<Database>,
  id: string
): Promise<BlackoutDatesTable | null>

export async function getBlackoutDatesByRange(
  db: Kysely<Database>,
  dateRange: DateRangeInput
): Promise<BlackoutDatesTable[]>

export async function createBlackoutDate(
  db: Kysely<Database>,
  data: CreateBlackoutDateInput
): Promise<BlackoutDatesTable>

export async function deleteBlackoutDate(
  db: Kysely<Database>,
  id: string
): Promise<void>

export async function isDateBlackedOut(
  db: Kysely<Database>,
  date: string
): Promise<boolean>

export async function blackoutDateExists(
  db: Kysely<Database>,
  id: string
): Promise<boolean>
```

**Requirements:**
- All functions accept database instance as first parameter
- Use Kysely type-safe queries
- Throw appropriate errors (NotFoundError)
- Generate UUIDs for new blackout dates
- Set timestamps (created_at, updated_at)

---

## Business Logic Functions

### 1. `getBlackoutDates(db: Kysely<Database>): Promise<BlackoutDatesTable[]>`

Retrieve all blackout dates from database.

**Logic:**
- Query all blackout dates from blackout_dates table
- Order by start_date ascending
- Return array of blackout dates (empty array if none)

**Returns:** Array of all blackout dates

**Errors:** None (returns empty array if no blackout dates)

**Example:**
```typescript
const blackoutDates = await getBlackoutDates(db);
// [{ id: '...', start_date: '2024-12-25', end_date: '2024-12-25', reason: 'Christmas', ... }]
```

---

### 2. `getBlackoutDateById(db: Kysely<Database>, id: string): Promise<BlackoutDatesTable | null>`

Retrieve single blackout date by ID.

**Logic:**
- Query blackout_dates by ID
- Return blackout date if found, null if not found

**Parameters:**
- `id`: Blackout date UUID

**Returns:** Blackout date object or null

**Errors:** None (returns null if not found)

**Example:**
```typescript
const blackoutDate = await getBlackoutDateById(db, '123-456-789');
if (!blackoutDate) {
  throw new NotFoundError('Blackout date');
}
```

---

### 3. `getBlackoutDatesByRange(db: Kysely<Database>, dateRange: DateRangeInput): Promise<BlackoutDatesTable[]>`

Get blackout dates that overlap with a date range.

**Logic:**
- Query blackout_dates table
- Filter where periods overlap with given date range
- Overlap condition: `blackout.start_date <= range.end_date AND blackout.end_date >= range.start_date`
- Order by start_date ascending

**Parameters:**
- `dateRange`: Object with start_date and end_date

**Returns:** Array of overlapping blackout dates

**Errors:** None

**Example:**
```typescript
const blackouts = await getBlackoutDatesByRange(db, {
  start_date: '2024-01-01',
  end_date: '2024-12-31'
});
```

---

### 4. `createBlackoutDate(db: Kysely<Database>, data: CreateBlackoutDateInput): Promise<BlackoutDatesTable>`

Create a new blackout date period.

**Logic:**
1. Generate UUID for new blackout date
2. Set created_at and updated_at timestamps
3. Insert into database
4. Return created blackout date

**Parameters:**
- `data`: Object with start_date, end_date, and reason

**Returns:** Created blackout date object

**Errors:** None (overlaps are allowed)

**Example:**
```typescript
const blackoutDate = await createBlackoutDate(db, {
  start_date: '2024-12-25',
  end_date: '2024-12-25',
  reason: 'Christmas Day'
});
```

---

### 5. `deleteBlackoutDate(db: Kysely<Database>, id: string): Promise<void>`

Delete a blackout date.

**Logic:**
1. Check if blackout date exists
2. Throw NotFoundError if not found
3. Delete from database
4. No constraint checking (blackout dates don't reference other tables)

**Parameters:**
- `id`: Blackout date UUID

**Returns:** void

**Errors:**
- `NotFoundError`: Blackout date not found

**Example:**
```typescript
await deleteBlackoutDate(db, '123-456-789');
```

---

### 6. `isDateBlackedOut(db: Kysely<Database>, date: string): Promise<boolean>`

Check if a specific date falls within any blackout period.

**Logic:**
- Query blackout_dates table
- Check if any periods contain the given date
- Containment condition: `blackout.start_date <= date AND blackout.end_date >= date`
- Return true if date is blacked out, false otherwise

**Parameters:**
- `date`: Date to check (YYYY-MM-DD)

**Returns:** Boolean indicating if date is blacked out

**Errors:** None

**Example:**
```typescript
const isBlackedOut = await isDateBlackedOut(db, '2024-12-25');
if (isBlackedOut) {
  console.log('Cannot schedule on this date (blackout period)');
}
```

---

### 7. `blackoutDateExists(db: Kysely<Database>, id: string): Promise<boolean>`

Check if blackout date exists.

**Logic:**
- Query blackout_dates by ID
- Return true if found, false if not

**Parameters:**
- `id`: Blackout date UUID

**Returns:** Boolean

**Errors:** None

**Example:**
```typescript
if (!await blackoutDateExists(db, '123-456-789')) {
  throw new NotFoundError('Blackout date');
}
```

---

## Testing Requirements

### Unit Tests

#### `/src/lib/features/blackout-dates/schemas.test.ts`

**Schema Validation Tests:**
- ✅ createBlackoutDateSchema validates valid input
- ✅ createBlackoutDateSchema requires start_date
- ✅ createBlackoutDateSchema requires end_date
- ✅ createBlackoutDateSchema requires reason
- ✅ createBlackoutDateSchema validates date format
- ✅ createBlackoutDateSchema rejects start_date > end_date
- ✅ createBlackoutDateSchema allows start_date = end_date
- ✅ dateRangeSchema validates date range
- ✅ blackoutDateIdSchema validates UUID format

---

#### `/src/lib/features/blackout-dates/services/blackout-date-service.test.ts`

**Service Function Tests:**

**getBlackoutDates():**
- ✅ Returns all blackout dates
- ✅ Returns empty array when no blackout dates
- ✅ Orders dates by start_date

**getBlackoutDateById():**
- ✅ Returns blackout date when found
- ✅ Returns null when not found

**getBlackoutDatesByRange():**
- ✅ Returns blackout dates overlapping with range
- ✅ Returns empty array when no overlap
- ✅ Detects partial overlaps
- ✅ Detects complete overlaps
- ✅ Detects dates contained within range
- ✅ Detects range contained within blackout period

**createBlackoutDate():**
- ✅ Creates blackout date with valid data
- ✅ Generates UUID for new date
- ✅ Sets timestamps
- ✅ Returns created blackout date
- ✅ Allows overlapping blackout dates
- ✅ Allows single-day blackout (start = end)

**deleteBlackoutDate():**
- ✅ Deletes blackout date successfully
- ✅ Throws NotFoundError if not found
- ✅ Actually removes from database

**isDateBlackedOut():**
- ✅ Returns true when date is within blackout period
- ✅ Returns false when date is outside blackout period
- ✅ Checks start_date boundary
- ✅ Checks end_date boundary
- ✅ Returns true when multiple overlapping blackouts exist

**blackoutDateExists():**
- ✅ Returns true when blackout date exists
- ✅ Returns false when blackout date doesn't exist

---

### Testing Strategy

1. **Date Range Testing:**
   - Test various overlap scenarios
   - Test edge cases (same day, boundaries)
   - Test invalid date formats

2. **Overlap Scenarios:**
   - Multiple overlapping blackouts allowed
   - Test containment logic
   - Test boundary conditions

3. **Test Isolation:**
   - Each test should be independent
   - Clean database state between tests

---

## Acceptance Criteria

- [ ] schemas.ts created with validation schemas
- [ ] blackout-date-service.ts created with all 7 functions
- [ ] All functions accept database as first parameter
- [ ] UUID generation working for blackout dates
- [ ] Timestamp management working
- [ ] Date range overlap detection working
- [ ] Overlapping blackout dates allowed
- [ ] All unit tests passing (100% coverage)
- [ ] All functions properly typed
- [ ] Error handling uses custom error classes

---

## Usage Example

```typescript
import { db } from '$lib/db';
import {
  getBlackoutDates,
  createBlackoutDate,
  isDateBlackedOut
} from '$lib/features/blackout-dates/services/blackout-date-service';

// Get all blackout dates
const blackouts = await getBlackoutDates(db);

// Create blackout date
const blackout = await createBlackoutDate(db, {
  start_date: '2024-12-25',
  end_date: '2024-12-26',
  reason: 'Christmas Holiday'
});

// Check if specific date is blacked out
const canSchedule = !await isDateBlackedOut(db, '2024-12-25');
```

---

## Notes

- Overlapping blackout dates are allowed (e.g., personal + institutional holidays)
- Date format is YYYY-MM-DD (ISO 8601)
- Blackout dates should be considered during schedule generation
- Future enhancement: recurring blackout dates (e.g., every Sunday)
- Consider importing holiday calendars
- May want to add categories (holiday, break, conference, etc.)

---

## References

- [Date Range Overlap Detection](https://stackoverflow.com/questions/325933/determine-whether-two-date-ranges-overlap)
- [ISO 8601 Date Format](https://en.wikipedia.org/wiki/ISO_8601)
- [Academic Calendar Planning](https://en.wikipedia.org/wiki/Academic_calendar)
