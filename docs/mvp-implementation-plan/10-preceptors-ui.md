# Step 10: Preceptors - UI

## Overview
Implement the user interface for preceptor management, including list view with data table, create/edit forms, availability calendar interface, and delete confirmation. This provides the frontend for managing preceptors and their availability.

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 09: Preceptors - API Routes

## Requirements

### Pages
- **Preceptor List Page** (`/preceptors`)
  - Data table with all preceptors
  - Search/filter functionality
  - Add new button
  - Edit/delete actions per row

- **Preceptor Form** (create/edit modal or page)
  - Name, email, specialty, max_students inputs
  - Form validation
  - Submit/cancel buttons
  - Error handling

- **Availability Management**
  - Calendar/date picker interface
  - Add/remove availability periods
  - Visual representation of availability
  - Bulk update capability

### UI Components
- Data table (shadcn/ui)
- Form components (shadcn/ui)
- Calendar/date picker (shadcn/ui)
- Modal/dialog (shadcn/ui)
- Alert/toast for feedback (shadcn/ui)

### User Experience
- Loading states during API calls
- Success/error notifications
- Confirmation dialogs for destructive actions
- Responsive design
- Accessible (ARIA labels, keyboard navigation)

## Implementation Details

### File Structure
```
/src/routes/(app)/preceptors/
├── +page.svelte                        # Preceptor list page (NEW)
├── +page.ts                            # Load data (NEW)
└── components/
    ├── PreceptorTable.svelte           # Data table component (NEW)
    ├── PreceptorForm.svelte            # Create/edit form (NEW)
    ├── AvailabilityCalendar.svelte     # Availability interface (NEW)
    └── DeletePreceptorDialog.svelte    # Delete confirmation (NEW)
```

---

## Files to Create

### 1. `/src/routes/(app)/preceptors/+page.ts`

Page load function to fetch preceptors.

**Exports:**
```typescript
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/preceptors');
  const { data: preceptors } = await response.json();

  return {
    preceptors
  };
};
```

**Requirements:**
- Use SvelteKit's fetch for SSR compatibility
- Handle loading states
- Handle errors gracefully
- Type-safe data return

---

### 2. `/src/routes/(app)/preceptors/+page.svelte`

Main preceptor management page.

**Features:**
- Display PreceptorTable component
- "Add Preceptor" button
- Modal/dialog for PreceptorForm
- Toast notifications for actions
- Loading spinner during operations

**State Management:**
```typescript
let preceptors = data.preceptors;
let isFormOpen = false;
let selectedPreceptor: PreceptorsTable | null = null;
let isAvailabilityOpen = false;
let selectedForAvailability: PreceptorsTable | null = null;

function openCreateForm() {
  selectedPreceptor = null;
  isFormOpen = true;
}

function openEditForm(preceptor: PreceptorsTable) {
  selectedPreceptor = preceptor;
  isFormOpen = true;
}

function openAvailability(preceptor: PreceptorsTable) {
  selectedForAvailability = preceptor;
  isAvailabilityOpen = true;
}

async function handleFormSubmit(event: CustomEvent) {
  // Handle create/update
  // Refresh preceptor list
  // Show success toast
}

async function handleDelete(preceptorId: string) {
  // Confirm and delete
  // Refresh list
  // Show success toast
}
```

**Layout:**
```svelte
<script lang="ts">
  import PreceptorTable from './components/PreceptorTable.svelte';
  import PreceptorForm from './components/PreceptorForm.svelte';
  import AvailabilityCalendar from './components/AvailabilityCalendar.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Dialog } from '$lib/components/ui/dialog';

  export let data;
  // ... state variables
</script>

<div class="container mx-auto py-8">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-3xl font-bold">Preceptors</h1>
    <Button on:click={openCreateForm}>Add Preceptor</Button>
  </div>

  <PreceptorTable
    {preceptors}
    on:edit={handleEdit}
    on:delete={handleDelete}
    on:availability={handleAvailability}
  />

  <Dialog open={isFormOpen} on:close={() => isFormOpen = false}>
    <PreceptorForm
      preceptor={selectedPreceptor}
      on:submit={handleFormSubmit}
      on:cancel={() => isFormOpen = false}
    />
  </Dialog>

  <Dialog open={isAvailabilityOpen} on:close={() => isAvailabilityOpen = false}>
    <AvailabilityCalendar
      preceptor={selectedForAvailability}
      on:save={handleAvailabilitySave}
      on:cancel={() => isAvailabilityOpen = false}
    />
  </Dialog>
</div>
```

---

### 3. `/src/routes/(app)/preceptors/components/PreceptorTable.svelte`

Data table for displaying preceptors.

**Props:**
```typescript
export let preceptors: PreceptorsTable[];
```

**Events:**
```typescript
createEventDispatcher<{
  edit: PreceptorsTable;
  delete: string;
  availability: PreceptorsTable;
}>();
```

**Features:**
- Sortable columns (name, email, specialty)
- Search/filter by name or specialty
- Action buttons (Edit, Delete, Set Availability)
- Responsive table design
- Empty state when no preceptors

