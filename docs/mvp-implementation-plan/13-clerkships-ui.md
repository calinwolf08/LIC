# Step 13: Clerkships - UI

## Overview
Implement the user interface for clerkship management, including list view with data table, create/edit forms, and delete confirmation. This provides the frontend for managing clerkship types and their requirements.

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 12: Clerkships - API Routes

## Requirements

### Pages
- **Clerkship List Page** (`/clerkships`)
  - Data table with all clerkships
  - Search/filter functionality
  - Add new button
  - Edit/delete actions per row

- **Clerkship Form** (create/edit modal or page)
  - Name, specialty, required_days, description inputs
  - Form validation
  - Submit/cancel buttons
  - Error handling

### UI Components
- Data table (shadcn/ui)
- Form components (shadcn/ui)
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
/src/routes/(app)/clerkships/
├── +page.svelte                     # Clerkship list page (NEW)
├── +page.ts                         # Load data (NEW)
└── components/
    ├── ClerkshipTable.svelte        # Data table component (NEW)
    ├── ClerkshipForm.svelte         # Create/edit form (NEW)
    └── DeleteClerkshipDialog.svelte # Delete confirmation (NEW)
```

---

## Files to Create

### 1. `/src/routes/(app)/clerkships/+page.ts`

Page load function to fetch clerkships.

**Exports:**
```typescript
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/clerkships');
  const { data: clerkships } = await response.json();

  return {
    clerkships
  };
};
```

---

### 2. `/src/routes/(app)/clerkships/+page.svelte`

Main clerkship management page.

**Features:**
- Display ClerkshipTable component
- "Add Clerkship" button
- Modal/dialog for ClerkshipForm
- Toast notifications for actions
- Loading spinner during operations

**State Management:**
```typescript
let clerkships = data.clerkships;
let isFormOpen = false;
let selectedClerkship: ClerkshipsTable | null = null;

function openCreateForm() {
  selectedClerkship = null;
  isFormOpen = true;
}

function openEditForm(clerkship: ClerkshipsTable) {
  selectedClerkship = clerkship;
  isFormOpen = true;
}

async function handleFormSubmit(event: CustomEvent) {
  // Handle create/update
  // Refresh clerkship list
  // Show success toast
}

async function handleDelete(clerkshipId: string) {
  // Confirm and delete
  // Refresh list
  // Show success toast
}
```

**Layout:**
```svelte
<script lang="ts">
  import ClerkshipTable from './components/ClerkshipTable.svelte';
  import ClerkshipForm from './components/ClerkshipForm.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Dialog } from '$lib/components/ui/dialog';

  export let data;
  // ... state variables
</script>

<div class="container mx-auto py-8">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-3xl font-bold">Clerkships</h1>
    <Button on:click={openCreateForm}>Add Clerkship</Button>
  </div>

  <ClerkshipTable
    {clerkships}
    on:edit={handleEdit}
    on:delete={handleDelete}
  />

  <Dialog open={isFormOpen} on:close={() => isFormOpen = false}>
    <ClerkshipForm
      clerkship={selectedClerkship}
      on:submit={handleFormSubmit}
      on:cancel={() => isFormOpen = false}
    />
  </Dialog>
</div>
```

---

### 3. `/src/routes/(app)/clerkships/components/ClerkshipTable.svelte`

Data table for displaying clerkships.

**Props:**
```typescript
export let clerkships: ClerkshipsTable[];
```

**Events:**
```typescript
createEventDispatcher<{
  edit: ClerkshipsTable;
  delete: string;
}>();
```

**Features:**
- Sortable columns (name, specialty, required_days)
- Search/filter by name or specialty
- Action buttons (Edit, Delete)
- Responsive table design
- Empty state when no clerkships

**Columns:**
- Name
- Specialty
- Required Days
- Description (truncated)
- Actions (Edit | Delete)

**Implementation:**
```svelte
<script lang="ts">
  import { DataTable } from '$lib/components/ui/data-table';
  import { Button } from '$lib/components/ui/button';
  import type { ClerkshipsTable } from '$lib/db/types';

  export let clerkships: ClerkshipsTable[];

  const dispatch = createEventDispatcher();

  let searchTerm = '';

  $: filteredClerkships = clerkships.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.specialty.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'specialty', label: 'Specialty', sortable: true },
    { key: 'required_days', label: 'Required Days', sortable: true },
    { key: 'description', label: 'Description', sortable: false },
    { key: 'actions', label: 'Actions', sortable: false }
  ];
</script>

