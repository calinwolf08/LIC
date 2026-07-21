# Step 11: Clerkships - Service Layer

## Overview
Implement the service layer for clerkship management. Clerkships represent rotation types (e.g., Internal Medicine, Surgery) with specific duration requirements. This layer handles CRUD operations, validation, and business logic for clerkship types.

## Dependencies
- ✅ Step 01: Kysely Database Setup
- ✅ Step 02: Database Schema & Migrations
- ✅ Step 03: Shared Utilities & Test Helpers

## Requirements

### Database Operations
Implement CRUD operations for clerkships:
- Get all clerkships
- Get single clerkship by ID
- Create new clerkship
- Update existing clerkship
- Delete clerkship (with constraint checking)
- Get clerkships by specialty

### Business Rules
- Name must be unique across all clerkships
- required_days must be positive integer
- Specialty is required and cannot be empty
- Cannot delete clerkship if it has schedule assignments
- Description is optional

### Validation
- Zod schemas for create and update operations
- Name uniqueness validation
- required_days validation (positive integer)
- Specialty validation

## Implementation Details

### File Structure
```
/src/lib/features/clerkships/
├── services/
│   ├── clerkship-service.ts       # Service functions (NEW)
│   └── clerkship-service.test.ts  # Service tests (NEW)
└── schemas.ts                      # Zod schemas (NEW)
```

---

## Files to Create

### 1. `/src/lib/features/clerkships/schemas.ts`

Zod validation schemas for clerkship operations.

**Exports:**
```typescript
import { z } from 'zod';
import { nameSchema, uuidSchema, positiveIntSchema } from '$lib/validation/common-schemas';

export const specialtySchema = z.string().min(1, 'Specialty is required');

export const createClerkshipSchema = z.object({
  name: nameSchema,
  specialty: specialtySchema,
  required_days: positiveIntSchema,
  description: z.string().optional(),
});

export const updateClerkshipSchema = z.object({
  name: nameSchema.optional(),
  specialty: specialtySchema.optional(),
  required_days: positiveIntSchema.optional(),
  description: z.string().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const clerkshipIdSchema = z.object({
  id: uuidSchema,
});

export type CreateClerkshipInput = z.infer<typeof createClerkshipSchema>;
export type UpdateClerkshipInput = z.infer<typeof updateClerkshipSchema>;
```

**Requirements:**
- Use common schemas from shared validation utilities
- Export both schemas and TypeScript types
- required_days must be positive
- Include refinement for update (at least one field required)

---

### 2. `/src/lib/features/clerkships/services/clerkship-service.ts`

Service functions for clerkship database operations.

**Exports:**
```typescript
import type { Kysely } from 'kysely';
import type { Database, ClerkshipsTable } from '$lib/db/types';
import type { CreateClerkshipInput, UpdateClerkshipInput } from '../schemas';

export async function getClerkships(db: Kysely<Database>): Promise<ClerkshipsTable[]>

export async function getClerkshipById(
  db: Kysely<Database>,
  id: string
): Promise<ClerkshipsTable | null>

export async function getClerkshipsBySpecialty(
  db: Kysely<Database>,
  specialty: string
): Promise<ClerkshipsTable[]>

export async function getClerkshipByName(
  db: Kysely<Database>,
  name: string
): Promise<ClerkshipsTable | null>

export async function createClerkship(
  db: Kysely<Database>,
  data: CreateClerkshipInput
): Promise<ClerkshipsTable>

export async function updateClerkship(
  db: Kysely<Database>,
  id: string,
  data: UpdateClerkshipInput
): Promise<ClerkshipsTable>

export async function deleteClerkship(
  db: Kysely<Database>,
  id: string
): Promise<void>

export async function canDeleteClerkship(
  db: Kysely<Database>,
  id: string
): Promise<boolean>

export async function clerkshipExists(
  db: Kysely<Database>,
  id: string
): Promise<boolean>

export async function isNameTaken(
  db: Kysely<Database>,
  name: string,
  excludeId?: string
): Promise<boolean>
```