**Columns:**
- Name
- Email
- Specialty
- Max Students
- Actions (Edit | Delete | Availability)

**Implementation:**
```svelte
<script lang="ts">
  import { DataTable } from '$lib/components/ui/data-table';
  import { Button } from '$lib/components/ui/button';
  import type { PreceptorsTable } from '$lib/db/types';

  export let preceptors: PreceptorsTable[];

  const dispatch = createEventDispatcher();

  let searchTerm = '';

  $: filteredPreceptors = preceptors.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.specialty.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'specialty', label: 'Specialty', sortable: true },
    { key: 'max_students', label: 'Max Students', sortable: false },
    { key: 'actions', label: 'Actions', sortable: false }
  ];
</script>

<div class="space-y-4">
  <Input
    type="search"
    placeholder="Search preceptors..."
    bind:value={searchTerm}
  />

  <DataTable {columns} data={filteredPreceptors}>
    <svelte:fragment slot="cell" let:row let:column>
      {#if column.key === 'actions'}
        <div class="flex gap-2">
          <Button size="sm" variant="outline" on:click={() => dispatch('edit', row)}>
            Edit
          </Button>
          <Button size="sm" variant="outline" on:click={() => dispatch('availability', row)}>
            Availability
          </Button>
          <Button size="sm" variant="destructive" on:click={() => dispatch('delete', row.id)}>
            Delete
          </Button>
        </div>
      {:else}
        {row[column.key]}
      {/if}
    </svelte:fragment>
  </DataTable>
</div>
```

---

### 4. `/src/routes/(app)/preceptors/components/PreceptorForm.svelte`

Form for creating/editing preceptors.

**Props:**
```typescript
export let preceptor: PreceptorsTable | null = null; // null = create, object = edit
```

**Events:**
```typescript
createEventDispatcher<{
  submit: PreceptorsTable;
  cancel: void;
}>();
```

