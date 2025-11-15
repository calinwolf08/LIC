# Step 04: Students - Service Layer

## Overview
Implement the service layer for student management, including all database operations, validation schemas, and business logic. This layer provides a clean abstraction over database operations and enforces business rules.

## Dependencies
- ✅ Step 01: Kysely Database Setup
- ✅ Step 02: Database Schema & Migrations
- ✅ Step 03: Shared Utilities & Test Helpers

## Requirements

### Database Operations
Implement CRUD operations for students:
- Get all students
- Get single student by ID
- Create new student
- Update existing student
- Delete student (with constraint checking)

### Business Rules
- Email must be unique across all students
- Cannot delete student if they have schedule assignments
- All fields (name, email) are required
- Email must be valid format

### Validation
- Zod schemas for create and update operations
- Email format validation
- Name length validation (min 2 characters)

## Implementation Details

### File Structure
```
/src/lib/features/students/
├── services/
│   ├── student-service.ts       # Service functions (NEW)
│   └── student-service.test.ts  # Service tests (NEW)
└── schemas.ts                    # Zod schemas (NEW)
```

---

## Files to Create

### 1. `/src/lib/features/students/schemas.ts`

Zod validation schemas for student operations.

**Exports:**
```typescript
import { z } from 'zod';
import { emailSchema, nameSchema, uuidSchema } from '$lib/validation/common-schemas';

export const createStudentSchema = z.object({
  name: nameSchema,
  email: emailSchema,
});

export const updateStudentSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const studentIdSchema = z.object({
  id: uuidSchema,
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
```

**Requirements:**
- Use common schemas from shared validation utilities
- Export both schemas and TypeScript types
- Include refinement for update (at least one field required)
- Clear error messages

---

### 2. `/src/lib/features/students/services/student-service.ts`

Service functions for student database operations.

**Exports:**
```typescript
import type { Kysely } from 'kysely';
import type { Database, StudentsTable } from '$lib/db/types';
import type { CreateStudentInput, UpdateStudentInput } from '../schemas';

export async function getStudents(db: Kysely<Database>): Promise<StudentsTable[]>

export async function getStudentById(
  db: Kysely<Database>,
  id: string
): Promise<StudentsTable | null>

export async function getStudentByEmail(
  db: Kysely<Database>,
  email: string
): Promise<StudentsTable | null>

export async function createStudent(
  db: Kysely<Database>,
  data: CreateStudentInput
): Promise<StudentsTable>

export async function updateStudent(
  db: Kysely<Database>,
  id: string,
  data: UpdateStudentInput
): Promise<StudentsTable>

export async function deleteStudent(
  db: Kysely<Database>,
  id: string
): Promise<void>

export async function canDeleteStudent(
  db: Kysely<Database>,
  id: string
): Promise<boolean>

export async function studentExists(
  db: Kysely<Database>,
  id: string
): Promise<boolean>

export async function isEmailTaken(
  db: Kysely<Database>,
  email: string,
  excludeId?: string
): Promise<boolean>
```

**Requirements:**
- All functions accept database instance as first parameter (for mocking)
- Use Kysely type-safe queries
- Throw appropriate errors (NotFoundError, ConflictError)
- Generate UUIDs for new students
- Set timestamps (created_at, updated_at)
- All functions are pure and testable

---

## Business Logic Functions

### 1. `getStudents(db: Kysely<Database>): Promise<StudentsTable[]>`

Retrieve all students from database.

**Logic:**
- Query all students from students table
- Order by name alphabetically
- Return array of students (empty array if none)

**Returns:** Array of all students

**Errors:** None (returns empty array if no students)

**Example:**
```typescript
const students = await getStudents(db);
// [{ id: '...', name: 'John Doe', email: 'john@example.com', ... }]
```

---

### 2. `getStudentById(db: Kysely<Database>, id: string): Promise<StudentsTable | null>`

Retrieve single student by ID.

**Logic:**
- Query student by ID
- Return student if found, null if not found

**Parameters:**
- `id`: Student UUID

**Returns:** Student object or null

**Errors:** None (returns null if not found)

**Example:**
```typescript
const student = await getStudentById(db, '123-456-789');
if (!student) {
  throw new NotFoundError('Student');
}
```

