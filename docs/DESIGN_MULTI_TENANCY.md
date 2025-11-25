# Multi-tenancy Design Document

**Status:** Design Phase
**Priority:** High (Phase 1)
**Last Updated:** 2025-11-24

---

## Overview

Implement account-based isolation to ensure each user's data (students, preceptors, clerkships, schedules, etc.) is completely isolated from other users. This enables multiple independent coordinators/programs to use the system without seeing each other's data.

---

## Architecture

### Data Model

#### New Tables

**`accounts` Table**
```typescript
interface Account {
  id: string;                    // Primary key (UUID)
  name: string;                  // Organization/program name (e.g., "University Hospital Medical School")
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
}
```

**`account_users` Table** (Junction table for future multi-user support)
```typescript
interface AccountUser {
  id: string;                    // Primary key (UUID)
  account_id: string;            // Foreign key -> accounts.id
  user_id: string;               // Foreign key -> user.id (from better-auth)
  role: 'admin' | 'coordinator'; // User role within account (future: 'student', 'preceptor')
  created_at: string;            // ISO timestamp
}
```

#### Modified Tables

Add `account_id` foreign key to all data tables:
- `students`
- `preceptors`
- `health_systems`
- `sites`
- `clerkships`
- `clerkship_configurations`
- `clerkship_requirements`
- `clerkship_electives`
- `clerkship_capacity_rules`
- `clerkship_fallback_strategies`
- `clerkship_global_defaults`
- `clerkship_teams`
- `schedule_assignments`
- `blackout_dates`
- `preceptor_availability`
- `preceptor_site_clerkships`
- `student_health_system_onboarding`
- `site_electives`
- `scheduling_periods`
- `schedules` (new table, see DESIGN_SCHEDULE_MANAGEMENT.md)

---

## Database Schema Changes

### Migration: `013_add_multi_tenancy.ts`

```typescript
import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create accounts table
  await db.schema
    .createTable('accounts')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();

  // Create account_users junction table
  await db.schema
    .createTable('account_users')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('account_id', 'text', (col) =>
      col.notNull().references('accounts.id').onDelete('cascade'))
    .addColumn('user_id', 'text', (col) => col.notNull())
    .addColumn('role', 'text', (col) => col.notNull().defaultTo('admin'))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('account_users_user_account_unique', ['user_id', 'account_id'])
    .execute();

  // Add account_id to all data tables
  const tables = [
    'students',
    'preceptors',
    'health_systems',
    'sites',
    'clerkships',
    'clerkship_configurations',
    'clerkship_requirements',
    'clerkship_electives',
    'clerkship_capacity_rules',
    'clerkship_fallback_strategies',
    'clerkship_global_defaults',
    'clerkship_teams',
    'schedule_assignments',
    'blackout_dates',
    'preceptor_availability',
    'preceptor_site_clerkships',
    'student_health_system_onboarding',
    'site_electives',
    'scheduling_periods'
  ];

  for (const table of tables) {
    await db.schema
      .alterTable(table)
      .addColumn('account_id', 'text', (col) =>
        col.notNull().references('accounts.id').onDelete('cascade'))
      .execute();

    // Add index for performance
    await db.schema
      .createIndex(`${table}_account_id_idx`)
      .on(table)
      .column('account_id')
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  // Remove account_id from all tables
  const tables = [
    'students',
    'preceptors',
    'health_systems',
    'sites',
    'clerkships',
    'clerkship_configurations',
    'clerkship_requirements',
    'clerkship_electives',
    'clerkship_capacity_rules',
    'clerkship_fallback_strategies',
    'clerkship_global_defaults',
    'clerkship_teams',
    'schedule_assignments',
    'blackout_dates',
    'preceptor_availability',
    'preceptor_site_clerkships',
    'student_health_system_onboarding',
    'site_electives',
    'scheduling_periods'
  ];

  for (const table of tables) {
    await db.schema
      .alterTable(table)
      .dropColumn('account_id')
      .execute();
  }

  await db.schema.dropTable('account_users').execute();
  await db.schema.dropTable('accounts').execute();
}
```

---

## Authentication Flow

### Registration Flow

