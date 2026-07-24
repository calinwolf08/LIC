# Step 02: Database Schema & Migrations

## Overview
Design and implement the complete database schema for the LIC Scheduling App. This includes tables for students, preceptors, availability, clerkships, blackout dates, and schedule assignments with proper relationships and constraints.

## Dependencies
- ✅ Step 01: Kysely Database Setup (must be completed first)
- ✅ SQLite database and better-sqlite3 installed
- ✅ Kysely migration system configured

## Requirements

### Database Tables
Create tables for:
1. **students** - Student information
2. **preceptors** - Preceptor (clinical supervisor) information
3. **preceptor_availability** - Days when preceptors are available
4. **clerkships** - Clerkship types and requirements
5. **blackout_dates** - System-wide unavailable dates
6. **schedule_assignments** - Student-preceptor assignments

### Data Integrity
- Foreign key constraints for relationships
- Unique constraints for emails and business rules
- NOT NULL constraints for required fields
- Check constraints for data validation
- Indexes for frequently queried columns

### Type Generation
- Generate TypeScript types from schema using kysely-codegen
- Ensure types are available for all tables
- Export types for use in service functions

## Database Schema Design

### Table: `students`
Stores student information.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | Student full name |
| email | TEXT | NOT NULL, UNIQUE | Student email address |
| created_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record update timestamp |

**Indexes:**
- `idx_students_email` on `email` (for quick lookups)

**Business Rules:**
- Email must be unique across all students
- Cannot delete student if they have schedule assignments

---

### Table: `preceptors`
Stores preceptor (clinical supervisor) information.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | Preceptor full name |
| email | TEXT | NOT NULL, UNIQUE | Preceptor email address |
| specialty | TEXT | NOT NULL | Medical specialty (e.g., "Internal Medicine") |
| max_students | INTEGER | NOT NULL, DEFAULT 1 | Maximum concurrent students (MVP: always 1) |
| created_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record update timestamp |

**Indexes:**
- `idx_preceptors_email` on `email`
- `idx_preceptors_specialty` on `specialty` (for filtering by specialty)

**Business Rules:**
- Email must be unique across all preceptors
- Specialty cannot be empty
- max_students defaults to 1 for MVP

---

### Table: `preceptor_availability`
Tracks which days preceptors are available to supervise students.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| preceptor_id | TEXT | NOT NULL, FOREIGN KEY → preceptors(id) ON DELETE CASCADE | Reference to preceptor |
| date | TEXT | NOT NULL | ISO date string (YYYY-MM-DD) |
| is_available | INTEGER | NOT NULL, DEFAULT 1 | Boolean: 1 = available, 0 = unavailable |
| created_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record update timestamp |

**Indexes:**
- `idx_availability_preceptor_date` on `(preceptor_id, date)` (UNIQUE)
- `idx_availability_date` on `date` (for date range queries)

**Business Rules:**
- One availability record per preceptor per date
- Cascading delete when preceptor is deleted
- Defaults to available (is_available = 1)

---

### Table: `clerkships`
Defines clerkship types and their required duration.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL, UNIQUE | Clerkship name (e.g., "Internal Medicine") |
| specialty | TEXT | NOT NULL | Medical specialty matching preceptor specialty |
| required_days | INTEGER | NOT NULL, CHECK(required_days > 0) | Number of days required |
| description | TEXT | NULL | Optional description of clerkship |
| created_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record update timestamp |

**Indexes:**
- `idx_clerkships_name` on `name` (UNIQUE)
- `idx_clerkships_specialty` on `specialty` (for matching preceptors)

**Business Rules:**
- Clerkship name must be unique
- required_days must be positive integer
- Specialty must match preceptor specialty for assignments

---

### Table: `blackout_dates`
System-wide dates when no scheduling occurs (holidays, exam periods).

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| date | TEXT | NOT NULL, UNIQUE | ISO date string (YYYY-MM-DD) |
| reason | TEXT | NULL | Optional reason (e.g., "Holiday", "Exam Week") |
| created_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |

**Indexes:**
- `idx_blackout_dates_date` on `date` (UNIQUE)

**Business Rules:**
- One record per date
- No assignments can be created on blackout dates
- Applies system-wide to all students and preceptors

---

### Table: `schedule_assignments`
Student-preceptor assignments for specific dates.

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| student_id | TEXT | NOT NULL, FOREIGN KEY → students(id) ON DELETE CASCADE | Reference to student |
| preceptor_id | TEXT | NOT NULL, FOREIGN KEY → preceptors(id) ON DELETE RESTRICT | Reference to preceptor |
| clerkship_id | TEXT | NOT NULL, FOREIGN KEY → clerkships(id) ON DELETE RESTRICT | Reference to clerkship |
| date | TEXT | NOT NULL | ISO date string (YYYY-MM-DD) |
| status | TEXT | NOT NULL, DEFAULT 'scheduled' | Status: 'scheduled', 'completed', 'cancelled' |
| created_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record update timestamp |

**Indexes:**
- `idx_assignments_student_date` on `(student_id, date)` (UNIQUE - prevents double-booking)
- `idx_assignments_preceptor_date` on `(preceptor_id, date)` (for capacity checks)
- `idx_assignments_date` on `date` (for calendar queries)
- `idx_assignments_clerkship` on `clerkship_id` (for requirement tracking)

**Business Rules:**
- Student cannot be assigned to multiple preceptors on same date (unique constraint)
- Preceptor cannot exceed max_students capacity on any date
- Assignment date cannot be a blackout date
- Students cascade delete, but preceptors and clerkships restrict delete (must reassign first)

---

## Database Relationships

```
students (1) ──────< (many) schedule_assignments
preceptors (1) ────< (many) schedule_assignments
preceptors (1) ────< (many) preceptor_availability
clerkships (1) ────< (many) schedule_assignments
```

