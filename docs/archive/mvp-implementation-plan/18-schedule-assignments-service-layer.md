# Step 18: Schedule Assignments - Service Layer

## Overview
Implement the service layer for managing schedule assignments (the output of the scheduling algorithm). This includes CRUD operations, conflict detection, requirement tracking, and validation logic for schedule assignments.

## Dependencies
- ✅ Step 01: Kysely Database Setup
- ✅ Step 02: Database Schema & Migrations
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 04: Students - Service Layer
- ✅ Step 07: Preceptors - Service Layer
- ✅ Step 11: Clerkships - Service Layer

## Requirements

### Database Operations
Implement assignment management operations:
- Get all assignments (with filters)
- Get single assignment by ID
- Get assignments by student/preceptor/clerkship
- Get assignments by date range
- Create new assignment
- Update existing assignment
- Delete assignment
- Bulk create assignments (for algorithm output)

### Business Rules
- Student can only have one assignment at a time (no overlapping assignments)
- Preceptor can only supervise max_students at once (MVP: 1)
- Assignment must fit within preceptor availability
- Assignment cannot overlap with blackout dates
- Assignment duration must be >= clerkship required_days
- Preceptor specialty must match clerkship specialty
- start_date must be before end_date

### Validation
- Zod schemas for create and update operations
- Date range validation
- Conflict detection (student and preceptor)
- Availability validation
- Specialty matching validation

## Implementation Details

### File Structure
```
/src/lib/features/schedules/
├── services/
│   ├── assignment-service.ts       # Service functions (NEW)
│   └── assignment-service.test.ts  # Service tests (NEW)
└── schemas.ts                       # Zod schemas (NEW)
```

---

## Files to Create

### 1. `/src/lib/features/schedules/schemas.ts`

Zod validation schemas for assignment operations.

**Exports:**
```typescript
import { z } from 'zod';
import { dateStringSchema, uuidSchema } from '$lib/validation/common-schemas';

export const createAssignmentSchema = z.object({
  student_id: uuidSchema,
  preceptor_id: uuidSchema,
  clerkship_id: uuidSchema,
  start_date: dateStringSchema,
  end_date: dateStringSchema,
}).refine(data => data.start_date < data.end_date, {
  message: 'start_date must be before end_date',
});

export const updateAssignmentSchema = z.object({
  student_id: uuidSchema.optional(),
  preceptor_id: uuidSchema.optional(),
  clerkship_id: uuidSchema.optional(),
  start_date: dateStringSchema.optional(),
  end_date: dateStringSchema.optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
}).refine(
  data => !data.start_date || !data.end_date || data.start_date < data.end_date,
  { message: 'start_date must be before end_date' }
);

export const bulkAssignmentSchema = z.object({
  assignments: z.array(createAssignmentSchema),
});

export const assignmentFiltersSchema = z.object({
  student_id: uuidSchema.optional(),
  preceptor_id: uuidSchema.optional(),
  clerkship_id: uuidSchema.optional(),
  start_date: dateStringSchema.optional(),
  end_date: dateStringSchema.optional(),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type BulkAssignmentInput = z.infer<typeof bulkAssignmentSchema>;
export type AssignmentFilters = z.infer<typeof assignmentFiltersSchema>;
```

---

### 2. `/src/lib/features/schedules/services/assignment-service.ts`

Service functions for assignment operations.

**Exports:**
```typescript
import type { Kysely } from 'kysely';
import type { Database, ScheduleAssignmentsTable } from '$lib/db/types';
import type { CreateAssignmentInput, UpdateAssignmentInput, BulkAssignmentInput, AssignmentFilters } from '../schemas';

export async function getAssignments(
  db: Kysely<Database>,
  filters?: AssignmentFilters
): Promise<ScheduleAssignmentsTable[]>

export async function getAssignmentById(
  db: Kysely<Database>,
  id: string
): Promise<ScheduleAssignmentsTable | null>

export async function getAssignmentsByStudent(
  db: Kysely<Database>,
  studentId: string
): Promise<ScheduleAssignmentsTable[]>

export async function getAssignmentsByPreceptor(
  db: Kysely<Database>,
  preceptorId: string
): Promise<ScheduleAssignmentsTable[]>

export async function getAssignmentsByDateRange(
  db: Kysely<Database>,
  startDate: string,
  endDate: string
): Promise<ScheduleAssignmentsTable[]>

export async function createAssignment(
  db: Kysely<Database>,
  data: CreateAssignmentInput
): Promise<ScheduleAssignmentsTable>

export async function updateAssignment(
  db: Kysely<Database>,
  id: string,
  data: UpdateAssignmentInput
): Promise<ScheduleAssignmentsTable>

export async function deleteAssignment(
  db: Kysely<Database>,
  id: string
): Promise<void>

export async function bulkCreateAssignments(
  db: Kysely<Database>,
  data: BulkAssignmentInput
): Promise<ScheduleAssignmentsTable[]>

export async function hasStudentConflict(
  db: Kysely<Database>,
  studentId: string,
  startDate: string,
  endDate: string,
  excludeId?: string
): Promise<boolean>

export async function hasPreceptorConflict(
  db: Kysely<Database>,
  preceptorId: string,
  startDate: string,
  endDate: string,
  excludeId?: string
): Promise<boolean>

export async function validateAssignment(
  db: Kysely<Database>,
  data: CreateAssignmentInput
): Promise<{ valid: boolean; errors: string[] }>

export async function getStudentProgress(
  db: Kysely<Database>,
  studentId: string
): Promise<{
  clerkship_id: string;
  clerkship_name: string;
  required_days: number;
  completed_days: number;
  percentage: number;
}[]>
```

