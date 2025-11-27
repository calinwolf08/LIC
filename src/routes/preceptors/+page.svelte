<script lang="ts">
	import type { PageData } from './$types';
	import type { PreceptorWithAssociations } from '$lib/features/preceptors/services/preceptor-service';
	import PreceptorList from '$lib/features/preceptors/components/preceptor-list.svelte';
	import PreceptorForm from '$lib/features/preceptors/components/preceptor-form.svelte';
	import PatternAvailabilityBuilder from '$lib/features/preceptors/components/pattern-availability-builder.svelte';
	import DeletePreceptorDialog from '$lib/features/preceptors/components/delete-preceptor-dialog.svelte';
	import TeamList from '$lib/features/teams/components/team-list.svelte';
	import TeamFormDialog from '$lib/features/teams/components/team-form-dialog.svelte';
	import PreceptorAssociationsForm from '$lib/features/scheduling-config/components/preceptor-associations-form.svelte';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	// Tab state
	let activeTab = $state<'preceptors' | 'teams' | 'associations'>('preceptors');

	// Preceptor state
	let showForm = $state(false);
	let showAvailability = $state(false);
	let showDeleteDialog = $state(false);
	let selectedPreceptor = $state<PreceptorWithAssociations | undefined>(undefined);

	// Teams state
	let selectedClerkshipId = $state('');
	let teams = $state<any[]>([]);
	let loadingTeams = $state(false);
	let showTeamForm = $state(false);
	let teamToEdit = $state<any>(null);

	// Preceptors formatted for team form
	let preceptorsForTeamForm = $derived(
		data.preceptors.map((p) => ({
			id: p.id!,
			name: p.name
		}))
	);

	// Selected clerkship name
	let selectedClerkshipName = $derived(
		data.clerkships.find((c) => c.id === selectedClerkshipId)?.name
	);

	// Load teams when clerkship changes
	async function loadTeams() {
		if (!selectedClerkshipId) {
			teams = [];
			return;
		}

		loadingTeams = true;
		try {
			const response = await fetch(`/api/preceptors/teams?clerkshipId=${selectedClerkshipId}`);
			const result = await response.json();
			if (result.success && result.data) {
				teams = result.data;
			} else {
				teams = [];
			}
		} catch (error) {
			console.error('Failed to load teams:', error);
			teams = [];
		} finally {
			loadingTeams = false;
		}
	}

	// Handle clerkship selection change
	function handleClerkshipChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		selectedClerkshipId = target.value;
		loadTeams();
	}

	// Preceptor handlers
	function handleAdd() {
		selectedPreceptor = undefined;
		showForm = true;
	}

	function handleEdit(preceptor: PreceptorWithAssociations) {
		selectedPreceptor = preceptor;
		showForm = true;
	}

	function handleManageAvailability(preceptor: PreceptorWithAssociations) {
		selectedPreceptor = preceptor;
		showAvailability = true;
	}

	function handleDelete(preceptor: PreceptorWithAssociations) {
		selectedPreceptor = preceptor;
		showDeleteDialog = true;
	}

	async function handleFormSuccess() {
		showForm = false;
		selectedPreceptor = undefined;
		await invalidateAll();
	}

	function handleFormCancel() {
		showForm = false;
		selectedPreceptor = undefined;
	}

	async function handleAvailabilitySuccess() {
		showAvailability = false;
		selectedPreceptor = undefined;
		await invalidateAll();
	}

	function handleAvailabilityCancel() {
		showAvailability = false;
		selectedPreceptor = undefined;
	}

	async function handleDeleteConfirm(preceptor: { id: string; name: string }) {
		const response = await fetch(`/api/preceptors/${preceptor.id}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error?.message || 'Failed to delete preceptor');
		}

		showDeleteDialog = false;
		selectedPreceptor = undefined;
		await invalidateAll();
	}

	function handleDeleteCancel() {
		showDeleteDialog = false;
		selectedPreceptor = undefined;
	}

	// Team handlers
	function handleAddTeam() {
		teamToEdit = null;
		showTeamForm = true;
	}

	function handleEditTeam(team: any) {
		teamToEdit = team;
		showTeamForm = true;
	}

	function handleCloseTeamForm() {
		showTeamForm = false;
		teamToEdit = null;
		loadTeams();
	}

	function handleTeamDeleted() {
		loadTeams();
	}
</script>

<div class="container mx-auto py-8">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Preceptors & Teams</h1>
	</div>

	<!-- Tabs -->
	<div class="mb-6 border-b">
		<nav class="-mb-px flex space-x-8">
			<button
				onclick={() => (activeTab = 'preceptors')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'preceptors'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Preceptors ({data.preceptors.length})
			</button>
			<button
				onclick={() => (activeTab = 'teams')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'teams'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Teams
			</button>
			<button
				onclick={() => (activeTab = 'associations')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'associations'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Site Associations
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'preceptors'}
		<div class="mb-6 flex items-center justify-end">
			<Button onclick={handleAdd}>Add Preceptor</Button>
		</div>

		<PreceptorList
			preceptors={data.preceptors}
			onEdit={handleEdit}
			onDelete={handleDelete}
			onManageAvailability={handleManageAvailability}
		/>
	{:else if activeTab === 'teams'}
		<div class="space-y-6">
			<div class="flex items-center justify-between gap-4">
				<div class="flex items-center gap-4">
					<label for="clerkship-select" class="text-sm font-medium">Clerkship:</label>
					<select
						id="clerkship-select"
						value={selectedClerkshipId}
						onchange={handleClerkshipChange}
						class="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
					>
						<option value="">Select a clerkship...</option>
						{#each data.clerkships as clerkship}
							<option value={clerkship.id}>{clerkship.name}</option>
						{/each}
					</select>
				</div>
				{#if selectedClerkshipId}
					<Button onclick={handleAddTeam}>Add Team</Button>
				{/if}
			</div>

			{#if !selectedClerkshipId}
				<div class="rounded-lg border p-12 text-center text-muted-foreground">
					<p>Select a clerkship to view and manage teams.</p>
				</div>
			{:else if loadingTeams}
				<div class="rounded-lg border p-12 text-center text-muted-foreground">
					<p>Loading teams...</p>
				</div>
			{:else}
				<TeamList
					{teams}
					clerkships={data.clerkships}
					onEdit={handleEditTeam}
					onDelete={handleTeamDeleted}
				/>
			{/if}
		</div>
	{:else if activeTab === 'associations'}
		<PreceptorAssociationsForm />
	{/if}
</div>

<!-- Preceptor Form Modal -->
{#if showForm}
	<div class="fixed inset-0 z-50 bg-black/50" onclick={handleFormCancel} role="presentation"></div>
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 max-h-[90vh] overflow-y-auto">
		<PreceptorForm
			preceptor={selectedPreceptor}
			healthSystems={data.healthSystems}
			sites={data.sites}
			onSuccess={handleFormSuccess}
			onCancel={handleFormCancel}
		/>
	</div>
{/if}

<!-- Availability Modal -->
{#if showAvailability && selectedPreceptor}
	<div
		class="fixed inset-0 z-50 bg-black/50"
		onclick={handleAvailabilityCancel}
		role="presentation"
	></div>
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-6xl -translate-x-1/2 -translate-y-1/2 max-h-[90vh] overflow-y-auto">
		<div class="bg-background p-6 rounded-lg shadow-lg">
			<PatternAvailabilityBuilder
				preceptor={selectedPreceptor}
				onSuccess={handleAvailabilitySuccess}
				onCancel={handleAvailabilityCancel}
			/>
		</div>
	</div>
{/if}

<!-- Delete Preceptor Dialog -->
<DeletePreceptorDialog
	open={showDeleteDialog}
	preceptor={selectedPreceptor}
	onConfirm={handleDeleteConfirm}
	onCancel={handleDeleteCancel}
/>

<!-- Team Form Dialog -->
<TeamFormDialog
	open={showTeamForm}
	clerkshipId={selectedClerkshipId}
	team={teamToEdit}
	preceptors={preceptorsForTeamForm}
	onClose={handleCloseTeamForm}
/>