## Implementation Details

### File Structure
```
/src/lib/db/migrations/
├── index.ts                                          # Migration runner (from Step 01)
├── run.ts                                            # CLI migration script (from Step 01)
└── 001_initial_schema.ts                             # Initial schema migration (NEW)
```

### Migration File to Create

#### `/src/lib/db/migrations/001_initial_schema.ts`

```typescript
import { Kysely, sql } from 'kysely';

/**
 * Initial database schema migration
 * Creates all tables for LIC Scheduling App
 */

export async function up(db: Kysely<any>): Promise<void> {
  // Create students table
  // Create preceptors table
  // Create preceptor_availability table
  // Create clerkships table
  // Create blackout_dates table
  // Create schedule_assignments table
  // Create all indexes
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop all tables in reverse order
  // Handle foreign key dependencies
}
```

**Requirements:**
- Use Kysely schema builder API
- Create tables in dependency order (referenced tables first)
- Add all constraints and indexes
- Implement both `up` and `down` functions
- Use proper SQLite data types
- Add comments for complex constraints

**SQL Features to Use:**
- `CREATE TABLE IF NOT EXISTS`
- `FOREIGN KEY ... ON DELETE CASCADE/RESTRICT`
- `UNIQUE` constraints
- `CHECK` constraints
- `DEFAULT` values
- `CREATE INDEX`

## Business Logic Functions

No business logic functions in this step - pure schema definition.

## Testing Requirements

### Integration Tests

#### `/src/lib/db/migrations/001_initial_schema.test.ts`

**Schema Validation Tests:**
- ✅ Migration runs successfully without errors
- ✅ All tables are created
- ✅ All columns exist with correct types
- ✅ All indexes are created
- ✅ Foreign key constraints work correctly
- ✅ Unique constraints work correctly
- ✅ Check constraints validate data
- ✅ Default values are applied
- ✅ CASCADE DELETE works for students → assignments
- ✅ RESTRICT DELETE works for preceptors/clerkships → assignments
- ✅ Down migration removes all tables

**Constraint Tests:**
- ✅ Cannot insert duplicate student email
- ✅ Cannot insert duplicate preceptor email
- ✅ Cannot insert duplicate clerkship name
- ✅ Cannot insert duplicate blackout date
- ✅ Cannot assign student to two preceptors on same date
- ✅ Cannot insert clerkship with negative required_days
- ✅ Cannot insert assignment with invalid foreign keys
- ✅ Deleting student cascades to assignments
- ✅ Deleting preceptor with assignments fails (RESTRICT)
- ✅ Deleting clerkship with assignments fails (RESTRICT)

### Testing Strategy
- Use separate test database (`:memory:` or test.db)
- Run migration before each test suite
- Clean up database after tests
- Test both successful and failing constraint scenarios
- Verify cascading deletes work correctly

## Type Generation

After creating the schema, generate TypeScript types:

```bash
npm run db:types
```

This generates `/src/lib/db/types.ts` with:

```typescript
export interface Database {
  students: StudentsTable;
  preceptors: PreceptorsTable;
  preceptor_availability: PreceptorAvailabilityTable;
  clerkships: ClerkshipsTable;
  blackout_dates: BlackoutDatesTable;
  schedule_assignments: ScheduleAssignmentsTable;
}

export interface StudentsTable {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

// ... other table types
```

## Acceptance Criteria

- [ ] Migration file `001_initial_schema.ts` created
- [ ] Migration includes all 6 tables with correct columns
- [ ] All foreign key relationships defined
- [ ] All indexes created
- [ ] All constraints implemented (UNIQUE, CHECK, NOT NULL)
- [ ] Both `up()` and `down()` functions implemented
- [ ] Migration runs successfully: `npm run db:migrate`
- [ ] Types generated successfully: `npm run db:types`
- [ ] `/src/lib/db/types.ts` contains all table types
- [ ] All constraint tests passing
- [ ] All cascade/restrict delete tests passing
- [ ] Schema documented with comments
- [ ] Can query all tables without errors

## Usage Example

After completion, the generated types enable type-safe queries:

```typescript
import { db } from '$lib/db';

// Fully typed query
const students = await db
  .selectFrom('students')
  .selectAll()
  .execute();
// students is typed as StudentsTable[]

// Type-safe insert
await db
  .insertInto('students')
  .values({
    id: crypto.randomUUID(),
    name: 'John Doe',
    email: 'john@example.com',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .execute();
```

## Notes

### SQLite Data Types
- Use TEXT for UUIDs and dates (ISO 8601 format)
- Use INTEGER for booleans (0 = false, 1 = true)
- Use INTEGER for counts and numbers
- Use CURRENT_TIMESTAMP for default timestamps (returns TEXT in ISO format)

### Date Handling
- Store all dates as TEXT in ISO 8601 format (YYYY-MM-DD)
- Use JavaScript Date methods for parsing/formatting
- Consider timezone handling (store in UTC)

### UUID Generation
- Use `crypto.randomUUID()` for ID generation
- IDs are TEXT type in database
- No auto-increment needed

### Future Considerations
- Schema can be extended with additional fields
- Consider soft deletes vs hard deletes
- May need audit log table in future
- Migration versioning allows schema evolution

## References

- [Kysely Schema Builder](https://kysely.dev/docs/schema)
- [Kysely Migrations](https://kysely.dev/docs/migrations)
- [SQLite Foreign Keys](https://www.sqlite.org/foreignkeys.html)
- [SQLite Data Types](https://www.sqlite.org/datatype3.html)
- [ISO 8601 Date Format](https://en.wikipedia.org/wiki/ISO_8601)
