# Development Plan: Multi-Schedule Support

## Overview

Add schedule management with sidebar selector, data scoping via junction tables, and wizard for duplicating data to new schedules.

## Current State

- `scheduling_periods` table exists with `start_date`, `end_date`, `name`, `is_active`
- Only one period can be active at a time
- Data entities (students, preceptors, sites) are NOT scoped to schedules
- No UI for schedule management

## Requirements

- Sidebar widget with dropdown to switch schedules AND date range display
- Default schedule is current year
- Junction tables to allow entities to be shared across schedules
- Wizard with tabs to select which entities to copy to new schedule
- Only show assignments for active schedule
- Cascade delete only if data is exclusively used by that schedule

---

## Phase 1: Database Schema

### 1.1 Create junction tables migration

**File:** `src/lib/db/migrations/0XX_schedule_scoping.ts`

Create tables:
```sql
-- Schedule-Student association
CREATE TABLE schedule_students (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES scheduling_periods(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, student_id)
);

-- Schedule-Preceptor association
CREATE TABLE schedule_preceptors (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES scheduling_periods(id) ON DELETE CASCADE,
  preceptor_id TEXT NOT NULL REFERENCES preceptors(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, preceptor_id)
);

-- Schedule-Site association
CREATE TABLE schedule_sites (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES scheduling_periods(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, site_id)
);

-- Schedule-Health System association
CREATE TABLE schedule_health_systems (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES scheduling_periods(id) ON DELETE CASCADE,
  health_system_id TEXT NOT NULL REFERENCES health_systems(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, health_system_id)
);

-- Schedule-Clerkship association
CREATE TABLE schedule_clerkships (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES scheduling_periods(id) ON DELETE CASCADE,
  clerkship_id TEXT NOT NULL REFERENCES clerkships(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, clerkship_id)
);

-- Schedule-Team association
CREATE TABLE schedule_teams (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES scheduling_periods(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES preceptor_teams(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, team_id)
);

-- Schedule-Configuration association
CREATE TABLE schedule_configurations (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES scheduling_periods(id) ON DELETE CASCADE,
  configuration_id TEXT NOT NULL REFERENCES clerkship_configurations(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, configuration_id)
);
```

### 1.2 Update scheduling_periods table

```sql
ALTER TABLE scheduling_periods ADD COLUMN year INTEGER;
```

### 1.3 Migrate existing data

- Create default schedule for current year
- Link all existing entities to default schedule
- Set default schedule as active

### Testing

- Run migration
- Verify existing data preserved and linked to default schedule
- Run `npm run check`

---

## Phase 2: Service Layer

### 2.1 Create ScheduleService

**File:** `src/lib/features/schedules/services/schedule.service.ts`

Methods:
```typescript
// Core CRUD
createSchedule(name: string, startDate: string, endDate: string, year: number): Promise<Schedule>
getSchedules(): Promise<Schedule[]>
getScheduleById(id: string): Promise<Schedule | null>
updateSchedule(id: string, data: UpdateScheduleInput): Promise<Schedule>
deleteSchedule(id: string): Promise<void>  // with cascade logic

// Active schedule management
getActiveSchedule(): Promise<Schedule | null>
setActiveSchedule(id: string): Promise<void>

// Entity associations
getScheduleEntities(scheduleId: string, entityType: EntityType): Promise<string[]>
addEntityToSchedule(scheduleId: string, entityType: EntityType, entityId: string): Promise<void>
addEntitiesToSchedule(scheduleId: string, entityType: EntityType, entityIds: string[]): Promise<void>
removeEntityFromSchedule(scheduleId: string, entityType: EntityType, entityId: string): Promise<void>

// Utility
isEntityInMultipleSchedules(entityType: EntityType, entityId: string): Promise<boolean>
getSchedulesForEntity(entityType: EntityType, entityId: string): Promise<Schedule[]>
```

### 2.2 Update entity services

Modify each service to accept optional `scheduleId` parameter:

**Files to modify:**
- `src/lib/features/students/services/student-service.ts`
- `src/lib/features/preceptors/services/preceptor-service.ts`
- `src/lib/features/sites/services/site-service.ts`
- `src/lib/features/health-systems/services/health-systems.service.ts`
- `src/lib/features/clerkships/services/clerkship-service.ts`
- `src/lib/features/scheduling-config/services/teams.service.ts`

Changes:
- Add `scheduleId?: string` parameter to list methods
- Filter by schedule when provided (JOIN with junction table)
- Auto-add to active schedule on entity creation