**Requirements:**
- All functions accept database instance as first parameter
- Use Kysely type-safe queries
- Throw appropriate errors (NotFoundError, ConflictError)
- Generate UUIDs for new clerkships
- Set timestamps (created_at, updated_at)

---

## Business Logic Functions

### 1. `getClerkships(db: Kysely<Database>): Promise<ClerkshipsTable[]>`

Retrieve all clerkships from database.

**Logic:**
- Query all clerkships from clerkships table
- Order by name alphabetically
- Return array of clerkships (empty array if none)

**Returns:** Array of all clerkships

**Errors:** None (returns empty array if no clerkships)

**Example:**
```typescript
const clerkships = await getClerkships(db);
// [{ id: '...', name: 'Internal Medicine', specialty: 'Internal Medicine', required_days: 28, ... }]
```

---

### 2. `getClerkshipById(db: Kysely<Database>, id: string): Promise<ClerkshipsTable | null>`

Retrieve single clerkship by ID.

**Logic:**
- Query clerkship by ID
- Return clerkship if found, null if not found

**Parameters:**
- `id`: Clerkship UUID

**Returns:** Clerkship object or null

**Errors:** None (returns null if not found)

**Example:**
```typescript
const clerkship = await getClerkshipById(db, '123-456-789');
if (!clerkship) {
  throw new NotFoundError('Clerkship');
}
```

---

### 3. `getClerkshipsBySpecialty(db: Kysely<Database>, specialty: string): Promise<ClerkshipsTable[]>`

Retrieve all clerkships for a specific medical specialty.

**Logic:**
- Query clerkships by specialty
- Case-sensitive match
- Order by name alphabetically
- Return array of matching clerkships

**Parameters:**
- `specialty`: Medical specialty (e.g., "Internal Medicine")

**Returns:** Array of clerkships with matching specialty

**Errors:** None (returns empty array if no matches)

**Example:**
```typescript
const clerkships = await getClerkshipsBySpecialty(db, 'Internal Medicine');
```

---

### 4. `getClerkshipByName(db: Kysely<Database>, name: string): Promise<ClerkshipsTable | null>`

Retrieve clerkship by name.

**Logic:**
- Query clerkship by name (case-insensitive)
- Return clerkship if found, null if not found

**Parameters:**
- `name`: Clerkship name

**Returns:** Clerkship object or null

**Errors:** None

**Example:**
```typescript
const clerkship = await getClerkshipByName(db, 'Internal Medicine');
```

---

### 5. `createClerkship(db: Kysely<Database>, data: CreateClerkshipInput): Promise<ClerkshipsTable>`

Create new clerkship.

**Logic:**
1. Check if name is already taken
2. Throw ConflictError if name exists
3. Generate UUID for new clerkship
4. Set created_at and updated_at timestamps
5. Insert clerkship into database
6. Return created clerkship

**Parameters:**
- `data`: Object with name, specialty, required_days, and optional description

**Returns:** Created clerkship object

**Errors:**
- `ConflictError`: Name already exists

**Example:**
```typescript
const clerkship = await createClerkship(db, {
  name: 'Internal Medicine',
  specialty: 'Internal Medicine',
  required_days: 28,
  description: 'Four-week internal medicine rotation'
});
```

---

### 6. `updateClerkship(db: Kysely<Database>, id: string, data: UpdateClerkshipInput): Promise<ClerkshipsTable>`

Update existing clerkship.

**Logic:**
1. Check if clerkship exists
2. Throw NotFoundError if not found
3. If name is being updated, check if new name is taken
4. Throw ConflictError if name is taken by another clerkship
5. Update updated_at timestamp
6. Update clerkship in database
7. Return updated clerkship

**Parameters:**
- `id`: Clerkship UUID
- `data`: Object with optional name, specialty, required_days, and/or description

**Returns:** Updated clerkship object

