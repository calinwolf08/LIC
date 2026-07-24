# Step 08: Preceptor Availability - Service Layer

## Overview
Implement the service layer for managing preceptor availability periods. This includes setting date ranges when preceptors are available to teach, validating availability windows, detecting conflicts, and bulk update operations.

## Dependencies
- ✅ Step 01: Kysely Database Setup
- ✅ Step 02: Database Schema & Migrations
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 07: Preceptors - Service Layer

## Requirements

### Database Operations
Implement availability management operations:
- Get availability for a preceptor
- Set/create availability period
- Update availability period
- Delete availability period
- Bulk update availability (replace all for a preceptor)
- Get availability by date range

### Business Rules
- start_date must be before end_date
- Cannot create overlapping availability periods for same preceptor
- Dates must be valid ISO 8601 format
- Cannot delete availability if it has schedule assignments within the period
- Availability periods can span multiple weeks/months

### Validation
- Zod schemas for create and update operations
- Date format validation (YYYY-MM-DD)
- Date range validation (start before end)
- Overlap detection logic

## Implementation Details

### File Structure
```
/src/lib/features/preceptors/
├── services/
│   ├── preceptor-service.ts             # (Existing)
│   ├── availability-service.ts          # Availability functions (NEW)
│   └── availability-service.test.ts     # Availability tests (NEW)
├── schemas.ts                            # (Existing)
└── availability-schemas.ts               # Availability schemas (NEW)
```

---

## Files to Create

### 1. `/src/lib/features/preceptors/availability-schemas.ts`

Zod validation schemas for availability operations.

**Exports:**
```typescript
import { z } from 'zod';
import { dateStringSchema, uuidSchema } from '$lib/validation/common-schemas';

export const createAvailabilitySchema = z.object({
  preceptor_id: uuidSchema,
  start_date: dateStringSchema,
  end_date: dateStringSchema,
}).refine(data => data.start_date < data.end_date, {
  message: 'start_date must be before end_date',
});

export const updateAvailabilitySchema = z.object({
  start_date: dateStringSchema.optional(),
  end_date: dateStringSchema.optional(),
}).refine(
  data => !data.start_date || !data.end_date || data.start_date < data.end_date,
  { message: 'start_date must be before end_date' }
);

export const dateRangeSchema = z.object({
  start_date: dateStringSchema,
  end_date: dateStringSchema,
}).refine(data => data.start_date <= data.end_date, {
  message: 'start_date must be before or equal to end_date',
});

export const bulkAvailabilitySchema = z.object({
  preceptor_id: uuidSchema,
  periods: z.array(z.object({
    start_date: dateStringSchema,
    end_date: dateStringSchema,
  })).refine(
    periods => periods.every(p => p.start_date < p.end_date),
    { message: 'All periods must have start_date before end_date' }
  ),
});

export type CreateAvailabilityInput = z.infer<typeof createAvailabilitySchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
export type BulkAvailabilityInput = z.infer<typeof bulkAvailabilitySchema>;
```

**Requirements:**
- Use common date validation schemas
- Validate date ordering (start before end)
- Support bulk operations
- Export TypeScript types

---

### 2. `/src/lib/features/preceptors/services/availability-service.ts`

Service functions for preceptor availability operations.

**Exports:**
```typescript
import type { Kysely } from 'kysely';
import type { Database, PreceptorAvailabilityTable } from '$lib/db/types';
import type { CreateAvailabilityInput, UpdateAvailabilityInput, DateRangeInput, BulkAvailabilityInput } from '../availability-schemas';

export async function getAvailability(
  db: Kysely<Database>,
  preceptorId: string
): Promise<PreceptorAvailabilityTable[]>

export async function getAvailabilityById(
  db: Kysely<Database>,
  id: string
): Promise<PreceptorAvailabilityTable | null>

export async function getAvailabilityByDateRange(
  db: Kysely<Database>,
  preceptorId: string,
  dateRange: DateRangeInput
): Promise<PreceptorAvailabilityTable[]>

export async function createAvailability(
  db: Kysely<Database>,
  data: CreateAvailabilityInput
): Promise<PreceptorAvailabilityTable>

export async function updateAvailability(
  db: Kysely<Database>,
  id: string,
  data: UpdateAvailabilityInput
): Promise<PreceptorAvailabilityTable>

export async function deleteAvailability(
  db: Kysely<Database>,
  id: string
): Promise<void>

export async function bulkUpdateAvailability(
  db: Kysely<Database>,
  data: BulkAvailabilityInput
): Promise<PreceptorAvailabilityTable[]>

export async function hasOverlap(
  db: Kysely<Database>,
  preceptorId: string,
  startDate: string,
  endDate: string,
  excludeId?: string
): Promise<boolean>

export async function canDeleteAvailability(
  db: Kysely<Database>,
  id: string
): Promise<boolean>
```

