<script lang="ts">
	import type { ClerkshipElective } from '$lib/features/scheduling-config/types/elective-types';
	import { Button } from '$lib/components/ui/button';
	import ElectiveList from './elective-list.svelte';
	import ElectiveForm from './elective-form.svelte';
	import ElectiveSiteManager from './elective-site-manager.svelte';
	import ElectivePreceptorManager from './elective-preceptor-manager.svelte';
	import DeleteElectiveDialog from './delete-elective-dialog.svelte';
	import {
		fetchElectivesByRequirement,
		fetchElectiveWithDetails,
		deleteElective,
		type ElectiveWithDetails
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
		requirementId: string;
		allSites?: Site[];
		allPreceptors?: Preceptor[];
	}

	let { requirementId, allSites = [], allPreceptors = [] }: Props = $props();

	let electives = $state<ClerkshipElective[]>([]);
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

	async function loadElectives() {
		loading = true;
		error = null;
		try {
			electives = await fetchElectivesByRequirement(requirementId);
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
	}

	// Load on mount
	$effect(() => {
		loadElectives();
	});

	// Computed available sites/preceptors for current elective
	let availableSites = $derived.by(() => {
		if (!viewingElective) return [];
		const currentSites = viewingElective.sites || [];
		return allSites.filter((site) => !currentSites.some((s) => s.id === site.id));
	});

	let availablePreceptors = $derived.by(() => {
		if (!viewingElective) return [];
		const currentPreceptors = viewingElective.preceptors || [];
		return allPreceptors.filter((preceptor) => !currentPreceptors.some((p) => p.id === preceptor.id));
	});
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold">Electives</h2>
			<p class="text-sm text-muted-foreground mt-1">
				Configure optional and required elective rotations for this clerkship
			</p>
		</div>
		{#if !showForm && !viewingElective}
			<Button onclick={handleCreate}>Create Elective</Button>
		{/if}
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	<!-- Form View -->
	{#if showForm}
		<ElectiveForm
			{requirementId}
			elective={editingElective}
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