<div class="space-y-4">
  <Input
    type="search"
    placeholder="Search clerkships..."
    bind:value={searchTerm}
  />

  <DataTable {columns} data={filteredClerkships}>
    <svelte:fragment slot="cell" let:row let:column>
      {#if column.key === 'description'}
        <span class="truncate max-w-xs">{row.description || '-'}</span>
      {:else if column.key === 'actions'}
        <div class="flex gap-2">
          <Button size="sm" variant="outline" on:click={() => dispatch('edit', row)}>
            Edit
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

### 4. `/src/routes/(app)/clerkships/components/ClerkshipForm.svelte`

Form for creating/editing clerkships.

**Props:**
```typescript
export let clerkship: ClerkshipsTable | null = null; // null = create, object = edit
```

**Events:**
```typescript
createEventDispatcher<{
  submit: ClerkshipsTable;
  cancel: void;
}>();
```

**Form Fields:**
- Name (required, text input)
- Specialty (required, text input or select)
- Required Days (required, number input)
- Description (optional, textarea)

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
  import { createClerkshipSchema, updateClerkshipSchema } from '$lib/features/clerkships/schemas';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';

  export let clerkship: ClerkshipsTable | null = null;

  const isEdit = !!clerkship;
  const schema = isEdit ? updateClerkshipSchema : createClerkshipSchema;

  const { form, errors, enhance, submitting } = superForm(
    { ...clerkship },
    {
      validators: zod(schema),
      async onUpdate({ form }) {
        if (form.valid) {
          const endpoint = isEdit
            ? `/api/clerkships/${clerkship!.id}`
            : '/api/clerkships';

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
    <Label for="specialty">Specialty</Label>
    <Input id="specialty" bind:value={$form.specialty} />
    {#if $errors.specialty}<span class="text-red-500">{$errors.specialty}</span>{/if}
  </div>

  <div>
    <Label for="required_days">Required Days</Label>
    <Input id="required_days" type="number" bind:value={$form.required_days} />
    {#if $errors.required_days}<span class="text-red-500">{$errors.required_days}</span>{/if}
  </div>

  <div>
    <Label for="description">Description (Optional)</Label>
    <Textarea id="description" bind:value={$form.description} />
    {#if $errors.description}<span class="text-red-500">{$errors.description}</span>{/if}
  </div>

  <div class="flex justify-end gap-2">
    <Button type="button" variant="outline" on:click={() => dispatch('cancel')}>
      Cancel
    </Button>
    <Button type="submit" disabled={$submitting}>
      {isEdit ? 'Update' : 'Create'} Clerkship
    </Button>
  </div>
</form>
```

---

### 5. `/src/routes/(app)/clerkships/components/DeleteClerkshipDialog.svelte`

Confirmation dialog for deleting clerkships.

**Props:**
```typescript
export let clerkship: ClerkshipsTable;
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

#### ClerkshipTable.svelte
- ✅ Renders clerkships in table
- ✅ Displays empty state when no clerkships
- ✅ Search filters clerkships by name
- ✅ Search filters clerkships by specialty
- ✅ Emits edit event with clerkship data
- ✅ Emits delete event with clerkship ID
- ✅ Sortable columns work correctly
- ✅ Truncates long descriptions

#### ClerkshipForm.svelte
- ✅ Renders empty form for create mode
- ✅ Renders populated form for edit mode
- ✅ Validates required fields
- ✅ Validates required_days is positive
- ✅ Displays field errors
- ✅ Disables submit when invalid
- ✅ Shows loading state during submission
- ✅ Emits submit event on success
- ✅ Emits cancel event

---

### Integration Tests

#### `/src/routes/(app)/clerkships/+page.test.ts`
- ✅ Page loads clerkships
- ✅ Opens create form on button click
- ✅ Creates new clerkship
- ✅ Opens edit form with clerkship data
- ✅ Updates existing clerkship
- ✅ Deletes clerkship after confirmation
- ✅ Shows success toast on actions
- ✅ Shows error toast on failures

---

## Acceptance Criteria

- [ ] Clerkship list page created and accessible at /clerkships
- [ ] Data table displays all clerkships
- [ ] Search/filter functionality works
- [ ] Add Clerkship button opens form
- [ ] Create form validates and submits
- [ ] Edit form populates and updates
- [ ] Delete confirmation prevents accidental deletion
- [ ] Success/error toasts display appropriately
- [ ] All UI components are responsive
- [ ] All interactive elements are keyboard accessible
- [ ] Loading states display during async operations
- [ ] Error states display helpful messages

---

## Usage Example

User workflow:
1. Navigate to `/clerkships`
2. View list of all clerkships in table
3. Search for specific clerkship
4. Click "Add Clerkship" to create new
5. Fill form (name, specialty, required days, description)
6. Submit to save
7. Click "Edit" on a clerkship to update
8. Click "Delete" to remove clerkship (with confirmation)

---

## Notes

- Use shadcn/ui components for consistent styling
- Form validation should match API validation
- Consider pagination for large clerkship lists
- Specialty dropdown instead of free text (future enhancement)
- Add color coding for calendar display (future)
- Consider clerkship templates/presets

---

## References

- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/data-table)
- [shadcn/ui Form](https://ui.shadcn.com/docs/components/form)
- [SvelteKit Superforms](https://superforms.rocks/)
- [SvelteKit Load Functions](https://kit.svelte.dev/docs/load)