**Requirements:**
- All functions accept database instance as first parameter
- Use Kysely type-safe queries
- Throw appropriate errors (NotFoundError, ConflictError, ValidationError)
- Generate UUIDs for new availability periods
- Set timestamps (created_at, updated_at)
- Transaction support for bulk operations

---

## Business Logic Functions

### 1. `getAvailability(db: Kysely<Database>, preceptorId: string): Promise<PreceptorAvailabilityTable[]>`

Get all availability periods for a preceptor.

**Logic:**
- Query preceptor_availability table by preceptor_id
- Order by start_date ascending
- Return array of availability periods

**Parameters:**
- `preceptorId`: Preceptor UUID

**Returns:** Array of availability periods (empty if none)

**Errors:** None (returns empty array)

**Example:**
```typescript
const availability = await getAvailability(db, 'preceptor-123');
// [{ id: '...', preceptor_id: '...', start_date: '2024-01-01', end_date: '2024-01-31', ... }]
```

---

### 2. `getAvailabilityById(db: Kysely<Database>, id: string): Promise<PreceptorAvailabilityTable | null>`

Get a single availability period by ID.

**Logic:**
- Query preceptor_availability by ID
- Return availability if found, null if not

**Parameters:**
- `id`: Availability period UUID

**Returns:** Availability object or null

**Errors:** None

**Example:**
```typescript
const period = await getAvailabilityById(db, 'availability-123');
```

---

### 3. `getAvailabilityByDateRange(db: Kysely<Database>, preceptorId: string, dateRange: DateRangeInput): Promise<PreceptorAvailabilityTable[]>`

Get availability periods that overlap with a date range.

**Logic:**
- Query preceptor_availability for preceptor_id
- Filter where periods overlap with given date range
- Overlap condition: `period.start_date <= range.end_date AND period.end_date >= range.start_date`
- Order by start_date ascending

**Parameters:**
- `preceptorId`: Preceptor UUID
- `dateRange`: Object with start_date and end_date

**Returns:** Array of overlapping availability periods

**Errors:** None

**Example:**
```typescript
const periods = await getAvailabilityByDateRange(db, 'preceptor-123', {
  start_date: '2024-01-01',
  end_date: '2024-01-31'
});
```

---

### 4. `createAvailability(db: Kysely<Database>, data: CreateAvailabilityInput): Promise<PreceptorAvailabilityTable>`

Create a new availability period for a preceptor.

**Logic:**
1. Verify preceptor exists
2. Throw NotFoundError if preceptor not found
3. Check for overlapping availability periods
4. Throw ConflictError if overlap detected
5. Generate UUID for new availability period
6. Set created_at and updated_at timestamps
7. Insert into database
8. Return created availability period

**Parameters:**
- `data`: Object with preceptor_id, start_date, end_date

**Returns:** Created availability period

**Errors:**
- `NotFoundError`: Preceptor not found
- `ConflictError`: Overlapping availability period exists

**Example:**
```typescript
const availability = await createAvailability(db, {
  preceptor_id: 'preceptor-123',
  start_date: '2024-01-01',
  end_date: '2024-01-31'
});
```

---

### 5. `updateAvailability(db: Kysely<Database>, id: string, data: UpdateAvailabilityInput): Promise<PreceptorAvailabilityTable>`

Update an existing availability period.

**Logic:**
1. Get existing availability period
2. Throw NotFoundError if not found
3. Merge update data with existing data
4. Check for overlapping periods (excluding current period)
5. Throw ConflictError if overlap detected
6. Update updated_at timestamp
7. Update in database
8. Return updated availability period

**Parameters:**
- `id`: Availability period UUID
- `data`: Object with optional start_date and/or end_date

**Returns:** Updated availability period

**Errors:**
- `NotFoundError`: Availability period not found
- `ConflictError`: Update would create overlap