1. User registers at `/register` (existing better-auth flow)
2. On successful registration:
   - Create new `Account` record with default name (e.g., user's email domain or "My Program")
   - Create `AccountUser` record linking user to account with role='admin'
3. Redirect to onboarding/setup page (future enhancement)

### Login Flow

1. User logs in via better-auth (existing flow)
2. Retrieve user's account via `account_users` junction table
3. Store `account_id` in session/context
4. All subsequent API calls use this `account_id` for data filtering

### Session Context

```typescript
// src/lib/server/auth-context.ts
import { getSession } from './better-auth-session'; // Adjust to actual better-auth setup
import { db } from '$lib/db';

export interface AuthContext {
  userId: string;
  accountId: string;
  role: 'admin' | 'coordinator';
}

export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  const session = await getSession(request);
  if (!session?.userId) return null;

  // Fetch user's account
  const accountUser = await db
    .selectFrom('account_users')
    .selectAll()
    .where('user_id', '=', session.userId)
    .executeTakeFirst();

  if (!accountUser) return null;

  return {
    userId: session.userId,
    accountId: accountUser.account_id,
    role: accountUser.role as 'admin' | 'coordinator'
  };
}
```

---

## API Changes

### Middleware: Account Context Injection

All API endpoints must be updated to:
1. Retrieve `account_id` from auth context
2. Filter queries by `account_id`
3. Set `account_id` when creating new records

**Example Pattern:**

```typescript
// src/routes/api/students/+server.ts
import type { RequestHandler } from './$types';
import { getAuthContext } from '$lib/server/auth-context';
import { errorResponse } from '$lib/api/responses';

export const GET: RequestHandler = async ({ request }) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errorResponse('Unauthorized', 401);
  }

  // All queries automatically filtered by account_id
  const students = await db
    .selectFrom('students')
    .selectAll()
    .where('account_id', '=', auth.accountId)
    .execute();

  return successResponse(students);
};

export const POST: RequestHandler = async ({ request }) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errorResponse('Unauthorized', 401);
  }

  const body = await request.json();
  const validatedData = createStudentSchema.parse(body);

  // Automatically inject account_id
  const student = await createStudent(db, {
    ...validatedData,
    account_id: auth.accountId
  });

  return successResponse(student, 201);
};
```

### Service Layer Updates

Update all service functions to accept and use `account_id`:

**Before:**
```typescript
export async function getStudents(db: Kysely<DB>): Promise<Student[]> {
  return await db.selectFrom('students').selectAll().execute();
}
```

**After:**
```typescript
export async function getStudents(
  db: Kysely<DB>,
  accountId: string
): Promise<Student[]> {
  return await db
    .selectFrom('students')
    .selectAll()
    .where('account_id', '=', accountId)
    .execute();
}
```

---

## Implementation Checklist

### Phase 1: Database Schema
- [ ] Create migration `013_add_multi_tenancy.ts`
- [ ] Update `src/lib/db/types.ts` to include new tables
- [ ] Run migration on development database
- [ ] Verify schema with `npm run db:types`

### Phase 2: Authentication Context
- [ ] Create `src/lib/server/auth-context.ts` with `getAuthContext()`
- [ ] Update better-auth registration to create Account + AccountUser
- [ ] Test registration flow creates account correctly

### Phase 3: Service Layer Updates
- [ ] Update all service functions to accept `accountId` parameter
- [ ] Add `account_id` filters to all SELECT queries
- [ ] Add `account_id` to all INSERT operations
- [ ] Update unit tests to pass `accountId`

### Phase 4: API Endpoint Updates
- [ ] Update all `/api/*` endpoints to use `getAuthContext()`
- [ ] Add authorization checks (return 401 if no auth)
- [ ] Inject `accountId` into service calls
- [ ] Update E2E tests to authenticate properly

### Phase 5: Testing
- [ ] Create test accounts
- [ ] Verify data isolation between accounts
- [ ] Test all CRUD operations respect account boundaries
- [ ] Verify cross-account data leakage is impossible

---

## Security Considerations

1. **Authorization on Every Request:**
   - Never trust client-provided `account_id`
   - Always derive from authenticated session

2. **Query Filtering:**
   - NEVER expose raw queries without `account_id` filter
   - Use database-level constraints where possible

3. **Foreign Key Constraints:**
   - All relationships must respect account boundaries
   - Cannot assign student from Account A to preceptor from Account B

4. **Session Security:**
   - Use secure session cookies (httpOnly, secure, sameSite)
   - Implement CSRF protection (already in better-auth)

---

## Future Enhancements

1. **Organization Hierarchy:**
   - Add `organization` table above accounts
   - Allow multiple programs within one institution

2. **Multi-user Accounts:**
   - Multiple coordinators per account
   - Role-based permissions (admin, coordinator, viewer)
   - Student/preceptor portal access (read-only)

3. **Account Management UI:**
   - Account settings page
   - Invite other users to account
   - Transfer ownership

4. **Audit Logging:**
   - Track which user performed which action
   - Account-level activity logs

---

## Migration Strategy

Since existing data will be deleted:
1. Run migration `013_add_multi_tenancy.ts`
2. Update all services and APIs
3. Test with fresh data
4. Deploy to production

No backward compatibility needed.

---

## Related Documents

- `DESIGN_SCHEDULE_MANAGEMENT.md` - Multi-schedule support within accounts
- `DESIGN_CONTACT_FIELDS.md` - Contact information enhancements
- `DESIGN_DASHBOARDS.md` - Account-specific dashboards
