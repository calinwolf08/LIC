# Contact Fields Design Document

**Status:** Design Phase
**Priority:** Medium (Phase 2)
**Last Updated:** 2025-11-24

---

## Overview

Add optional contact information fields to Students, Preceptors, and Sites to enable better communication and coordination.

---

## Schema Changes

### Students Table

**New Columns:**
```typescript
interface Student {
  // ... existing fields
  email: string;                 // Already exists (required)
  phone: string | null;          // NEW: Optional phone number
}
```

### Preceptors Table

**New Columns:**
```typescript
interface Preceptor {
  // ... existing fields
  email: string;                 // Already exists (required)
  phone: string | null;          // NEW: Optional phone number
}
```

### Sites Table

**New Columns:**
```typescript
interface Site {
  // ... existing fields
  address: string | null;        // NEW: Physical address
  office_phone: string | null;   // NEW: Main office phone
  contact_person: string | null; // NEW: Primary contact name
  contact_email: string | null;  // NEW: Contact email address
}
```

---

## Database Migration

### Migration: `014_add_contact_fields.ts`

```typescript
import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Add phone to students
  await db.schema
    .alterTable('students')
    .addColumn('phone', 'text')
    .execute();

  // Add phone to preceptors
  await db.schema
    .alterTable('preceptors')
    .addColumn('phone', 'text')
    .execute();

  // Add contact fields to sites
  await db.schema
    .alterTable('sites')
    .addColumn('address', 'text')
    .addColumn('office_phone', 'text')
    .addColumn('contact_person', 'text')
    .addColumn('contact_email', 'text')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('students').dropColumn('phone').execute();
  await db.schema.alterTable('preceptors').dropColumn('phone').execute();

  await db.schema
    .alterTable('sites')
    .dropColumn('address')
    .dropColumn('office_phone')
    .dropColumn('contact_person')
    .dropColumn('contact_email')
    .execute();
}
```

---

## Validation Schemas

### Student Schema Updates

```typescript
// src/lib/features/students/schemas.ts
import { z } from 'zod';

const phoneSchema = z
  .string()
  .regex(/^[\d\s\-\(\)\+\.]+$/, 'Invalid phone number format')
  .min(10, 'Phone number must be at least 10 digits')
  .max(20, 'Phone number too long')
  .optional()
  .or(z.literal(''));

export const createStudentSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,        // NEW
  cohort: cohortSchema.optional()
});

export const updateStudentSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,        // NEW
  cohort: cohortSchema.optional()
});
```

### Preceptor Schema Updates

```typescript
// src/lib/features/preceptors/schemas.ts
import { z } from 'zod';

export const createPreceptorSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,        // NEW
  specialty: specialtySchema,
  health_system_id: uuidSchema,
  site_id: uuidSchema.optional(),
  max_students: maxStudentsSchema
});

export const updatePreceptorSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,        // NEW
  specialty: specialtySchema.optional(),
  health_system_id: uuidSchema.optional(),
  site_id: uuidSchema.optional(),
  max_students: maxStudentsSchema.optional()
});
```

### Site Schema Updates

```typescript
// src/lib/features/sites/schemas.ts (or wherever sites are defined)
import { z } from 'zod';

const addressSchema = z
  .string()
  .max(500, 'Address too long')
  .optional()
  .or(z.literal(''));

const contactPersonSchema = z
  .string()
  .max(200, 'Name too long')
  .optional()
  .or(z.literal(''));

export const createSiteSchema = z.object({
  name: nameSchema,
  health_system_id: uuidSchema.optional(),
  address: addressSchema,              // NEW
  office_phone: phoneSchema,           // NEW
  contact_person: contactPersonSchema, // NEW
  contact_email: emailSchema.optional() // NEW
});

export const updateSiteSchema = z.object({
  name: nameSchema.optional(),
  health_system_id: uuidSchema.optional(),
  address: addressSchema,              // NEW
  office_phone: phoneSchema,           // NEW
  contact_person: contactPersonSchema, // NEW
  contact_email: emailSchema.optional() // NEW
});
```

---

## Service Layer Updates

### Student Service

```typescript
// src/lib/features/students/services/student-service.ts

export async function createStudent(
  db: Kysely<DB>,
  accountId: string,
  data: CreateStudentInput
): Promise<Selectable<Students>> {
  const timestamp = new Date().toISOString();
  const newStudent = {
    id: crypto.randomUUID(),
    account_id: accountId,
    name: data.name,
    email: data.email,
    phone: data.phone || null,        // NEW
    cohort: data.cohort || null,
    created_at: timestamp,
    updated_at: timestamp
  };

  return await db
    .insertInto('students')
    .values(newStudent)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateStudent(
  db: Kysely<DB>,
  accountId: string,
  id: string,
  data: UpdateStudentInput
): Promise<Selectable<Students>> {
  const updates: any = {
    updated_at: new Date().toISOString()
  };

  if (data.name !== undefined) updates.name = data.name;
  if (data.email !== undefined) updates.email = data.email;
  if (data.phone !== undefined) updates.phone = data.phone || null; // NEW
  if (data.cohort !== undefined) updates.cohort = data.cohort;

  return await db
    .updateTable('students')
    .set(updates)
    .where('id', '=', id)
    .where('account_id', '=', accountId)
    .returningAll()
    .executeTakeFirstOrThrow();
}
```

### Preceptor Service

Similar updates to `preceptor-service.ts` to handle `phone` field.

### Site Service

Similar updates to site service to handle `address`, `office_phone`, `contact_person`, and `contact_email`.

---

## UI Changes

### Student Form

**Location:** `src/routes/(app)/students/[id]/edit/+page.svelte` or student creation form

