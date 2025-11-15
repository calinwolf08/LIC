# Step 06: Students - UI

## Overview
Implement the user interface for student management, including a list view with data table, create/edit forms, and delete confirmation. This provides administrators with an intuitive way to manage students.

## Dependencies
- ✅ Step 04: Students - Service Layer
- ✅ Step 05: Students - API Routes
- ✅ shadcn-svelte components installed (Card, Button, Input, Form, etc.)

## Requirements

### Pages & Components
- Student list page with data table
- Create student form (modal or separate page)
- Edit student form
- Delete confirmation dialog
- Loading and error states
- Success feedback (toasts/alerts)

### Features
- View all students in sortable table
- Search/filter students
- Add new student
- Edit existing student
- Delete student (with confirmation)
- Form validation with error display
- Responsive design

## Implementation Details

### File Structure
```
/src/lib/features/students/
├── components/
│   ├── student-form.svelte        # Create/Edit form (NEW)
│   ├── student-list.svelte        # Student table (NEW)
│   └── delete-student-dialog.svelte  # Delete confirmation (NEW)
├── services/
│   └── student-service.ts         # (from Step 04)
└── schemas.ts                      # (from Step 04)

/src/lib/features/shared/components/
└── data-table.svelte              # Reusable table component (NEW)

/src/routes/students/
├── +page.svelte                   # Main students page (NEW)
├── +page.ts                       # Load students data (NEW)
└── new/
    ├── +page.svelte               # Create student page (NEW)
    └── +page.ts                   # New student page load (NEW)
```

---

## Files to Create

### 1. `/src/lib/features/shared/components/data-table.svelte`

Reusable data table component (will be used across multiple features).

**Props:**
```typescript
interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => any;
}

interface Props<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}
```

**Features:**
- Column sorting
- Empty state message
- Loading state
- Row click handler
- Responsive design

**Example Usage:**
```svelte
<DataTable
  data={students}
  columns={[
    { key: 'name', label: 'Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
  ]}
  emptyMessage="No students found"
  onRowClick={(student) => goto(`/students/${student.id}`)}
/>
```

---

### 2. `/src/lib/features/students/components/student-form.svelte`

Form component for creating or editing students.

**Props:**
```typescript
interface Props {
  student?: StudentsTable;  // Undefined for create, populated for edit
  onSuccess?: () => void;
  onCancel?: () => void;
}
```

**Features:**
- Uses shadcn Form components
- Client-side validation with createStudentSchema
- Loading state during submission
- Error display (field errors and general errors)
- Calls API endpoints (POST or PATCH)
- Success callback after save

**Implementation:**
- Use $state for form data and loading state
- Validate on submit
- Call appropriate API endpoint
- Display errors from API
- Call onSuccess callback on success

**Example Usage:**
```svelte
<StudentForm
  student={existingStudent}
  onSuccess={() => goto('/students')}
  onCancel={() => goto('/students')}
/>
```

---

### 3. `/src/lib/features/students/components/student-list.svelte`

Student list component with table and actions.

**Props:**
```typescript
interface Props {
  students: StudentsTable[];
  loading?: boolean;
  onEdit?: (student: StudentsTable) => void;
  onDelete?: (student: StudentsTable) => void;
}
```

**Features:**
- Uses DataTable component
- Action buttons (Edit, Delete) for each row
- Empty state when no students
- Loading state

**Columns:**
- Name (sortable)
- Email (sortable)
- Created Date
- Actions (Edit, Delete buttons)

**Example Usage:**
```svelte
<StudentList
  students={data.students}
  onEdit={(student) => goto(`/students/${student.id}/edit`)}
  onDelete={(student) => handleDelete(student)}
/>
```

---

### 4. `/src/lib/features/students/components/delete-student-dialog.svelte`

Confirmation dialog for deleting students.

**Props:**
```typescript
interface Props {
  open: boolean;
  student: StudentsTable | null;
  onConfirm: (student: StudentsTable) => Promise<void>;
  onCancel: () => void;
}
```

**Features:**
- Shows student name in confirmation message
- Warning about cannot undo
- Disabled confirm button during deletion
- Error display if deletion fails
- Calls API DELETE endpoint

**Example Usage:**
```svelte
<DeleteStudentDialog
  open={showDeleteDialog}
  student={studentToDelete}
  onConfirm={handleDeleteConfirm}
  onCancel={() => showDeleteDialog = false}
/>
```

---

### 5. `/src/routes/students/+page.ts`

Page load function to fetch students.

**Exports:**
```typescript
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/students');
  const { data: students } = await response.json();

  return {
    students
  };
};
```

**Requirements:**
- Fetch students from API
- Handle loading state
- Handle errors
- Return typed data

---

### 6. `/src/routes/students/+page.svelte`

Main students page.

**Features:**
- Page header with title and "Add Student" button
- StudentList component
- Delete confirmation dialog
- Loading and error states
- Success messages (toast/alert)