**Example:**
```typescript
const updated = await updateAvailability(db, 'availability-123', {
  end_date: '2024-02-15'
});
```

---

### 6. `deleteAvailability(db: Kysely<Database>, id: string): Promise<void>`

Delete an availability period.

**Logic:**
1. Check if availability period exists
2. Throw NotFoundError if not found
3. Check if period can be deleted (no assignments within dates)
4. Throw ConflictError if assignments exist
5. Delete from database

**Parameters:**
- `id`: Availability period UUID

**Returns:** void

**Errors:**
- `NotFoundError`: Availability period not found
- `ConflictError`: Period has schedule assignments

**Example:**
```typescript
await deleteAvailability(db, 'availability-123');
```

---

### 7. `bulkUpdateAvailability(db: Kysely<Database>, data: BulkAvailabilityInput): Promise<PreceptorAvailabilityTable[]>`

Replace all availability periods for a preceptor with new periods.

**Logic:**
1. Verify preceptor exists
2. Throw NotFoundError if not found
3. Check that new periods don't overlap with each other
4. Throw ValidationError if internal overlaps detected
5. Begin transaction
6. Delete all existing availability for preceptor
7. Create new availability periods
8. Commit transaction
9. Return array of created periods

**Parameters:**
- `data`: Object with preceptor_id and array of periods

**Returns:** Array of created availability periods

**Errors:**
- `NotFoundError`: Preceptor not found
- `ValidationError`: Periods overlap with each other

**Example:**
```typescript
const availability = await bulkUpdateAvailability(db, {
  preceptor_id: 'preceptor-123',
  periods: [
    { start_date: '2024-01-01', end_date: '2024-01-31' },
    { start_date: '2024-03-01', end_date: '2024-03-31' },
  ]
});
```

---

### 8. `hasOverlap(db: Kysely<Database>, preceptorId: string, startDate: string, endDate: string, excludeId?: string): Promise<boolean>`

Check if a date range overlaps with existing availability periods.

**Logic:**
- Query preceptor_availability for preceptor_id
- If excludeId provided, exclude that period from check
- Check if any periods overlap with given date range
- Return true if overlap exists, false otherwise

**Parameters:**
- `preceptorId`: Preceptor UUID
- `startDate`: Start date (YYYY-MM-DD)
- `endDate`: End date (YYYY-MM-DD)
- `excludeId`: Optional availability period ID to exclude

**Returns:** Boolean indicating overlap

**Errors:** None

**Example:**
```typescript
const overlap = await hasOverlap(db, 'preceptor-123', '2024-01-15', '2024-02-15');
if (overlap) {
  throw new ConflictError('Availability period overlaps with existing period');
}
```

---

### 9. `canDeleteAvailability(db: Kysely<Database>, id: string): Promise<boolean>`

Check if an availability period can be deleted.

**Logic:**
- Get availability period
- Query schedule_assignments for preceptor_id within date range
- Return false if any assignments exist
- Return true if no assignments

**Parameters:**
- `id`: Availability period UUID

**Returns:** Boolean indicating if deletion is allowed

**Errors:** None

**Example:**
```typescript
const canDelete = await canDeleteAvailability(db, 'availability-123');
if (!canDelete) {
  throw new ConflictError('Cannot delete availability with existing assignments');
}
```

---

## Testing Requirements

### Unit Tests

#### `/src/lib/features/preceptors/availability-schemas.test.ts`

**Schema Validation Tests:**
- ✅ createAvailabilitySchema validates valid input
- ✅ createAvailabilitySchema requires preceptor_id
- ✅ createAvailabilitySchema requires start_date
- ✅ createAvailabilitySchema requires end_date
- ✅ createAvailabilitySchema validates date format
- ✅ createAvailabilitySchema rejects start_date >= end_date
- ✅ updateAvailabilitySchema allows optional dates
- ✅ updateAvailabilitySchema validates date ordering when both provided
- ✅ dateRangeSchema allows equal dates
- ✅ bulkAvailabilitySchema validates array of periods
- ✅ bulkAvailabilitySchema validates each period's date ordering

---

#### `/src/lib/features/preceptors/services/availability-service.test.ts`

**Service Function Tests:**

**getAvailability():**
- ✅ Returns all availability periods for preceptor
- ✅ Returns empty array when no availability
- ✅ Orders periods by start_date
- ✅ Only returns periods for specified preceptor