---

### 3. `getStudentByEmail(db: Kysely<Database>, email: string): Promise<StudentsTable | null>`

Retrieve student by email address.

**Logic:**
- Query student by email (case-insensitive)
- Return student if found, null if not found

**Parameters:**
- `email`: Student email address

**Returns:** Student object or null

**Errors:** None

**Example:**
```typescript
const student = await getStudentByEmail(db, 'john@example.com');
```

---

### 4. `createStudent(db: Kysely<Database>, data: CreateStudentInput): Promise<StudentsTable>`

Create new student.

**Logic:**
1. Check if email is already taken
2. Throw ConflictError if email exists
3. Generate UUID for new student
4. Set created_at and updated_at timestamps
5. Insert student into database
6. Return created student

**Parameters:**
- `data`: Object with name and email

**Returns:** Created student object

**Errors:**
- `ConflictError`: Email already exists

**Example:**
```typescript
const student = await createStudent(db, {
  name: 'John Doe',
  email: 'john@example.com',
});
```

---

### 5. `updateStudent(db: Kysely<Database>, id: string, data: UpdateStudentInput): Promise<StudentsTable>`

Update existing student.

**Logic:**
1. Check if student exists
2. Throw NotFoundError if not found
3. If email is being updated, check if new email is taken
4. Throw ConflictError if email is taken by another student
5. Update updated_at timestamp
6. Update student in database
7. Return updated student

**Parameters:**
- `id`: Student UUID
- `data`: Object with optional name and/or email

**Returns:** Updated student object

**Errors:**
- `NotFoundError`: Student not found
- `ConflictError`: Email already exists

**Example:**
```typescript
const updated = await updateStudent(db, '123-456-789', {
  email: 'newemail@example.com',
});
```

---

### 6. `deleteStudent(db: Kysely<Database>, id: string): Promise<void>`

Delete student.

**Logic:**
1. Check if student exists
2. Throw NotFoundError if not found
3. Check if student can be deleted (no assignments)
4. Throw ConflictError if student has assignments
5. Delete student from database

**Parameters:**
- `id`: Student UUID

**Returns:** void

**Errors:**
- `NotFoundError`: Student not found
- `ConflictError`: Student has schedule assignments

**Example:**
```typescript
await deleteStudent(db, '123-456-789');
```

---

### 7. `canDeleteStudent(db: Kysely<Database>, id: string): Promise<boolean>`

Check if student can be deleted (has no assignments).

**Logic:**
- Query schedule_assignments table for student_id
- Return false if any assignments exist
- Return true if no assignments

**Parameters:**
- `id`: Student UUID

**Returns:** Boolean indicating if deletion is allowed

**Errors:** None

**Example:**
```typescript
const canDelete = await canDeleteStudent(db, '123-456-789');
if (!canDelete) {
  throw new ConflictError('Cannot delete student with existing schedule assignments');
}
```

---

### 8. `studentExists(db: Kysely<Database>, id: string): Promise<boolean>`

Check if student exists.

**Logic:**
- Query student by ID
- Return true if found, false if not

**Parameters:**
- `id`: Student UUID

**Returns:** Boolean

**Errors:** None

**Example:**
```typescript
if (!await studentExists(db, '123-456-789')) {
  throw new NotFoundError('Student');
}
```

---

### 9. `isEmailTaken(db: Kysely<Database>, email: string, excludeId?: string): Promise<boolean>`

Check if email is already in use by another student.

**Logic:**
- Query students by email (case-insensitive)
- If excludeId provided, exclude that student from check (for updates)
- Return true if email exists, false if not

**Parameters:**
- `email`: Email to check
- `excludeId`: Optional student ID to exclude from check

**Returns:** Boolean

**Errors:** None

**Example:**
```typescript
// Check if email is available
const taken = await isEmailTaken(db, 'test@example.com');

// Check if email is taken by another student (for updates)
const takenByOther = await isEmailTaken(db, 'test@example.com', currentStudentId);
```

---

## Testing Requirements

### Unit Tests

#### `/src/lib/features/students/schemas.test.ts`

