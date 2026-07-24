# Development Plan: Student Page Updates

## Overview

Add completion % to student list, remove onboarding tab from list page, add Edit tab to detail page.

## Current State

- Student list page (`/students`) has two tabs: "Students" and "Health System Onboarding"
- Student detail page (`/students/[id]`) has tabs: Health System Onboarding, Clerkship Progress, Calendar
- Edit is a separate page (`/students/[id]/edit`)
- StudentList component shows: Name, Email, Onboarding progress, Created, Actions

## Requirements

- Show clerkship completion % on student list page
- Remove "Health System Onboarding" tab from student list page (keep on detail page)
- Add "Details" tab as FIRST tab on student detail page with inline edit form

---

## Phase 1: Student List Page Updates

### 1.1 Update student list data loader

**File:** `src/routes/students/+page.ts`

Add schedule completion data fetch:
```typescript
export const load: PageLoad = async ({ fetch }) => {
  // Existing: fetch students
  const studentsResponse = await fetch('/api/students');
  const students = await studentsResponse.json();

  // NEW: fetch completion data for all students
  const completionResponse = await fetch('/api/students/completion-stats');
  const completionStats = await completionResponse.json();
  // Returns: { [studentId]: { scheduledDays: number, requiredDays: number, percentage: number } }

  return {
    students,
    completionStats
  };
};
```

### 1.2 Create completion stats API endpoint

**File:** `src/routes/api/students/completion-stats/+server.ts`

```typescript
export async function GET({ locals }) {
  const db = locals.db;

  // Get all students with their scheduled days
  const students = await db
    .selectFrom('students')
    .select(['id'])
    .execute();

  // For each student, calculate:
  // - Total scheduled days (from schedule_assignments)
  // - Total required days (sum of clerkship required_days)
  // - Percentage

  // Return as map: { studentId: { scheduledDays, requiredDays, percentage } }
}
```

### 1.3 Update StudentList component

**File:** `src/lib/features/students/components/student-list.svelte`

Add "Completion" column:
```svelte
<script>
  export let students: Student[];
  export let completionStats: Record<string, CompletionStats>;
</script>

<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Email</th>
      <th>Completion</th>  <!-- NEW -->
      <th>Created</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each students as student}
      <tr>
        <td>{student.name}</td>
        <td>{student.email}</td>
        <td>
          <!-- NEW: Completion percentage with color coding -->
          {@const stats = completionStats[student.id]}
          {@const pct = stats?.percentage ?? 0}
          <div class="flex items-center gap-2">
            <div class="w-16 bg-gray-200 rounded-full h-2">
              <div
                class="h-2 rounded-full {pct < 50 ? 'bg-red-500' : pct < 100 ? 'bg-yellow-500' : 'bg-green-500'}"
                style="width: {pct}%"
              ></div>
            </div>
            <span class="text-sm">{pct.toFixed(0)}%</span>
          </div>
        </td>
        <td>{formatDate(student.created_at)}</td>
        <td><!-- actions --></td>
      </tr>
    {/each}
  </tbody>
</table>
```

Color coding:
- Red: < 50%
- Yellow: 50-99%
- Green: 100%

### 1.4 Remove onboarding tab from list page

**File:** `src/routes/students/+page.svelte`

Before:
```svelte
<Tabs>
  <TabItem title="Students">
    <StudentList ... />
  </TabItem>
  <TabItem title="Health System Onboarding">
    <StudentOnboardingForm ... />
  </TabItem>
</Tabs>
```

After:
```svelte
<!-- Remove Tabs wrapper entirely since only one section remains -->
<div class="students-page">
  <div class="header">
    <h1>Students</h1>
    <a href="/students/new">Add Student</a>
  </div>

  <StudentList
    students={data.students}
    completionStats={data.completionStats}
    on:delete={handleDelete}
  />
</div>
```

Remove:
- `StudentOnboardingForm` import
- Tab component usage
- Onboarding-related data loading

### Testing

- Component tests for updated StudentList with completion column
- Integration test: verify completion % displays correctly
- Verify onboarding tab removed from list page
- Run `npm run check` and `npm run test`

---

## Phase 2: Student Detail Page Updates

### 2.1 Restructure tabs

**File:** `src/routes/students/[id]/+page.svelte`

New tab order:
1. **Details** (new, first) - contains edit form
2. **Health System Onboarding** (existing, moved)
3. **Clerkship Progress** (existing)
4. **Calendar** (existing)

```svelte
<script>
  import StudentForm from '$lib/features/students/components/student-form.svelte';
  // ... other imports
</script>

<div class="student-detail-page">
  <header>
    <h1>{data.student.name}</h1>
    <!-- Breadcrumb: Students > Student Name -->
  </header>

  <Tabs>
    <!-- NEW: Details tab first -->
    <TabItem title="Details">
      <StudentDetailsTab
        student={data.student}
        on:updated={handleStudentUpdated}
      />
    </TabItem>

    <TabItem title="Health System Onboarding">
      <!-- Existing onboarding content -->
    </TabItem>

    <TabItem title="Clerkship Progress">
      <!-- Existing progress content -->
    </TabItem>

    <TabItem title="Calendar">
      <!-- Existing calendar content -->
    </TabItem>
  </Tabs>
</div>
```

