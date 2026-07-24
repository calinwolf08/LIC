# Step 16: Blackout Dates - UI

## Overview
Implement the user interface for managing blackout dates, including list view with calendar visualization, date picker for adding blackout periods, and delete functionality.

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 15: Blackout Dates - API Routes

## Requirements

### Pages
- **Blackout Dates Page** (`/blackout-dates`)
  - Calendar view showing blackout dates
  - List view with all blackout dates
  - Add new blackout date button
  - Date range picker
  - Delete functionality

### UI Components
- Calendar (shadcn/ui)
- Date picker/range picker (shadcn/ui)
- Data table (shadcn/ui)
- Modal/dialog (shadcn/ui)
- Alert/toast for feedback (shadcn/ui)

### User Experience
- Visual calendar showing blocked dates
- Loading states during API calls
- Success/error notifications
- Confirmation dialogs for destructive actions
- Responsive design
- Accessible (ARIA labels, keyboard navigation)

## Implementation Details

### File Structure
```
/src/routes/(app)/blackout-dates/
├── +page.svelte                       # Blackout dates page (NEW)
├── +page.ts                           # Load data (NEW)
└── components/
    ├── BlackoutDateCalendar.svelte    # Calendar view (NEW)
    ├── BlackoutDateList.svelte        # List view (NEW)
    ├── AddBlackoutDateForm.svelte     # Add form (NEW)
    └── DeleteBlackoutDialog.svelte    # Delete confirmation (NEW)
```

---

## Files to Create

### 1. `/src/routes/(app)/blackout-dates/+page.ts`

Page load function to fetch blackout dates.

**Exports:**
```typescript
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/blackout-dates');
  const { data: blackoutDates } = await response.json();

  return {
    blackoutDates
  };
};
```

---

### 2. `/src/routes/(app)/blackout-dates/+page.svelte`

Main blackout dates management page.

**Features:**
- Toggle between calendar and list view
- "Add Blackout Date" button
- Modal/dialog for AddBlackoutDateForm
- Toast notifications for actions
- Loading spinner during operations

**State Management:**
```typescript
let blackoutDates = data.blackoutDates;
let isFormOpen = false;
let viewMode: 'calendar' | 'list' = 'calendar';

function openAddForm() {
  isFormOpen = true;
}

async function handleFormSubmit(event: CustomEvent) {
  // Handle create
  // Refresh blackout dates list
  // Show success toast
}

async function handleDelete(blackoutDateId: string) {
  // Confirm and delete
  // Refresh list
  // Show success toast
}
```

**Layout:**
```svelte
<script lang="ts">
  import BlackoutDateCalendar from './components/BlackoutDateCalendar.svelte';
  import BlackoutDateList from './components/BlackoutDateList.svelte';
  import AddBlackoutDateForm from './components/AddBlackoutDateForm.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Dialog } from '$lib/components/ui/dialog';
  import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';

  export let data;
  // ... state variables
</script>

<div class="container mx-auto py-8">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-3xl font-bold">Blackout Dates</h1>
    <div class="flex gap-4">
      <ToggleGroup bind:value={viewMode}>
        <ToggleGroupItem value="calendar">Calendar</ToggleGroupItem>
        <ToggleGroupItem value="list">List</ToggleGroupItem>
      </ToggleGroup>
      <Button on:click={openAddForm}>Add Blackout Date</Button>
    </div>
  </div>

  {#if viewMode === 'calendar'}
    <BlackoutDateCalendar
      {blackoutDates}
      on:delete={handleDelete}
    />
  {:else}
    <BlackoutDateList
      {blackoutDates}
      on:delete={handleDelete}
    />
  {/if}

  <Dialog open={isFormOpen} on:close={() => isFormOpen = false}>
    <AddBlackoutDateForm
      on:submit={handleFormSubmit}
      on:cancel={() => isFormOpen = false}
    />
  </Dialog>
</div>
```

---

### 3. `/src/routes/(app)/blackout-dates/components/BlackoutDateCalendar.svelte`

Calendar view showing blackout dates visually.

**Props:**
```typescript
export let blackoutDates: BlackoutDatesTable[];
```

**Events:**
```typescript
createEventDispatcher<{
  delete: string;
}>();
```

**Features:**
- Display calendar with blackout dates highlighted
- Click on date to see blackout info
- Delete button in tooltip/popover
- Navigate between months
- Legend showing blackout date colors

