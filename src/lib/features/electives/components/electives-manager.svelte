<script lang="ts">
	import type { ClerkshipElective } from '$lib/features/scheduling-config/types/elective-types';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import ElectiveList from './elective-list.svelte';
	import ElectiveForm from './elective-form.svelte';
	import ElectiveSiteManager from './elective-site-manager.svelte';
	import ElectivePreceptorManager from './elective-preceptor-manager.svelte';
	import DeleteElectiveDialog from './delete-elective-dialog.svelte';
	import {
		fetchElectivesByClerkship,
		fetchElectiveWithDetails,
		fetchElectiveDaysSummary,
		fetchAvailablePreceptorsForElective,
		deleteElective,
		type ElectiveWithDetails,
		type ElectiveDaysSummary
	} from '../services/elective-client';

	interface Site {
		id: string;
		name: string;
	}

	interface Preceptor {
		id: string;
		name: string;
	}

	interface Props {
		clerkshipId: string;
		allSites?: Site[];
	}

	let { clerkshipId, allSites = [] }: Props = $props();

	let electives = $state<ClerkshipElective[]>([]);
	let daysSummary = $state<ElectiveDaysSummary | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Form state
	let showForm = $state(false);
	let editingElective = $state<ClerkshipElective | undefined>(undefined);

	// Delete dialog state
	let showDeleteDialog = $state(false);
	let deletingElective = $state<ClerkshipElective | undefined>(undefined);

	// Detail view state
	let viewingElective = $state<ElectiveWithDetails | null>(null);
	let availablePreceptorsForElective = $state<Array<{ id: string; name: string; siteId: string; siteName: string }>>([]);

	async function loadElectives() {
		loading = true;
		error = null;
		try {
			const [electivesData, summaryData] = await Promise.all([
				fetchElectivesByClerkship(clerkshipId),
				fetchElectiveDaysSummary(clerkshipId)
			]);
			electives = electivesData;
			daysSummary = summaryData;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load electives';
		} finally {
			loading = false;
		}
	}

	function handleCreate() {
		editingElective = undefined;
		showForm = true;
	}

	function handleEdit(elective: ClerkshipElective) {
		editingElective = elective;
		showForm = true;
	}

	function handleDelete(elective: ClerkshipElective) {
		deletingElective = elective;
		showDeleteDialog = true;
	}

	async function handleConfirmDelete(elective: ClerkshipElective) {
		try {
			await deleteElective(elective.id);
			showDeleteDialog = false;
			deletingElective = undefined;
			await loadElectives();
			if (viewingElective?.id === elective.id) {
				viewingElective = null;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete elective';
		}
	}

	function handleCancelDelete() {
		showDeleteDialog = false;
		deletingElective = undefined;
	}

	async function handleFormSuccess() {
		const wasEditingId = editingElective?.id;
		showForm = false;
		editingElective = undefined;
		await loadElectives();
		if (viewingElective && wasEditingId === viewingElective.id) {
			await loadElectiveDetails(viewingElective.id);
		}
	}

	function handleFormCancel() {
		showForm = false;
		editingElective = undefined;
	}

	async function handleManageSites(elective: ClerkshipElective) {
		await loadElectiveDetails(elective.id);
	}

	async function handleManagePreceptors(elective: ClerkshipElective) {
		await loadElectiveDetails(elective.id);
	}

	async function loadElectiveDetails(electiveId: string) {
		try {
			viewingElective = await fetchElectiveWithDetails(electiveId);
			// Load available preceptors (filtered by elective's sites)
			availablePreceptorsForElective = await fetchAvailablePreceptorsForElective(electiveId);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load elective details';
		}
	}

	async function handleAssociationUpdate() {
		if (viewingElective) {
			await loadElectiveDetails(viewingElective.id);
		}
		await loadElectives();
	}

	function handleCloseDetails() {
		viewingElective = null;
		availablePreceptorsForElective = [];
	}

	// Load on mount
	$effect(() => {
		loadElectives();
	});

	// Computed available sites for current elective
	let availableSites = $derived.by(() => {
		if (!viewingElective) return [];
		const currentSites = viewingElective.sites || [];
		return allSites.filter((site) => !currentSites.some((s) => s.id === site.id));
	});

	// Computed available preceptors (filtered by elective's sites, excluding already assigned)
	let availablePreceptors = $derived.by(() => {
		if (!viewingElective) return [];
		const currentPreceptors = viewingElective.preceptors || [];
		// Filter out preceptors already assigned to this elective
		return availablePreceptorsForElective.filter(
			(p) => !currentPreceptors.some((cp) => cp.id === p.id)
		);
	});

	// Computed: can add more electives?
	let canAddElective = $derived(daysSummary ? daysSummary.remainingDays > 0 : true);
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold">Electives</h2>
			<p class="text-sm text-muted-foreground mt-1">
				Configure elective rotations for this clerkship
			</p>
		</div>
		{#if !showForm && !viewingElective}
			<Button onclick={handleCreate} disabled={!canAddElective}>
				{canAddElective ? 'Create Elective' : 'No Days Remaining'}
			</Button>
		{/if}
	</div>

	<!-- Days Summary -->
	{#if daysSummary}
		{@const electivePercent = (daysSummary.totalElectiveDays / daysSummary.clerkshipRequiredDays) * 100}
		{@const nonElectivePercent = (daysSummary.nonElectiveDays / daysSummary.clerkshipRequiredDays) * 100}
		<Card class="p-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-6">
					<div>
						<span class="text-sm text-muted-foreground">Total Clerkship Days:</span>
						<span class="ml-2 font-semibold">{daysSummary.clerkshipRequiredDays}</span>
					</div>
					<div>
						<span class="text-sm text-muted-foreground">Elective Days:</span>
						<span class="ml-2 font-semibold">{daysSummary.totalElectiveDays}</span>
					</div>
					<div>
						<span class="text-sm text-muted-foreground">Non-Elective Days:</span>
						<span class="ml-2 font-semibold">{daysSummary.nonElectiveDays}</span>
					</div>
				</div>
				<div class="text-right">
					<span class="text-sm text-muted-foreground">Available for new electives:</span>
					<span class="ml-2 font-semibold {daysSummary.remainingDays === 0 ? 'text-destructive' : 'text-green-600'}">
						{daysSummary.remainingDays} days
					</span>
				</div>
			</div>
			<!-- Progress bar -->
			<div class="mt-3 h-2 bg-muted rounded-full overflow-hidden">
				<div class="h-full flex">
					<div class="bg-primary" style="width: {electivePercent}%"></div>
					<div class="bg-muted-foreground/30" style="width: {nonElectivePercent}%"></div>
				</div>
			</div>
			<div class="mt-1 flex gap-4 text-xs text-muted-foreground">
				<span class="flex items-center gap-1">
					<span class="w-3 h-3 bg-primary rounded-sm"></span> Elective Days
				</span>
				<span class="flex items-center gap-1">
					<span class="w-3 h-3 bg-muted-foreground/30 rounded-sm"></span> Non-Elective Days
				</span>
			</div>
		</Card>
	{/if}

	<!-- Error Display -->
	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	<!-- Form View -->
	{#if showForm}
		<ElectiveForm
			{clerkshipId}
			elective={editingElective}
			maxDays={daysSummary?.remainingDays ?? undefined}
			onSuccess={handleFormSuccess}
			onCancel={handleFormCancel}
		/>
	{:else if viewingElective}
		<!-- Detail/Management View -->
		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<div>
					<h3 class="text-xl font-semibold">{viewingElective.name}</h3>
					{#if viewingElective.specialty}
						<p class="text-sm text-muted-foreground">{viewingElective.specialty}</p>
					{/if}
				</div>
				<Button variant="outline" onclick={handleCloseDetails}>
					← Back to List
				</Button>
			</div>

			<div class="grid gap-6">
				<ElectiveSiteManager
					elective={viewingElective}
					associatedSites={viewingElective.sites || []}
					{availableSites}
					onUpdate={handleAssociationUpdate}
				/>

				<ElectivePreceptorManager
					elective={viewingElective}
					associatedPreceptors={viewingElective.preceptors || []}
					{availablePreceptors}
					onUpdate={handleAssociationUpdate}
				/>

				{#if viewingElective.sites?.length === 0}
					<Card class="p-4 border-warning bg-warning/10">
						<p class="text-sm text-warning-foreground">
							<strong>Note:</strong> Add sites to this elective first, then preceptors who work at those sites will become available.
						</p>
					</Card>
				{/if}
			</div>
		</div>
	{:else}
		<!-- List View -->
		{#if loading}
			<div class="rounded-md border p-8 text-center">
				<p class="text-muted-foreground">Loading electives...</p>
			</div>
		{:else}
			<ElectiveList
				{electives}
				onEdit={handleEdit}
				onDelete={handleDelete}
				onManageSites={handleManageSites}
				onManagePreceptors={handleManagePreceptors}
			/>
		{/if}
	{/if}
</div>

<!-- Delete Confirmation Dialog -->
<DeleteElectiveDialog
	bind:open={showDeleteDialog}
	elective={deletingElective}
	onConfirm={handleConfirmDelete}
	onCancel={handleCancelDelete}
/>
