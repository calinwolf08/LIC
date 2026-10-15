# Plan 07: Schedule Wizard UX Improvements

## Overview

Improve the new schedule wizard for first-time users by:

1. Reordering steps to respect entity dependencies
2. Adding inline entity creation at each step
3. Removing redundant Year field
4. Adding clear messaging and confirmations
5. Warning about scheduling requirements (teams)

## Current Problems

1. **Wrong step order**: Students before Health Systems makes no sense for dependencies
2. **Empty steps useless**: "No X available" with no way to create entities inline
3. **Year field redundant**: Auto-calculated from dates, not even saved to DB
4. **No skip confirmation**: User can silently skip entity selection
5. **No scheduling warnings**: User not informed that teams are required for scheduling

## Design Decisions

Based on discussion:

- Each step allows creating **multiple** entities inline
- Use **existing form components** (all are reusable)
- Show **confirmation modal** when skipping with 0 selections
- Teams step uses **full team-form-dialog** (feature-complete)
- Teams step **disabled with explanation** if prerequisites missing
- **Warn at Review** about scheduling requirements
- Sidebar order should also be updated to match entity dependency order

## Implementation

### Phase 1: Remove Year Field

**File**: `src/lib/features/schedules/components/new-schedule-wizard.svelte`

Remove:

- Line 48: `let year = $state(new Date().getFullYear());`
- Lines 71-76: `$effect` that auto-calculates year
- Lines 314-326: Year input field in Step 0
- Lines 401-402: Year display in Review step
- Lines 162, 179: Year in API payloads (if present)

### Phase 2: Reorder Wizard Steps

**File**: `src/lib/features/schedules/components/new-schedule-wizard.svelte`

Change `steps` array from:

```javascript
const steps = [
	{ name: 'Details', icon: '📝' },
	{ name: 'Students', icon: '👨‍🎓' },
	{ name: 'Preceptors', icon: '👨‍⚕️' },
	{ name: 'Sites', icon: '📍' },
	{ name: 'Health Systems', icon: '🏥' },
	{ name: 'Clerkships', icon: '📚' },
	{ name: 'Teams', icon: '👥' },
	{ name: 'Review', icon: '✅' }
];
```

To:

```javascript
const steps = [
	{ name: 'Details', icon: '📝' },
	{ name: 'Health Systems', icon: '🏥' },
	{ name: 'Sites', icon: '📍' },
	{ name: 'Clerkships', icon: '📚' },
	{ name: 'Preceptors', icon: '👨‍⚕️' },
	{ name: 'Teams', icon: '👥' },
	{ name: 'Students', icon: '👨‍🎓' },
	{ name: 'Review', icon: '✅' }
];
```

Update all step content `{#if currentStep === X}` blocks to match new order.

### Phase 3: Add Inline Entity Creation

For each entity step, add:

1. Import the existing form component
2. Add modal state: `let showXForm = $state(false)`
3. Add "Add New" button (primary style) when list is empty or below table
4. Add modal wrapper with form component
5. On success: refresh entity list, auto-select new entity

**Components to import**:

```javascript
import HealthSystemForm from '$lib/features/health-systems/components/health-system-form.svelte';
import SiteForm from '$lib/features/sites/components/site-form.svelte';
import ClerkshipForm from '$lib/features/clerkships/components/clerkship-form.svelte';
import PreceptorForm from '$lib/features/preceptors/components/preceptor-form.svelte';
import StudentForm from '$lib/features/students/components/student-form.svelte';
import TeamFormDialog from '$lib/features/teams/components/team-form-dialog.svelte';
```

**Pattern for each step**:

```svelte
{#if currentStep === X}
  <h2 class="text-xl font-semibold mb-6">Select [Entities]</h2>

  {#if entityData.[entities].length === 0}
    <div class="text-center py-8">
      <p class="text-gray-500 mb-4">No [entities] available yet.</p>
      <button
        type="button"
        onclick={() => showXForm = true}
        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        + Add [Entity]
      </button>
    </div>
  {:else}
    <EntitySelectionTable ... />
    <div class="mt-4">
      <button
        type="button"
        onclick={() => showXForm = true}
        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        + Add [Entity]
      </button>
    </div>
  {/if}

  <!-- Modal -->
  {#if showXForm}
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" onclick={() => showXForm = false}></div>
      <div class="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <XForm
          onSuccess={handleXCreated}
          onCancel={() => showXForm = false}
          {...dependentProps}
        />
      </div>
    </div>
  {/if}
{/if}
```

**Entity-specific handlers**:

```javascript
async function handleHealthSystemCreated() {
	showHealthSystemForm = false;
	await refreshHealthSystems();
}

async function handleSiteCreated() {
	showSiteForm = false;
	await refreshSites();
}
// ... etc for each entity type
```