**Layout:**
```svelte
<script lang="ts">
  import type { PageData } from './$types';
  import StudentList from '$lib/features/students/components/student-list.svelte';
  import DeleteStudentDialog from '$lib/features/students/components/delete-student-dialog.svelte';
  import { Button } from '$lib/components/ui/button';

  let { data }: { data: PageData } = $props();

  let showDeleteDialog = $state(false);
  let studentToDelete = $state<StudentsTable | null>(null);

  async function handleDelete(student: StudentsTable) {
    studentToDelete = student;
    showDeleteDialog = true;
  }

  async function handleDeleteConfirm(student: StudentsTable) {
    await fetch(`/api/students/${student.id}`, { method: 'DELETE' });
    // Refresh page data
    location.reload();
  }
</script>

<div class="container mx-auto py-8">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-3xl font-bold">Students</h1>
    <Button href="/students/new">Add Student</Button>
  </div>

  <StudentList
    students={data.students}
    onEdit={(student) => goto(`/students/${student.id}/edit`)}
    onDelete={handleDelete}
  />

  <DeleteStudentDialog
    open={showDeleteDialog}
    student={studentToDelete}
    onConfirm={handleDeleteConfirm}
    onCancel={() => showDeleteDialog = false}
  />
</div>
```

---

### 7. `/src/routes/students/new/+page.svelte`

Create new student page.

**Features:**
- Page header
- StudentForm component (no student prop = create mode)
- Cancel button returns to list
- Success redirects to list

**Layout:**
```svelte
<script lang="ts">
  import StudentForm from '$lib/features/students/components/student-form.svelte';
  import { goto } from '$app/navigation';
</script>

<div class="container mx-auto py-8 max-w-2xl">
  <h1 class="text-3xl font-bold mb-6">Add Student</h1>

  <StudentForm
    onSuccess={() => goto('/students')}
    onCancel={() => goto('/students')}
  />
</div>
```

---

## Component Logic Functions

### StudentForm Component

**State Management:**
- `formData = $state({ name: '', email: '' })`
- `errors = $state<Record<string, string>>({})`
- `isSubmitting = $state(false)`
- `generalError = $state<string | null>(null)`

**Functions:**

1. `async handleSubmit()`
   - Validates form data with schema
   - Calls API (POST for create, PATCH for edit)
   - Handles success/error
   - Calls onSuccess callback

2. `validateField(field: string, value: string)`
   - Validates single field
   - Updates errors state
   - Shows real-time validation

---

### DeleteStudentDialog Component

**State Management:**
- `isDeleting = $state(false)`
- `error = $state<string | null>(null)`

**Functions:**

1. `async handleConfirm()`
   - Sets isDeleting to true
   - Calls onConfirm prop
   - Handles errors (student has assignments)
   - Closes dialog on success

---

## Testing Requirements

While UI components don't require unit tests per requirements, test the page behavior:

### Manual Testing Checklist

**Students List Page:**
- ✅ Page loads and displays students
- ✅ Table is sortable by name and email
- ✅ "Add Student" button navigates to new student page
- ✅ Edit button navigates to edit page
- ✅ Delete button opens confirmation dialog
- ✅ Empty state shows when no students

**Create Student:**
- ✅ Form validation shows errors
- ✅ Cannot submit with invalid data
- ✅ Success creates student and redirects
- ✅ Duplicate email shows error
- ✅ Cancel button returns to list

**Edit Student:**
- ✅ Form pre-fills with student data
- ✅ Can update name
- ✅ Can update email
- ✅ Duplicate email shows error
- ✅ Success updates student and redirects

**Delete Student:**
- ✅ Dialog shows student name
- ✅ Cancel closes dialog
- ✅ Confirm deletes student
- ✅ Error shown if student has assignments
- ✅ List refreshes after deletion

---

## Acceptance Criteria

- [ ] DataTable shared component created and working
- [ ] StudentForm component handles create and edit modes
- [ ] StudentList component displays students in table
- [ ] DeleteStudentDialog component shows confirmation
- [ ] Students list page shows all students
- [ ] Create student page works
- [ ] Edit student functionality works
- [ ] Delete student with confirmation works
- [ ] All forms validate input
- [ ] Error messages display appropriately
- [ ] Loading states show during API calls
- [ ] Success feedback after actions
- [ ] Responsive design works on mobile
- [ ] Navigation flows work correctly
- [ ] Page updates after create/update/delete

---

## Usage Example

After completion, administrators can:

1. Navigate to `/students`
2. See list of all students
3. Click "Add Student" to create new
4. Fill form and submit
5. Return to list and see new student
6. Click edit to modify student
7. Click delete and confirm to remove student

---

## Notes

- Use Svelte 5 runes ($state, $derived, $effect)
- Follow existing auth UI patterns (Card components, consistent styling)
- Reuse form components from shared library where possible
- Consider adding toast notifications for success messages
- DataTable component should be generic enough for other features
- Keep components focused and composable
- Extract complex logic from components when needed

---

## References

- [Svelte 5 Runes](https://svelte.dev/docs/svelte/what-are-runes)
- [SvelteKit Page Data](https://kit.svelte.dev/docs/load)
- [SvelteKit Navigation](https://kit.svelte.dev/docs/modules#$app-navigation)
- [shadcn-svelte Components](https://www.shadcn-svelte.com/)