**Form Fields:**
- Name (required, text input)
- Email (required, email input)
- Specialty (required, text input or select)
- Max Students (optional, number input, default 1)

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
  import { createPreceptorSchema, updatePreceptorSchema } from '$lib/features/preceptors/schemas';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  export let preceptor: PreceptorsTable | null = null;

  const isEdit = !!preceptor;
  const schema = isEdit ? updatePreceptorSchema : createPreceptorSchema;

  const { form, errors, enhance, submitting } = superForm(
    { ...preceptor },
    {
      validators: zod(schema),
      async onUpdate({ form }) {
        if (form.valid) {
          const endpoint = isEdit
            ? `/api/preceptors/${preceptor!.id}`
            : '/api/preceptors';

          const response = await fetch(endpoint, {
            method: isEdit ? 'PATCH' : 'POST',
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
    <Label for="name">Name</Label>
    <Input id="name" bind:value={$form.name} />
    {#if $errors.name}<span class="text-red-500">{$errors.name}</span>{/if}
  </div>

  <div>
    <Label for="email">Email</Label>
    <Input id="email" type="email" bind:value={$form.email} />
    {#if $errors.email}<span class="text-red-500">{$errors.email}</span>{/if}
  </div>

  <div>
    <Label for="specialty">Specialty</Label>
    <Input id="specialty" bind:value={$form.specialty} />
    {#if $errors.specialty}<span class="text-red-500">{$errors.specialty}</span>{/if}
  </div>

  <div>
    <Label for="max_students">Max Students</Label>
    <Input id="max_students" type="number" bind:value={$form.max_students} />
    {#if $errors.max_students}<span class="text-red-500">{$errors.max_students}</span>{/if}
  </div>

  <div class="flex justify-end gap-2">
    <Button type="button" variant="outline" on:click={() => dispatch('cancel')}>
      Cancel
    </Button>
    <Button type="submit" disabled={$submitting}>
      {isEdit ? 'Update' : 'Create'} Preceptor
    </Button>
  </div>
</form>
```

---

### 5. `/src/routes/(app)/preceptors/components/AvailabilityCalendar.svelte`

Interface for managing preceptor availability periods.

**Props:**
```typescript
export let preceptor: PreceptorsTable;
```

**Events:**
```typescript
createEventDispatcher<{
  save: PreceptorAvailabilityTable[];
  cancel: void;
}>();
```

**Features:**
- Display current availability periods
- Add new period (date range picker)
- Remove period
- Visual calendar representation
- Validate no overlaps
- Bulk save

**State:**
```typescript
let periods: Array<{ start_date: string; end_date: string }> = [];
let isLoading = true;

onMount(async () => {
  const response = await fetch(`/api/preceptors/${preceptor.id}/availability`);
  const { data } = await response.json();
  periods = data.map(p => ({ start_date: p.start_date, end_date: p.end_date }));
  isLoading = false;
});

function addPeriod() {
  periods = [...periods, { start_date: '', end_date: '' }];
}

function removePeriod(index: number) {
  periods = periods.filter((_, i) => i !== index);
}

async function handleSave() {
  const response = await fetch(`/api/preceptors/${preceptor.id}/availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ periods })
  });

  if (response.ok) {
    const { data } = await response.json();
    dispatch('save', data);
  }
}
```

**Implementation:**
```svelte
<script lang="ts">
  import { Calendar } from '$lib/components/ui/calendar';
  import { Button } from '$lib/components/ui/button';
  import { DatePicker } from '$lib/components/ui/date-picker';
  import { Trash2 } from 'lucide-svelte';

  export let preceptor: PreceptorsTable;
  // ... state and functions
</script>

<div class="space-y-4">
  <h3 class="text-lg font-semibold">
    Availability for {preceptor.name}
  </h3>

  {#if isLoading}
    <p>Loading...</p>
  {:else}
    <div class="space-y-2">
      {#each periods as period, i}
        <div class="flex gap-2 items-center">
          <DatePicker
            label="Start Date"
            bind:value={period.start_date}
          />
          <span>to</span>
          <DatePicker
            label="End Date"
            bind:value={period.end_date}
          />
          <Button
            size="icon"
            variant="ghost"
            on:click={() => removePeriod(i)}
          >
            <Trash2 class="h-4 w-4" />
          </Button>
        </div>
      {/each}
    </div>

    <Button variant="outline" on:click={addPeriod}>
      Add Period
    </Button>

    <div class="flex justify-end gap-2 pt-4">
      <Button variant="outline" on:click={() => dispatch('cancel')}>
        Cancel
      </Button>
      <Button on:click={handleSave}>
        Save Availability
      </Button>
    </div>
  {/if}
</div>
```

---

### 6. `/src/routes/(app)/preceptors/components/DeletePreceptorDialog.svelte`

Confirmation dialog for deleting preceptors.

**Props:**
```typescript
export let preceptor: PreceptorsTable;
export let open: boolean = false;
```

**Events:**
```typescript
createEventDispatcher<{
  confirm: string;
  cancel: void;
}>();
```

**Features:**
- Display preceptor name
- Warning message
- Confirm/Cancel buttons
- Loading state during deletion

---

## Testing Requirements

### Component Tests

#### PreceptorTable.svelte
- ✅ Renders preceptors in table
- ✅ Displays empty state when no preceptors
- ✅ Search filters preceptors by name
- ✅ Search filters preceptors by specialty
- ✅ Emits edit event with preceptor data
- ✅ Emits delete event with preceptor ID
- ✅ Emits availability event with preceptor data
- ✅ Sortable columns work correctly

#### PreceptorForm.svelte
- ✅ Renders empty form for create mode
- ✅ Renders populated form for edit mode
- ✅ Validates required fields
- ✅ Validates email format
- ✅ Validates max_students is positive
- ✅ Displays field errors
- ✅ Disables submit when invalid
- ✅ Shows loading state during submission
- ✅ Emits submit event on success
- ✅ Emits cancel event

#### AvailabilityCalendar.svelte
- ✅ Loads existing availability on mount
- ✅ Displays availability periods
- ✅ Adds new period
- ✅ Removes period
- ✅ Validates date ranges (start < end)
- ✅ Prevents overlapping periods
- ✅ Emits save event with periods
- ✅ Emits cancel event

---

### Integration Tests

#### `/src/routes/(app)/preceptors/+page.test.ts`
- ✅ Page loads preceptors
- ✅ Opens create form on button click
- ✅ Creates new preceptor
- ✅ Opens edit form with preceptor data
- ✅ Updates existing preceptor
- ✅ Deletes preceptor after confirmation
- ✅ Opens availability dialog
- ✅ Updates availability
- ✅ Shows success toast on actions
- ✅ Shows error toast on failures

---

## Acceptance Criteria

- [ ] Preceptor list page created and accessible at /preceptors
- [ ] Data table displays all preceptors
- [ ] Search/filter functionality works
- [ ] Add Preceptor button opens form
- [ ] Create form validates and submits
- [ ] Edit form populates and updates
- [ ] Delete confirmation prevents accidental deletion
- [ ] Availability calendar loads existing periods
- [ ] Availability calendar allows add/remove periods
- [ ] Availability saves correctly
- [ ] Success/error toasts display appropriately
- [ ] All UI components are responsive
- [ ] All interactive elements are keyboard accessible
- [ ] Loading states display during async operations
- [ ] Error states display helpful messages

---

## Usage Example

User workflow:
1. Navigate to `/preceptors`
2. View list of all preceptors in table
3. Search for specific preceptor
4. Click "Add Preceptor" to create new
5. Fill form and submit
6. Click "Edit" on a preceptor to update
7. Click "Availability" to manage schedule
8. Add/remove date ranges
9. Save availability
10. Click "Delete" to remove preceptor (with confirmation)

---

## Notes

- Use shadcn/ui components for consistent styling
- Form validation should match API validation
- Consider pagination for large preceptor lists
- Availability calendar could be enhanced with visual representation
- Consider specialty dropdown instead of free text
- Add export functionality (CSV/Excel) in future

---

## References

- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/data-table)
- [shadcn/ui Form](https://ui.shadcn.com/docs/components/form)
- [shadcn/ui Calendar](https://ui.shadcn.com/docs/components/calendar)
- [SvelteKit Superforms](https://superforms.rocks/)
- [SvelteKit Load Functions](https://kit.svelte.dev/docs/load)