```svelte
<form>
  <!-- Existing fields -->
  <input type="text" name="name" required />
  <input type="email" name="email" required />

  <!-- NEW: Phone field -->
  <label>
    Phone (optional)
    <input
      type="tel"
      name="phone"
      placeholder="+1 (555) 123-4567"
      pattern="[\d\s\-\(\)\+\.]+"
    />
  </label>

  <input type="text" name="cohort" />

  <button type="submit">Save</button>
</form>
```

### Preceptor Form

Similar addition of phone field to preceptor creation/edit forms.

### Site Form

**Location:** Site creation/edit form

```svelte
<form>
  <!-- Existing fields -->
  <input type="text" name="name" required />
  <select name="health_system_id">...</select>

  <!-- NEW: Contact fields -->
  <fieldset>
    <legend>Contact Information</legend>

    <label>
      Address (optional)
      <textarea
        name="address"
        placeholder="123 Main St, City, State ZIP"
        maxlength="500"
      ></textarea>
    </label>

    <label>
      Office Phone (optional)
      <input
        type="tel"
        name="office_phone"
        placeholder="+1 (555) 123-4567"
      />
    </label>

    <label>
      Contact Person (optional)
      <input
        type="text"
        name="contact_person"
        placeholder="Dr. Jane Smith"
        maxlength="200"
      />
    </label>

    <label>
      Contact Email (optional)
      <input
        type="email"
        name="contact_email"
        placeholder="contact@site.com"
      />
    </label>
  </fieldset>

  <button type="submit">Save</button>
</form>
```

### Display Views

Update detail/list views to display contact information:

**Student Detail Page:**
```svelte
<dl>
  <dt>Name:</dt>
  <dd>{student.name}</dd>

  <dt>Email:</dt>
  <dd><a href="mailto:{student.email}">{student.email}</a></dd>

  {#if student.phone}
    <dt>Phone:</dt>
    <dd><a href="tel:{student.phone}">{student.phone}</a></dd>
  {/if}

  <dt>Cohort:</dt>
  <dd>{student.cohort || 'N/A'}</dd>
</dl>
```

Similar patterns for preceptor and site detail pages.

---

## API Response Format

### Student Response

```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1 (555) 123-4567",
    "cohort": "2024",
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z"
  }
}
```

### Site Response

```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "Main Campus",
    "health_system_id": "uuid-here",
    "address": "123 Main St, City, State 12345",
    "office_phone": "+1 (555) 123-4567",
    "contact_person": "Dr. Jane Smith",
    "contact_email": "jane@hospital.com",
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z"
  }
}
```

---

## Testing Updates

### Unit Tests

Update service tests to include new fields:

```typescript
describe('createStudent', () => {
  it('should create student with phone', async () => {
    const studentData = {
      name: 'Test Student',
      email: 'test@example.com',
      phone: '+1 (555) 123-4567',
      cohort: '2024'
    };

    const student = await createStudent(db, accountId, studentData);

    expect(student.phone).toBe('+1 (555) 123-4567');
  });

  it('should create student without phone', async () => {
    const studentData = {
      name: 'Test Student',
      email: 'test@example.com',
      cohort: '2024'
    };

    const student = await createStudent(db, accountId, studentData);

    expect(student.phone).toBeNull();
  });
});
```

### E2E Tests

Update API tests:

```typescript
test('should create student with phone number', async ({ request }) => {
  const api = createApiClient(request);

  const studentData = fixtures.student({
    phone: '+1 (555) 123-4567'
  });

  const response = await api.post('/api/students', studentData);
  const student = await api.expectData(response, 201);

  expect(student.phone).toBe('+1 (555) 123-4567');
});
```

---

## Implementation Checklist

### Phase 1: Database & Schema
- [ ] Create migration `014_add_contact_fields.ts`
- [ ] Run migration
- [ ] Update TypeScript types (`npm run db:types`)

### Phase 2: Validation
- [ ] Add `phoneSchema` to common schemas
- [ ] Update student schemas
- [ ] Update preceptor schemas
- [ ] Create/update site schemas

### Phase 3: Service Layer
- [ ] Update student service (create/update)
- [ ] Update preceptor service (create/update)
- [ ] Update site service (create/update)
- [ ] Update unit tests

### Phase 4: UI
- [ ] Update student creation form
- [ ] Update student edit form
- [ ] Update student detail page
- [ ] Update preceptor creation form
- [ ] Update preceptor edit form
- [ ] Update preceptor detail page
- [ ] Create/update site creation form
- [ ] Create/update site edit form
- [ ] Create/update site detail page

### Phase 5: Testing
- [ ] Add unit tests for phone validation
- [ ] Update E2E tests for student API
- [ ] Update E2E tests for preceptor API
- [ ] Update E2E tests for site API

---

## Phone Number Format

### Accepted Formats

The phone validation allows flexible formats:
- `+1 (555) 123-4567`
- `555-123-4567`
- `5551234567`
- `+44 20 7123 4567` (international)

### Storage

Store as-entered (no normalization). Display formatting can be handled client-side if needed.

---

## Future Enhancements

1. **SMS Notifications:**
   - Send schedule reminders via SMS
   - Require phone verification

2. **Multiple Contact Methods:**
   - Personal vs work email/phone
   - Emergency contacts for students

3. **International Phone Support:**
   - Country code dropdowns
   - Format validation per country

4. **Contact Preferences:**
   - Preferred contact method
   - Do not contact flags

---

## Related Documents

- `DESIGN_MULTI_TENANCY.md` - Account isolation for contact data
- `DESIGN_DASHBOARDS.md` - Display contact information in dashboards
