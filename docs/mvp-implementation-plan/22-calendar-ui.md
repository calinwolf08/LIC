# Step 22: Calendar - UI

## Overview
Implement the calendar user interface for viewing and interacting with schedule assignments. This includes calendar component integration, multiple view options (monthly/weekly/daily), color coding by clerkship, and filtering controls.

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 21: Calendar - API Routes

## Requirements

### Pages
- **Calendar Page** (`/calendar`)
  - Full calendar view with schedule assignments
  - View toggle (month, week, day)
  - Filter controls (student, preceptor, clerkship, date range)
  - Event click to view details
  - Summary statistics display

### UI Components
- Calendar component (shadcn/ui)
- Filter panel with selects/inputs
- Event detail modal/popover
- Summary cards
- Legend for color coding

### User Experience
- Loading states during data fetch
- Empty state when no assignments
- Responsive calendar view
- Color coding by clerkship type
- Accessible (ARIA labels, keyboard navigation)
- Date navigation (prev/next month, today)

## Implementation Details

### File Structure
```
/src/routes/(app)/calendar/
├── +page.svelte                    # Calendar page (NEW)
├── +page.ts                        # Load data (NEW)
└── components/
    ├── ScheduleCalendar.svelte     # Calendar component (NEW)
    ├── CalendarFilters.svelte      # Filter controls (NEW)
    ├── EventDetailModal.svelte     # Event details (NEW)
    └── ScheduleSummary.svelte      # Summary stats (NEW)
```

---

## Files to Create

### 1. `/src/routes/(app)/calendar/+page.ts`

Page load function to fetch initial calendar data and filter options.

**Exports:**
```typescript
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  // Default to current month
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  // Fetch calendar data
  const calendarResponse = await fetch(
    `/api/calendar?start_date=${startDateStr}&end_date=${endDateStr}`
  );
  const { data: calendarData } = await calendarResponse.json();

  // Fetch filter options
  const [studentsRes, preceptorsRes, clerkshipsRes] = await Promise.all([
    fetch('/api/students'),
    fetch('/api/preceptors'),
    fetch('/api/clerkships'),
  ]);

  const { data: students } = await studentsRes.json();
  const { data: preceptors } = await preceptorsRes.json();
  const { data: clerkships } = await clerkshipsRes.json();

  return {
    events: calendarData.events,
    summary: calendarData.summary,
    students,
    preceptors,
    clerkships,
    initialStartDate: startDateStr,
    initialEndDate: endDateStr,
  };
};
```

---

### 2. `/src/routes/(app)/calendar/+page.svelte`

Main calendar page with filters and summary.

**Features:**
- Display ScheduleCalendar component
- Calendar filter controls
- View mode toggle (month/week/day)
- Summary statistics
- Event detail modal
- Loading states

**State Management:**
```typescript
let events = data.events;
let summary = data.summary;
let viewMode: 'month' | 'week' | 'day' = 'month';
let currentDate = new Date();
let filters = {
  student_id: undefined,
  preceptor_id: undefined,
  clerkship_id: undefined,
};
let selectedEvent: CalendarEvent | null = null;
let isLoading = false;

async function fetchCalendarData() {
  isLoading = true;

  const { startDate, endDate } = calculateDateRange(currentDate, viewMode);

  let url = `/api/calendar?start_date=${startDate}&end_date=${endDate}`;
  if (filters.student_id) url += `&student_id=${filters.student_id}`;
  if (filters.preceptor_id) url += `&preceptor_id=${filters.preceptor_id}`;
  if (filters.clerkship_id) url += `&clerkship_id=${filters.clerkship_id}`;

  const response = await fetch(url);
  const { data } = await response.json();

  events = data.events;
  summary = data.summary;
  isLoading = false;
}

function handleDateChange(newDate: Date) {
  currentDate = newDate;
  fetchCalendarData();
}

function handleFilterChange() {
  fetchCalendarData();
}

function handleEventClick(event: CalendarEvent) {
  selectedEvent = event;
}

function navigatePrevious() {
  if (viewMode === 'month') {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  } else if (viewMode === 'week') {
    currentDate = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    currentDate = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);
  }
  fetchCalendarData();
}

function navigateNext() {
  // Similar logic for next period
  fetchCalendarData();
}

function goToToday() {
  currentDate = new Date();
  fetchCalendarData();
}
```