**Errors:**
- `NotFoundError`: Clerkship not found
- `ConflictError`: Name already exists

**Example:**
```typescript
const updated = await updateClerkship(db, '123-456-789', {
  required_days: 56,
  description: 'Eight-week internal medicine rotation'
});
```

---

### 7. `deleteClerkship(db: Kysely<Database>, id: string): Promise<void>`

Delete clerkship.

**Logic:**
1. Check if clerkship exists
2. Throw NotFoundError if not found
3. Check if clerkship can be deleted (no assignments)
4. Throw ConflictError if clerkship has assignments
5. Delete clerkship from database

**Parameters:**
- `id`: Clerkship UUID

**Returns:** void

**Errors:**
- `NotFoundError`: Clerkship not found
- `ConflictError`: Clerkship has schedule assignments

**Example:**
```typescript
await deleteClerkship(db, '123-456-789');
```

---

### 8. `canDeleteClerkship(db: Kysely<Database>, id: string): Promise<boolean>`

Check if clerkship can be deleted (has no assignments).

**Logic:**
- Query schedule_assignments table for clerkship_id
- Return false if any assignments exist
- Return true if no assignments

**Parameters:**
- `id`: Clerkship UUID

**Returns:** Boolean indicating if deletion is allowed

**Errors:** None

**Example:**
```typescript
const canDelete = await canDeleteClerkship(db, '123-456-789');
if (!canDelete) {
  throw new ConflictError('Cannot delete clerkship with existing schedule assignments');
}
```

---

### 9. `clerkshipExists(db: Kysely<Database>, id: string): Promise<boolean>`

Check if clerkship exists.

**Logic:**
- Query clerkship by ID
- Return true if found, false if not

**Parameters:**
- `id`: Clerkship UUID

**Returns:** Boolean

**Errors:** None

**Example:**
```typescript
if (!await clerkshipExists(db, '123-456-789')) {
  throw new NotFoundError('Clerkship');
}
```

---

### 10. `isNameTaken(db: Kysely<Database>, name: string, excludeId?: string): Promise<boolean>`

Check if clerkship name is already in use.

**Logic:**
- Query clerkships by name (case-insensitive)
- If excludeId provided, exclude that clerkship from check (for updates)
- Return true if name exists, false if not

**Parameters:**
- `name`: Clerkship name to check
- `excludeId`: Optional clerkship ID to exclude from check

**Returns:** Boolean

**Errors:** None

**Example:**
```typescript
// Check if name is available
const taken = await isNameTaken(db, 'Internal Medicine');

// Check if name is taken by another clerkship (for updates)
const takenByOther = await isNameTaken(db, 'Internal Medicine', currentClerkshipId);
```

---

## Testing Requirements

### Unit Tests

#### `/src/lib/features/clerkships/schemas.test.ts`

**Schema Validation Tests:**
- ✅ createClerkshipSchema validates valid input
- ✅ createClerkshipSchema requires name
- ✅ createClerkshipSchema requires specialty
- ✅ createClerkshipSchema requires required_days
- ✅ createClerkshipSchema validates required_days is positive
- ✅ createClerkshipSchema allows optional description
- ✅ updateClerkshipSchema allows optional fields
- ✅ updateClerkshipSchema requires at least one field
- ✅ clerkshipIdSchema validates UUID format

---

#### `/src/lib/features/clerkships/services/clerkship-service.test.ts`

**Service Function Tests:**

**getClerkships():**
- ✅ Returns all clerkships
- ✅ Returns empty array when no clerkships
- ✅ Returns clerkships ordered by name

**getClerkshipById():**
- ✅ Returns clerkship when found
- ✅ Returns null when not found
- ✅ Returns correct clerkship data

**getClerkshipsBySpecialty():**
- ✅ Returns clerkships matching specialty
- ✅ Returns empty array when no matches
- ✅ Case-sensitive specialty matching
- ✅ Returns clerkships ordered by name