**Implementation:**
```svelte
<script lang="ts">
  import { Calendar } from '$lib/components/ui/calendar';
  import { Popover } from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import type { BlackoutDatesTable } from '$lib/db/types';

  export let blackoutDates: BlackoutDatesTable[];

  const dispatch = createEventDispatcher();

  // Convert blackout dates to calendar format
  $: markedDates = blackoutDates.map(bd => ({
    start: new Date(bd.start_date),
    end: new Date(bd.end_date),
    reason: bd.reason,
    id: bd.id
  }));

  function isBlackedOut(date: Date): boolean {
    return markedDates.some(bd =>
      date >= bd.start && date <= bd.end
    );
  }

  function getBlackoutInfo(date: Date) {
    return markedDates.filter(bd =>
      date >= bd.start && date <= bd.end
    );
  }
</script>

<div class="space-y-4">
  <Calendar
    modifiers={{
      blackout: (date) => isBlackedOut(date)
    }}
    modifiersClassNames={{
      blackout: 'bg-red-100 text-red-900'
    }}
  >
    <svelte:fragment slot="day" let:date>
      {#if isBlackedOut(date)}
        <Popover>
          <div class="w-full h-full">
            {date.getDate()}
          </div>
          <svelte:fragment slot="content">
            {#each getBlackoutInfo(date) as blackout}
              <div class="p-2 space-y-2">
                <p class="font-semibold">{blackout.reason}</p>
                <Button
                  size="sm"
                  variant="destructive"
                  on:click={() => dispatch('delete', blackout.id)}
                >
                  Delete
                </Button>
              </div>
            {/each}
          </svelte:fragment>
        </Popover>
      {/if}
    </svelte:fragment>
  </Calendar>

  <div class="flex items-center gap-2 text-sm">
    <div class="w-4 h-4 bg-red-100 border border-red-300"></div>
    <span>Blackout Date</span>
  </div>
</div>
```

---

### 4. `/src/routes/(app)/blackout-dates/components/BlackoutDateList.svelte`

List view for blackout dates.

**Props:**
```typescript
export let blackoutDates: BlackoutDatesTable[];
```

**Events:**
```typescript
createEventDispatcher<{
  delete: string;
}>();
```

**Features:**
- Table showing all blackout dates
- Sortable columns
- Delete button per row
- Empty state when no blackout dates

**Columns:**
- Start Date
- End Date
- Reason
- Actions (Delete)

**Implementation:**
```svelte
<script lang="ts">
  import { DataTable } from '$lib/components/ui/data-table';
  import { Button } from '$lib/components/ui/button';
  import type { BlackoutDatesTable } from '$lib/db/types';

  export let blackoutDates: BlackoutDatesTable[];

  const dispatch = createEventDispatcher();

  const columns = [
    { key: 'start_date', label: 'Start Date', sortable: true },
    { key: 'end_date', label: 'End Date', sortable: true },
    { key: 'reason', label: 'Reason', sortable: true },
    { key: 'actions', label: 'Actions', sortable: false }
  ];
</script>

<DataTable {columns} data={blackoutDates}>
  <svelte:fragment slot="cell" let:row let:column>
    {#if column.key === 'actions'}
      <Button
        size="sm"
        variant="destructive"
        on:click={() => dispatch('delete', row.id)}
      >
        Delete
      </Button>
    {:else}
      {row[column.key]}
    {/if}
  </svelte:fragment>
</DataTable>
```

---

### 5. `/src/routes/(app)/blackout-dates/components/AddBlackoutDateForm.svelte`

Form for adding blackout dates.

**Events:**
```typescript
createEventDispatcher<{
  submit: BlackoutDatesTable;
  cancel: void;
}>();
```

**Form Fields:**
- Date Range (start_date, end_date) - date range picker
- Reason (required, text input)

**Validation:**
- Client-side validation using Zod schema
- Display field-level errors
- Disable submit when invalid
- Show loading state during submission

