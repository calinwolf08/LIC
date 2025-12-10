# Schedule-First Architecture Design

## Overview

This document describes the architectural changes to implement a "schedule-first" user experience where users must have an active schedule before creating or managing any entities.

## Current Problems

1. **No schedule context**: Entities (students, preceptors, etc.) exist in limbo without being tied to a schedule
2. **Confusing wizard**: Users must manually select which entities to include in a schedule
3. **Inconsistent selections**: Users can select entities that don't make sense together (e.g., team without its preceptors)
4. **No user ownership**: Schedules aren't tied to users
5. **No access control**: Data visible when not logged in

## Design Principles

1. **Schedule-first**: User must have an active schedule to do anything
2. **User-owned**: Schedules belong to users
3. **Reference model**: Entities shared across schedules by default via junction tables
4. **Copy-on-conflict**: When editing shared entity, offer to create schedule-specific copy

---

## Phase 1: Database Migration

### File: `src/lib/db/migrations/023_schedule_user_ownership.ts`

### Changes

```sql
-- Add user_id to scheduling_periods (foreign key to better-auth user table)
ALTER TABLE scheduling_periods ADD COLUMN user_id TEXT REFERENCES user(id);

-- Add active_schedule_id to user table
ALTER TABLE user ADD COLUMN active_schedule_id TEXT REFERENCES scheduling_periods(id);

-- Index for efficient user schedule lookups
CREATE INDEX idx_scheduling_periods_user ON scheduling_periods(user_id);

-- Migrate existing data: create default schedule for orphaned entities
-- (handled in migration code)
```

### Acceptance Criteria
- [ ] Migration runs without errors
- [ ] `scheduling_periods` has `user_id` column
- [ ] `user` table has `active_schedule_id` column
- [ ] Existing data is preserved

---

## Phase 2: Auth Flow & Schedule Enforcement

### Files to Modify
- `src/hooks.server.ts` - Add schedule check after auth
- `src/routes/+layout.server.ts` - Load active schedule into page data
- `src/routes/+layout.svelte` - Pass schedule context to components

### Logic

```
User requests page
    ↓
Auth check (existing)
    ↓ Not authenticated        ↓ Authenticated
Redirect to /login         Check: user.active_schedule_id exists?
                               ↓ No                    ↓ Yes
                           Is path /schedules/new?   Load schedule
                               ↓ No      ↓ Yes       Continue
                           Redirect    Allow
                           to /schedules/new
```

### Protected Routes (require schedule)
- `/` (dashboard)
- `/students/*`
- `/preceptors/*`
- `/clerkships/*`
- `/sites/*`
- `/health-systems/*`
- `/calendar/*`

### Unprotected Routes (no schedule needed)
- `/login`
- `/register`
- `/schedules/new` (to create first schedule)
- `/schedules` (to select/manage schedules)

### Acceptance Criteria
- [ ] Unauthenticated users see login page only
- [ ] New users redirected to /schedules/new after login
- [ ] Users with active schedule can access all routes
- [ ] Active schedule available in all page data

---

## Phase 3: Schedule Management UI

### New Files

#### `src/routes/schedules/+page.svelte`
Schedule list with table showing:
- Schedule name
- Date range
- Status (active indicator)
- Actions (Switch, Edit, Delete)

#### `src/routes/schedules/+page.server.ts`
Load all schedules for current user.

#### `src/routes/schedules/new/+page.svelte`
Simplified create form:
- Name (required)
- Start Date (required)
- End Date (required)
- Copy from existing (optional) - see Phase 6

#### `src/routes/schedules/[id]/+page.svelte`
Edit schedule details (name, dates).

#### `src/lib/components/schedule-selector.svelte`
Dropdown in navigation header:
- Shows current schedule name
- List of user's schedules
- "Manage Schedules" link to /schedules
- "New Schedule" link

### Sidebar Changes
- Add "Schedules" link
- Disable/gray out other links when no active schedule
- Visual indicator of disabled state

