# Step 07: Preceptors - Service Layer

## Overview
Implement the service layer for preceptor management, including CRUD operations, validation, and business logic. Preceptors are clinical supervisors who teach students in specific medical specialties.

## Dependencies
- ✅ Step 01: Kysely Database Setup
- ✅ Step 02: Database Schema & Migrations
- ✅ Step 03: Shared Utilities & Test Helpers

## Requirements

### Database Operations
Implement CRUD operations for preceptors:
- Get all preceptors
- Get single preceptor by ID
- Create new preceptor
- Update existing preceptor
- Delete preceptor (with constraint checking)
- Filter preceptors by specialty

### Business Rules
- Email must be unique across all preceptors
- Specialty is required and cannot be empty
- max_students defaults to 1 (MVP constraint)
- Cannot delete preceptor if they have schedule assignments
- Preceptor name and email are required

### Validation
- Zod schemas for create and update operations
- Email format validation
- Name and specialty validation
- max_students must be positive integer

## Implementation Details

### File Structure
```
/src/lib/features/preceptors/
├── services/
│   ├── preceptor-service.ts       # Service functions (NEW)
│   └── preceptor-service.test.ts  # Service tests (NEW)
└── schemas.ts                      # Zod schemas (NEW)
```

---

## Files to Create

### 1. `/src/lib/features/preceptors/schemas.ts`

Zod validation schemas for preceptor operations.

**Exports:**
```typescript
import { z } from 'zod';
import { emailSchema, nameSchema, uuidSchema, positiveIntSchema } from '$lib/validation/common-schemas';

export const specialtySchema = z.string().min(1, 'Specialty is required');

export const createPreceptorSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  specialty: specialtySchema,
  max_students: positiveIntSchema.default(1),
});

export const updatePreceptorSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  specialty: specialtySchema.optional(),
  max_students: positiveIntSchema.optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const preceptorIdSchema = z.object({
  id: uuidSchema,
});

export type CreatePreceptorInput = z.infer<typeof createPreceptorSchema>;
export type UpdatePreceptorInput = z.infer<typeof updatePreceptorSchema>;
```

**Requirements:**
- Use common schemas from shared validation utilities
- Export both schemas and TypeScript types
- Default max_students to 1
- Specialty must be non-empty string
- Include refinement for update (at least one field required)

---

### 2. `/src/lib/features/preceptors/services/preceptor-service.ts`

Service functions for preceptor database operations.