### 2.2 Create StudentDetailsTab component

**File:** `src/lib/features/students/components/student-details-tab.svelte`

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import StudentForm from './student-form.svelte';
  import type { Students } from '$lib/db/types';

  export let student: Students;

  const dispatch = createEventDispatcher();

  let isEditing = true; // Always show form in edit mode
  let successMessage = '';

  async function handleSuccess() {
    successMessage = 'Student updated successfully';
    dispatch('updated');

    // Clear success message after delay
    setTimeout(() => {
      successMessage = '';
    }, 3000);
  }
</script>

<div class="student-details-tab">
  {#if successMessage}
    <div class="alert alert-success mb-4">
      {successMessage}
    </div>
  {/if}

  <div class="card">
    <div class="card-header">
      <h2>Student Information</h2>
    </div>
    <div class="card-body">
      <StudentForm
        {student}
        onSuccess={handleSuccess}
      />
    </div>
  </div>

  <!-- Optional: Add additional read-only info sections -->
  <div class="card mt-4">
    <div class="card-header">
      <h2>Summary</h2>
    </div>
    <div class="card-body">
      <dl>
        <dt>Created</dt>
        <dd>{formatDate(student.created_at)}</dd>

        <dt>Last Updated</dt>
        <dd>{formatDate(student.updated_at)}</dd>
      </dl>
    </div>
  </div>
</div>
```

### 2.3 Update StudentForm for inline use

**File:** `src/lib/features/students/components/student-form.svelte`

Ensure the form works well in the tab context:
- Remove card wrapper (handled by parent)
- Keep Save button (rename from "Update" to "Save Changes")
- Remove Cancel button (not needed in tab context)
- Add loading state during save
- Show success feedback

### 2.4 Update page data loader

**File:** `src/routes/students/[id]/+page.ts`

Ensure all necessary data is loaded:
```typescript
export const load: PageLoad = async ({ params, fetch }) => {
  const [studentRes, healthSystemsRes, onboardingRes, scheduleRes] = await Promise.all([
    fetch(`/api/students/${params.id}`),
    fetch('/api/health-systems'),
    fetch('/api/student-onboarding'),
    fetch(`/api/students/${params.id}/schedule`)
  ]);

  return {
    student: await studentRes.json(),
    healthSystems: await healthSystemsRes.json(),
    onboardingStatus: await onboardingRes.json(),
    schedule: await scheduleRes.json()
  };
};
```

### Testing

- Integration tests for new tab structure
- Test inline editing saves correctly
- Test success message displays
- Verify tab order is correct
- Run `npm run check` and `npm run test`

---

## Phase 3: Cleanup

### 3.1 Handle edit page redirect

**File:** `src/routes/students/[id]/edit/+page.ts`

Option A: Redirect to detail page
```typescript
import { redirect } from '@sveltejs/kit';

export const load = async ({ params }) => {
  throw redirect(302, `/students/${params.id}`);
};
```

Option B: Delete the edit route entirely
- Remove `src/routes/students/[id]/edit/` directory

### 3.2 Update navigation links

Search codebase for links to `/students/*/edit`:

**Files to check/update:**
- `src/lib/features/students/components/student-list.svelte` - Remove Edit button or change to navigate to detail page
- Any other components with edit links

Update StudentList actions:
```svelte
<!-- Before -->
<a href="/students/{student.id}/edit">Edit</a>

<!-- After: Remove edit link, just use View -->
<a href="/students/{student.id}">View</a>
```

### 3.3 Update delete button location

If delete was on the edit page, ensure it's accessible:
- Add delete button to Details tab (with confirmation dialog)
- Or keep in student list actions

### Testing

- Verify old edit URL redirects (if using Option A)
- Verify no broken links
- Test delete functionality still works
- Run `npm run check` and `npm run test`

---

## Files to Create/Modify

| Action | File Path |
|--------|-----------|
| Create | `src/routes/api/students/completion-stats/+server.ts` |
| Create | `src/lib/features/students/components/student-details-tab.svelte` |
| Modify | `src/routes/students/+page.svelte` |
| Modify | `src/routes/students/+page.ts` |
| Modify | `src/routes/students/[id]/+page.svelte` |
| Modify | `src/lib/features/students/components/student-list.svelte` |
| Modify | `src/lib/features/students/components/student-form.svelte` |
| Delete/Redirect | `src/routes/students/[id]/edit/` |

---

## Validation Checklist

- [ ] Completion % displays on student list page
- [ ] Progress bar shows correct color coding
- [ ] Onboarding tab removed from student list page
- [ ] Onboarding tab still present on student detail page
- [ ] Details tab is first on student detail page
- [ ] Inline edit form works correctly
- [ ] Success message shows after save
- [ ] Old edit URL handles gracefully (redirect or 404)
- [ ] No broken navigation links
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] TypeScript build passes (`npm run check`)
- [ ] Production build succeeds (`npm run build`)