**Refresh functions** - fetch updated entity lists from API:

```javascript
async function refreshHealthSystems() {
	const response = await fetch('/api/health-systems');
	const result = await response.json();
	if (result.success) {
		entityData.healthSystems = result.data;
	}
}
// ... etc for each entity type
```

### Phase 4: Skip Confirmation Modal

Add state:

```javascript
let showSkipConfirmation = $state(false);
let skipEntityType = $state('');
let pendingNextStep = $state<(() => void) | null>(null);
```

Modify `nextStep()`:

```javascript
function nextStep(): void {
  // Check if current step has 0 selections
  const currentSelections = getCurrentStepSelections();
  const entityName = getCurrentStepEntityName();

  if (currentSelections.length === 0 && entityName) {
    skipEntityType = entityName;
    pendingNextStep = () => {
      if (currentStep < steps.length - 1) {
        currentStep++;
      }
    };
    showSkipConfirmation = true;
    return;
  }

  if (currentStep < steps.length - 1) {
    currentStep++;
  }
}

function confirmSkip(): void {
  showSkipConfirmation = false;
  if (pendingNextStep) {
    pendingNextStep();
    pendingNextStep = null;
  }
}

function cancelSkip(): void {
  showSkipConfirmation = false;
  pendingNextStep = null;
}
```

Skip confirmation modal:

```svelte
{#if showSkipConfirmation}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<div class="absolute inset-0 bg-black/50"></div>
		<div class="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
			<h3 class="mb-4 text-lg font-semibold">Continue without {skipEntityType}?</h3>
			<p class="mb-6 text-gray-600">
				You haven't selected any {skipEntityType.toLowerCase()}. You can add them later, but some
				features may not work without them.
			</p>
			<div class="flex justify-end gap-3">
				<button
					type="button"
					onclick={cancelSkip}
					class="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200"
				>
					Go Back
				</button>
				<button
					type="button"
					onclick={confirmSkip}
					class="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
				>
					Continue Anyway
				</button>
			</div>
		</div>
	</div>
{/if}
```

### Phase 5: Teams Step with Prerequisites

Teams step logic:

```javascript
let teamsPrerequisitesMet = $derived(
	selectedClerkships.length > 0 && selectedPreceptors.length > 0
);

let preceptorsWithoutTeams = $derived(() => {
	const preceptorIdsInTeams = new Set(
		entityData.teams.flatMap((t) => t.members?.map((m) => m.preceptor_id) || [])
	);
	return selectedPreceptors.filter((id) => !preceptorIdsInTeams.has(id));
});
```

Teams step content:

```svelte
{#if currentStep === 5}
	<h2 class="mb-6 text-xl font-semibold">Select Teams</h2>

	{#if !teamsPrerequisitesMet}
		<div class="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
			<div class="mb-4 text-4xl text-amber-600">⚠️</div>
			<h3 class="mb-2 text-lg font-medium text-amber-800">Prerequisites Required</h3>
			<p class="mb-4 text-amber-700">
				Teams connect preceptors to clerkships for scheduling. You need at least one clerkship and
				one preceptor to create a team.
			</p>
			<div class="flex justify-center gap-3">
				<button
					type="button"
					onclick={() => (currentStep = 3)}
					class="rounded-lg bg-amber-100 px-4 py-2 text-amber-700 hover:bg-amber-200"
				>
					← Add Clerkships
				</button>
				<button
					type="button"
					onclick={() => (currentStep = 4)}
					class="rounded-lg bg-amber-100 px-4 py-2 text-amber-700 hover:bg-amber-200"
				>
					← Add Preceptors
				</button>
			</div>
		</div>
	{:else}
		<!-- Warning about preceptors without teams -->
		{#if preceptorsWithoutTeams().length > 0}
			<div class="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
				<div class="flex gap-3">
					<div class="text-blue-600">ℹ️</div>
					<div>
						<p class="font-medium text-blue-800">Teams are required for scheduling</p>
						<p class="mt-1 text-sm text-blue-700">
							{preceptorsWithoutTeams().length} preceptor(s) are not assigned to any team and won't be
							available for scheduling. Create teams below to include them.
						</p>
					</div>
				</div>
			</div>
		{/if}

		{#if entityData.teams.length === 0}
			<div class="py-8 text-center">
				<p class="mb-4 text-gray-500">No teams created yet.</p>
				<button
					type="button"
					onclick={() => (showTeamForm = true)}
					class="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
				>
					+ Create Team
				</button>
			</div>
		{:else}
			<EntitySelectionTable ... />
			<div class="mt-4">
				<button
					type="button"
					onclick={() => (showTeamForm = true)}
					class="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
				>
					+ Create Team
				</button>
			</div>
		{/if}
	{/if}

	<!-- Team Form Dialog -->
	<TeamFormDialog
		open={showTeamForm}
		onClose={() => (showTeamForm = false)}
		onSuccess={handleTeamCreated}
	/>
{/if}
```

