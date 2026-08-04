<script lang="ts">
	import type { PageData } from './$types';
	import type { PreceptorWithAssociations } from '$lib/features/preceptors/services/preceptor-service';
	import PreceptorList from '$lib/features/preceptors/components/preceptor-list.svelte';
	import DeletePreceptorDialog from '$lib/features/preceptors/components/delete-preceptor-dialog.svelte';
	import TeamList from '$lib/features/teams/components/team-list.svelte';
	import { Button } from '$lib/components/ui/button';
	import { NoActiveSchedule } from '$lib/components';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';

	let { data }: { data: PageData } = $props();

	let hasAutogen = $derived(($page.data.entitlements ?? []).includes('autogen'));

	// Read origin context from URL params
	let fromClerkshipId = $derived($page.url.searchParams.get('fromClerkship'));
	let fromClerkship = $derived(
		fromClerkshipId ? data.clerkships.find((c) => c.id === fromClerkshipId) : null
	);

	// Tab state - default to teams if coming from clerkship
	let activeTab = $state<'preceptors' | 'teams'>('preceptors');

	// Set initial tab based on URL param
	$effect(() => {
		if ($page.url.searchParams.get('tab') === 'teams') {
			activeTab = 'teams';
		}
	});

	// Preceptor state
	let showDeleteDialog = $state(false);
	let selectedPreceptor = $state<PreceptorWithAssociations | undefined>(undefined);

	// Teams state
	let teams = $state<any[]>([]);
	let loadingTeams = $state(false);
	let teamsLoaded = $state(false);

	// Load all teams on mount
	async function loadTeams() {
		loadingTeams = true;
		try {
			const response = await fetch('/api/preceptors/teams');
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
			teamsLoaded = true;
		}
	}

	// Load teams when switching to teams tab (only once)
	$effect(() => {
		if (activeTab === 'teams' && !teamsLoaded && !loadingTeams) {
			loadTeams();
		}
	});

	// Preceptor handlers
	function handleAdd() {
		// Navigate to the new preceptor wizard
		goto('/preceptors/new');
	}

	function handleDelete(preceptor: PreceptorWithAssociations) {
		selectedPreceptor = preceptor;
		showDeleteDialog = true;
	}

	async function handleDeleteConfirm(preceptor: { id: string; name: string }) {
		const response = await fetch(`/api/preceptors/${preceptor.id}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const result = await response.json();
			// Extract detailed error message from validation errors or conflict errors
			let errorMessage = result.error?.message || 'Failed to delete preceptor';
			if (result.error?.details && Array.isArray(result.error.details)) {
				const fieldErrors = result.error.details
					.map((d: { field?: string; message?: string }) => d.message || d.field)
					.filter(Boolean)
					.join(', ');
				if (fieldErrors) {
					errorMessage = `${errorMessage}: ${fieldErrors}`;
				}
			}
			throw new Error(errorMessage);
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
		const params = fromClerkshipId ? `?fromClerkship=${fromClerkshipId}` : '';
		goto(`/preceptors/teams/new${params}`);
	}

	function handleEditTeam(team: any) {
		const params = fromClerkshipId ? `?fromClerkship=${fromClerkshipId}` : '';
		goto(`/preceptors/teams/${team.id}${params}`);
	}

	function handleTeamDeleted() {
		teamsLoaded = false;
		loadTeams();
	}
</script>

<div class="container mx-auto py-8">
	{#if fromClerkship}
		<Button
			variant="ghost"
			onclick={() => goto(`/clerkships/${fromClerkshipId}/config`)}
			class="mb-4"
		>
			← Back to {fromClerkship.name} Config
		</Button>
	{/if}

	<div class="mb-6">
		<h1 class="text-3xl font-bold">{hasAutogen ? 'Preceptors & Teams' : 'Preceptors'}</h1>
	</div>

	{#if !data.hasActiveSchedule}
		<NoActiveSchedule surface="preceptors" />
	{:else}
	<!-- Tabs -->
	<div class="mb-6 border-b">
		<nav class="-mb-px flex space-x-8">
			<button
				onclick={() => (activeTab = 'preceptors')}
				class={`border-b-2 px-1 py-4 text-sm font-medium whitespace-nowrap ${
					activeTab === 'preceptors'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Preceptors ({data.preceptors.length})
			</button>
			{#if hasAutogen}
				<button
					onclick={() => (activeTab = 'teams')}
					class={`border-b-2 px-1 py-4 text-sm font-medium whitespace-nowrap ${
						activeTab === 'teams'
							? 'border-primary text-primary'
							: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
					}`}
				>
					Teams
				</button>
			{/if}
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'preceptors'}
		<div class="mb-6 flex items-center justify-end">
			<Button onclick={handleAdd}>Add Preceptor</Button>
		</div>

		<PreceptorList preceptors={data.preceptors} onDelete={handleDelete} />
	{:else if activeTab === 'teams'}
		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<p class="max-w-2xl text-sm text-muted-foreground">
					Teams group preceptors for scheduling. Every preceptor must belong to at least one team to
					be included in schedule generation.
				</p>
				<Button onclick={handleAddTeam}>Add Team</Button>
			</div>

			{#if loadingTeams}
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
	{/if}
	{/if}
</div>

<!-- Delete Preceptor Dialog -->
<DeletePreceptorDialog
	open={showDeleteDialog}
	preceptor={selectedPreceptor}
	onConfirm={handleDeleteConfirm}
	onCancel={handleDeleteCancel}
/>
