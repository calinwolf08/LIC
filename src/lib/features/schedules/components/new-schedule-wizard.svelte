<script lang="ts">
	import { goto } from '$app/navigation';
	import EntitySelectionTable from './entity-selection-table.svelte';
	import HealthSystemForm from '$lib/features/health-systems/components/health-system-form.svelte';
	import SiteForm from '$lib/features/sites/components/site-form.svelte';
	import ClerkshipForm from '$lib/features/clerkships/components/clerkship-form.svelte';
	import PreceptorForm from '$lib/features/preceptors/components/preceptor-form.svelte';
	import StudentForm from '$lib/features/students/components/student-form.svelte';
	import TeamFormDialog from '$lib/features/teams/components/team-form-dialog.svelte';

	interface EntityData {
		students: Array<{ id: string; name: string; email: string }>;
		preceptors: Array<{ id: string; name: string; email: string; site_ids: string[]; team_ids: string[] }>;
		sites: Array<{ id: string; name: string; health_system_id: string | null; health_system_name?: string | null }>;
		healthSystems: Array<{ id: string; name: string }>;
		clerkships: Array<{ id: string; name: string; clerkship_type: string }>;
		teams: Array<{ id: string; name: string | null; clerkship_id: string | null; clerkship_name?: string | null }>;
		configurations: Array<{ id: string; clerkship_name?: string | null }>;
	}

	interface SourceSchedule {
		name: string;
		start_date: string;
		end_date: string;
	}

	interface SourceEntityIds {
		students: string[];
		preceptors: string[];
		sites: string[];
		healthSystems: string[];
		clerkships: string[];
		teams: string[];
	}

	interface Props {
		sourceScheduleId?: string | null;
		sourceSchedule?: SourceSchedule | null;
		sourceEntityIds?: SourceEntityIds | null;
		entityData: EntityData;
	}

	let { sourceScheduleId = null, sourceSchedule = null, sourceEntityIds = null, entityData }: Props = $props();

	// Make entityData reactive so we can update it after creating new entities
	let localEntityData = $state<EntityData>({ ...entityData });

	// Wizard state
	let currentStep = $state(0);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	// Form data - initialize from source schedule if duplicating
	let name = $state(sourceSchedule ? `Copy of ${sourceSchedule.name}` : '');
	let startDate = $state(sourceSchedule?.start_date || '');
	let endDate = $state(sourceSchedule?.end_date || '');

	// Entity selections - initialize from source if duplicating
	let selectedHealthSystems = $state<string[]>(sourceEntityIds?.healthSystems || []);
	let selectedSites = $state<string[]>(sourceEntityIds?.sites || []);
	let selectedClerkships = $state<string[]>(sourceEntityIds?.clerkships || []);
	let selectedPreceptors = $state<string[]>(sourceEntityIds?.preceptors || []);
	let selectedTeams = $state<string[]>(sourceEntityIds?.teams || []);
	let selectedStudents = $state<string[]>(sourceEntityIds?.students || []);
	let selectedConfigurations = $state<string[]>([]);

	// Modal states for inline entity creation
	let showHealthSystemForm = $state(false);
	let showSiteForm = $state(false);
	let showClerkshipForm = $state(false);
	let showPreceptorForm = $state(false);
	let showStudentForm = $state(false);
	let showTeamForm = $state(false);
	let teamFormClerkshipId = $state<string | null>(null);

	// Skip confirmation modal
	let showSkipConfirmation = $state(false);
	let skipEntityType = $state('');
	let pendingNextStep = $state<(() => void) | null>(null);

	// Step order: Details → Health Systems → Sites → Clerkships → Preceptors → Teams → Students → Review
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

	// Derived: Check if teams prerequisites are met
	let teamsPrerequisitesMet = $derived(
		selectedClerkships.length > 0 && selectedPreceptors.length > 0
	);

	// Derived: Find preceptors that are selected but not in any selected team
	let preceptorsWithoutTeams = $derived(() => {
		const selectedTeamSet = new Set(selectedTeams);
		return selectedPreceptors.filter(preceptorId => {
			const preceptor = localEntityData.preceptors.find(p => p.id === preceptorId);
			if (!preceptor) return true;
			// Check if preceptor is in any of the selected teams
			return !preceptor.team_ids.some(teamId => selectedTeamSet.has(teamId));
		});
	});

	let canProceed = $derived(() => {
		if (currentStep === 0) {
			return name.trim() && startDate && endDate && startDate <= endDate;
		}
		return true;
	});

	function getCurrentStepSelections(): string[] {
		switch (currentStep) {
			case 1: return selectedHealthSystems;
			case 2: return selectedSites;
			case 3: return selectedClerkships;
			case 4: return selectedPreceptors;
			case 5: return selectedTeams;
			case 6: return selectedStudents;
			default: return [];
		}
	}

	function getCurrentStepEntityName(): string {
		switch (currentStep) {
			case 1: return 'Health Systems';
			case 2: return 'Sites';
			case 3: return 'Clerkships';
			case 4: return 'Preceptors';
			case 5: return 'Teams';
			case 6: return 'Students';
			default: return '';
		}
	}

	function nextStep(): void {
		// Check if current step has 0 selections (skip steps 0 and 7 - details and review)
		if (currentStep >= 1 && currentStep <= 6) {
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

	function prevStep(): void {
		if (currentStep > 0) {
			currentStep--;
		}
	}

	function goToStep(index: number): void {
		// Only allow going to previous steps or details
		if (index <= currentStep || index === 0) {
			currentStep = index;
		}
	}

	// Refresh functions for after creating new entities
	async function refreshHealthSystems() {
		const response = await fetch('/api/health-systems');
		const result = await response.json();
		if (result.success) {
			localEntityData.healthSystems = result.data;
		}
	}

	async function refreshSites() {
		const response = await fetch('/api/sites');
		const result = await response.json();
		if (result.success) {
			localEntityData.sites = result.data.map((s: any) => ({
				id: s.id,
				name: s.name,
				health_system_id: s.health_system_id,
				health_system_name: s.health_system_name
			}));
		}
	}

	async function refreshClerkships() {
		const response = await fetch('/api/clerkships');
		const result = await response.json();
		if (result.success) {
			localEntityData.clerkships = result.data;
		}
	}

	async function refreshPreceptors() {
		const response = await fetch('/api/preceptors');
		const result = await response.json();
		if (result.success) {
			localEntityData.preceptors = result.data.map((p: any) => ({
				id: p.id,
				name: p.name,
				email: p.email,
				site_ids: p.site_ids || [],
				team_ids: p.team_ids || []
			}));
		}
	}

	async function refreshStudents() {
		const response = await fetch('/api/students');
		const result = await response.json();
		if (result.success) {
			localEntityData.students = result.data;
		}
	}

	async function refreshTeams() {
		const response = await fetch('/api/preceptors/teams');
		const result = await response.json();
		if (result.success) {
			localEntityData.teams = result.data.map((t: any) => ({
				id: t.id,
				name: t.name,
				clerkship_id: t.clerkship_id,
				clerkship_name: t.clerkship_name
			}));
		}
		// Also refresh preceptors to update their team_ids
		await refreshPreceptors();
	}

	// Handlers for form success
	async function handleHealthSystemCreated() {
		showHealthSystemForm = false;
		await refreshHealthSystems();
	}

	async function handleSiteCreated() {
		showSiteForm = false;
		await refreshSites();
	}

	async function handleClerkshipCreated() {
		showClerkshipForm = false;
		await refreshClerkships();
	}

	async function handlePreceptorCreated() {
		showPreceptorForm = false;
		await refreshPreceptors();
	}

	async function handleStudentCreated() {
		showStudentForm = false;
		await refreshStudents();
	}

	async function handleTeamCreated() {
		showTeamForm = false;
		teamFormClerkshipId = null;
		await refreshTeams();
	}

	function openTeamForm() {
		// Need to select a clerkship first
		if (selectedClerkships.length === 1) {
			teamFormClerkshipId = selectedClerkships[0];
			showTeamForm = true;
		} else if (selectedClerkships.length > 1) {
			// Show clerkship selector - for now just pick first one
			// TODO: Could add a selector modal
			teamFormClerkshipId = selectedClerkships[0];
			showTeamForm = true;
		}
	}

	async function handleSubmit(): Promise<void> {
		submitting = true;
		error = null;

		try {
			const options: Record<string, string[] | 'all'> = {};

			if (selectedStudents.length === localEntityData.students.length && localEntityData.students.length > 0) {
				options.students = 'all';
			} else if (selectedStudents.length > 0) {
				options.students = selectedStudents;
			}

			if (selectedPreceptors.length === localEntityData.preceptors.length && localEntityData.preceptors.length > 0) {
				options.preceptors = 'all';
			} else if (selectedPreceptors.length > 0) {
				options.preceptors = selectedPreceptors;
			}

			if (selectedSites.length === localEntityData.sites.length && localEntityData.sites.length > 0) {
				options.sites = 'all';
			} else if (selectedSites.length > 0) {
				options.sites = selectedSites;
			}

			if (selectedHealthSystems.length === localEntityData.healthSystems.length && localEntityData.healthSystems.length > 0) {
				options.healthSystems = 'all';
			} else if (selectedHealthSystems.length > 0) {
				options.healthSystems = selectedHealthSystems;
			}

			if (selectedClerkships.length === localEntityData.clerkships.length && localEntityData.clerkships.length > 0) {
				options.clerkships = 'all';
			} else if (selectedClerkships.length > 0) {
				options.clerkships = selectedClerkships;
			}

			if (selectedTeams.length === localEntityData.teams.length && localEntityData.teams.length > 0) {
				options.teams = 'all';
			} else if (selectedTeams.length > 0) {
				options.teams = selectedTeams;
			}

			if (selectedConfigurations.length === localEntityData.configurations.length && localEntityData.configurations.length > 0) {
				options.configurations = 'all';
			} else if (selectedConfigurations.length > 0) {
				options.configurations = selectedConfigurations;
			}

			// If we have a source schedule, use duplication endpoint
			if (sourceScheduleId) {
				const response = await fetch(`/api/scheduling-periods/${sourceScheduleId}/duplicate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: name.trim(),
						startDate,
						endDate,
						options
					})
				});

				const result = await response.json();

				if (result.success) {
					goto('/calendar');
				} else {
					error = result.error?.message || 'Failed to create schedule';
				}
			} else {
				// Create new schedule without duplication
				const response = await fetch('/api/scheduling-periods', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: name.trim(),
						start_date: startDate,
						end_date: endDate,
						is_active: false
					})
				});

				const result = await response.json();

				if (result.success) {
					const newScheduleId = result.data.id;

					// Add entities to the new schedule
					const entityTypes = [
						{ type: 'students', ids: selectedStudents },
						{ type: 'preceptors', ids: selectedPreceptors },
						{ type: 'sites', ids: selectedSites },
						{ type: 'health_systems', ids: selectedHealthSystems },
						{ type: 'clerkships', ids: selectedClerkships },
						{ type: 'teams', ids: selectedTeams },
						{ type: 'configurations', ids: selectedConfigurations }
					];

					for (const { type, ids } of entityTypes) {
						if (ids.length > 0) {
							await fetch(`/api/scheduling-periods/${newScheduleId}/entities`, {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									entityType: type,
									entityIds: ids
								})
							});
						}
					}

					goto('/calendar');
				} else {
					error = result.error?.message || 'Failed to create schedule';
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'An unexpected error occurred';
		} finally {
			submitting = false;
		}
	}

	// Prepare data for forms
	let sitesForPreceptorForm = $derived(
		localEntityData.sites.map(s => ({
			id: s.id,
			name: s.name,
			health_system_id: s.health_system_id
		}))
	);

	// Prepare preceptors for team form (with site info)
	let preceptorsForTeamForm = $derived(() => {
		return localEntityData.preceptors
			.filter(p => selectedPreceptors.includes(p.id))
			.map(p => ({
				id: p.id,
				name: p.name,
				sites: p.site_ids
					.map(siteId => localEntityData.sites.find(s => s.id === siteId))
					.filter((s): s is NonNullable<typeof s> => s !== undefined)
					.map(s => ({ id: s.id, name: s.name }))
			}));
	});

	// Prepare sites for team form (only selected sites)
	let sitesForTeamForm = $derived(() => {
		return localEntityData.sites
			.filter(s => selectedSites.includes(s.id))
			.map(s => ({ id: s.id, name: s.name }));
	});
</script>

<div class="max-w-4xl mx-auto">
	<!-- Progress Steps -->
	<div class="mb-8">
		<div class="flex items-center justify-between">
			{#each steps as step, index}
				<button
					type="button"
					onclick={() => goToStep(index)}
					disabled={index > currentStep && index !== 0}
					class="flex flex-col items-center gap-1 px-2 {index <= currentStep
						? 'opacity-100'
						: 'opacity-50'}"
				>
					<div
						class="w-10 h-10 rounded-full flex items-center justify-center text-lg {index ===
						currentStep
							? 'bg-blue-600 text-white'
							: index < currentStep
								? 'bg-green-600 text-white'
								: 'bg-gray-200 text-gray-600'}"
					>
						{step.icon}
					</div>
					<span class="text-xs text-gray-600 hidden sm:block">{step.name}</span>
				</button>
				{#if index < steps.length - 1}
					<div
						class="flex-1 h-0.5 mx-2 {index < currentStep ? 'bg-green-600' : 'bg-gray-200'}"
					></div>
				{/if}
			{/each}
		</div>
	</div>

	<!-- Error Message -->
	{#if error}
		<div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
			{error}
		</div>
	{/if}

	<!-- Step Content -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
		{#if currentStep === 0}
			<!-- Step 0: Details -->
			<h2 class="text-xl font-semibold mb-6">Schedule Details</h2>
			<div class="space-y-4">
				<div>
					<label for="name" class="block text-sm font-medium text-gray-700 mb-1">
						Schedule Name
					</label>
					<input
						id="name"
						type="text"
						bind:value={name}
						placeholder="e.g., Academic Year 2025-2026"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="startDate" class="block text-sm font-medium text-gray-700 mb-1">
							Start Date
						</label>
						<input
							id="startDate"
							type="date"
							bind:value={startDate}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
					<div>
						<label for="endDate" class="block text-sm font-medium text-gray-700 mb-1">
							End Date
						</label>
						<input
							id="endDate"
							type="date"
							bind:value={endDate}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
				</div>
			</div>

		{:else if currentStep === 1}
			<!-- Step 1: Health Systems -->
			<h2 class="text-xl font-semibold mb-6">Select Health Systems</h2>

			{#if localEntityData.healthSystems.length === 0}
				<div class="text-center py-8">
					<p class="text-gray-500 mb-4">No health systems available yet.</p>
					<button
						type="button"
						onclick={() => showHealthSystemForm = true}
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					>
						+ Add Health System
					</button>
				</div>
			{:else}
				<EntitySelectionTable
					entities={localEntityData.healthSystems}
					selectedIds={selectedHealthSystems}
					onSelectionChange={(ids) => (selectedHealthSystems = ids)}
					searchPlaceholder="Search health systems..."
					emptyMessage="No health systems available"
				/>
				<div class="mt-4">
					<button
						type="button"
						onclick={() => showHealthSystemForm = true}
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					>
						+ Add Health System
					</button>
				</div>
			{/if}

		{:else if currentStep === 2}
			<!-- Step 2: Sites -->
			<h2 class="text-xl font-semibold mb-6">Select Sites</h2>

			{#if localEntityData.sites.length === 0}
				<div class="text-center py-8">
					<p class="text-gray-500 mb-4">No sites available yet.</p>
					<button
						type="button"
						onclick={() => showSiteForm = true}
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					>
						+ Add Site
					</button>
				</div>
			{:else}
				<EntitySelectionTable
					entities={localEntityData.sites.map((s) => ({ id: s.id, name: s.name }))}
					selectedIds={selectedSites}
					onSelectionChange={(ids) => (selectedSites = ids)}
					searchPlaceholder="Search sites..."
					emptyMessage="No sites available"
				/>
				<div class="mt-4">
					<button
						type="button"
						onclick={() => showSiteForm = true}
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					>
						+ Add Site
					</button>
				</div>
			{/if}

		{:else if currentStep === 3}
			<!-- Step 3: Clerkships -->
			<h2 class="text-xl font-semibold mb-6">Select Clerkships</h2>

			{#if localEntityData.clerkships.length === 0}
				<div class="text-center py-8">
					<p class="text-gray-500 mb-4">No clerkships available yet.</p>
					<button
						type="button"
						onclick={() => showClerkshipForm = true}
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					>
						+ Add Clerkship
					</button>
				</div>
			{:else}
				<EntitySelectionTable
					entities={localEntityData.clerkships.map((c) => ({ id: c.id, name: c.name }))}
					selectedIds={selectedClerkships}
					onSelectionChange={(ids) => (selectedClerkships = ids)}
					searchPlaceholder="Search clerkships..."
					emptyMessage="No clerkships available"
				/>
				<div class="mt-4">
					<button
						type="button"
						onclick={() => showClerkshipForm = true}
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					>
						+ Add Clerkship
					</button>
				</div>
			{/if}

		{:else if currentStep === 4}
			<!-- Step 4: Preceptors -->
			<h2 class="text-xl font-semibold mb-6">Select Preceptors</h2>

			{#if localEntityData.preceptors.length === 0}
				<div class="text-center py-8">
					<p class="text-gray-500 mb-4">No preceptors available yet.</p>
					<button
						type="button"
						onclick={() => showPreceptorForm = true}
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					>
						+ Add Preceptor
					</button>
				</div>
			{:else}
				<EntitySelectionTable
					entities={localEntityData.preceptors.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
					selectedIds={selectedPreceptors}
					onSelectionChange={(ids) => (selectedPreceptors = ids)}
					searchPlaceholder="Search preceptors..."
					emptyMessage="No preceptors available"
				/>
				<div class="mt-4">
					<button
						type="button"
						onclick={() => showPreceptorForm = true}
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					>
						+ Add Preceptor
					</button>
				</div>
			{/if}

		{:else if currentStep === 5}
			<!-- Step 5: Teams -->
			<h2 class="text-xl font-semibold mb-6">Select Teams</h2>

			{#if !teamsPrerequisitesMet}
				<div class="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
					<div class="text-amber-600 text-4xl mb-4">⚠️</div>
					<h3 class="text-lg font-medium text-amber-800 mb-2">Prerequisites Required</h3>
					<p class="text-amber-700 mb-4">
						Teams connect preceptors to clerkships for scheduling. You need at least one clerkship and one preceptor to create a team.
					</p>
					<div class="flex justify-center gap-3">
						<button
							type="button"
							onclick={() => currentStep = 3}
							class="px-4 py-2 text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200"
						>
							← Add Clerkships
						</button>
						<button
							type="button"
							onclick={() => currentStep = 4}
							class="px-4 py-2 text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200"
						>
							← Add Preceptors
						</button>
					</div>
				</div>
			{:else}
				<!-- Warning about preceptors without teams -->
				{#if preceptorsWithoutTeams().length > 0}
					<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
						<div class="flex gap-3">
							<div class="text-blue-600 text-xl">ℹ️</div>
							<div>
								<p class="text-blue-800 font-medium">Teams are required for scheduling</p>
								<p class="text-blue-700 text-sm mt-1">
									{preceptorsWithoutTeams().length} selected preceptor(s) are not assigned to any team and won't be available for scheduling. Create teams below to include them.
								</p>
							</div>
						</div>
					</div>
				{/if}

				{#if localEntityData.teams.length === 0}
					<div class="text-center py-8">
						<p class="text-gray-500 mb-4">No teams created yet.</p>
						<button
							type="button"
							onclick={openTeamForm}
							class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
						>
							+ Create Team
						</button>
					</div>
				{:else}
					<EntitySelectionTable
						entities={localEntityData.teams
							.filter(t => selectedClerkships.includes(t.clerkship_id || ''))
							.map((t) => ({ id: t.id, name: t.name || 'Unnamed Team' }))}
						selectedIds={selectedTeams}
						onSelectionChange={(ids) => (selectedTeams = ids)}
						searchPlaceholder="Search teams..."
						emptyMessage="No teams available for selected clerkships"
					/>
					<div class="mt-4">
						<button
							type="button"
							onclick={openTeamForm}
							class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
						>
							+ Create Team
						</button>
					</div>
				{/if}
			{/if}

		{:else if currentStep === 6}
			<!-- Step 6: Students -->
			<h2 class="text-xl font-semibold mb-6">Select Students</h2>

			{#if localEntityData.students.length === 0}
				<div class="text-center py-8">
					<p class="text-gray-500 mb-4">No students available yet.</p>
					<button
						type="button"
						onclick={() => showStudentForm = true}
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					>
						+ Add Student
					</button>
				</div>
			{:else}
				<EntitySelectionTable
					entities={localEntityData.students.map((s) => ({ id: s.id, name: s.name, email: s.email }))}
					selectedIds={selectedStudents}
					onSelectionChange={(ids) => (selectedStudents = ids)}
					searchPlaceholder="Search students..."
					emptyMessage="No students available"
				/>
				<div class="mt-4">
					<button
						type="button"
						onclick={() => showStudentForm = true}
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					>
						+ Add Student
					</button>
				</div>
			{/if}

		{:else if currentStep === 7}
			<!-- Step 7: Review -->
			<h2 class="text-xl font-semibold mb-6">Review & Create</h2>

			<!-- Scheduling Warnings -->
			{#if selectedTeams.length === 0 || selectedStudents.length === 0 || selectedClerkships.length === 0}
				<div class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
					<div class="flex gap-3">
						<div class="text-amber-600 text-xl">⚠️</div>
						<div>
							<p class="text-amber-800 font-medium">Schedule generation may not work</p>
							<ul class="text-amber-700 text-sm mt-2 list-disc list-inside">
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
							<p class="text-amber-700 text-sm mt-2">
								You can still create the schedule and add these later.
							</p>
						</div>
					</div>
				</div>
			{/if}

			<div class="space-y-4">
				<div class="bg-gray-50 p-4 rounded-lg">
					<h3 class="font-medium text-gray-900 mb-2">Schedule Details</h3>
					<dl class="grid grid-cols-2 gap-2 text-sm">
						<dt class="text-gray-500">Name:</dt>
						<dd class="text-gray-900">{name || '(not set)'}</dd>
						<dt class="text-gray-500">Start Date:</dt>
						<dd class="text-gray-900">{startDate || '(not set)'}</dd>
						<dt class="text-gray-500">End Date:</dt>
						<dd class="text-gray-900">{endDate || '(not set)'}</dd>
					</dl>
				</div>

				<div class="bg-gray-50 p-4 rounded-lg">
					<h3 class="font-medium text-gray-900 mb-2">Selected Entities</h3>
					<dl class="grid grid-cols-2 gap-2 text-sm">
						<dt class="text-gray-500">Health Systems:</dt>
						<dd class="text-gray-900">{selectedHealthSystems.length} of {localEntityData.healthSystems.length}</dd>
						<dt class="text-gray-500">Sites:</dt>
						<dd class="text-gray-900">{selectedSites.length} of {localEntityData.sites.length}</dd>
						<dt class="text-gray-500">Clerkships:</dt>
						<dd class="text-gray-900">{selectedClerkships.length} of {localEntityData.clerkships.length}</dd>
						<dt class="text-gray-500">Preceptors:</dt>
						<dd class="text-gray-900">{selectedPreceptors.length} of {localEntityData.preceptors.length}</dd>
						<dt class="text-gray-500">Teams:</dt>
						<dd class="text-gray-900">{selectedTeams.length} of {localEntityData.teams.length}</dd>
						<dt class="text-gray-500">Students:</dt>
						<dd class="text-gray-900">{selectedStudents.length} of {localEntityData.students.length}</dd>
					</dl>
				</div>
			</div>
		{/if}
	</div>

	<!-- Navigation Buttons -->
	<div class="mt-6 flex justify-between">
		<button
			type="button"
			onclick={prevStep}
			disabled={currentStep === 0}
			class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
		>
			Previous
		</button>

		{#if currentStep === steps.length - 1}
			<button
				type="button"
				onclick={handleSubmit}
				disabled={submitting || !canProceed()}
				class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
			>
				{#if submitting}
					<span class="animate-spin">⏳</span>
					Creating...
				{:else}
					Create Schedule
				{/if}
			</button>
		{:else}
			<button
				type="button"
				onclick={nextStep}
				disabled={!canProceed()}
				class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
			>
				Next
			</button>
		{/if}
	</div>
</div>

<!-- Skip Confirmation Modal -->
{#if showSkipConfirmation}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<div class="absolute inset-0 bg-black/50"></div>
		<div class="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
			<h3 class="text-lg font-semibold mb-4">Continue without {skipEntityType}?</h3>
			<p class="text-gray-600 mb-6">
				You haven't selected any {skipEntityType.toLowerCase()}. You can add them later, but some features may not work without them.
			</p>
			<div class="flex justify-end gap-3">
				<button
					type="button"
					onclick={cancelSkip}
					class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
				>
					Go Back
				</button>
				<button
					type="button"
					onclick={confirmSkip}
					class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
				>
					Continue Anyway
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Health System Form Modal -->
{#if showHealthSystemForm}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<button type="button" class="absolute inset-0 bg-black/50" onclick={() => showHealthSystemForm = false} aria-label="Close modal"></button>
		<div class="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
			<HealthSystemForm
				onSuccess={handleHealthSystemCreated}
				onCancel={() => showHealthSystemForm = false}
			/>
		</div>
	</div>
{/if}

<!-- Site Form Modal -->
{#if showSiteForm}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<button type="button" class="absolute inset-0 bg-black/50" onclick={() => showSiteForm = false} aria-label="Close modal"></button>
		<div class="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
			<SiteForm
				healthSystems={localEntityData.healthSystems}
				onSuccess={handleSiteCreated}
				onCancel={() => showSiteForm = false}
			/>
		</div>
	</div>
{/if}

<!-- Clerkship Form Modal -->
{#if showClerkshipForm}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<button type="button" class="absolute inset-0 bg-black/50" onclick={() => showClerkshipForm = false} aria-label="Close modal"></button>
		<div class="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
			<ClerkshipForm
				onSuccess={handleClerkshipCreated}
				onCancel={() => showClerkshipForm = false}
			/>
		</div>
	</div>
{/if}

<!-- Preceptor Form Modal -->
{#if showPreceptorForm}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<button type="button" class="absolute inset-0 bg-black/50" onclick={() => showPreceptorForm = false} aria-label="Close modal"></button>
		<div class="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
			<PreceptorForm
				healthSystems={localEntityData.healthSystems}
				sites={sitesForPreceptorForm}
				onSuccess={handlePreceptorCreated}
				onCancel={() => showPreceptorForm = false}
			/>
		</div>
	</div>
{/if}

<!-- Student Form Modal -->
{#if showStudentForm}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<button type="button" class="absolute inset-0 bg-black/50" onclick={() => showStudentForm = false} aria-label="Close modal"></button>
		<div class="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
			<StudentForm
				onSuccess={handleStudentCreated}
				onCancel={() => showStudentForm = false}
			/>
		</div>
	</div>
{/if}

<!-- Team Form Dialog -->
{#if teamFormClerkshipId}
	<TeamFormDialog
		open={showTeamForm}
		clerkshipId={teamFormClerkshipId}
		preceptors={preceptorsForTeamForm()}
		sites={sitesForTeamForm()}
		onClose={handleTeamCreated}
	/>
{/if}