### Phase 6: Review Step Warnings

Add warnings to Review step:

```svelte
{#if currentStep === 7}
	<h2 class="mb-6 text-xl font-semibold">Review & Create</h2>

	<!-- Scheduling Warnings -->
	{#if selectedTeams.length === 0 || selectedStudents.length === 0 || selectedClerkships.length === 0}
		<div class="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
			<div class="flex gap-3">
				<div class="text-xl text-amber-600">⚠️</div>
				<div>
					<p class="font-medium text-amber-800">Schedule generation may not work</p>
					<ul class="mt-2 list-inside list-disc text-sm text-amber-700">
						{#if selectedClerkships.length === 0}
							<li>No clerkships selected - nothing to schedule</li>
						{/if}
						{#if selectedStudents.length === 0}
							<li>No students selected - no one to assign</li>
						{/if}
						{#if selectedTeams.length === 0}
							<li>No teams selected - preceptors won't be available for assignment</li>
						{/if}
					</ul>
					<p class="mt-2 text-sm text-amber-700">
						You can still create the schedule and add these later.
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Existing review content -->
	...
{/if}
```

### Phase 7: Update Sidebar Order

**File**: `src/lib/components/navigation/sidebar.svelte`

Change `navItems` from:

```javascript
const navItems = [
	{ href: '/', label: 'Dashboard', icon: '📊' },
	{ href: '/schedules', label: 'Schedules', icon: '📆' },
	{ href: '/students', label: 'Students', icon: '👨‍🎓' },
	{ href: '/preceptors', label: 'Preceptors', icon: '👨‍⚕️' },
	{ href: '/clerkships', label: 'Clerkships', icon: '📚' },
	{ href: '/health-systems', label: 'Health Systems', icon: '🏥' },
	{ href: '/sites', label: 'Sites', icon: '📍' },
	{ href: '/calendar', label: 'Calendar', icon: '📅' }
];
```

To:

```javascript
const navItems = [
	{ href: '/', label: 'Dashboard', icon: '📊' },
	{ href: '/schedules', label: 'Schedules', icon: '📆' },
	{ href: '/health-systems', label: 'Health Systems', icon: '🏥' },
	{ href: '/sites', label: 'Sites', icon: '📍' },
	{ href: '/clerkships', label: 'Clerkships', icon: '📚' },
	{ href: '/preceptors', label: 'Preceptors', icon: '👨‍⚕️' },
	{ href: '/students', label: 'Students', icon: '👨‍🎓' },
	{ href: '/calendar', label: 'Calendar', icon: '📅' }
];
```

Note: Teams are accessed via `/preceptors/teams`, so they're naturally under Preceptors.

## Testing

### Manual Testing Checklist

- [ ] Year field removed from wizard
- [ ] Steps in correct order: Details → HS → Sites → Clerkships → Preceptors → Teams → Students → Review
- [ ] Each step shows "Add New" button
- [ ] Can create multiple entities inline at each step
- [ ] New entities appear in list and can be selected
- [ ] Skip confirmation appears when proceeding with 0 selections
- [ ] Teams step disabled when no clerkships or preceptors
- [ ] Teams step shows quick actions to go back
- [ ] Teams step warns about preceptors without team membership
- [ ] Review step shows warnings about missing entities for scheduling
- [ ] Sidebar reflects new entity order
- [ ] Schedule creation still works end-to-end

### Edge Cases

- [ ] Creating entity fails - error shown, modal stays open
- [ ] Creating multiple entities in a row - all appear in list
- [ ] Wizard state preserved when going back/forward between steps
- [ ] Team form dialog works with filtered data (only selected clerkships/preceptors)

## Files Modified

1. `src/lib/features/schedules/components/new-schedule-wizard.svelte` - Main changes
2. `src/lib/components/navigation/sidebar.svelte` - Reorder nav items
3. `src/routes/schedules/new/+page.server.ts` - May need to pass additional data for forms

## Acceptance Criteria

- [ ] First-time user can create schedule with inline entity creation
- [ ] Each wizard step allows creating multiple entities
- [ ] Year field removed
- [ ] Skip confirmation works
- [ ] Teams step properly handles prerequisites
- [ ] Review warnings inform user about scheduling requirements
- [ ] Sidebar order matches entity dependency hierarchy