### 2.3 Create ScheduleDuplicationService

**File:** `src/lib/features/schedules/services/schedule-duplication.service.ts`

```typescript
interface DuplicationOptions {
  students?: string[];      // specific IDs to copy, or 'all'
  preceptors?: string[];
  sites?: string[];
  healthSystems?: string[];
  clerkships?: string[];
  teams?: string[];
  configurations?: string[];
}

async duplicateToNewSchedule(
  sourceScheduleId: string,
  newScheduleName: string,
  startDate: string,
  endDate: string,
  year: number,
  options: DuplicationOptions
): Promise<Schedule>
```

- Creates new schedule
- Links selected entities to new schedule (does NOT copy, just associates)
- Returns new schedule

### Testing

- Unit tests for all service methods
- Test cascade delete logic (only delete if entity in single schedule)
- Test duplication with various options
- Run `npm run check` and `npm run test`

---

## Phase 3: API Routes

### 3.1 Schedule management endpoints

**File:** `src/routes/api/schedules/+server.ts`
- `GET` - List all schedules
- `POST` - Create new schedule

**File:** `src/routes/api/schedules/[id]/+server.ts`
- `GET` - Get schedule details
- `PATCH` - Update schedule (name, dates)
- `DELETE` - Delete schedule (with cascade logic)

**File:** `src/routes/api/schedules/[id]/activate/+server.ts`
- `POST` - Set as active schedule

**File:** `src/routes/api/schedules/[id]/duplicate/+server.ts`
- `POST` - Duplicate schedule with options
- Body: `{ name, startDate, endDate, year, options: DuplicationOptions }`

**File:** `src/routes/api/schedules/[id]/entities/+server.ts`
- `GET` - Get entities for schedule (query param: `type`)
- `POST` - Add entities to schedule
- `DELETE` - Remove entities from schedule

### 3.2 Update existing entity endpoints

Add `scheduleId` query parameter to filter by schedule:

**Files to modify:**
- `src/routes/api/students/+server.ts`
- `src/routes/api/preceptors/+server.ts`
- `src/routes/api/sites/+server.ts`
- `src/routes/api/health-systems/+server.ts`
- `src/routes/api/clerkships/+server.ts`

Changes:
- Accept `?scheduleId=xxx` query parameter
- Default to active schedule if not provided
- Auto-associate new entities with active schedule

### Testing

- API integration tests for all new endpoints
- Test schedule switching affects entity queries
- Run `npm run check` and `npm run test`

---

## Phase 4: Sidebar Schedule Selector

### 4.1 Create ScheduleSelector component

**File:** `src/lib/features/schedules/components/schedule-selector.svelte`

Features:
- Dropdown showing all schedules (name + date range)
- Current/active schedule highlighted with checkmark
- Date range display for selected schedule
- "New Schedule" button that opens wizard
- Quick edit for date range (inline or modal)

```svelte
<div class="schedule-selector">
  <select bind:value={selectedScheduleId} on:change={handleScheduleChange}>
    {#each schedules as schedule}
      <option value={schedule.id}>
        {schedule.name} ({schedule.start_date} - {schedule.end_date})
      </option>
    {/each}
  </select>

  <div class="date-range">
    <span>{activeSchedule.start_date}</span>
    <span>to</span>
    <span>{activeSchedule.end_date}</span>
    <button on:click={openDateEditor}>Edit</button>
  </div>

  <button on:click={openWizard}>+ New Schedule</button>
</div>
```

### 4.2 Integrate into layout

**File:** `src/routes/+layout.svelte` (or sidebar component)

- Add ScheduleSelector to sidebar, below navigation
- Position prominently but not intrusively

### 4.3 Create schedule store

**File:** `src/lib/stores/schedule-store.ts`

```typescript
import { writable, derived } from 'svelte/store';

interface ScheduleState {
  schedules: Schedule[];
  activeScheduleId: string | null;
  loading: boolean;
}

export const scheduleStore = writable<ScheduleState>({
  schedules: [],
  activeScheduleId: null,
  loading: true
});

export const activeSchedule = derived(scheduleStore, ($state) =>
  $state.schedules.find(s => s.id === $state.activeScheduleId) || null
);

// Actions
export async function loadSchedules() { ... }
export async function setActiveSchedule(id: string) { ... }
export async function createSchedule(data: CreateScheduleInput) { ... }
```

- Persist active schedule ID in localStorage
- Sync with server on changes
- Invalidate data when schedule changes

### Testing