---

## Business Logic Functions

### 1. `getAssignments(db, filters?): Promise<ScheduleAssignmentsTable[]>`

Get all assignments with optional filtering.

**Logic:**
- Query schedule_assignments table
- Apply filters if provided (student_id, preceptor_id, clerkship_id, date range)
- Order by start_date ascending
- Return array of assignments

**Parameters:**
- `filters`: Optional object with filter criteria

**Returns:** Array of assignments (empty if none match)

**Errors:** None

**Example:**
```typescript
// Get all assignments
const all = await getAssignments(db);

// Get filtered assignments
const studentAssignments = await getAssignments(db, { student_id: 'student-123' });
```

---

### 2. `getAssignmentById(db, id): Promise<ScheduleAssignmentsTable | null>`

Get single assignment by ID.

**Logic:**
- Query schedule_assignments by ID
- Return assignment if found, null if not

**Parameters:**
- `id`: Assignment UUID

**Returns:** Assignment object or null

**Errors:** None

---

### 3. `getAssignmentsByStudent(db, studentId): Promise<ScheduleAssignmentsTable[]>`

Get all assignments for a student.

**Logic:**
- Query schedule_assignments by student_id
- Order by start_date ascending
- Return array of assignments

**Parameters:**
- `studentId`: Student UUID

**Returns:** Array of assignments for student

**Errors:** None

---

### 4. `getAssignmentsByPreceptor(db, preceptorId): Promise<ScheduleAssignmentsTable[]>`

Get all assignments for a preceptor.

**Logic:**
- Query schedule_assignments by preceptor_id
- Order by start_date ascending
- Return array of assignments

**Parameters:**
- `preceptorId`: Preceptor UUID

**Returns:** Array of assignments for preceptor

**Errors:** None

---

### 5. `getAssignmentsByDateRange(db, startDate, endDate): Promise<ScheduleAssignmentsTable[]>`

Get assignments that overlap with a date range.

**Logic:**
- Query schedule_assignments
- Filter where assignment overlaps with date range
- Overlap condition: `assignment.start_date <= range.end_date AND assignment.end_date >= range.start_date`
- Order by start_date ascending

**Parameters:**
- `startDate`: Range start (YYYY-MM-DD)
- `endDate`: Range end (YYYY-MM-DD)

**Returns:** Array of overlapping assignments

**Errors:** None

---

### 6. `createAssignment(db, data): Promise<ScheduleAssignmentsTable>`

Create a new schedule assignment.

**Logic:**
1. Validate assignment data
2. Check student exists
3. Check preceptor exists
4. Check clerkship exists
5. Validate specialty matching
6. Validate duration >= required_days
7. Check for student conflicts
8. Check for preceptor conflicts
9. Verify preceptor availability
10. Check for blackout date conflicts
11. Generate UUID
12. Set timestamps
13. Insert into database
14. Return created assignment

**Parameters:**
- `data`: Assignment data object

**Returns:** Created assignment

**Errors:**
- `NotFoundError`: Student/Preceptor/Clerkship not found
- `ValidationError`: Invalid data
- `ConflictError`: Scheduling conflict detected

**Example:**
```typescript
const assignment = await createAssignment(db, {
  student_id: 'student-123',
  preceptor_id: 'preceptor-456',
  clerkship_id: 'clerkship-789',
  start_date: '2024-01-01',
  end_date: '2024-01-28'
});
```

---

### 7. `updateAssignment(db, id, data): Promise<ScheduleAssignmentsTable>`

Update an existing assignment.

**Logic:**
1. Check assignment exists
2. Merge update data with existing data
3. Validate updated assignment
4. Check conflicts (excluding current assignment)
5. Update updated_at timestamp
6. Update in database
7. Return updated assignment

**Parameters:**
- `id`: Assignment UUID
- `data`: Update data object

**Returns:** Updated assignment

**Errors:**
- `NotFoundError`: Assignment not found
- `ValidationError`: Invalid data
- `ConflictError`: Update creates conflict

---

### 8. `deleteAssignment(db, id): Promise<void>`

Delete an assignment.

**Logic:**
1. Check assignment exists
2. Throw NotFoundError if not found
3. Delete from database

**Parameters:**
- `id`: Assignment UUID

**Returns:** void

**Errors:**
- `NotFoundError`: Assignment not found

---

### 9. `bulkCreateAssignments(db, data): Promise<ScheduleAssignmentsTable[]>`