### Acceptance Criteria
- [ ] /schedules shows all user's schedules in table
- [ ] Can create new schedule with name and dates
- [ ] Can switch active schedule from dropdown
- [ ] Can switch active schedule from table
- [ ] Can edit schedule name/dates
- [ ] Can delete schedule (with confirmation)
- [ ] Sidebar shows disabled state when no schedule
- [ ] Nav dropdown shows current schedule

---

## Phase 4: Entity Auto-Association

### Concept
When a user creates any entity, it's automatically associated with the current active schedule via the appropriate junction table.

### API Endpoints to Modify

#### Create (POST) - Add junction table insert

| Endpoint | Junction Table |
|----------|---------------|
| `POST /api/students` | `schedule_students` |
| `POST /api/preceptors` | `schedule_preceptors` |
| `POST /api/sites` | `schedule_sites` |
| `POST /api/health-systems` | `schedule_health_systems` |
| `POST /api/clerkships` | `schedule_clerkships` |
| `POST /api/preceptors/teams` | `schedule_teams` |

```typescript
// Example: POST /api/students
const student = await db.insertInto('students').values(data).returning('id').executeTakeFirst();

// Auto-associate with current schedule
await db.insertInto('schedule_students').values({
  schedule_id: currentScheduleId,
  student_id: student.id
}).execute();
```

#### Read (GET) - Filter by current schedule

| Endpoint | Join With |
|----------|-----------|
| `GET /api/students` | `schedule_students` |
| `GET /api/preceptors` | `schedule_preceptors` |
| `GET /api/sites` | `schedule_sites` |
| `GET /api/health-systems` | `schedule_health_systems` |
| `GET /api/clerkships` | `schedule_clerkships` |
| `GET /api/preceptors/teams` | `schedule_teams` |

```typescript
// Example: GET /api/students
const students = await db
  .selectFrom('students')
  .innerJoin('schedule_students', 'students.id', 'schedule_students.student_id')
  .where('schedule_students.schedule_id', '=', currentScheduleId)
  .selectAll('students')
  .execute();
```

### Getting Current Schedule ID
- Pass via request header: `X-Schedule-Id`
- Or get from session/user record
- Middleware extracts and validates

### Acceptance Criteria
- [ ] New entities auto-associated with current schedule
- [ ] GET endpoints only return entities in current schedule
- [ ] Switching schedules shows different entity sets
- [ ] Dashboard stats reflect current schedule only

---

## Phase 5: Shared Entity Warnings

### Concept
When editing an entity that belongs to multiple schedules, warn the user and offer options.

### Detection Logic

```typescript
// On PATCH request, before applying changes
async function checkSharedEntity(entityType: string, entityId: string, currentScheduleId: string) {
  const junctionTable = `schedule_${entityType}s`; // e.g., schedule_preceptors

  const otherSchedules = await db
    .selectFrom(junctionTable)
    .innerJoin('scheduling_periods', 'scheduling_periods.id', `${junctionTable}.schedule_id`)
    .where(`${junctionTable}.${entityType}_id`, '=', entityId)
    .where(`${junctionTable}.schedule_id`, '!=', currentScheduleId)
    .select(['scheduling_periods.id', 'scheduling_periods.name'])
    .execute();

  return otherSchedules;
}
```

### API Response

```typescript
// If entity is shared
return json({
  warning: 'shared_entity',
  affectedSchedules: [
    { id: 'abc', name: 'Fall 2024' },
    { id: 'def', name: 'Spring 2025' }
  ],
  message: 'This preceptor is also used in 2 other schedules.'
});
```

### Client Flow

1. User submits edit form
2. API returns `warning: 'shared_entity'`
3. Show dialog:
   ```
   ┌─────────────────────────────────────────────────┐
   │  This preceptor is used in other schedules      │
   │                                                 │
   │  Your changes will affect:                      │
   │  • Fall 2024                                    │
   │  • Spring 2025                                  │
   │                                                 │
   │  What would you like to do?                     │
   │                                                 │
   │  [Update All Schedules]  [Copy for This Only]  │
   │                                                 │
   │  [Cancel]                                       │
   └─────────────────────────────────────────────────┘
   ```