**getClerkshipByName():**
- ✅ Returns clerkship when found
- ✅ Returns null when not found
- ✅ Case-insensitive name matching

**createClerkship():**
- ✅ Creates clerkship with valid data
- ✅ Generates UUID for new clerkship
- ✅ Sets created_at and updated_at timestamps
- ✅ Throws ConflictError if name already exists
- ✅ Returns created clerkship with all fields
- ✅ Creates clerkship with optional description

**updateClerkship():**
- ✅ Updates clerkship name
- ✅ Updates clerkship specialty
- ✅ Updates clerkship required_days
- ✅ Updates clerkship description
- ✅ Updates multiple fields at once
- ✅ Updates updated_at timestamp
- ✅ Throws NotFoundError if clerkship not found
- ✅ Throws ConflictError if new name is taken
- ✅ Allows keeping same name
- ✅ Returns updated clerkship

**deleteClerkship():**
- ✅ Deletes clerkship successfully
- ✅ Throws NotFoundError if clerkship not found
- ✅ Throws ConflictError if clerkship has assignments
- ✅ Actually removes clerkship from database

**canDeleteClerkship():**
- ✅ Returns true when clerkship has no assignments
- ✅ Returns false when clerkship has assignments

**clerkshipExists():**
- ✅ Returns true when clerkship exists
- ✅ Returns false when clerkship doesn't exist

**isNameTaken():**
- ✅ Returns true when name exists
- ✅ Returns false when name doesn't exist
- ✅ Case-insensitive name check
- ✅ Excludes clerkship when excludeId provided

---

### Testing Strategy

1. **Use Test Database:**
   - Create test DB using `createTestDb()` from test helpers
   - Reset database before each test
   - Close database after all tests

2. **Mock Data:**
   - Use `createMockClerkship()` from fixtures
   - Create clerkships with known data for assertions
   - Test multiple specialties

3. **Test Isolation:**
   - Each test should be independent
   - Clean database state between tests
   - Don't rely on test execution order

4. **Constraint Testing:**
   - Verify name uniqueness enforcement
   - Test required_days validation
   - Verify assignment constraint on delete

---

## Acceptance Criteria

- [ ] Schemas file created with create/update/id schemas
- [ ] All schema validations working correctly
- [ ] Service file created with all 10 functions
- [ ] All functions accept database as first parameter
- [ ] UUID generation working for new clerkships
- [ ] Timestamp management working (created_at, updated_at)
- [ ] Name uniqueness enforced
- [ ] Specialty filtering working
- [ ] Delete constraint checking working
- [ ] All unit tests passing (100% coverage)
- [ ] All functions properly typed
- [ ] No direct database imports (db passed as parameter)
- [ ] Error handling uses custom error classes

---

## Usage Example

After completion, API routes will use the service like this:

```typescript
import { db } from '$lib/db';
import { getClerkships, createClerkship, getClerkshipsBySpecialty } from '$lib/features/clerkships/services/clerkship-service';
import { createClerkshipSchema } from '$lib/features/clerkships/schemas';

// Get all clerkships
const clerkships = await getClerkships(db);

// Get clerkships by specialty
const internalMedClerkships = await getClerkshipsBySpecialty(db, 'Internal Medicine');

// Create clerkship
const input = createClerkshipSchema.parse({
  name: 'Internal Medicine',
  specialty: 'Internal Medicine',
  required_days: 28,
  description: 'Four-week rotation'
});
const newClerkship = await createClerkship(db, input);
```

---

## Notes

- Name uniqueness prevents duplicate rotation types
- required_days represents minimum days for completion
- Specialty should match preceptor specialties for assignment logic
- Consider specialty enum/select options (future enhancement)
- Description field provides additional context for users
- Future: Add color coding for calendar display

---

## References

- [Kysely Query Builder](https://kysely.dev/docs/category/queries)
- [Zod Validation](https://zod.dev/)
- [Medical Clerkship Overview](https://en.wikipedia.org/wiki/Medical_school#Clinical_clerkships)