**getAvailabilityById():**
- ✅ Returns availability period when found
- ✅ Returns null when not found

**getAvailabilityByDateRange():**
- ✅ Returns periods overlapping with date range
- ✅ Returns empty array when no overlap
- ✅ Detects partial overlaps
- ✅ Detects complete overlaps
- ✅ Detects periods contained within range
- ✅ Detects range contained within period

**createAvailability():**
- ✅ Creates availability with valid data
- ✅ Generates UUID for new period
- ✅ Sets timestamps
- ✅ Throws NotFoundError if preceptor doesn't exist
- ✅ Throws ConflictError on exact overlap
- ✅ Throws ConflictError on partial overlap
- ✅ Allows adjacent periods (end_date = next start_date)

**updateAvailability():**
- ✅ Updates start_date
- ✅ Updates end_date
- ✅ Updates both dates
- ✅ Updates updated_at timestamp
- ✅ Throws NotFoundError if period not found
- ✅ Throws ConflictError on overlap with other periods
- ✅ Allows update without creating overlap

**deleteAvailability():**
- ✅ Deletes period successfully
- ✅ Throws NotFoundError if not found
- ✅ Throws ConflictError if has assignments
- ✅ Actually removes from database

**bulkUpdateAvailability():**
- ✅ Replaces all periods for preceptor
- ✅ Deletes old periods
- ✅ Creates new periods
- ✅ Uses transaction (all or nothing)
- ✅ Throws NotFoundError if preceptor doesn't exist
- ✅ Throws ValidationError if periods overlap each other
- ✅ Allows empty periods array (clears all)

**hasOverlap():**
- ✅ Returns true for exact overlap
- ✅ Returns true for partial overlap
- ✅ Returns false for adjacent periods
- ✅ Returns false for non-overlapping periods
- ✅ Excludes period when excludeId provided

**canDeleteAvailability():**
- ✅ Returns true when no assignments
- ✅ Returns false when assignments exist

---

### Testing Strategy

1. **Date Range Testing:**
   - Test various overlap scenarios (exact, partial, contained, adjacent)
   - Test edge cases (same day, year boundaries)
   - Test invalid date formats

2. **Transaction Testing:**
   - Verify bulk operations are atomic
   - Test rollback on failure
   - Verify all-or-nothing behavior

3. **Conflict Detection:**
   - Test overlap detection thoroughly
   - Verify exclusion logic works
   - Test multiple existing periods

---

## Acceptance Criteria

- [ ] availability-schemas.ts created with all validation schemas
- [ ] availability-service.ts created with all 9 functions
- [ ] All functions accept database as first parameter
- [ ] UUID generation working for availability periods
- [ ] Timestamp management working
- [ ] Overlap detection working correctly
- [ ] Bulk update uses transactions
- [ ] Cannot create overlapping periods
- [ ] Cannot delete periods with assignments
- [ ] All unit tests passing (100% coverage)
- [ ] All functions properly typed
- [ ] Error handling uses custom error classes

---

## Usage Example

```typescript
import { db } from '$lib/db';
import {
  getAvailability,
  createAvailability,
  bulkUpdateAvailability
} from '$lib/features/preceptors/services/availability-service';

// Get all availability for a preceptor
const periods = await getAvailability(db, 'preceptor-123');

// Create single availability period
const period = await createAvailability(db, {
  preceptor_id: 'preceptor-123',
  start_date: '2024-01-01',
  end_date: '2024-01-31'
});

// Bulk update (replace all)
const newPeriods = await bulkUpdateAvailability(db, {
  preceptor_id: 'preceptor-123',
  periods: [
    { start_date: '2024-01-01', end_date: '2024-02-28' },
    { start_date: '2024-04-01', end_date: '2024-05-31' },
  ]
});
```

---

## Notes

- Date format is YYYY-MM-DD (ISO 8601)
- Overlap detection uses inclusive range comparison
- Adjacent periods (touching but not overlapping) are allowed
- Bulk update is atomic (transaction-based)
- Consider adding recurring availability in future
- May want to add availability templates in future

---

## References

- [Date Range Overlap Detection](https://stackoverflow.com/questions/325933/determine-whether-two-date-ranges-overlap)
- [ISO 8601 Date Format](https://en.wikipedia.org/wiki/ISO_8601)
- [Kysely Transactions](https://kysely.dev/docs/examples/transactions)