**Exports:**
```typescript
import type { Kysely } from 'kysely';
import type { Database, PreceptorsTable } from '$lib/db/types';
import type { CreatePreceptorInput, UpdatePreceptorInput } from '../schemas';

export async function getPreceptors(db: Kysely<Database>): Promise<PreceptorsTable[]>

export async function getPreceptorById(
  db: Kysely<Database>,
  id: string
): Promise<PreceptorsTable | null>

export async function getPreceptorsBySpecialty(
  db: Kysely<Database>,
  specialty: string
): Promise<PreceptorsTable[]>

export async function getPreceptorByEmail(
  db: Kysely<Database>,
  email: string
): Promise<PreceptorsTable | null>

export async function createPreceptor(
  db: Kysely<Database>,
  data: CreatePreceptorInput
): Promise<PreceptorsTable>

export async function updatePreceptor(
  db: Kysely<Database>,
  id: string,
  data: UpdatePreceptorInput
): Promise<PreceptorsTable>

export async function deletePreceptor(
  db: Kysely<Database>,
  id: string
): Promise<void>

export async function canDeletePreceptor(
  db: Kysely<Database>,
  id: string
): Promise<boolean>

export async function preceptorExists(
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
- All functions accept database instance as first parameter
- Use Kysely type-safe queries
- Throw appropriate errors (NotFoundError, ConflictError)
- Generate UUIDs for new preceptors
- Set timestamps (created_at, updated_at)
- All functions are pure and testable

---

## Business Logic Functions

### 1. `getPreceptors(db: Kysely<Database>): Promise<PreceptorsTable[]>`

Retrieve all preceptors from database.

**Logic:**
- Query all preceptors from preceptors table
- Order by name alphabetically
- Return array of preceptors (empty array if none)

**Returns:** Array of all preceptors

**Errors:** None (returns empty array if no preceptors)

**Example:**
```typescript
const preceptors = await getPreceptors(db);
// [{ id: '...', name: 'Dr. Smith', email: 'smith@example.com', specialty: 'Internal Medicine', max_students: 1, ... }]
```

---

### 2. `getPreceptorById(db: Kysely<Database>, id: string): Promise<PreceptorsTable | null>`

Retrieve single preceptor by ID.

**Logic:**
- Query preceptor by ID
- Return preceptor if found, null if not found

**Parameters:**
- `id`: Preceptor UUID

**Returns:** Preceptor object or null

**Errors:** None (returns null if not found)

**Example:**
```typescript
const preceptor = await getPreceptorById(db, '123-456-789');
if (!preceptor) {
  throw new NotFoundError('Preceptor');
}
```

---

### 3. `getPreceptorsBySpecialty(db: Kysely<Database>, specialty: string): Promise<PreceptorsTable[]>`

Retrieve all preceptors with a specific medical specialty.

**Logic:**
- Query preceptors by specialty
- Case-sensitive match
- Order by name alphabetically
- Return array of matching preceptors

**Parameters:**
- `specialty`: Medical specialty (e.g., "Internal Medicine")

**Returns:** Array of preceptors with matching specialty

**Errors:** None (returns empty array if no matches)

**Example:**
```typescript
const preceptors = await getPreceptorsBySpecialty(db, 'Internal Medicine');
```

---

### 4. `getPreceptorByEmail(db: Kysely<Database>, email: string): Promise<PreceptorsTable | null>`

Retrieve preceptor by email address.

**Logic:**
- Query preceptor by email (case-insensitive)
- Return preceptor if found, null if not found

**Parameters:**
- `email`: Preceptor email address

**Returns:** Preceptor object or null

**Errors:** None

**Example:**
```typescript
const preceptor = await getPreceptorByEmail(db, 'smith@example.com');
```

---

### 5. `createPreceptor(db: Kysely<Database>, data: CreatePreceptorInput): Promise<PreceptorsTable>`

Create new preceptor.

**Logic:**
1. Check if email is already taken
2. Throw ConflictError if email exists
3. Generate UUID for new preceptor
4. Set max_students to 1 (default, MVP constraint)
5. Set created_at and updated_at timestamps
6. Insert preceptor into database
7. Return created preceptor

**Parameters:**
- `data`: Object with name, email, specialty, and optional max_students

**Returns:** Created preceptor object

**Errors:**
- `ConflictError`: Email already exists

**Example:**
```typescript
const preceptor = await createPreceptor(db, {
  name: 'Dr. John Smith',
  email: 'smith@example.com',
  specialty: 'Internal Medicine',
  max_students: 1,
});
```

---

### 6. `updatePreceptor(db: Kysely<Database>, id: string, data: UpdatePreceptorInput): Promise<PreceptorsTable>`

Update existing preceptor.

**Logic:**
1. Check if preceptor exists
2. Throw NotFoundError if not found
3. If email is being updated, check if new email is taken
4. Throw ConflictError if email is taken by another preceptor
5. Update updated_at timestamp
6. Update preceptor in database
7. Return updated preceptor

**Parameters:**
- `id`: Preceptor UUID
- `data`: Object with optional name, email, specialty, and/or max_students

**Returns:** Updated preceptor object

**Errors:**
- `NotFoundError`: Preceptor not found
- `ConflictError`: Email already exists

**Example:**
```typescript
const updated = await updatePreceptor(db, '123-456-789', {
  specialty: 'Cardiology',
});
```

---

### 7. `deletePreceptor(db: Kysely<Database>, id: string): Promise<void>`

Delete preceptor.

**Logic:**
1. Check if preceptor exists
2. Throw NotFoundError if not found
3. Check if preceptor can be deleted (no assignments)
4. Throw ConflictError if preceptor has assignments
5. Delete preceptor from database
6. Note: Cascading delete will remove preceptor_availability records

**Parameters:**
- `id`: Preceptor UUID

**Returns:** void

**Errors:**
- `NotFoundError`: Preceptor not found
- `ConflictError`: Preceptor has schedule assignments

**Example:**
```typescript
await deletePreceptor(db, '123-456-789');
```

---

### 8. `canDeletePreceptor(db: Kysely<Database>, id: string): Promise<boolean>`

Check if preceptor can be deleted (has no assignments).

**Logic:**
- Query schedule_assignments table for preceptor_id
- Return false if any assignments exist
- Return true if no assignments

**Parameters:**
- `id`: Preceptor UUID

**Returns:** Boolean indicating if deletion is allowed

**Errors:** None

**Example:**
```typescript
const canDelete = await canDeletePreceptor(db, '123-456-789');
if (!canDelete) {
  throw new ConflictError('Cannot delete preceptor with existing schedule assignments');
}
```

---

### 9. `preceptorExists(db: Kysely<Database>, id: string): Promise<boolean>`

Check if preceptor exists.

**Logic:**
- Query preceptor by ID
- Return true if found, false if not

**Parameters:**
- `id`: Preceptor UUID

**Returns:** Boolean

**Errors:** None

**Example:**
```typescript
if (!await preceptorExists(db, '123-456-789')) {
  throw new NotFoundError('Preceptor');
}
```

---

### 10. `isEmailTaken(db: Kysely<Database>, email: string, excludeId?: string): Promise<boolean>`

Check if email is already in use by another preceptor.

**Logic:**
- Query preceptors by email (case-insensitive)
- If excludeId provided, exclude that preceptor from check (for updates)
- Return true if email exists, false if not

**Parameters:**
- `email`: Email to check
- `excludeId`: Optional preceptor ID to exclude from check

**Returns:** Boolean

**Errors:** None

**Example:**
```typescript
// Check if email is available
const taken = await isEmailTaken(db, 'test@example.com');

