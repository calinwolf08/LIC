# Schedule Management Design Document

**Status:** Design Phase
**Priority:** Medium (Phase 3)
**Last Updated:** 2025-11-24

---

## Overview

Enable users to create multiple schedules (e.g., "2024-2025 Academic Year", "Fall 2025 Term") within their account and import data from previous schedules. This allows coordinators to reuse clerkship definitions, preceptors, and sites across academic years without starting from scratch.

---

## Data Model

### New Table: `schedules`

```typescript
interface Schedule {
  id: string;                    // Primary key (UUID)
  account_id: string;            // Foreign key -> accounts.id
  name: string;                  // User-defined name (e.g., "2024-2025 Academic Year")
  start_date: string;            // ISO date (YYYY-MM-DD)
  end_date: string;              // ISO date (YYYY-MM-DD)
  is_active: boolean;            // Currently selected schedule
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
}
```

**Constraints:**
- One active schedule per account (unique constraint on `account_id` where `is_active = true`)
- User can have multiple schedules for any time period (overlapping dates allowed)

---

## Modified Schema

All data tables that are schedule-specific need `schedule_id`:

### Tables Getting `schedule_id`

**Student Data:**
- `students` - Students can be in multiple schedules (copies)
- `student_health_system_onboarding` - Schedule-specific onboarding status

**Assignments:**
- `schedule_assignments` - Assignments belong to specific schedule
- `blackout_dates` - Blackout dates per schedule

**Availability:**
- `preceptor_availability` - Can be copied between schedules

**Note:** Clerkships, Preceptors, Sites, Health Systems remain at account level (can be shared across schedules via import).

---

## Database Migration

### Migration: `015_add_schedules.ts`

```typescript
import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create schedules table
  await db.schema
    .createTable('schedules')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('account_id', 'text', (col) =>
      col.notNull().references('accounts.id').onDelete('cascade'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('start_date', 'text', (col) => col.notNull())
    .addColumn('end_date', 'text', (col) => col.notNull())
    .addColumn('is_active', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();

  // Unique constraint: only one active schedule per account
  await db.schema
    .createIndex('schedules_account_active_unique')
    .on('schedules')
    .columns(['account_id'])
    .where('is_active', '=', 1)
    .unique()
    .execute();

  // Add schedule_id to relevant tables
  const tables = [
    'students',
    'student_health_system_onboarding',
    'schedule_assignments',
    'blackout_dates',
    'preceptor_availability'
  ];

  for (const table of tables) {
    await db.schema
      .alterTable(table)
      .addColumn('schedule_id', 'text', (col) =>
        col.notNull().references('schedules.id').onDelete('cascade'))
      .execute();

    await db.schema
      .createIndex(`${table}_schedule_id_idx`)
      .on(table)
      .column('schedule_id')
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  const tables = [
    'students',
    'student_health_system_onboarding',
    'schedule_assignments',
    'blackout_dates',
    'preceptor_availability'
  ];

  for (const table of tables) {
    await db.schema.alterTable(table).dropColumn('schedule_id').execute();
  }

  await db.schema.dropTable('schedules').execute();
}
```

---

## API Endpoints

### Schedule Management

**GET /api/schedules**
- List all schedules for current account
- Response: `{ success: true, data: Schedule[] }`

**GET /api/schedules/active**
- Get currently active schedule
- Response: `{ success: true, data: Schedule }`

**POST /api/schedules**
- Create new schedule
- Body: `{ name, start_date, end_date, is_active? }`
- Response: `{ success: true, data: Schedule }`

**PUT /api/schedules/:id**
- Update schedule details
- Body: `{ name?, start_date?, end_date? }`
- Response: `{ success: true, data: Schedule }`

**POST /api/schedules/:id/activate**
- Set schedule as active
- Deactivates other schedules in account
- Response: `{ success: true, data: Schedule }`

**DELETE /api/schedules/:id**
- Delete schedule and all associated data
- Response: `{ success: true }`

---

### Schedule Import/Copy

**POST /api/schedules/:id/import**

Copy data from source schedule to target schedule.

**Request Body:**
```typescript
{
  source_schedule_id: string;  // UUID of schedule to copy from
  import_options: {
    clerkships: boolean;       // Import clerkship definitions
    preceptors: boolean;       // Import preceptors
    sites: boolean;            // Import sites
    health_systems: boolean;   // Import health systems (usually yes)
    students: boolean;         // Import students (create copies)
    availability: boolean;     // Import preceptor availability patterns
    blackout_dates: boolean;   // Import blackout dates
    scheduling_config: boolean; // Import all scheduling configuration
  }
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    imported: {
      clerkships: number;
      preceptors: number;
      sites: number;
      health_systems: number;
      students: number;
      availability_records: number;
      blackout_dates: number;
      configurations: number;
    },
    errors: string[];  // Any errors during import
  }
}
```

**Import Logic:**