4. If "Update All": Proceed with PATCH
5. If "Copy for This Only":
   - POST new entity with changes
   - Update junction table: remove old, add new for current schedule
   - Other schedules keep reference to original

### New Component
`src/lib/components/shared-entity-warning-dialog.svelte`

### Acceptance Criteria
- [ ] Editing shared entity shows warning
- [ ] "Update All" applies changes to all schedules
- [ ] "Copy for This Only" creates new entity for current schedule
- [ ] Other schedules unaffected by copy
- [ ] No warning for entities only in current schedule

---

## Phase 6: New Schedule from Existing (Copy Flow)

### UI: Enhanced `/schedules/new`

```
┌─────────────────────────────────────────────────────────────┐
│  Create New Schedule                                        │
│                                                             │
│  Name *                                                     │
│  [Spring 2026 Clerkships_______________________________]    │
│                                                             │
│  Start Date *                     End Date *                │
│  [2026-01-05_______]              [2026-05-15_______]       │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ☐ Copy entities from existing schedule                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Source Schedule: [Fall 2025 Clerkships ▼]           │    │
│  │                                                     │    │
│  │ Select what to copy:                                │    │
│  │ ☑ Students (24)                                     │    │
│  │ ☑ Preceptors (18)                                   │    │
│  │ ☑ Clerkships (8)                                    │    │
│  │ ☑ Sites (5)                                         │    │
│  │ ☑ Health Systems (3)                                │    │
│  │ ☑ Teams (12)                                        │    │
│  │ ☐ Scheduling Configurations                         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│                              [Cancel]  [Create Schedule]    │
└─────────────────────────────────────────────────────────────┘
```

### API: `POST /api/schedules`

```typescript
// Request body
{
  name: "Spring 2026 Clerkships",
  startDate: "2026-01-05",
  endDate: "2026-05-15",
  copyFrom?: {
    scheduleId: "source-schedule-id",
    entities: {
      students: true,      // Copy all students from source
      preceptors: true,
      clerkships: true,
      sites: true,
      healthSystems: true,
      teams: true,
      configurations: false
    }
  }
}
```

### Copy Logic

```typescript
// For each selected entity type
if (copyFrom.entities.students) {
  // Get student IDs from source schedule
  const sourceStudents = await db
    .selectFrom('schedule_students')
    .where('schedule_id', '=', copyFrom.scheduleId)
    .select('student_id')
    .execute();

  // Add references to new schedule (same entities, new associations)
  for (const { student_id } of sourceStudents) {
    await db.insertInto('schedule_students').values({
      schedule_id: newScheduleId,
      student_id
    }).execute();
  }
}
```

### Acceptance Criteria
- [ ] Can create schedule without copying
- [ ] Can select source schedule to copy from
- [ ] Can select which entity types to copy
- [ ] Copy creates references (not duplicates)
- [ ] New schedule shows copied entities
- [ ] Source schedule unaffected

---

## Phase 7: Seed Data with Test User

### File: `src/lib/db/seed.ts`

### Test User
```typescript
const testUser = {
  id: 'test-user-001',
  email: 'admin@example.com',
  name: 'Admin User',
  emailVerified: true,
  // Password: 'password123' (hashed by better-auth)
};
```

### Test Schedule
```typescript
const testSchedule = {
  id: 'test-schedule-001',
  name: 'Demo Schedule 2025',
  start_date: '2025-01-06',
  end_date: '2025-06-30',
  user_id: testUser.id,
  is_active: true,
};
```

### Sample Entities (all associated with test schedule)
- 2 Health Systems
- 4 Sites (2 per health system)
- 6 Clerkships (mix of inpatient/outpatient)
- 10 Students
- 8 Preceptors (with availability patterns)
- 4 Teams (one per primary clerkship)

### Running Seed
```bash
npm run db:seed
```

### Acceptance Criteria
- [ ] Seed creates test user with known credentials
- [ ] Seed creates schedule owned by test user
- [ ] Seed creates sample entities associated with schedule
- [ ] Can login with admin@example.com / password123
- [ ] Dashboard shows seeded data

---

## Phase 8: Validation and Testing

### Unit Tests

