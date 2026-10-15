# Dev Plan: Manual Assignment Creation UI

## Overview

Add the ability to manually create individual schedule assignments directly from the calendar view, without requiring a full schedule regeneration.

## Problem Statement

Currently, if a coordinator needs to add a single assignment (e.g., a student was added late, or an additional day is needed), they must regenerate the entire schedule. This is disruptive and may override carefully made manual adjustments.

## Solution

Add a "+" button on empty calendar day slots that opens a modal to create a single assignment with full validation.

---

## Implementation Steps

### Phase 1: Create Assignment Modal Component

**File: `src/lib/features/schedules/components/create-assignment-modal.svelte`**

```typescript
interface Props {
	open: boolean;
	date: string; // Pre-selected date from calendar click
	onSave: () => void;
	onCancel: () => void;
}
```

**Features:**

- Date picker (pre-populated from clicked day)
- Student dropdown (searchable, shows only students in active schedule)
- Clerkship dropdown (shows remaining days needed for selected student)
- Preceptor dropdown (filtered by availability on selected date)
- Real-time validation display (capacity, conflicts, blackouts)
- "Create" and "Cancel" buttons

**Validation Display:**

- Green checkmark when valid
- Red error messages for each constraint violation
- Warning for assignments that would exceed clerkship requirements

### Phase 2: Backend API Endpoint

**File: `src/routes/api/schedules/assignments/+server.ts`**

Add POST handler for creating single assignments:

```typescript
// POST /api/schedules/assignments
export async function POST({ request, locals }) {
	const { student_id, preceptor_id, clerkship_id, date, dry_run } = await request.json();

	// If dry_run, only validate
	if (dry_run) {
		const validation = await validateAssignment(db, {
			student_id,
			preceptor_id,
			clerkship_id,
			date
		});
		return json({ valid: validation.valid, errors: validation.errors });
	}

	// Create assignment
	const assignment = await createAssignment(db, { student_id, preceptor_id, clerkship_id, date });
	return json(assignment, { status: 201 });
}
```

**Note:** The `createAssignment` function already exists in `assignment-service.ts:122` with full validation.

### Phase 3: Available Preceptors Query

**File: `src/lib/features/schedules/services/assignment-service.ts`**

Add helper function:

```typescript
/**
 * Get preceptors available on a specific date for a clerkship
 */
export async function getAvailablePreceptorsForDate(
	db: Kysely<DB>,
	date: string,
	clerkshipId: string
): Promise<
	Array<{
		id: string;
		name: string;
		availableSlots: number;
		isTeamMember: boolean;
	}>
> {
	// 1. Get preceptors with availability on this date
	// 2. Filter by team membership for this clerkship
	// 3. Check capacity (max_students - current assignments)
	// 4. Exclude if on blackout date
	// 5. Sort by: team members first, then by available slots
}
```

**API Endpoint: `GET /api/preceptors/available?date=YYYY-MM-DD&clerkship_id=xxx`**

### Phase 4: Student Requirements Query

**File: `src/routes/api/students/[id]/requirements/+server.ts`**

```typescript
// GET /api/students/{id}/requirements
// Returns remaining days needed per clerkship
{
	clerkships: [
		{ id: '...', name: 'Family Medicine', required: 20, assigned: 15, remaining: 5 },
		{ id: '...', name: 'Surgery', required: 28, assigned: 28, remaining: 0, complete: true }
	];
}
```

### Phase 5: Calendar Grid Integration

**File: `src/lib/features/schedules/components/schedule-calendar-grid.svelte`**

Modify to show "+" button on empty, available days:

```svelte
{:else if day.isCurrentMonth && !isBlackoutDate(day.date) && !isPastDate(day.date)}
  <button
    type="button"
    class="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-primary/10
           hover:bg-primary/20 flex items-center justify-center
           opacity-0 group-hover:opacity-100 transition-opacity"
    onclick={(e) => { e.stopPropagation(); onCreateClick?.(day); }}
    title="Add assignment"
  >
    <span class="text-primary text-sm">+</span>
  </button>
{/if}
```

**Add new prop:**

```typescript
onCreateClick?: (day: CalendarDay) => void;
```

### Phase 6: Calendar Page Integration

**File: `src/routes/calendar/+page.svelte`**

Add state and handlers:

```svelte
<script>
	let showCreateModal = $state(false);
	let createDate = $state<string>('');

	function handleCreateClick(day: CalendarDay) {
		createDate = day.date;
		showCreateModal = true;
	}

	function handleCreateSave() {
		showCreateModal = false;
		loadCalendar();
	}
</script>

<!-- In calendar grid -->
<ScheduleCalendarGrid ... onCreateClick={handleCreateClick} />

<!-- Modal -->
<CreateAssignmentModal
	open={showCreateModal}
	date={createDate}
	students={data.students}
	clerkships={data.clerkships}
	onSave={handleCreateSave}
	onCancel={() => (showCreateModal = false)}
/>
```