**Layout:**
```svelte
<script lang="ts">
  import ScheduleCalendar from './components/ScheduleCalendar.svelte';
  import CalendarFilters from './components/CalendarFilters.svelte';
  import EventDetailModal from './components/EventDetailModal.svelte';
  import ScheduleSummary from './components/ScheduleSummary.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';

  export let data;
  // ... state variables
</script>

<div class="container mx-auto py-8">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-3xl font-bold">Schedule Calendar</h1>

    <div class="flex gap-4">
      <ToggleGroup bind:value={viewMode} on:change={fetchCalendarData}>
        <ToggleGroupItem value="month">Month</ToggleGroupItem>
        <ToggleGroupItem value="week">Week</ToggleGroupItem>
        <ToggleGroupItem value="day">Day</ToggleGroupItem>
      </ToggleGroup>

      <Button on:click={goToToday}>Today</Button>
    </div>
  </div>

  <div class="grid grid-cols-4 gap-6">
    <!-- Sidebar: Filters and Summary -->
    <div class="col-span-1 space-y-6">
      <CalendarFilters
        students={data.students}
        preceptors={data.preceptors}
        clerkships={data.clerkships}
        bind:filters
        on:change={handleFilterChange}
      />

      <ScheduleSummary {summary} />
    </div>

    <!-- Main: Calendar -->
    <div class="col-span-3">
      <ScheduleCalendar
        {events}
        {viewMode}
        {currentDate}
        {isLoading}
        on:event-click={handleEventClick}
        on:date-change={handleDateChange}
        on:previous={navigatePrevious}
        on:next={navigateNext}
      />
    </div>
  </div>

  <!-- Event Detail Modal -->
  {#if selectedEvent}
    <EventDetailModal
      event={selectedEvent}
      open={!!selectedEvent}
      on:close={() => selectedEvent = null}
    />
  {/if}
</div>
```

---

### 3. `/src/routes/(app)/calendar/components/ScheduleCalendar.svelte`

Calendar component displaying schedule events.

**Props:**
```typescript
export let events: CalendarEvent[];
export let viewMode: 'month' | 'week' | 'day';
export let currentDate: Date;
export let isLoading: boolean = false;
```

**Events:**
```typescript
createEventDispatcher<{
  'event-click': CalendarEvent;
  'date-change': Date;
  previous: void;
  next: void;
}>();
```

**Features:**
- Display calendar with events
- Color code events by clerkship
- Handle event clicks
- Navigation controls
- Loading state overlay
- Empty state

**Implementation:**
```svelte
<script lang="ts">
  import { Calendar } from '$lib/components/ui/calendar';
  import { Button } from '$lib/components/ui/button';
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import type { CalendarEvent } from '$lib/features/schedules/types';

  export let events: CalendarEvent[];
  export let viewMode: 'month' | 'week' | 'day';
  export let currentDate: Date;
  export let isLoading: boolean = false;

  const dispatch = createEventDispatcher();

  // Map clerkship to colors (simple version - could be stored in DB)
  const clerkshipColors: Record<string, string> = {
    'Internal Medicine': '#3b82f6', // blue
    'Surgery': '#ef4444', // red
    'Pediatrics': '#10b981', // green
    'OB/GYN': '#f59e0b', // amber
    // Add more as needed
  };

  function getEventColor(event: CalendarEvent): string {
    return clerkshipColors[event.assignment.clerkship_name] || '#6b7280'; // gray default
  }

  function formatEventTitle(event: CalendarEvent): string {
    return viewMode === 'month'
      ? event.assignment.student_name.split(' ')[0] // First name only
      : event.title; // Full title
  }
</script>

<div class="calendar-container">
  <!-- Navigation Header -->
  <div class="flex items-center justify-between mb-4">
    <Button variant="outline" size="icon" on:click={() => dispatch('previous')}>
      <ChevronLeft class="h-4 w-4" />
    </Button>

    <h2 class="text-xl font-semibold">
      {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
    </h2>

    <Button variant="outline" size="icon" on:click={() => dispatch('next')}>
      <ChevronRight class="h-4 w-4" />
    </Button>
  </div>

  <!-- Loading Overlay -->
  {#if isLoading}
    <div class="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
      <div class="animate-spin">Loading...</div>
    </div>
  {/if}

  <!-- Calendar Grid -->
  <div class="calendar-grid">
    {#each events as event}
      <div
        class="calendar-event"
        style="background-color: {getEventColor(event)};"
        on:click={() => dispatch('event-click', event)}
        on:keydown={(e) => e.key === 'Enter' && dispatch('event-click', event)}
        role="button"
        tabindex="0"
      >
        <span class="text-white font-medium">
          {formatEventTitle(event)}
        </span>
      </div>
    {/each}
  </div>

  <!-- Empty State -->
  {#if !isLoading && events.length === 0}
    <div class="text-center py-12 text-gray-500">
      No schedule assignments for this period.
    </div>
  {/if}

  <!-- Legend -->
  <div class="mt-4 flex gap-4 flex-wrap">
    {#each Object.entries(clerkshipColors) as [clerkship, color]}
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded" style="background-color: {color};"></div>
        <span class="text-sm">{clerkship}</span>
      </div>
    {/each}
  </div>
</div>
```

---

### 4. `/src/routes/(app)/calendar/components/CalendarFilters.svelte`

Filter controls for calendar view.

**Props:**
```typescript
export let students: StudentsTable[];
export let preceptors: PreceptorsTable[];
export let clerkships: ClerkshipsTable[];
export let filters: {
  student_id?: string;
  preceptor_id?: string;
  clerkship_id?: string;
};
```

**Events:**
```typescript
createEventDispatcher<{
  change: void;
}>();
```