- Component tests for ScheduleSelector
- Test schedule switching updates store
- Test localStorage persistence
- Run `npm run check` and `npm run test`

---

## Phase 5: New Schedule Wizard

### 5.1 Create wizard components

**File:** `src/lib/features/schedules/components/new-schedule-wizard.svelte`

Multi-step wizard with tabs:

```
Step 1: Schedule Details
  - Name (required)
  - Start Date (required)
  - End Date (required)
  - Year (auto-filled from start date)

Step 2: Students (tab with table)
  - Select All / Deselect All buttons
  - Search/filter input
  - Table: checkbox, name, email

Step 3: Preceptors (same pattern)
Step 4: Sites (same pattern)
Step 5: Health Systems (same pattern)
Step 6: Clerkships (same pattern)
Step 7: Teams (same pattern)
Step 8: Configurations (same pattern)

Step 9: Review & Create
  - Summary of selected entities
  - Create button
```

### 5.2 Create EntitySelectionTable component

**File:** `src/lib/features/schedules/components/entity-selection-table.svelte`

Reusable table with:
- Checkbox column
- Entity-specific columns
- Search/filter
- Select All / Deselect All
- Selected count display

Props:
```typescript
interface Props {
  entityType: 'students' | 'preceptors' | 'sites' | ...;
  entities: Entity[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}
```

### 5.3 Create wizard page

**File:** `src/routes/schedules/new/+page.svelte`

- Host the wizard component
- Load all entities from source schedule (or all if no source)
- Handle form submission
- Redirect to new schedule on success

### Testing

- Component tests for wizard steps
- Test navigation between steps
- Test entity selection persists across steps
- Integration test: complete wizard -> verify schedule created
- Run `npm run check` and `npm run test`

---

## Phase 6: Update All Data Views

### 6.1 Filter data by active schedule

Update all page data loaders:

**Files to modify:**
- `src/routes/students/+page.ts`
- `src/routes/preceptors/+page.ts`
- `src/routes/sites/+page.ts`
- `src/routes/health-systems/+page.ts`
- `src/routes/clerkships/+page.ts`
- `src/routes/calendar/+page.ts`
- `src/routes/schedule/+page.ts`

Changes:
- Get active schedule from store or API
- Pass scheduleId to API calls
- Only show entities/assignments for active schedule

### 6.2 Update data creation flows

- Auto-associate new entities with active schedule
- Show indication of which schedule entity will be added to
- Confirmation if creating while in specific schedule

### 6.3 Update schedule generation

**File:** `src/routes/api/schedules/generate/+server.ts`

- Scope to active schedule entities
- Create assignments linked to active schedule

### Testing

- Integration tests for each page with schedule filtering
- Test switching schedules updates all views
- Test new entities auto-added to active schedule
- Run `npm run check` and `npm run test`

---

## Files to Create/Modify

| Action | File Path |
|--------|-----------|
| Create | `src/lib/db/migrations/0XX_schedule_scoping.ts` |
| Create | `src/lib/features/schedules/services/schedule.service.ts` |
| Create | `src/lib/features/schedules/services/schedule-duplication.service.ts` |
| Create | `src/lib/features/schedules/components/schedule-selector.svelte` |
| Create | `src/lib/features/schedules/components/new-schedule-wizard.svelte` |
| Create | `src/lib/features/schedules/components/entity-selection-table.svelte` |
| Create | `src/lib/stores/schedule-store.ts` |
| Create | `src/routes/api/schedules/+server.ts` |
| Create | `src/routes/api/schedules/[id]/+server.ts` |
| Create | `src/routes/api/schedules/[id]/activate/+server.ts` |
| Create | `src/routes/api/schedules/[id]/duplicate/+server.ts` |
| Create | `src/routes/api/schedules/[id]/entities/+server.ts` |
| Create | `src/routes/schedules/new/+page.svelte` |
| Modify | `src/routes/+layout.svelte` |
| Modify | All entity service files |
| Modify | All entity API routes |
| Modify | All page data loaders |

---

## Validation Checklist

- [ ] Junction tables created with correct relationships
- [ ] Default schedule created for current year
- [ ] Existing data linked to default schedule
- [ ] Schedule selector in sidebar works
- [ ] Switching schedules updates all data views
- [ ] New entities auto-associated with active schedule
- [ ] Wizard allows selecting entities for new schedule
- [ ] Cascade delete respects multi-schedule entities
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] TypeScript build passes (`npm run check`)
- [ ] Production build succeeds (`npm run build`)