1. **Clerkships**: Copy clerkship records, generate new UUIDs
2. **Preceptors**: Copy preceptor records, generate new UUIDs
3. **Sites**: Copy site records, generate new UUIDs
4. **Health Systems**: Copy health system records, generate new UUIDs
5. **Students**: Copy student records, generate new UUIDs (fresh cohort)
6. **Availability**: Copy preceptor availability, map to new preceptor IDs
7. **Blackout Dates**: Copy blackout date records
8. **Scheduling Config**: Copy all configuration tables:
   - `clerkship_configurations`
   - `clerkship_requirements`
   - `clerkship_electives`
   - `clerkship_capacity_rules`
   - `clerkship_fallback_strategies`
   - `clerkship_global_defaults`
   - `clerkship_teams`

**NOT Imported:**
- `schedule_assignments` (generated schedules)
- `student_health_system_onboarding` (fresh start for each schedule)
- `scheduling_periods` (if implemented, these are schedule-specific)

---

## UI/UX Design

### Schedule Selector

**Location:** Global navigation header

```svelte
<nav>
  <div class="schedule-selector">
    <label for="active-schedule">Current Schedule:</label>
    <select id="active-schedule" on:change={handleScheduleChange}>
      {#each schedules as schedule}
        <option value={schedule.id} selected={schedule.is_active}>
          {schedule.name}
        </option>
      {/each}
    </select>
    <button on:click={openScheduleManager}>Manage Schedules</button>
  </div>

  <!-- Other nav items -->
</nav>
```

### Schedule Management Page

**Location:** `/schedules` or `/settings/schedules`

**Features:**
1. **List View:**
   - Table of all schedules
   - Columns: Name, Date Range, Status (Active/Inactive), Actions
   - Actions: Activate, Edit, Delete, Import From

2. **Create New Schedule:**
   - Modal/form with:
     - Name input
     - Start/end date pickers
     - "Set as active" checkbox
     - "Import from previous schedule" option

3. **Import Wizard:**
   ```
   Step 1: Select Source Schedule
   - Dropdown of existing schedules to copy from

   Step 2: Choose What to Import
   [ ] Clerkships (recommended)
   [ ] Preceptors (recommended)
   [ ] Sites (recommended)
   [ ] Health Systems (recommended)
   [ ] Students (optional - creates new copies)
   [ ] Preceptor Availability (optional)
   [ ] Blackout Dates (optional)
   [ ] All Scheduling Configuration (recommended)

   Or: [Select All] [Select None]

   Step 3: Confirm & Import
   Review selections, click "Import"
   Show progress bar
   Display summary of imported items
   ```

### Schedule Context

All data views must be filtered by active schedule:
- Students list
- Preceptors list (if filtered by schedule)
- Schedule calendar
- Assignments

**Context Indicator:**
Show active schedule name in header or as badge:
```svelte
<div class="context-indicator">
  <Icon name="calendar" />
  <span>Viewing: {activeSchedule.name}</span>
</div>
```

---

## Service Layer

### Schedule Service

**File:** `src/lib/features/schedules/services/schedule-service.ts`

```typescript
export async function createSchedule(
  db: Kysely<DB>,
  accountId: string,
  data: CreateScheduleInput
): Promise<Schedule> {
  const timestamp = new Date().toISOString();

  // If setting as active, deactivate others first
  if (data.is_active) {
    await deactivateAllSchedules(db, accountId);
  }

  const newSchedule = {
    id: crypto.randomUUID(),
    account_id: accountId,
    name: data.name,
    start_date: data.start_date,
    end_date: data.end_date,
    is_active: data.is_active ? 1 : 0,
    created_at: timestamp,
    updated_at: timestamp
  };

  return await db
    .insertInto('schedules')
    .values(newSchedule)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function activateSchedule(
  db: Kysely<DB>,
  accountId: string,
  scheduleId: string
): Promise<Schedule> {
  // Deactivate all schedules in account
  await db
    .updateTable('schedules')
    .set({ is_active: 0, updated_at: new Date().toISOString() })
    .where('account_id', '=', accountId)
    .execute();

  // Activate target schedule
  return await db
    .updateTable('schedules')
    .set({ is_active: 1, updated_at: new Date().toISOString() })
    .where('id', '=', scheduleId)
    .where('account_id', '=', accountId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function getActiveSchedule(
  db: Kysely<DB>,
  accountId: string
): Promise<Schedule | null> {
  return await db
    .selectFrom('schedules')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('is_active', '=', 1)
    .executeTakeFirst();
}
```

### Import Service

**File:** `src/lib/features/schedules/services/schedule-import-service.ts`

