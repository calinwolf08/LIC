# Step 25: Schedule Editing - UI

## Overview
Implement the user interface for manual schedule editing. This includes assignment edit modals, reassignment functionality, conflict warnings, and a regenerate schedule button with confirmation.

## Dependencies
- ✅ Step 03: Shared Utilities & Test Helpers
- ✅ Step 22: Calendar - UI
- ✅ Step 24: Schedule Editing - API Routes

## Requirements

### UI Components
- **Assignment Edit Modal**
  - Edit dates
  - Reassign to different preceptor
  - Show validation errors
  - Preview conflicts before saving

- **Reassignment Interface**
  - Select new preceptor
  - Dry run preview
  - Conflict warnings
  - Confirm/cancel actions

- **Regenerate Schedule**
  - Clear and regenerate button
  - Confirmation dialog with warning
  - Progress indicator
  - Success/error feedback

### User Experience
- Clear validation feedback
- Conflict warnings before saving
- Confirmation for destructive actions
- Loading states during operations
- Success/error toasts
- Accessible (ARIA labels, keyboard navigation)

## Implementation Details

### File Structure
```
/src/routes/(app)/calendar/
├── +page.svelte                         # (Existing - add edit buttons)
└── components/
    ├── ScheduleCalendar.svelte          # (Existing)
    ├── EditAssignmentModal.svelte       # Edit modal (NEW)
    ├── ReassignModal.svelte             # Reassignment interface (NEW)
    ├── ConflictWarning.svelte           # Conflict display (NEW)
    └── RegenerateScheduleDialog.svelte  # Regenerate confirmation (NEW)
```

---

## Files to Create

### 1. `/src/routes/(app)/calendar/components/EditAssignmentModal.svelte`

Modal for editing assignment details.

**Props:**
```typescript
export let assignment: EnrichedAssignment | null;
export let open: boolean = false;
```

**Events:**
```typescript
createEventDispatcher<{
  save: EnrichedAssignment;
  cancel: void;
  reassign: EnrichedAssignment;
}>();
```

**Features:**
- Edit start and end dates
- Display student/preceptor/clerkship info (read-only)
- Reassign button (opens ReassignModal)
- Delete button
- Validate dates client-side
- Show validation errors from API
- Dry run preview before saving

