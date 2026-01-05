# Development Plan: Health Systems Page Redesign

## Overview

Convert from cards to table, create detail page with tabs, improve delete tooltip.

## Current State

- Health systems displayed as cards in grid layout
- Edit opens as modal popup on same page
- Delete button disabled with basic tooltip when dependencies exist
- No dedicated detail page

## Requirements

- Display as table (matching format of other routes)
- Create separate detail page with two tabs:
  1. Details - edit form
  2. Dependencies - lists with links
- Enhanced delete tooltip with detailed explanation

---

## Phase 1: Create Table Component

### 1.1 Create HealthSystemTable component

**File:** `src/lib/features/health-systems/components/health-system-table.svelte`

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { HealthSystems } from '$lib/db/types';

  interface HealthSystemWithCounts extends HealthSystems {
    siteCount: number;
    preceptorCount: number;
  }

  export let healthSystems: HealthSystemWithCounts[];
  export let loading = false;

  const dispatch = createEventDispatcher();

  // Sorting state
  let sortColumn: 'name' | 'location' | 'created_at' = 'name';
  let sortDirection: 'asc' | 'desc' = 'asc';

  $: sortedHealthSystems = [...healthSystems].sort((a, b) => {
    const aVal = a[sortColumn] ?? '';
    const bVal = b[sortColumn] ?? '';
    const comparison = aVal.localeCompare(bVal);
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  function handleSort(column: typeof sortColumn) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function canDelete(hs: HealthSystemWithCounts): boolean {
    return hs.siteCount === 0 && hs.preceptorCount === 0;
  }

  function getDeleteTooltip(hs: HealthSystemWithCounts): string {
    if (canDelete(hs)) return '';

    const parts: string[] = ['Cannot delete: This health system has:'];
    if (hs.siteCount > 0) {
      parts.push(`• ${hs.siteCount} site${hs.siteCount > 1 ? 's' : ''}`);
    }
    if (hs.preceptorCount > 0) {
      parts.push(`• ${hs.preceptorCount} preceptor${hs.preceptorCount > 1 ? 's' : ''}`);
    }
    parts.push('', 'Remove or reassign these before deleting.');
    return parts.join('\n');
  }
</script>

<div class="overflow-x-auto">
  <table class="table table-zebra w-full">
    <thead>
      <tr>
        <th class="cursor-pointer" on:click={() => handleSort('name')}>
          Name {sortColumn === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </th>
        <th class="cursor-pointer" on:click={() => handleSort('location')}>
          Location {sortColumn === 'location' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </th>
        <th>Sites</th>
        <th>Preceptors</th>
        <th class="cursor-pointer" on:click={() => handleSort('created_at')}>
          Created {sortColumn === 'created_at' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each sortedHealthSystems as hs}
        <tr class="hover cursor-pointer" on:click={() => goto(`/health-systems/${hs.id}`)}>
          <td class="font-medium">{hs.name}</td>
          <td>{hs.location || '-'}</td>
          <td>
            <span class="badge badge-ghost">{hs.siteCount}</span>
          </td>
          <td>
            <span class="badge badge-ghost">{hs.preceptorCount}</span>
          </td>
          <td>{formatDate(hs.created_at)}</td>
          <td class="flex gap-2" on:click|stopPropagation>
            <a href="/health-systems/{hs.id}" class="btn btn-sm btn-ghost">
              View
            </a>
            <button
              class="btn btn-sm btn-error btn-outline"
              disabled={!canDelete(hs)}
              title={getDeleteTooltip(hs)}
              on:click={() => dispatch('delete', hs)}
            >
              Delete
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if healthSystems.length === 0 && !loading}
    <div class="text-center py-8 text-gray-500">
      No health systems found. <a href="/health-systems/new">Add one</a>.
    </div>
  {/if}
</div>
```

### 1.2 Update list page data loader

**File:** `src/routes/health-systems/+page.ts`

```typescript
export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/health-systems?includeCounts=true');
  const healthSystems = await response.json();

  return { healthSystems };
};
```

### 1.3 Update API to include counts

**File:** `src/routes/api/health-systems/+server.ts`

Add `includeCounts` query parameter:
```typescript
export async function GET({ url, locals }) {
  const includeCounts = url.searchParams.get('includeCounts') === 'true';

  if (includeCounts) {
    // Join with sites and preceptors to get counts
    const healthSystems = await db
      .selectFrom('health_systems')
      .leftJoin('sites', 'sites.health_system_id', 'health_systems.id')
      .leftJoin('preceptors', /* preceptor-site-health_system join */)
      .select([
        'health_systems.id',
        'health_systems.name',
        'health_systems.location',
        'health_systems.created_at',
        db.fn.count('sites.id').distinct().as('siteCount'),
        db.fn.count('preceptors.id').distinct().as('preceptorCount')
      ])
      .groupBy('health_systems.id')
      .execute();

    return json(healthSystems);
  }

  // Existing logic without counts
}
```

### 1.4 Update list page

**File:** `src/routes/health-systems/+page.svelte`

```svelte
<script>
  import HealthSystemTable from '$lib/features/health-systems/components/health-system-table.svelte';
  import DeleteHealthSystemDialog from '$lib/features/health-systems/components/delete-health-system-dialog.svelte';

  export let data;

  let deleteTarget: HealthSystem | null = null;

  async function handleDelete(event: CustomEvent<HealthSystem>) {
    deleteTarget = event.detail;
  }

  async function confirmDelete() {
    // Delete logic
    deleteTarget = null;
  }
</script>

<div class="health-systems-page">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold">Health Systems</h1>
    <a href="/health-systems/new" class="btn btn-primary">
      Add Health System
    </a>
  </div>

  <HealthSystemTable
    healthSystems={data.healthSystems}
    on:delete={handleDelete}
  />
</div>

{#if deleteTarget}
  <DeleteHealthSystemDialog
    healthSystem={deleteTarget}
    on:confirm={confirmDelete}
    on:cancel={() => deleteTarget = null}
  />
{/if}
```

### Testing

- Component tests for HealthSystemTable
- Test sorting functionality
- Test delete tooltip content
- Test row click navigation
- Run `npm run check` and `npm run test`

---

## Phase 2: Create Detail Page

### 2.1 Create detail page route

**File:** `src/routes/health-systems/[id]/+page.svelte`

```svelte
<script lang="ts">
  import HealthSystemDetailsTab from '$lib/features/health-systems/components/health-system-details-tab.svelte';
  import HealthSystemDependenciesTab from '$lib/features/health-systems/components/health-system-dependencies-tab.svelte';

  export let data;

  let activeTab = 'details';
</script>

<div class="health-system-detail-page">
  <!-- Header with breadcrumb -->
  <div class="mb-6">
    <nav class="text-sm breadcrumbs">
      <ul>
        <li><a href="/health-systems">Health Systems</a></li>
        <li>{data.healthSystem.name}</li>
      </ul>
    </nav>
    <h1 class="text-2xl font-bold mt-2">{data.healthSystem.name}</h1>
  </div>

  <!-- Tabs -->
  <div class="tabs tabs-boxed mb-6">
    <button
      class="tab {activeTab === 'details' ? 'tab-active' : ''}"
      on:click={() => activeTab = 'details'}
    >
      Details
    </button>
    <button
      class="tab {activeTab === 'dependencies' ? 'tab-active' : ''}"
      on:click={() => activeTab = 'dependencies'}
    >
      Dependencies
      <span class="badge badge-sm ml-2">
        {data.dependencies.sites.length + data.dependencies.preceptors.length}
      </span>
    </button>
  </div>

  <!-- Tab content -->
  {#if activeTab === 'details'}
    <HealthSystemDetailsTab
      healthSystem={data.healthSystem}
      canDelete={data.canDelete}
      deleteTooltip={data.deleteTooltip}
      on:updated={handleUpdated}
      on:deleted={handleDeleted}
    />
  {:else if activeTab === 'dependencies'}
    <HealthSystemDependenciesTab
      dependencies={data.dependencies}
    />
  {/if}
</div>
```

### 2.2 Create page data loader

**File:** `src/routes/health-systems/[id]/+page.ts`

```typescript
export const load: PageLoad = async ({ params, fetch }) => {
  const [hsResponse, depsResponse] = await Promise.all([
    fetch(`/api/health-systems/${params.id}`),
    fetch(`/api/health-systems/${params.id}/dependencies`)
  ]);

  const healthSystem = await hsResponse.json();
  const dependencies = await depsResponse.json();

  const canDelete = dependencies.sites.length === 0 &&
                    dependencies.preceptors.length === 0;

  let deleteTooltip = '';
  if (!canDelete) {
    const parts = ['Cannot delete: This health system has:'];
    if (dependencies.sites.length > 0) {
      parts.push(`• ${dependencies.sites.length} site${dependencies.sites.length > 1 ? 's' : ''}`);
    }
    if (dependencies.preceptors.length > 0) {
      parts.push(`• ${dependencies.preceptors.length} preceptor${dependencies.preceptors.length > 1 ? 's' : ''}`);
    }
    parts.push('', 'Remove or reassign these before deleting.');
    deleteTooltip = parts.join('\n');
  }

  return {
    healthSystem,
    dependencies,
    canDelete,
    deleteTooltip
  };
};
```

### 2.3 Create HealthSystemDetailsTab component

**File:** `src/lib/features/health-systems/components/health-system-details-tab.svelte`

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import HealthSystemForm from './health-system-form.svelte';
  import type { HealthSystems } from '$lib/db/types';

  export let healthSystem: HealthSystems;
  export let canDelete: boolean;
  export let deleteTooltip: string;

  const dispatch = createEventDispatcher();

  let successMessage = '';
  let showDeleteConfirm = false;

  function handleSuccess() {
    successMessage = 'Health system updated successfully';
    dispatch('updated');
    setTimeout(() => successMessage = '', 3000);
  }

  async function handleDelete() {
    const response = await fetch(`/api/health-systems/${healthSystem.id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      dispatch('deleted');
      goto('/health-systems');
    }
  }
</script>

<div class="health-system-details-tab">
  {#if successMessage}
    <div class="alert alert-success mb-4">{successMessage}</div>
  {/if}

  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">Health System Information</h2>

      <HealthSystemForm
        {healthSystem}
        onSuccess={handleSuccess}
      />
    </div>
  </div>

  <!-- Danger zone -->
  <div class="card bg-base-100 shadow mt-6 border-error border">
    <div class="card-body">
      <h2 class="card-title text-error">Danger Zone</h2>

      <div class="flex items-center justify-between">
        <div>
          <p class="font-medium">Delete this health system</p>
          <p class="text-sm text-gray-500">
            This action cannot be undone.
          </p>
        </div>

        <div class="tooltip tooltip-left" data-tip={deleteTooltip || undefined}>
          <button
            class="btn btn-error btn-outline"
            disabled={!canDelete}
            on:click={() => showDeleteConfirm = true}
          >
            Delete Health System
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

{#if showDeleteConfirm}
  <!-- Delete confirmation modal -->
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg">Delete Health System</h3>
      <p class="py-4">
        Are you sure you want to delete "{healthSystem.name}"?
        This action cannot be undone.
      </p>
      <div class="modal-action">
        <button class="btn" on:click={() => showDeleteConfirm = false}>
          Cancel
        </button>
        <button class="btn btn-error" on:click={handleDelete}>
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}
```

### 2.4 Create HealthSystemDependenciesTab component

**File:** `src/lib/features/health-systems/components/health-system-dependencies-tab.svelte`

```svelte
<script lang="ts">
  interface Dependencies {
    sites: Array<{ id: string; name: string; address?: string }>;
    preceptors: Array<{ id: string; name: string; email?: string }>;
    studentOnboarding: Array<{ studentId: string; studentName: string }>;
  }

  export let dependencies: Dependencies;
</script>

<div class="health-system-dependencies-tab space-y-6">
  <!-- Sites Section -->
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">
        Sites
        <span class="badge">{dependencies.sites.length}</span>
      </h2>

      {#if dependencies.sites.length === 0}
        <p class="text-gray-500">No sites associated with this health system.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="table table-compact w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {#each dependencies.sites as site}
                <tr>
                  <td>{site.name}</td>
                  <td>{site.address || '-'}</td>
                  <td>
                    <a href="/sites/{site.id}" class="btn btn-xs btn-ghost">
                      View →
                    </a>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>

  <!-- Preceptors Section -->
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">
        Preceptors
        <span class="badge">{dependencies.preceptors.length}</span>
      </h2>

      {#if dependencies.preceptors.length === 0}
        <p class="text-gray-500">No preceptors associated with this health system.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="table table-compact w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {#each dependencies.preceptors as preceptor}
                <tr>
                  <td>{preceptor.name}</td>
                  <td>{preceptor.email || '-'}</td>
                  <td>
                    <a href="/preceptors/{preceptor.id}" class="btn btn-xs btn-ghost">
                      View →
                    </a>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>

  <!-- Student Onboarding Section -->
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">
        Student Onboarding Records
        <span class="badge badge-warning">{dependencies.studentOnboarding.length}</span>
      </h2>

      <p class="text-sm text-gray-500">
        These records will be automatically deleted if the health system is deleted.
      </p>

      {#if dependencies.studentOnboarding.length === 0}
        <p class="text-gray-500">No student onboarding records.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="table table-compact w-full">
            <thead>
              <tr>
                <th>Student</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {#each dependencies.studentOnboarding as record}
                <tr>
                  <td>{record.studentName}</td>
                  <td>
                    <a href="/students/{record.studentId}" class="btn btn-xs btn-ghost">
                      View →
                    </a>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
</div>
```

### 2.5 Update dependencies API endpoint

**File:** `src/routes/api/health-systems/[id]/dependencies/+server.ts`

Update to return full lists with links:
```typescript
export async function GET({ params, locals }) {
  const db = locals.db;
  const healthSystemId = params.id;

  // Get sites with details
  const sites = await db
    .selectFrom('sites')
    .where('health_system_id', '=', healthSystemId)
    .select(['id', 'name', 'address'])
    .execute();

  // Get preceptors with details (through site association)
  const preceptors = await db
    .selectFrom('preceptors')
    .innerJoin('preceptor_sites', 'preceptor_sites.preceptor_id', 'preceptors.id')
    .innerJoin('sites', 'sites.id', 'preceptor_sites.site_id')
    .where('sites.health_system_id', '=', healthSystemId)
    .select(['preceptors.id', 'preceptors.name', 'preceptors.email'])
    .distinct()
    .execute();

  // Get student onboarding records
  const studentOnboarding = await db
    .selectFrom('student_health_system_onboarding')
    .innerJoin('students', 'students.id', 'student_health_system_onboarding.student_id')
    .where('health_system_id', '=', healthSystemId)
    .select([
      'student_health_system_onboarding.student_id as studentId',
      'students.name as studentName'
    ])
    .execute();

  return json({
    sites,
    preceptors,
    studentOnboarding
  });
}
```

### Testing

- Component tests for both tab components
- Integration tests for detail page
- Test navigation from list to detail
- Test delete functionality with dependencies
- Run `npm run check` and `npm run test`

---

## Phase 3: Enhanced Delete Tooltip

### 3.1 Create enhanced tooltip component (optional)

**File:** `src/lib/components/enhanced-tooltip.svelte`

For multi-line tooltips with better formatting:
```svelte
<script>
  export let content: string;
  export let disabled = false;
</script>

<div class="relative group inline-block">
  <slot />

  {#if content && !disabled}
    <div class="absolute z-50 invisible group-hover:visible
                bg-gray-900 text-white text-sm rounded-lg py-2 px-3
                bottom-full left-1/2 transform -translate-x-1/2 mb-2
                min-w-[200px] max-w-[300px] whitespace-pre-line">
      {content}
      <div class="absolute top-full left-1/2 transform -translate-x-1/2
                  border-8 border-transparent border-t-gray-900"></div>
    </div>
  {/if}
</div>
```

### 3.2 Update all delete buttons to use enhanced tooltip

Apply consistent tooltip format across:
- Health system table
- Health system detail page
- Any other entity with dependency-based delete restrictions

### Testing

- Visual testing for tooltip display
- Test tooltip content accuracy
- Test tooltip with various dependency combinations
- Run `npm run check` and `npm run test`

---

## Phase 4: Cleanup

### 4.1 Remove old components

- Delete or deprecate `health-system-list.svelte` (card-based component)
- Remove modal form code from list page (if still present)

### 4.2 Update navigation

Ensure all health system links point to new detail page:
- Sidebar navigation
- Any cross-linking from other pages (sites, preceptors)

### 4.3 Consistency check

Verify health systems page now matches pattern of other entity pages:
- Students: list page -> detail page with tabs
- Preceptors: list page -> detail page with tabs
- Sites: list page -> detail page with tabs
- Health Systems: list page -> detail page with tabs ✓

### Testing

- Verify no broken links
- Full E2E test of health system CRUD flow
- Compare with other entity pages for consistency
- Run `npm run check` and `npm run test`

---

## Files to Create/Modify

| Action | File Path |
|--------|-----------|
| Create | `src/lib/features/health-systems/components/health-system-table.svelte` |
| Create | `src/lib/features/health-systems/components/health-system-details-tab.svelte` |
| Create | `src/lib/features/health-systems/components/health-system-dependencies-tab.svelte` |
| Create | `src/routes/health-systems/[id]/+page.svelte` |
| Create | `src/routes/health-systems/[id]/+page.ts` |
| Modify | `src/routes/health-systems/+page.svelte` |
| Modify | `src/routes/health-systems/+page.ts` |
| Modify | `src/routes/api/health-systems/+server.ts` |
| Modify | `src/routes/api/health-systems/[id]/dependencies/+server.ts` |
| Delete | `src/lib/features/health-systems/components/health-system-list.svelte` (optional) |

---

## Validation Checklist

- [ ] Health systems display as table with correct columns
- [ ] Table sorting works (Name, Location, Created)
- [ ] Row click navigates to detail page
- [ ] Detail page has two tabs: Details and Dependencies
- [ ] Details tab shows editable form
- [ ] Dependencies tab shows sites, preceptors, student onboarding
- [ ] All dependency items have working "View" links
- [ ] Delete button disabled with detailed tooltip when dependencies exist
- [ ] Delete confirmation works when allowed
- [ ] Student onboarding cascade delete warning shown
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] TypeScript build passes (`npm run check`)
- [ ] Production build succeeds (`npm run build`)