Create multiple assignments (for algorithm output).

**Logic:**
1. Begin transaction
2. For each assignment:
   - Validate
   - Create with timestamps and UUID
3. Commit transaction
4. Return created assignments

**Parameters:**
- `data`: Object with array of assignments

**Returns:** Array of created assignments

**Errors:**
- `ValidationError`: Invalid assignment data
- Rolls back transaction on any error

---

### 10. `hasStudentConflict(db, studentId, startDate, endDate, excludeId?): Promise<boolean>`

Check if student has conflicting assignments in date range.

**Logic:**
- Query schedule_assignments for student_id
- Exclude assignment with excludeId if provided
- Check if any assignments overlap with date range
- Return true if conflict exists

**Parameters:**
- `studentId`: Student UUID
- `startDate`: Start date
- `endDate`: End date
- `excludeId`: Optional assignment ID to exclude

**Returns:** Boolean indicating conflict

**Errors:** None

---

### 11. `hasPreceptorConflict(db, preceptorId, startDate, endDate, excludeId?): Promise<boolean>`

Check if preceptor has conflicting assignments in date range.

**Logic:**
- Query schedule_assignments for preceptor_id
- Exclude assignment with excludeId if provided
- Check if any assignments overlap with date range
- Return true if conflict exists (considers max_students)

**Parameters:**
- `preceptorId`: Preceptor UUID
- `startDate`: Start date
- `endDate`: End date
- `excludeId`: Optional assignment ID to exclude

**Returns:** Boolean indicating conflict

**Errors:** None

---

### 12. `validateAssignment(db, data): Promise<{ valid: boolean; errors: string[] }>`

Validate assignment against all business rules.

**Logic:**
1. Check student exists
2. Check preceptor exists
3. Check clerkship exists
4. Verify specialty matching
5. Calculate and verify duration
6. Check student conflicts
7. Check preceptor conflicts
8. Check preceptor availability
9. Check blackout dates
10. Return validation result

**Parameters:**
- `data`: Assignment data to validate

**Returns:** Object with valid flag and error messages

**Errors:** None (returns validation errors in result)

**Example:**
```typescript
const result = await validateAssignment(db, assignmentData);
if (!result.valid) {
  console.log('Validation errors:', result.errors);
}
```

---

### 13. `getStudentProgress(db, studentId): Promise<ProgressInfo[]>`

Calculate student's progress on required clerkships.

**Logic:**
1. Get all clerkships
2. For each clerkship:
   - Get student's assignments for that clerkship
   - Calculate total days completed
   - Calculate percentage of required_days
3. Return progress information

**Parameters:**
- `studentId`: Student UUID

**Returns:** Array of progress objects per clerkship

**Errors:** None

**Example:**
```typescript
const progress = await getStudentProgress(db, 'student-123');
// [{ clerkship_name: 'Internal Medicine', required_days: 28, completed_days: 28, percentage: 100 }]
```

---

## Testing Requirements

### Unit Tests

#### `/src/lib/features/schedules/schemas.test.ts`
- ✅ Validate all schemas
- ✅ Test date ordering refinements
- ✅ Test required fields
- ✅ Test optional fields

#### `/src/lib/features/schedules/services/assignment-service.test.ts`
- ✅ Test all CRUD operations
- ✅ Test filtering logic
- ✅ Test conflict detection
- ✅ Test validation logic
- ✅ Test bulk operations
- ✅ Test progress tracking
- ✅ Test all error cases

---

## Acceptance Criteria

- [ ] schemas.ts created with all validation schemas
- [ ] assignment-service.ts created with all 13 functions
- [ ] All functions accept database as first parameter
- [ ] UUID generation working
- [ ] Timestamp management working
- [ ] Conflict detection working (student and preceptor)
- [ ] Specialty matching validation working
- [ ] Duration validation working
- [ ] Availability checking working
- [ ] Blackout date checking working
- [ ] Bulk operations use transactions
- [ ] Progress tracking calculations accurate
- [ ] All unit tests passing (100% coverage)
- [ ] All functions properly typed

---

## Usage Example

```typescript
import { db } from '$lib/db';
import {
  createAssignment,
  validateAssignment,
  getStudentProgress
} from '$lib/features/schedules/services/assignment-service';

// Validate before creating
const validation = await validateAssignment(db, assignmentData);
if (!validation.valid) {
  console.error(validation.errors);
  return;
}

// Create assignment
const assignment = await createAssignment(db, assignmentData);

// Check student progress
const progress = await getStudentProgress(db, 'student-123');
```

---

## Notes

- Conflict detection is critical for schedule integrity
- Validation should be comprehensive before creation
- Bulk operations are atomic (all or nothing)
- Progress tracking helps identify incomplete schedules
- Future: Add notifications for upcoming assignments

---

## References

- [Kysely Transactions](https://kysely.dev/docs/examples/transactions)
- [Date Range Overlap Detection](https://stackoverflow.com/questions/325933/determine-whether-two-date-ranges-overlap)