---

## Data Flow

```
User clicks "+" on calendar day
         │
         ▼
┌─────────────────────────────────┐
│   CreateAssignmentModal opens   │
│   with date pre-populated       │
└─────────────────────────────────┘
         │
         ▼
User selects Student
         │
         ▼
┌─────────────────────────────────┐
│  Fetch student requirements     │
│  GET /api/students/{id}/reqs    │
└─────────────────────────────────┘
         │
         ▼
User selects Clerkship
         │
         ▼
┌─────────────────────────────────┐
│  Fetch available preceptors     │
│  GET /api/preceptors/available  │
│  ?date=X&clerkship_id=Y         │
└─────────────────────────────────┘
         │
         ▼
User selects Preceptor
         │
         ▼
┌─────────────────────────────────┐
│  Dry-run validation             │
│  POST /api/schedules/assignments│
│  { ..., dry_run: true }         │
└─────────────────────────────────┘
         │
         ▼
Validation result displayed
         │
         ▼
User clicks "Create"
         │
         ▼
┌─────────────────────────────────┐
│  Create assignment              │
│  POST /api/schedules/assignments│
│  { ..., dry_run: false }        │
└─────────────────────────────────┘
         │
         ▼
Calendar refreshes
```

---

## UI Wireframe

```
┌─────────────────────────────────────────────────┐
│         Create Assignment                    ✕  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Date:        [2025-01-15        ] 📅          │
│                                                 │
│  Student:     [Select student...       ▼]      │
│                                                 │
│  Clerkship:   [Select clerkship...     ▼]      │
│               ℹ️ 5 days remaining for this      │
│                  student                        │
│                                                 │
│  Preceptor:   [Select preceptor...     ▼]      │
│               ✓ Dr. Smith - 2 slots available  │
│               ✓ Dr. Jones - 1 slot available   │
│               ✗ Dr. Lee - at capacity          │
│                                                 │
├─────────────────────────────────────────────────┤
│  Validation:                                    │
│  ✓ Student has no conflict on this date        │
│  ✓ Preceptor is available                      │
│  ✓ Preceptor has capacity                      │
│  ✓ Not a blackout date                         │
│                                                 │
├─────────────────────────────────────────────────┤
│                        [Cancel]  [Create]       │
└─────────────────────────────────────────────────┘
```

---

## Files to Create/Modify

| File                                                                   | Action | Description                         |
| ---------------------------------------------------------------------- | ------ | ----------------------------------- |
| `src/lib/features/schedules/components/create-assignment-modal.svelte` | Create | New modal component                 |
| `src/routes/api/schedules/assignments/+server.ts`                      | Modify | Add POST handler                    |
| `src/routes/api/preceptors/available/+server.ts`                       | Create | Available preceptors endpoint       |
| `src/routes/api/students/[id]/requirements/+server.ts`                 | Create | Student requirements endpoint       |
| `src/lib/features/schedules/services/assignment-service.ts`            | Modify | Add `getAvailablePreceptorsForDate` |
| `src/lib/features/schedules/components/schedule-calendar-grid.svelte`  | Modify | Add "+" button and callback         |
| `src/routes/calendar/+page.svelte`                                     | Modify | Add modal state and handler         |

---

## Testing Plan

### Unit Tests

- `getAvailablePreceptorsForDate` returns correct preceptors
- `getAvailablePreceptorsForDate` respects capacity limits
- `getAvailablePreceptorsForDate` excludes unavailable preceptors

### Integration Tests

- Create assignment via API with valid data
- Create assignment fails with student conflict
- Create assignment fails with preceptor at capacity
- Create assignment fails on blackout date
- Dry-run returns validation errors without creating

### E2E Tests

- Click "+" on calendar day opens modal
- Select student shows their remaining requirements
- Select clerkship filters preceptor list
- Validation errors display correctly
- Successful creation refreshes calendar
- Cannot create on past dates
- Cannot create on blackout dates

---

## Estimated Effort

| Phase                               | Effort                 |
| ----------------------------------- | ---------------------- |
| Phase 1: Modal Component            | Medium                 |
| Phase 2: POST API                   | Small (service exists) |
| Phase 3: Available Preceptors Query | Medium                 |
| Phase 4: Student Requirements Query | Small                  |
| Phase 5: Calendar Grid Changes      | Small                  |
| Phase 6: Page Integration           | Small                  |
| Testing                             | Medium                 |

**Total: ~3-4 days of development**

---

## Future Enhancements

1. **Bulk Creation Mode**: Allow creating multiple assignments in one session
2. **Template Assignments**: Save common patterns (e.g., "Mon/Wed/Fri with Dr. Smith")
3. **Smart Suggestions**: Recommend preceptors based on team, past assignments, load balancing
4. **Copy from Another Student**: Quick-create similar schedule to an existing student