**Implementation:**
```svelte
<script lang="ts">
  import { Dialog } from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import ConflictWarning from './ConflictWarning.svelte';
  import type { EnrichedAssignment } from '$lib/features/schedules/types';

  export let assignment: EnrichedAssignment | null;
  export let open: boolean = false;

  const dispatch = createEventDispatcher();

  let editedStartDate = '';
  let editedEndDate = '';
  let isValidating = false;
  let isSaving = false;
  let validationErrors: string[] = [];
  let conflicts: any = null;

  $: if (assignment && open) {
    editedStartDate = assignment.start_date;
    editedEndDate = assignment.end_date;
    validationErrors = [];
    conflicts = null;
  }

  async function handlePreview() {
    if (!assignment) return;

    isValidating = true;
    validationErrors = [];

    try {
      // Call preview API
      const response = await fetch(
        `/api/schedules/assignments/${assignment.id}/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start_date: editedStartDate,
            end_date: editedEndDate,
          }),
        }
      );

      const { data } = await response.json();

      if (!data.valid) {
        validationErrors = data.errors;
      } else {
        conflicts = data.conflicts;
      }
    } catch (error) {
      validationErrors = ['Failed to validate changes'];
    } finally {
      isValidating = false;
    }
  }

  async function handleSave() {
    if (!assignment) return;

    isSaving = true;

    try {
      const response = await fetch(`/api/schedules/assignments/${assignment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: editedStartDate,
          end_date: editedEndDate,
        }),
      });

      if (response.ok) {
        const { data } = await response.json();
        dispatch('save', data);
      } else {
        const { error } = await response.json();
        validationErrors = [error.message];
      }
    } catch (error) {
      validationErrors = ['Failed to save changes'];
    } finally {
      isSaving = false;
    }
  }

  function handleReassign() {
    if (assignment) {
      dispatch('reassign', assignment);
    }
  }
</script>

<Dialog bind:open on:close={() => dispatch('cancel')}>
  <div class="space-y-4 p-6">
    <h2 class="text-2xl font-bold">Edit Assignment</h2>

    {#if assignment}
      <!-- Read-only Info -->
      <div class="space-y-2 p-4 bg-gray-50 rounded">
        <p><strong>Student:</strong> {assignment.student_name}</p>
        <p><strong>Preceptor:</strong> {assignment.preceptor_name}</p>
        <p><strong>Clerkship:</strong> {assignment.clerkship_name}</p>
      </div>

      <!-- Editable Fields -->
      <div>
        <Label for="start_date">Start Date</Label>
        <Input
          id="start_date"
          type="date"
          bind:value={editedStartDate}
          on:change={handlePreview}
        />
      </div>

      <div>
        <Label for="end_date">End Date</Label>
        <Input
          id="end_date"
          type="date"
          bind:value={editedEndDate}
          on:change={handlePreview}
        />
      </div>

      <!-- Validation Errors -->
      {#if validationErrors.length > 0}
        <div class="p-4 bg-red-50 border border-red-200 rounded">
          <p class="font-semibold text-red-800">Validation Errors:</p>
          <ul class="list-disc list-inside text-red-700">
            {#each validationErrors as error}
              <li>{error}</li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Conflict Warnings -->
      {#if conflicts}
        <ConflictWarning {conflicts} />
      {/if}

      <!-- Actions -->
      <div class="flex justify-between pt-4">
        <div class="flex gap-2">
          <Button variant="outline" on:click={handleReassign}>
            Reassign Preceptor
          </Button>
        </div>

        <div class="flex gap-2">
          <Button variant="outline" on:click={() => dispatch('cancel')}>
            Cancel
          </Button>
          <Button
            on:click={handleSave}
            disabled={isValidating || isSaving || validationErrors.length > 0}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    {/if}
  </div>
</Dialog>
```

---

### 2. `/src/routes/(app)/calendar/components/ReassignModal.svelte`

Modal for reassigning student to different preceptor.

**Props:**
```typescript
export let assignment: EnrichedAssignment | null;
export let preceptors: PreceptorsTable[];
export let open: boolean = false;
```

**Events:**
```typescript
createEventDispatcher<{
  save: EnrichedAssignment;
  cancel: void;
}>();
```

**Features:**
- Select new preceptor (filter by matching specialty)
- Preview reassignment (dry run)
- Show validation errors
- Show conflicts
- Confirm/cancel

**Implementation:**
```svelte
<script lang="ts">
  import { Dialog } from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Select } from '$lib/components/ui/select';
  import { Label } from '$lib/components/ui/label';
  import ConflictWarning from './ConflictWarning.svelte';

  export let assignment: EnrichedAssignment | null;
  export let preceptors: PreceptorsTable[];
  export let open: boolean = false;

  const dispatch = createEventDispatcher();

  let selectedPreceptorId = '';
  let isPreviewing = false;
  let isSaving = false;
  let validationErrors: string[] = [];
  let previewResult: any = null;

  // Filter preceptors by matching specialty
  $: matchingPreceptors = assignment
    ? preceptors.filter(p => p.specialty === assignment.clerkship_specialty)
    : [];

  async function handlePreview() {
    if (!assignment || !selectedPreceptorId) return;

    isPreviewing = true;
    validationErrors = [];

    try {
      const response = await fetch(
        `/api/schedules/assignments/${assignment.id}/reassign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_preceptor_id: selectedPreceptorId,
            dry_run: true,
          }),
        }
      );

      const { data } = await response.json();
      previewResult = data;

      if (!data.valid) {
        validationErrors = data.errors;
      }
    } catch (error) {
      validationErrors = ['Failed to preview reassignment'];
    } finally {
      isPreviewing = false;
    }
  }

  async function handleSave() {
    if (!assignment || !selectedPreceptorId) return;

    isSaving = true;

    try {
      const response = await fetch(
        `/api/schedules/assignments/${assignment.id}/reassign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_preceptor_id: selectedPreceptorId,
            dry_run: false,
          }),
        }
      );

      if (response.ok) {
        const { data } = await response.json();
        if (data.valid && data.assignment) {
          dispatch('save', data.assignment);
        } else {
          validationErrors = data.errors;
        }
      }
    } catch (error) {
      validationErrors = ['Failed to save reassignment'];
    } finally {
      isSaving = false;
    }
  }
</script>

<Dialog bind:open on:close={() => dispatch('cancel')}>
  <div class="space-y-4 p-6">
    <h2 class="text-2xl font-bold">Reassign to Different Preceptor</h2>

    {#if assignment}
      <p class="text-gray-600">
        Reassigning <strong>{assignment.student_name}</strong> for
        <strong>{assignment.clerkship_name}</strong> clerkship
      </p>

      <div>
        <Label>Current Preceptor</Label>
        <p class="p-2 bg-gray-100 rounded">{assignment.preceptor_name}</p>
      </div>

      <div>
        <Label for="new_preceptor">New Preceptor</Label>
        <Select
          id="new_preceptor"
          bind:value={selectedPreceptorId}
          on:change={handlePreview}
        >
          <option value="">Select a preceptor...</option>
          {#each matchingPreceptors as preceptor}
            <option value={preceptor.id}>{preceptor.name}</option>
          {/each}
        </Select>
        <p class="text-sm text-gray-500 mt-1">
          Showing preceptors with {assignment.clerkship_specialty} specialty
        </p>
      </div>

      {#if isPreviewing}
        <p class="text-gray-500">Validating...</p>
      {/if}

      {#if validationErrors.length > 0}
        <div class="p-4 bg-red-50 border border-red-200 rounded">
          <p class="font-semibold text-red-800">Cannot reassign:</p>
          <ul class="list-disc list-inside text-red-700">
            {#each validationErrors as error}
              <li>{error}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if previewResult?.valid}
        <div class="p-4 bg-green-50 border border-green-200 rounded">
          <p class="text-green-800">✓ Reassignment is valid</p>
        </div>
      {/if}

      <div class="flex justify-end gap-2 pt-4">
        <Button variant="outline" on:click={() => dispatch('cancel')}>
          Cancel
        </Button>
        <Button
          on:click={handleSave}
          disabled={!selectedPreceptorId || isPreviewing || isSaving || validationErrors.length > 0}
        >
          {isSaving ? 'Saving...' : 'Confirm Reassignment'}
        </Button>
      </div>
    {/if}
  </div>
</Dialog>
```

---

### 3. `/src/routes/(app)/calendar/components/ConflictWarning.svelte`

Component displaying conflict warnings.

**Props:**
```typescript
export let conflicts: {
  studentConflicts: EnrichedAssignment[];
  preceptorConflicts: EnrichedAssignment[];
  availabilityIssues: string[];
  blackoutConflicts: any[];
};
```

**Features:**
- Display student conflicts
- Display preceptor conflicts
- Display availability issues
- Display blackout date conflicts
- Color-coded warnings

---

### 4. `/src/routes/(app)/calendar/components/RegenerateScheduleDialog.svelte`

Confirmation dialog for regenerating schedule.

**Props:**
```typescript
export let open: boolean = false;
```

**Events:**
```typescript
createEventDispatcher<{
  confirm: void;
  cancel: void;
}>();
```

**Features:**
- Warning message about deleting existing schedule
- Date range inputs for new schedule
- Confirm/cancel buttons
- Loading state during generation

**Implementation:**
```svelte
<script lang="ts">
  import { Dialog } from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { AlertTriangle } from 'lucide-svelte';

  export let open: boolean = false;

  const dispatch = createEventDispatcher();

  let startDate = '';
  let endDate = '';
  let isGenerating = false;

  async function handleConfirm() {
    isGenerating = true;

    try {
      // Step 1: Clear existing schedule
      await fetch('/api/schedules', { method: 'DELETE' });

      // Step 2: Generate new schedule
      const response = await fetch('/api/schedules/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: startDate, end_date: endDate }),
      });

      if (response.ok) {
        dispatch('confirm');
      } else {
        alert('Failed to generate schedule');
      }
    } catch (error) {
      alert('Error regenerating schedule');
    } finally {
      isGenerating = false;
    }
  }
</script>

<Dialog bind:open>
  <div class="space-y-4 p-6">
    <div class="flex items-center gap-3">
      <AlertTriangle class="h-8 w-8 text-amber-500" />
      <h2 class="text-2xl font-bold">Regenerate Schedule</h2>
    </div>

    <div class="p-4 bg-amber-50 border border-amber-200 rounded">
      <p class="font-semibold text-amber-800">Warning:</p>
      <p class="text-amber-700">
        This will delete all existing schedule assignments and generate a new schedule.
        This action cannot be undone.
      </p>
    </div>

    <div>
      <Label for="regen_start_date">Start Date</Label>
      <Input id="regen_start_date" type="date" bind:value={startDate} />
    </div>

    <div>
      <Label for="regen_end_date">End Date</Label>
      <Input id="regen_end_date" type="date" bind:value={endDate} />
    </div>

    <div class="flex justify-end gap-2 pt-4">
      <Button variant="outline" on:click={() => dispatch('cancel')}>
        Cancel
      </Button>
      <Button
        variant="destructive"
        on:click={handleConfirm}
        disabled={!startDate || !endDate || isGenerating}
      >
        {isGenerating ? 'Regenerating...' : 'Confirm Regenerate'}
      </Button>
    </div>
  </div>
</Dialog>
```

---

### 5. Update `/src/routes/(app)/calendar/+page.svelte`

Add edit buttons and regenerate functionality.

**Additional State:**
```typescript
let editingAssignment: EnrichedAssignment | null = null;
let reassigningAssignment: EnrichedAssignment | null = null;
let showRegenerateDialog = false;
```

**Additional Functions:**
```typescript
function handleEditClick(event: CalendarEvent) {
  editingAssignment = event.assignment;
}

function handleReassignClick(assignment: EnrichedAssignment) {
  reassigningAssignment = assignment;
}

async function handleRegenerateConfirm() {
  showRegenerateDialog = false;
  // Refresh calendar data
  await fetchCalendarData();
  toast.success('Schedule regenerated successfully');
}
```

**Additional UI:**
```svelte
<!-- Add to header -->
<Button variant="destructive" on:click={() => showRegenerateDialog = true}>
  Regenerate Schedule
</Button>

<!-- Add modals -->
<EditAssignmentModal
  assignment={editingAssignment}
  open={!!editingAssignment}
  on:save={handleEditSave}
  on:reassign={handleReassignClick}
  on:cancel={() => editingAssignment = null}
/>

<ReassignModal
  assignment={reassigningAssignment}
  {preceptors}
  open={!!reassigningAssignment}
  on:save={handleReassignSave}
  on:cancel={() => reassigningAssignment = null}
/>

<RegenerateScheduleDialog
  open={showRegenerateDialog}
  on:confirm={handleRegenerateConfirm}
  on:cancel={() => showRegenerateDialog = false}
/>
```

---

## Testing Requirements

### Component Tests

#### EditAssignmentModal.svelte
- ✅ Displays assignment info
- ✅ Validates date changes
- ✅ Shows validation errors
- ✅ Preview functionality works
- ✅ Save functionality works
- ✅ Reassign button opens reassign modal

#### ReassignModal.svelte
- ✅ Filters preceptors by specialty
- ✅ Preview validates reassignment
- ✅ Shows validation errors
- ✅ Save functionality works
- ✅ Only allows valid reassignments

#### ConflictWarning.svelte
- ✅ Displays all conflict types
- ✅ Color codes warnings appropriately

#### RegenerateScheduleDialog.svelte
- ✅ Shows warning message
- ✅ Validates date inputs
- ✅ Clears existing schedule
- ✅ Generates new schedule
- ✅ Shows loading state

---

## Acceptance Criteria

- [ ] Edit assignment modal implemented
- [ ] Reassign modal implemented
- [ ] Conflict warning component implemented
- [ ] Regenerate schedule dialog implemented
- [ ] Edit functionality working end-to-end
- [ ] Reassignment functionality working end-to-end
- [ ] Validation errors displayed clearly
- [ ] Dry run preview before saving
- [ ] Regenerate clears and recreates schedule
- [ ] Success/error toasts display appropriately
- [ ] All UI components are responsive
- [ ] All interactive elements are keyboard accessible
- [ ] Confirmation dialogs prevent accidental actions

---

## Usage Example

User workflow:
1. Click on event in calendar
2. Event detail modal opens
3. Click "Edit" button
4. Edit assignment modal opens
5. Change dates
6. System validates changes (dry run)
7. If valid, "Save" button enabled
8. Click "Save" to commit changes
9. Or click "Reassign" to change preceptor
10. Select new preceptor
11. System validates reassignment
12. Confirm to save
13. Calendar refreshes with updated assignment

Regenerate workflow:
1. Click "Regenerate Schedule" button
2. Warning dialog appears
3. Enter date range
4. Confirm action
5. System clears all assignments
6. System generates new schedule
7. Calendar refreshes with new schedule

---

## Notes

- Dry run preview is critical for user confidence
- Clear validation feedback prevents frustration
- Confirmation dialogs prevent accidental data loss
- Future: Add drag-and-drop reassignment
- Future: Add bulk edit functionality
- Future: Add undo/redo

---

## References

- [shadcn/ui Dialog](https://ui.shadcn.com/docs/components/dialog)
- [Form Validation UX](https://www.nngroup.com/articles/errors-forms-design-guidelines/)
- [Confirmation Dialog Patterns](https://www.nngroup.com/articles/confirmation-dialog/)
