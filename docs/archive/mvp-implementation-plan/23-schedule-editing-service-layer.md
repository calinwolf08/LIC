# Step 23: Schedule Editing - Service Layer

## Overview
Implement the service layer for manual schedule editing operations. This includes updating individual assignments, reassigning students to different preceptors, conflict checking on edits, and validation logic to ensure schedule integrity is maintained.

## Dependencies
- ✅ Step 01: Kysely Database Setup
- ✅ Step 02: Database Schema & Migrations
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 18: Schedule Assignments - Service Layer

## Requirements

### Editing Operations
Implement functions for manual schedule adjustments:
- Reassign student to different preceptor
- Change assignment dates
- Swap two assignments
- Validate edits against all constraints
- Preview edit conflicts before committing

### Business Rules
- All existing constraints still apply:
  - No student conflicts
  - No preceptor conflicts
  - Specialty matching
  - Availability requirements
  - No blackout date overlaps
  - Minimum duration requirements
- Edits must maintain schedule integrity
- Provide clear validation feedback

### Validation
- Re-validate assignments after edits
- Check for cascading conflicts
- Provide detailed error messages
- Support dry-run/preview mode

## Implementation Details

### File Structure
```
/src/lib/features/schedules/
├── services/
│   ├── assignment-service.ts       # (Existing)
│   ├── calendar-service.ts         # (Existing)
│   ├── editing-service.ts          # Editing functions (NEW)
│   └── editing-service.test.ts     # Editing tests (NEW)
└── schemas.ts                       # (Existing)
```

---

## Files to Create

### 1. `/src/lib/features/schedules/services/editing-service.ts`

Service functions for schedule editing operations.

**Exports:**
```typescript
import type { Kysely } from 'kysely';
import type { Database, ScheduleAssignmentsTable } from '$lib/db/types';
import type { UpdateAssignmentInput } from '../schemas';

export async function reassignToPreceptor(
  db: Kysely<Database>,
  assignmentId: string,
  newPreceptorId: string,
  dryRun?: boolean
): Promise<{ valid: boolean; errors: string[]; assignment?: ScheduleAssignmentsTable }>

export async function changeAssignmentDates(
  db: Kysely<Database>,
  assignmentId: string,
  newStartDate: string,
  newEndDate: string,
  dryRun?: boolean
): Promise<{ valid: boolean; errors: string[]; assignment?: ScheduleAssignmentsTable }>

export async function swapAssignments(
  db: Kysely<Database>,
  assignmentId1: string,
  assignmentId2: string,
  dryRun?: boolean
): Promise<{ valid: boolean; errors: string[]; assignments?: ScheduleAssignmentsTable[] }>

export async function validateEdit(
  db: Kysely<Database>,
  assignmentId: string,
  updates: UpdateAssignmentInput
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }>

export async function previewEditConflicts(
  db: Kysely<Database>,
  assignmentId: string,
  updates: UpdateAssignmentInput
): Promise<{
  studentConflicts: ScheduleAssignmentsTable[];
  preceptorConflicts: ScheduleAssignmentsTable[];
  availabilityIssues: string[];
  blackoutConflicts: { start_date: string; end_date: string; reason: string }[];
}>

export async function bulkReassign(
  db: Kysely<Database>,
  assignmentIds: string[],
  newPreceptorId: string
): Promise<{ successful: string[]; failed: { id: string; errors: string[] }[] }>
```

---

## Business Logic Functions

### 1. `reassignToPreceptor(db, assignmentId, newPreceptorId, dryRun?): Promise<ValidationResult>`

Reassign a student to a different preceptor for same clerkship.

**Logic:**
1. Get existing assignment
2. Verify new preceptor exists
3. Check specialty matching (must match clerkship)
4. Check preceptor availability for assignment period
5. Check for preceptor conflicts
6. If dryRun=true, return validation result without saving
7. If dryRun=false and valid, update assignment
8. Return result