// Check if email is taken by another preceptor (for updates)
const takenByOther = await isEmailTaken(db, 'test@example.com', currentPreceptorId);
```

---

## Testing Requirements

### Unit Tests

#### `/src/lib/features/preceptors/schemas.test.ts`

**Schema Validation Tests:**
- ✅ createPreceptorSchema validates valid input
- ✅ createPreceptorSchema requires name
- ✅ createPreceptorSchema requires email
- ✅ createPreceptorSchema requires specialty
- ✅ createPreceptorSchema validates email format
- ✅ createPreceptorSchema validates name length
- ✅ createPreceptorSchema defaults max_students to 1
- ✅ createPreceptorSchema validates max_students is positive
- ✅ updatePreceptorSchema allows optional fields
- ✅ updatePreceptorSchema requires at least one field
- ✅ preceptorIdSchema validates UUID format

---

#### `/src/lib/features/preceptors/services/preceptor-service.test.ts`

**Service Function Tests:**

**getPreceptors():**
- ✅ Returns all preceptors
- ✅ Returns empty array when no preceptors
- ✅ Returns preceptors ordered by name

**getPreceptorById():**
- ✅ Returns preceptor when found
- ✅ Returns null when not found
- ✅ Returns correct preceptor data

**getPreceptorsBySpecialty():**
- ✅ Returns preceptors matching specialty
- ✅ Returns empty array when no matches
- ✅ Case-sensitive specialty matching
- ✅ Returns preceptors ordered by name

**getPreceptorByEmail():**
- ✅ Returns preceptor when found
- ✅ Returns null when not found
- ✅ Case-insensitive email matching

**createPreceptor():**
- ✅ Creates preceptor with valid data
- ✅ Generates UUID for new preceptor
- ✅ Sets created_at and updated_at timestamps
- ✅ Defaults max_students to 1
- ✅ Throws ConflictError if email already exists
- ✅ Returns created preceptor with all fields

**updatePreceptor():**
- ✅ Updates preceptor name
- ✅ Updates preceptor email
- ✅ Updates preceptor specialty
- ✅ Updates preceptor max_students
- ✅ Updates multiple fields at once
- ✅ Updates updated_at timestamp
- ✅ Throws NotFoundError if preceptor not found
- ✅ Throws ConflictError if new email is taken
- ✅ Allows keeping same email
- ✅ Returns updated preceptor

**deletePreceptor():**
- ✅ Deletes preceptor successfully
- ✅ Throws NotFoundError if preceptor not found
- ✅ Throws ConflictError if preceptor has assignments
- ✅ Actually removes preceptor from database
- ✅ Cascades delete to preceptor_availability

**canDeletePreceptor():**
- ✅ Returns true when preceptor has no assignments
- ✅ Returns false when preceptor has assignments

**preceptorExists():**
- ✅ Returns true when preceptor exists
- ✅ Returns false when preceptor doesn't exist

**isEmailTaken():**
- ✅ Returns true when email exists
- ✅ Returns false when email doesn't exist
- ✅ Case-insensitive email check
- ✅ Excludes preceptor when excludeId provided

---

### Testing Strategy

1. **Use Test Database:**
   - Create test DB using `createTestDb()` from test helpers
   - Reset database before each test
   - Close database after all tests

2. **Mock Data:**
   - Use `createMockPreceptor()` from fixtures
   - Create preceptors with known data for assertions
   - Test multiple specialties

3. **Test Isolation:**
   - Each test should be independent
   - Clean database state between tests
   - Don't rely on test execution order

4. **Cascade Testing:**
   - Verify availability records deleted when preceptor deleted
   - Test constraint enforcement (RESTRICT on assignments)

---

## Acceptance Criteria

- [ ] Schemas file created with create/update/id schemas
- [ ] All schema validations working correctly
- [ ] Service file created with all 10 functions
- [ ] All functions accept database as first parameter
- [ ] UUID generation working for new preceptors
- [ ] Timestamp management working (created_at, updated_at)
- [ ] Email uniqueness enforced
- [ ] Specialty filtering working
- [ ] Delete constraint checking working
- [ ] Cascade delete to availability working
- [ ] All unit tests passing (100% coverage)
- [ ] All functions properly typed
- [ ] No direct database imports (db passed as parameter)
- [ ] Error handling uses custom error classes

---

## Usage Example

After completion, API routes will use the service like this:

```typescript
import { db } from '$lib/db';
import { getPreceptors, createPreceptor, getPreceptorsBySpecialty } from '$lib/features/preceptors/services/preceptor-service';
import { createPreceptorSchema } from '$lib/features/preceptors/schemas';

// Get all preceptors
const preceptors = await getPreceptors(db);

// Get preceptors by specialty
const internists = await getPreceptorsBySpecialty(db, 'Internal Medicine');

// Create preceptor
const input = createPreceptorSchema.parse({
  name: 'Dr. Smith',
  email: 'smith@example.com',
  specialty: 'Internal Medicine',
});
const newPreceptor = await createPreceptor(db, input);
```

---

## Notes

- max_students defaults to 1 for MVP (future: allow customization)
- Specialty should eventually be enum/select options (future enhancement)
- Consider specialty normalization to prevent typos
- Deleting preceptor cascades to availability (ON DELETE CASCADE)
- Deleting preceptor with assignments is restricted (ON DELETE RESTRICT)
- Case-insensitive email comparisons prevent duplicates

---

## References

- [Kysely Query Builder](https://kysely.dev/docs/category/queries)
- [Zod Validation](https://zod.dev/)
- [Cascading Deletes in SQLite](https://www.sqlite.org/foreignkeys.html#fk_actions)