**Schema Validation Tests:**
- ✅ createStudentSchema validates valid input
- ✅ createStudentSchema requires name
- ✅ createStudentSchema requires email
- ✅ createStudentSchema validates email format
- ✅ createStudentSchema validates name length (min 2 chars)
- ✅ updateStudentSchema allows optional name
- ✅ updateStudentSchema allows optional email
- ✅ updateStudentSchema requires at least one field
- ✅ updateStudentSchema rejects empty object
- ✅ studentIdSchema validates UUID format

---

#### `/src/lib/features/students/services/student-service.test.ts`

**Service Function Tests:**

**getStudents():**
- ✅ Returns all students
- ✅ Returns empty array when no students
- ✅ Returns students ordered by name

**getStudentById():**
- ✅ Returns student when found
- ✅ Returns null when not found
- ✅ Returns correct student data

**getStudentByEmail():**
- ✅ Returns student when found
- ✅ Returns null when not found
- ✅ Case-insensitive email matching

**createStudent():**
- ✅ Creates student with valid data
- ✅ Generates UUID for new student
- ✅ Sets created_at and updated_at timestamps
- ✅ Throws ConflictError if email already exists
- ✅ Returns created student with all fields

**updateStudent():**
- ✅ Updates student name
- ✅ Updates student email
- ✅ Updates both name and email
- ✅ Updates updated_at timestamp
- ✅ Throws NotFoundError if student not found
- ✅ Throws ConflictError if new email is taken
- ✅ Allows keeping same email (excludes self from check)
- ✅ Returns updated student

**deleteStudent():**
- ✅ Deletes student successfully
- ✅ Throws NotFoundError if student not found
- ✅ Throws ConflictError if student has assignments
- ✅ Actually removes student from database

**canDeleteStudent():**
- ✅ Returns true when student has no assignments
- ✅ Returns false when student has assignments

**studentExists():**
- ✅ Returns true when student exists
- ✅ Returns false when student doesn't exist

**isEmailTaken():**
- ✅ Returns true when email exists
- ✅ Returns false when email doesn't exist
- ✅ Case-insensitive email check
- ✅ Excludes student when excludeId provided

---

### Testing Strategy

1. **Use Test Database:**
   - Create test DB using `createTestDb()` from test helpers
   - Reset database before each test
   - Close database after all tests

2. **Mock Data:**
   - Use `createMockStudent()` from fixtures
   - Create students with known data for assertions
   - Test edge cases (empty strings, special characters)

3. **Test Isolation:**
   - Each test should be independent
   - Clean database state between tests
   - Don't rely on test execution order

4. **Error Testing:**
   - Test both success and error paths
   - Verify correct error types thrown
   - Verify error messages

---

## Acceptance Criteria

- [ ] Schemas file created with create/update/id schemas
- [ ] All schema validations working correctly
- [ ] Service file created with all 9 functions
- [ ] All functions accept database as first parameter
- [ ] UUID generation working for new students
- [ ] Timestamp management working (created_at, updated_at)
- [ ] Email uniqueness enforced
- [ ] Delete constraint checking working
- [ ] All unit tests passing (100% coverage)
- [ ] All functions properly typed
- [ ] No direct database imports (db passed as parameter)
- [ ] Error handling uses custom error classes
- [ ] All functions documented with JSDoc comments

---

## Usage Example

After completion, API routes will use the service like this:

```typescript
import { db } from '$lib/db';
import { getStudents, createStudent } from '$lib/features/students/services/student-service';
import { createStudentSchema } from '$lib/features/students/schemas';

// Get all students
const students = await getStudents(db);

// Create student
const input = createStudentSchema.parse({ name: 'John Doe', email: 'john@example.com' });
const newStudent = await createStudent(db, input);
```

---

## Notes

- Database instance passed as parameter enables easy mocking in tests
- All timestamps use ISO 8601 format
- Email comparisons should be case-insensitive
- UUIDs generated using `crypto.randomUUID()`
- Consider adding transaction support in future for complex operations
- Service layer should have no knowledge of HTTP/API concerns

---

## References

- [Kysely Query Builder](https://kysely.dev/docs/category/queries)
- [Zod Validation](https://zod.dev/)
- [UUID Generation](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)
- [ISO 8601 Timestamps](https://en.wikipedia.org/wiki/ISO_8601)