**Parameters:**
- `assignmentId`: Assignment UUID
- `newPreceptorId`: New preceptor UUID
- `dryRun`: If true, validate only (don't save)

**Returns:** Validation result with updated assignment if successful

**Errors:**
- `NotFoundError`: Assignment or preceptor not found
- `ValidationError`: Constraints violated

**Example:**
```typescript
// Preview reassignment
const preview = await reassignToPreceptor(db, 'assignment-123', 'preceptor-456', true);
if (!preview.valid) {
  console.log('Errors:', preview.errors);
  return;
}

// Commit reassignment
const result = await reassignToPreceptor(db, 'assignment-123', 'preceptor-456', false);
```

---

### 2. `changeAssignmentDates(db, assignmentId, newStartDate, newEndDate, dryRun?): Promise<ValidationResult>`

Change the date range of an assignment.

**Logic:**
1. Get existing assignment
2. Validate new dates (start < end, duration >= required_days)
3. Check student conflicts with new dates
4. Check preceptor conflicts with new dates
5. Check preceptor availability for new dates
6. Check blackout dates for new period
7. If dryRun=true, return validation result without saving
8. If dryRun=false and valid, update assignment
9. Return result

**Parameters:**
- `assignmentId`: Assignment UUID
- `newStartDate`: New start date (YYYY-MM-DD)
- `newEndDate`: New end date (YYYY-MM-DD)
- `dryRun`: If true, validate only

**Returns:** Validation result with updated assignment if successful

**Errors:**
- `NotFoundError`: Assignment not found
- `ValidationError`: Constraints violated

**Example:**
```typescript
// Preview date change
const preview = await changeAssignmentDates(
  db,
  'assignment-123',
  '2024-02-01',
  '2024-02-28',
  true
);

if (preview.valid) {
  // Commit change
  const result = await changeAssignmentDates(
    db,
    'assignment-123',
    '2024-02-01',
    '2024-02-28',
    false
  );
}
```

---

### 3. `swapAssignments(db, assignmentId1, assignmentId2, dryRun?): Promise<ValidationResult>`

Swap two assignments (exchange preceptors or dates).

**Logic:**
1. Get both assignments
2. Verify they can be swapped (same clerkship recommended but not required)
3. Create temporary swapped versions
4. Validate both swapped assignments
5. Check all constraints for both
6. If dryRun=true, return validation result without saving
7. If dryRun=false and valid, use transaction to swap
8. Return result

**Parameters:**
- `assignmentId1`: First assignment UUID
- `assignmentId2`: Second assignment UUID
- `dryRun`: If true, validate only

**Returns:** Validation result with swapped assignments if successful

**Errors:**
- `NotFoundError`: Assignment not found
- `ValidationError`: Swap violates constraints

**Example:**
```typescript
// Preview swap
const preview = await swapAssignments(db, 'assignment-1', 'assignment-2', true);

if (preview.valid) {
  // Commit swap
  const result = await swapAssignments(db, 'assignment-1', 'assignment-2', false);
}
```

---

### 4. `validateEdit(db, assignmentId, updates): Promise<ValidationResult>`

Validate proposed changes to an assignment.

**Logic:**
1. Get current assignment
2. Merge updates with current values
3. Validate merged assignment:
   - Check entities exist
   - Verify specialty matching
   - Check duration requirements
   - Check student conflicts
   - Check preceptor conflicts
   - Check availability
   - Check blackout dates
4. Return validation result with errors and warnings

**Parameters:**
- `assignmentId`: Assignment UUID
- `updates`: Proposed changes

**Returns:** Validation result with errors and warnings

**Errors:** None (returns validation in result)

**Example:**
```typescript
const validation = await validateEdit(db, 'assignment-123', {
  preceptor_id: 'new-preceptor',
  start_date: '2024-02-01',
});

if (!validation.valid) {
  console.log('Errors:', validation.errors);
  console.log('Warnings:', validation.warnings);
}
```

---

### 5. `previewEditConflicts(db, assignmentId, updates): Promise<ConflictPreview>`

Preview detailed conflicts for proposed edit.

**Logic:**
1. Get current assignment
2. Merge updates with current values
3. Find all conflicts:
   - Query student's other assignments that overlap
   - Query preceptor's other assignments that overlap
   - Check availability periods
   - Check blackout dates that overlap
4. Return detailed conflict information

**Parameters:**
- `assignmentId`: Assignment UUID
- `updates`: Proposed changes

**Returns:** Object with detailed conflict information

**Errors:** None

**Example:**
```typescript
const conflicts = await previewEditConflicts(db, 'assignment-123', {
  start_date: '2024-02-01',
  end_date: '2024-02-28',
});

console.log('Student conflicts:', conflicts.studentConflicts);
console.log('Preceptor conflicts:', conflicts.preceptorConflicts);
console.log('Availability issues:', conflicts.availabilityIssues);
console.log('Blackout conflicts:', conflicts.blackoutConflicts);
```

---

### 6. `bulkReassign(db, assignmentIds, newPreceptorId): Promise<BulkResult>`

Reassign multiple assignments to a new preceptor.

**Logic:**
1. Begin transaction
2. For each assignment:
   - Validate reassignment
   - If valid, update
   - If invalid, add to failed list
3. Commit transaction
4. Return success/failure summary

**Parameters:**
- `assignmentIds`: Array of assignment UUIDs
- `newPreceptorId`: New preceptor UUID

**Returns:** Object with successful and failed assignments

**Errors:**
- Transaction rolled back if any database error

**Example:**
```typescript
const result = await bulkReassign(
  db,
  ['assignment-1', 'assignment-2', 'assignment-3'],
  'new-preceptor'
);

console.log('Successful:', result.successful.length);
console.log('Failed:', result.failed.length);

result.failed.forEach(f => {
  console.log(`Failed ${f.id}:`, f.errors);
});
```

---

## Testing Requirements

### Unit Tests

#### `/src/lib/features/schedules/services/editing-service.test.ts`

**reassignToPreceptor():**
- ✅ Validates specialty matching
- ✅ Checks preceptor availability
- ✅ Checks preceptor conflicts
- ✅ Dry run doesn't save changes
- ✅ Successful reassignment saves to database
- ✅ Returns validation errors when invalid
- ✅ Throws NotFoundError when assignment not found
- ✅ Throws NotFoundError when preceptor not found

**changeAssignmentDates():**
- ✅ Validates date ordering
- ✅ Validates duration requirements
- ✅ Checks student conflicts
- ✅ Checks preceptor conflicts
- ✅ Checks availability
- ✅ Checks blackout dates
- ✅ Dry run doesn't save changes
- ✅ Successful change saves to database
- ✅ Returns validation errors when invalid

**swapAssignments():**
- ✅ Swaps preceptors successfully
- ✅ Validates both swapped assignments
- ✅ Checks all constraints for both
- ✅ Uses transaction (all or nothing)
- ✅ Dry run doesn't save changes
- ✅ Rolls back on validation failure
- ✅ Returns errors for invalid swaps

**validateEdit():**
- ✅ Validates all constraint types
- ✅ Returns specific error messages
- ✅ Returns warnings for potential issues
- ✅ Handles partial updates correctly

**previewEditConflicts():**
- ✅ Finds student conflicts
- ✅ Finds preceptor conflicts
- ✅ Identifies availability issues
- ✅ Identifies blackout conflicts
- ✅ Returns detailed conflict info

**bulkReassign():**
- ✅ Processes all assignments
- ✅ Separates successful and failed
- ✅ Uses transaction
- ✅ Returns detailed results
- ✅ Handles mixed success/failure

---

### Testing Strategy

1. **Constraint Validation:**
   - Test each constraint independently
   - Test combined constraints
   - Verify error messages

2. **Dry Run Testing:**
   - Verify dry run doesn't modify database
   - Verify dry run returns same validation as actual run

3. **Transaction Testing:**
   - Verify atomic operations
   - Test rollback scenarios

---

## Acceptance Criteria

- [ ] editing-service.ts created with all 6 functions
- [ ] All functions support dry run mode
- [ ] All constraint validations working
- [ ] Reassignment logic correct
- [ ] Date change logic correct
- [ ] Swap logic correct with transactions
- [ ] Conflict preview provides detailed information
- [ ] Bulk operations handle partial failures
- [ ] All unit tests passing (100% coverage)
- [ ] All functions properly typed
- [ ] Clear error and warning messages

---

## Usage Example

```typescript
import { db } from '$lib/db';
import {
  reassignToPreceptor,
  validateEdit,
  previewEditConflicts
} from '$lib/features/schedules/services/editing-service';

// Preview conflicts before editing
const conflicts = await previewEditConflicts(db, 'assignment-123', {
  preceptor_id: 'new-preceptor'
});

if (conflicts.preceptorConflicts.length > 0) {
  console.log('Warning: preceptor has conflicts');
}

// Validate edit
const validation = await validateEdit(db, 'assignment-123', {
  preceptor_id: 'new-preceptor'
});

if (!validation.valid) {
  console.log('Cannot reassign:', validation.errors);
  return;
}

// Commit reassignment
const result = await reassignToPreceptor(db, 'assignment-123', 'new-preceptor');
console.log('Reassigned successfully');
```

---

## Notes

- Dry run mode is critical for user preview
- Transaction support ensures atomic operations
- Detailed conflict preview helps users understand issues
- Bulk operations useful for mass changes
- Future: Add undo/redo functionality
- Future: Add change history/audit log

---

## References

- [Kysely Transactions](https://kysely.dev/docs/examples/transactions)
- [Optimistic Locking](https://en.wikipedia.org/wiki/Optimistic_concurrency_control)