**Implementation:**
```svelte
<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { zod } from 'sveltekit-superforms/adapters';
  import { createBlackoutDateSchema } from '$lib/features/blackout-dates/schemas';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { DateRangePicker } from '$lib/components/ui/date-range-picker';

  const { form, errors, enhance, submitting } = superForm(
    { start_date: '', end_date: '', reason: '' },
    {
      validators: zod(createBlackoutDateSchema),
      async onUpdate({ form }) {
        if (form.valid) {
          const response = await fetch('/api/blackout-dates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form.data)
          });

          if (response.ok) {
            const { data } = await response.json();
            dispatch('submit', data);
          }
        }
      }
    }
  );
</script>

<form method="POST" use:enhance class="space-y-4">
  <div>
    <Label>Date Range</Label>
    <DateRangePicker
      bind:startDate={$form.start_date}
      bind:endDate={$form.end_date}
    />
    {#if $errors.start_date}<span class="text-red-500">{$errors.start_date}</span>{/if}
    {#if $errors.end_date}<span class="text-red-500">{$errors.end_date}</span>{/if}
  </div>

  <div>
    <Label for="reason">Reason</Label>
    <Input id="reason" bind:value={$form.reason} />
    {#if $errors.reason}<span class="text-red-500">{$errors.reason}</span>{/if}
  </div>

  <div class="flex justify-end gap-2">
    <Button type="button" variant="outline" on:click={() => dispatch('cancel')}>
      Cancel
    </Button>
    <Button type="submit" disabled={$submitting}>
      Add Blackout Date
    </Button>
  </div>
</form>
```

---

### 6. `/src/routes/(app)/blackout-dates/components/DeleteBlackoutDialog.svelte`

Confirmation dialog for deleting blackout dates.

**Props:**
```typescript
export let blackoutDate: BlackoutDatesTable;
export let open: boolean = false;
```

**Events:**
```typescript
createEventDispatcher<{
  confirm: string;
  cancel: void;
}>();
```

---

## Testing Requirements

### Component Tests

#### BlackoutDateCalendar.svelte
- ✅ Renders calendar with blackout dates highlighted
- ✅ Shows blackout info on date hover/click
- ✅ Emits delete event
- ✅ Displays multiple blackouts on same date

#### BlackoutDateList.svelte
- ✅ Renders blackout dates in table
- ✅ Displays empty state when no blackout dates
- ✅ Emits delete event
- ✅ Sortable columns work correctly

#### AddBlackoutDateForm.svelte
- ✅ Validates required fields
- ✅ Validates date range (start <= end)
- ✅ Displays field errors
- ✅ Disables submit when invalid
- ✅ Shows loading state during submission
- ✅ Emits submit event on success
- ✅ Emits cancel event

---

### Integration Tests

#### `/src/routes/(app)/blackout-dates/+page.test.ts`
- ✅ Page loads blackout dates
- ✅ Toggles between calendar and list view
- ✅ Opens add form on button click
- ✅ Creates new blackout date
- ✅ Deletes blackout date after confirmation
- ✅ Shows success toast on actions
- ✅ Shows error toast on failures

---

## Acceptance Criteria

- [ ] Blackout dates page created and accessible at /blackout-dates
- [ ] Calendar view displays blackout dates visually
- [ ] List view displays all blackout dates in table
- [ ] Toggle between calendar and list view works
- [ ] Add Blackout Date button opens form
- [ ] Date range picker allows selecting start and end dates
- [ ] Form validates and submits
- [ ] Delete confirmation prevents accidental deletion
- [ ] Success/error toasts display appropriately
- [ ] All UI components are responsive
- [ ] All interactive elements are keyboard accessible
- [ ] Loading states display during async operations
- [ ] Calendar highlights blackout dates clearly

---

## Usage Example

User workflow:
1. Navigate to `/blackout-dates`
2. View calendar with blackout dates highlighted
3. Toggle to list view to see all dates
4. Click "Add Blackout Date"
5. Select date range using date picker
6. Enter reason (e.g., "Spring Break")
7. Submit to save
8. Click on highlighted date in calendar to see info
9. Click "Delete" to remove blackout date (with confirmation)

---

## Notes

- Use shadcn/ui components for consistent styling
- Calendar view is more intuitive for visualizing blackouts
- Consider adding preset templates (e.g., US federal holidays)
- Future enhancement: recurring blackout dates
- Consider color coding by reason category
- Add bulk import functionality (CSV/Excel)

---

## References

- [shadcn/ui Calendar](https://ui.shadcn.com/docs/components/calendar)
- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/data-table)
- [shadcn/ui Date Picker](https://ui.shadcn.com/docs/components/date-picker)
- [SvelteKit Load Functions](https://kit.svelte.dev/docs/load)