**Implementation:**
```svelte
<script lang="ts">
  import { Select } from '$lib/components/ui/select';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';

  export let students: StudentsTable[];
  export let preceptors: PreceptorsTable[];
  export let clerkships: ClerkshipsTable[];
  export let filters: { student_id?: string; preceptor_id?: string; clerkship_id?: string };

  const dispatch = createEventDispatcher();

  function handleChange() {
    dispatch('change');
  }

  function clearFilters() {
    filters = {
      student_id: undefined,
      preceptor_id: undefined,
      clerkship_id: undefined,
    };
    dispatch('change');
  }
</script>

<div class="space-y-4">
  <h3 class="font-semibold">Filters</h3>

  <div>
    <Label>Student</Label>
    <Select
      bind:value={filters.student_id}
      on:change={handleChange}
      placeholder="All Students"
    >
      <option value={undefined}>All Students</option>
      {#each students as student}
        <option value={student.id}>{student.name}</option>
      {/each}
    </Select>
  </div>

  <div>
    <Label>Preceptor</Label>
    <Select
      bind:value={filters.preceptor_id}
      on:change={handleChange}
      placeholder="All Preceptors"
    >
      <option value={undefined}>All Preceptors</option>
      {#each preceptors as preceptor}
        <option value={preceptor.id}>{preceptor.name}</option>
      {/each}
    </Select>
  </div>

  <div>
    <Label>Clerkship</Label>
    <Select
      bind:value={filters.clerkship_id}
      on:change={handleChange}
      placeholder="All Clerkships"
    >
      <option value={undefined}>All Clerkships</option>
      {#each clerkships as clerkship}
        <option value={clerkship.id}>{clerkship.name}</option>
      {/each}
    </Select>
  </div>

  <Button variant="outline" on:click={clearFilters} class="w-full">
    Clear Filters
  </Button>
</div>
```

---

### 5. `/src/routes/(app)/calendar/components/EventDetailModal.svelte`

Modal displaying full event/assignment details.

**Props:**
```typescript
export let event: CalendarEvent;
export let open: boolean;
```

**Events:**
```typescript
createEventDispatcher<{
  close: void;
}>();
```

**Features:**
- Display all assignment details
- Student information
- Preceptor information
- Clerkship information
- Date range
- Close button

---

### 6. `/src/routes/(app)/calendar/components/ScheduleSummary.svelte`

Summary statistics display.

**Props:**
```typescript
export let summary: {
  total_assignments: number;
  active_students: number;
  active_preceptors: number;
  assignments_by_clerkship: { clerkship_name: string; count: number }[];
};
```

**Features:**
- Display total assignments
- Display active students
- Display active preceptors
- Display breakdown by clerkship
- Visual cards/badges

---

## Testing Requirements

### Component Tests

#### ScheduleCalendar.svelte
- ✅ Renders calendar with events
- ✅ Color codes events correctly
- ✅ Emits event-click on event selection
- ✅ Navigation controls work
- ✅ Displays loading state
- ✅ Displays empty state
- ✅ Shows legend

#### CalendarFilters.svelte
- ✅ Renders all filter controls
- ✅ Emits change event on filter selection
- ✅ Clear filters button works
- ✅ Populates select options correctly

#### EventDetailModal.svelte
- ✅ Displays all event details
- ✅ Shows student information
- ✅ Shows preceptor information
- ✅ Shows clerkship information
- ✅ Close functionality works

#### ScheduleSummary.svelte
- ✅ Displays all summary statistics
- ✅ Formats numbers correctly
- ✅ Shows clerkship breakdown

---

### Integration Tests

#### `/src/routes/(app)/calendar/+page.test.ts`
- ✅ Page loads calendar data
- ✅ Filters update calendar view
- ✅ View mode toggle works
- ✅ Date navigation works
- ✅ Event click opens detail modal
- ✅ Today button resets to current date

---

## Acceptance Criteria

- [ ] Calendar page created and accessible at /calendar
- [ ] Calendar displays schedule events
- [ ] Events are color coded by clerkship
- [ ] Month/week/day view toggle works
- [ ] Student filter works
- [ ] Preceptor filter works
- [ ] Clerkship filter works
- [ ] Event click shows detail modal
- [ ] Summary statistics display correctly
- [ ] Date navigation works (prev/next/today)
- [ ] Loading states display during data fetch
- [ ] Empty state displays when no events
- [ ] All UI components are responsive
- [ ] Calendar is keyboard accessible
- [ ] Legend shows color mapping

---

## Usage Example

User workflow:
1. Navigate to `/calendar`
2. View current month's schedule assignments
3. Toggle to week or day view
4. Filter by specific student
5. Click on event to see full details
6. Navigate to next month
7. Clear filters to see all assignments
8. View summary statistics in sidebar

---

## Notes

- Use shadcn/ui calendar component as base
- Color coding improves visual clarity
- Consider caching calendar data
- Future: Add drag-and-drop for reassignment
- Future: Add export to iCal format
- Consider mobile-optimized view

---

## References

- [shadcn/ui Calendar](https://ui.shadcn.com/docs/components/calendar)
- [FullCalendar](https://fullcalendar.io/)
- [Date Navigation Patterns](https://www.nngroup.com/articles/date-input/)