#### Migration Tests
- [ ] Migration applies cleanly to fresh DB
- [ ] Migration handles existing data
- [ ] Rollback works correctly

#### API Tests
- [ ] Entity creation associates with schedule
- [ ] Entity listing filters by schedule
- [ ] Shared entity detection works
- [ ] Copy flow creates correct references

#### Auth Tests
- [ ] Unauthenticated users blocked
- [ ] Users without schedule redirected
- [ ] Schedule context available in requests

### Integration Tests

#### User Flow Tests
- [ ] New user signup → create schedule → add entities
- [ ] Existing user login → switch schedules → see different data
- [ ] Create schedule from existing → entities copied correctly
- [ ] Edit shared entity → warning shown → copy works

#### Edge Cases
- [ ] Delete schedule with shared entities (entities remain)
- [ ] Delete entity used in multiple schedules (remove from current only)
- [ ] Switch schedule while editing (handle gracefully)

### Manual Testing Checklist

#### First-Time User Flow
- [ ] Register new account
- [ ] Redirected to create schedule
- [ ] Cannot access other pages until schedule created
- [ ] After creating schedule, dashboard accessible
- [ ] Can add health system, site, clerkship, student, preceptor, team
- [ ] All entities appear in lists
- [ ] Can generate schedule

#### Returning User Flow
- [ ] Login with existing account
- [ ] Taken to dashboard with active schedule
- [ ] Can switch schedules via dropdown
- [ ] Can switch schedules via /schedules page
- [ ] Different schedules show different entities

#### Multi-Schedule Flow
- [ ] Create second schedule (empty)
- [ ] Entities from first schedule not visible
- [ ] Create third schedule copying from first
- [ ] Entities from first schedule now visible in third
- [ ] Edit entity in third → warning about first schedule

### Acceptance Criteria
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Manual testing checklist complete
- [ ] No console errors in browser
- [ ] No server errors in logs

---

## Schedule Deletion Behavior

When deleting a schedule:

### Always Deleted
- Schedule record itself
- Junction table entries (schedule_students, etc.)
- Assignments for that schedule

### User Chooses (Checkboxes)
For each entity type, show:
- Count of entities only in this schedule (safe to delete)
- Count of entities shared with other schedules (cannot delete)

```
┌─────────────────────────────────────────────────────────────┐
│  Delete Schedule: Fall 2025                                 │
│                                                             │
│  This will permanently delete the schedule and its          │
│  assignments. Choose what else to delete:                   │
│                                                             │
│  ☐ Students                                                 │
│    • 5 only in this schedule (will be deleted)              │
│    • 3 shared with other schedules (will be kept)           │
│                                                             │
│  ☐ Preceptors                                               │
│    • 2 only in this schedule (will be deleted)              │
│    • 6 shared with other schedules (will be kept)           │
│                                                             │
│  ... (other entity types)                                   │
│                                                             │
│  ⚠️  Shared entities cannot be deleted from here.           │
│     Remove them from other schedules first.                 │
│                                                             │
│                              [Cancel]  [Delete Schedule]    │
└─────────────────────────────────────────────────────────────┘
```

### Acceptance Criteria
- [ ] Deletion shows entity breakdown
- [ ] Shared entities cannot be deleted
- [ ] Only-in-this-schedule entities can be optionally deleted
- [ ] Confirmation required before deletion

---

## Implementation Order

1. **Phase 1** - Database migration (foundation)
2. **Phase 7** - Seed data (enables testing)
3. **Phase 3** - Schedule management UI (user-facing)
4. **Phase 2** - Auth flow enforcement (requires Phase 3)
5. **Phase 4** - Entity auto-association (core behavior)
6. **Phase 6** - Copy flow (depends on Phase 4)
7. **Phase 5** - Shared entity warnings (polish)
8. **Phase 8** - Validation and testing (final)

---

## Open Questions / Future Considerations

1. **Historical schedules**: Should there be a "completed" or "archived" state?
2. **Schedule templates**: Pre-built schedule configurations for common setups?
3. **Multi-user schedules**: Could multiple users collaborate on one schedule?
4. **Schedule comparison**: View differences between two schedules?