```typescript
interface ImportOptions {
  clerkships: boolean;
  preceptors: boolean;
  sites: boolean;
  health_systems: boolean;
  students: boolean;
  availability: boolean;
  blackout_dates: boolean;
  scheduling_config: boolean;
}

interface ImportResult {
  imported: {
    clerkships: number;
    preceptors: number;
    sites: number;
    health_systems: number;
    students: number;
    availability_records: number;
    blackout_dates: number;
    configurations: number;
  };
  errors: string[];
}

export async function importScheduleData(
  db: Kysely<DB>,
  accountId: string,
  targetScheduleId: string,
  sourceScheduleId: string,
  options: ImportOptions
): Promise<ImportResult> {
  const result: ImportResult = {
    imported: {
      clerkships: 0,
      preceptors: 0,
      sites: 0,
      health_systems: 0,
      students: 0,
      availability_records: 0,
      blackout_dates: 0,
      configurations: 0
    },
    errors: []
  };

  // ID mapping for foreign key updates
  const idMaps = {
    clerkships: new Map<string, string>(),
    preceptors: new Map<string, string>(),
    sites: new Map<string, string>(),
    health_systems: new Map<string, string>(),
    students: new Map<string, string>()
  };

  try {
    // Import in dependency order

    if (options.health_systems) {
      const count = await importHealthSystems(db, accountId, idMaps.health_systems);
      result.imported.health_systems = count;
    }

    if (options.sites) {
      const count = await importSites(db, accountId, idMaps.sites, idMaps.health_systems);
      result.imported.sites = count;
    }

    if (options.clerkships) {
      const count = await importClerkships(db, accountId, idMaps.clerkships);
      result.imported.clerkships = count;
    }

    if (options.preceptors) {
      const count = await importPreceptors(
        db,
        accountId,
        idMaps.preceptors,
        idMaps.health_systems,
        idMaps.sites
      );
      result.imported.preceptors = count;
    }

    if (options.students) {
      const count = await importStudents(
        db,
        accountId,
        targetScheduleId,
        sourceScheduleId,
        idMaps.students
      );
      result.imported.students = count;
    }

    if (options.availability) {
      const count = await importAvailability(
        db,
        accountId,
        targetScheduleId,
        sourceScheduleId,
        idMaps.preceptors
      );
      result.imported.availability_records = count;
    }

    if (options.blackout_dates) {
      const count = await importBlackoutDates(
        db,
        accountId,
        targetScheduleId,
        sourceScheduleId
      );
      result.imported.blackout_dates = count;
    }

    if (options.scheduling_config) {
      const count = await importSchedulingConfig(
        db,
        accountId,
        idMaps.clerkships,
        idMaps.preceptors,
        idMaps.sites
      );
      result.imported.configurations = count;
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return result;
}

// Helper functions for each import type
async function importHealthSystems(
  db: Kysely<DB>,
  accountId: string,
  idMap: Map<string, string>
): Promise<number> {
  // Fetch source health systems for this account
  const sources = await db
    .selectFrom('health_systems')
    .selectAll()
    .where('account_id', '=', accountId)
    .execute();

  const timestamp = new Date().toISOString();
  const copies = sources.map(source => {
    const newId = crypto.randomUUID();
    idMap.set(source.id, newId);

    return {
      id: newId,
      account_id: accountId,
      name: source.name,
      location: source.location,
      description: source.description,
      created_at: timestamp,
      updated_at: timestamp
    };
  });

  if (copies.length > 0) {
    await db.insertInto('health_systems').values(copies).execute();
  }

  return copies.length;
}

// Similar functions for other entity types...
```

---

## Implementation Checklist

### Phase 1: Database Schema
- [ ] Create migration `015_add_schedules.ts`
- [ ] Run migration
- [ ] Update TypeScript types

### Phase 2: Service Layer
- [ ] Create schedule service (CRUD operations)
- [ ] Create import service
- [ ] Write unit tests for schedule service
- [ ] Write unit tests for import service

### Phase 3: API Endpoints
- [ ] Implement `/api/schedules` (GET, POST)
- [ ] Implement `/api/schedules/:id` (GET, PUT, DELETE)
- [ ] Implement `/api/schedules/:id/activate` (POST)
- [ ] Implement `/api/schedules/:id/import` (POST)
- [ ] Write E2E tests

### Phase 4: UI Components
- [ ] Create schedule selector component (header)
- [ ] Create schedule management page
- [ ] Create import wizard component
- [ ] Add schedule context to all data views

### Phase 5: Context Updates
- [ ] Update all data queries to filter by active schedule
- [ ] Update all data creation to use active schedule
- [ ] Update authentication context to include active schedule

### Phase 6: Testing
- [ ] Test schedule switching
- [ ] Test import with all options
- [ ] Test import with subset of options
- [ ] Verify data isolation between schedules

---

## Future Enhancements

1. **Schedule Templates:**
   - Pre-defined schedule configurations
   - "Standard 4-year curriculum" template

2. **Bulk Schedule Operations:**
   - Archive old schedules
   - Bulk delete schedules

3. **Schedule Comparison:**
   - Compare two schedules side-by-side
   - Diff view showing changes

4. **Schedule Analytics:**
   - Utilization across schedules
   - Year-over-year comparisons

5. **Smart Import:**
   - Detect changes since last import
   - Suggest what to import based on schedule dates

---

## Related Documents

- `DESIGN_MULTI_TENANCY.md` - Account isolation for schedules
- `DESIGN_DASHBOARDS.md` - Schedule-specific dashboards
