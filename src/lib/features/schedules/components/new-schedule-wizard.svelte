<script lang="ts">
	import { goto } from '$app/navigation';
	import EntitySelectionTable from './entity-selection-table.svelte';

	interface EntityData {
		students: Array<{ id: string; name: string; email: string }>;
		preceptors: Array<{ id: string; name: string; email: string }>;
		sites: Array<{ id: string; name: string; health_system_name?: string | null }>;
		healthSystems: Array<{ id: string; name: string }>;
		clerkships: Array<{ id: string; name: string; clerkship_type: string }>;
		teams: Array<{ id: string; name: string | null; clerkship_name?: string | null }>;
		configurations: Array<{ id: string; clerkship_name?: string | null }>;
	}

	interface Props {
		sourceScheduleId?: string | null;
		entityData: EntityData;
	}

	let { sourceScheduleId = null, entityData }: Props = $props();

	// Wizard state
	let currentStep = $state(0);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	// Form data
	let name = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let year = $state(new Date().getFullYear());

	// Entity selections
	let selectedStudents = $state<string[]>([]);
	let selectedPreceptors = $state<string[]>([]);
	let selectedSites = $state<string[]>([]);
	let selectedHealthSystems = $state<string[]>([]);
	let selectedClerkships = $state<string[]>([]);
	let selectedTeams = $state<string[]>([]);
	let selectedConfigurations = $state<string[]>([]);

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

	// Auto-calculate year from start date
	$effect(() => {
		if (startDate) {
			const dateYear = new Date(startDate + 'T00:00:00').getFullYear();
			year = dateYear;
		}
	});

	let canProceed = $derived(() => {
		if (currentStep === 0) {
			return name.trim() && startDate && endDate && startDate <= endDate;
		}
		return true;
	});

	function nextStep(): void {
		if (currentStep < steps.length - 1) {
			currentStep++;
		}
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

	async function handleSubmit(): Promise<void> {
		submitting = true;
		error = null;

		try {
			const options: Record<string, string[] | 'all'> = {};

			if (selectedStudents.length === entityData.students.length) {
				options.students = 'all';
			} else if (selectedStudents.length > 0) {
				options.students = selectedStudents;
			}

			if (selectedPreceptors.length === entityData.preceptors.length) {
				options.preceptors = 'all';
			} else if (selectedPreceptors.length > 0) {
				options.preceptors = selectedPreceptors;
			}

			if (selectedSites.length === entityData.sites.length) {
				options.sites = 'all';
			} else if (selectedSites.length > 0) {
				options.sites = selectedSites;
			}

			if (selectedHealthSystems.length === entityData.healthSystems.length) {
				options.healthSystems = 'all';
			} else if (selectedHealthSystems.length > 0) {
				options.healthSystems = selectedHealthSystems;
			}

			if (selectedClerkships.length === entityData.clerkships.length) {
				options.clerkships = 'all';
			} else if (selectedClerkships.length > 0) {
				options.clerkships = selectedClerkships;
			}

			if (selectedTeams.length === entityData.teams.length) {
				options.teams = 'all';
			} else if (selectedTeams.length > 0) {
				options.teams = selectedTeams;
			}

			if (selectedConfigurations.length === entityData.configurations.length) {
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
						year,
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
			<!-- Step 1: Details -->
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

				<div>
					<label for="year" class="block text-sm font-medium text-gray-700 mb-1">
						Year
					</label>
					<input
						id="year"
						type="number"
						bind:value={year}
						min="2000"
						max="2100"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>
			</div>
		{:else if currentStep === 1}
			<!-- Step 2: Students -->
			<h2 class="text-xl font-semibold mb-6">Select Students</h2>
			<EntitySelectionTable
				entities={entityData.students.map((s) => ({ id: s.id, name: s.name, email: s.email }))}
				selectedIds={selectedStudents}
				onSelectionChange={(ids) => (selectedStudents = ids)}
				searchPlaceholder="Search students..."
				emptyMessage="No students available"
			/>
		{:else if currentStep === 2}
			<!-- Step 3: Preceptors -->
			<h2 class="text-xl font-semibold mb-6">Select Preceptors</h2>
			<EntitySelectionTable
				entities={entityData.preceptors.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
				selectedIds={selectedPreceptors}
				onSelectionChange={(ids) => (selectedPreceptors = ids)}
				searchPlaceholder="Search preceptors..."
				emptyMessage="No preceptors available"
			/>
		{:else if currentStep === 3}
			<!-- Step 4: Sites -->
			<h2 class="text-xl font-semibold mb-6">Select Sites</h2>
			<EntitySelectionTable
				entities={entityData.sites.map((s) => ({ id: s.id, name: s.name }))}
				selectedIds={selectedSites}
				onSelectionChange={(ids) => (selectedSites = ids)}
				searchPlaceholder="Search sites..."
				emptyMessage="No sites available"
			/>
		{:else if currentStep === 4}
			<!-- Step 5: Health Systems -->
			<h2 class="text-xl font-semibold mb-6">Select Health Systems</h2>
			<EntitySelectionTable
				entities={entityData.healthSystems}
				selectedIds={selectedHealthSystems}
				onSelectionChange={(ids) => (selectedHealthSystems = ids)}
				searchPlaceholder="Search health systems..."
				emptyMessage="No health systems available"
			/>
		{:else if currentStep === 5}
			<!-- Step 6: Clerkships -->
			<h2 class="text-xl font-semibold mb-6">Select Clerkships</h2>
			<EntitySelectionTable
				entities={entityData.clerkships.map((c) => ({ id: c.id, name: c.name }))}
				selectedIds={selectedClerkships}
				onSelectionChange={(ids) => (selectedClerkships = ids)}
				searchPlaceholder="Search clerkships..."
				emptyMessage="No clerkships available"
			/>
		{:else if currentStep === 6}
			<!-- Step 7: Teams -->
			<h2 class="text-xl font-semibold mb-6">Select Teams</h2>
			<EntitySelectionTable
				entities={entityData.teams.map((t) => ({ id: t.id, name: t.name || 'Unnamed Team' }))}
				selectedIds={selectedTeams}
				onSelectionChange={(ids) => (selectedTeams = ids)}
				searchPlaceholder="Search teams..."
				emptyMessage="No teams available"
			/>
		{:else if currentStep === 7}
			<!-- Step 8: Review -->
			<h2 class="text-xl font-semibold mb-6">Review & Create</h2>
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
						<dt class="text-gray-500">Year:</dt>
						<dd class="text-gray-900">{year}</dd>
					</dl>
				</div>

				<div class="bg-gray-50 p-4 rounded-lg">
					<h3 class="font-medium text-gray-900 mb-2">Selected Entities</h3>
					<dl class="grid grid-cols-2 gap-2 text-sm">
						<dt class="text-gray-500">Students:</dt>
						<dd class="text-gray-900">{selectedStudents.length} of {entityData.students.length}</dd>
						<dt class="text-gray-500">Preceptors:</dt>
						<dd class="text-gray-900">{selectedPreceptors.length} of {entityData.preceptors.length}</dd>
						<dt class="text-gray-500">Sites:</dt>
						<dd class="text-gray-900">{selectedSites.length} of {entityData.sites.length}</dd>
						<dt class="text-gray-500">Health Systems:</dt>
						<dd class="text-gray-900">{selectedHealthSystems.length} of {entityData.healthSystems.length}</dd>
						<dt class="text-gray-500">Clerkships:</dt>
						<dd class="text-gray-900">{selectedClerkships.length} of {entityData.clerkships.length}</dd>
						<dt class="text-gray-500">Teams:</dt>
						<dd class="text-gray-900">{selectedTeams.length} of {entityData.teams.length}</dd>
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
