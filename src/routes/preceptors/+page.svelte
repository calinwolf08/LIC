<script lang="ts">
	import type { PageData } from './$types';
	import type { Preceptors } from '$lib/db/types';
	import PreceptorList from '$lib/features/preceptors/components/preceptor-list.svelte';
	import PreceptorForm from '$lib/features/preceptors/components/preceptor-form.svelte';
	import AvailabilityManager from '$lib/features/preceptors/components/availability-manager.svelte';
	import DeletePreceptorDialog from '$lib/features/preceptors/components/delete-preceptor-dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let showForm = $state(false);
	let showAvailability = $state(false);
	let showDeleteDialog = $state(false);
	let selectedPreceptor = $state<Preceptors | null>(null);

	function handleAdd() {
		selectedPreceptor = null;
		showForm = true;
	}

	function handleEdit(preceptor: Preceptors) {
		selectedPreceptor = preceptor;
		showForm = true;
	}

	function handleManageAvailability(preceptor: Preceptors) {
		selectedPreceptor = preceptor;
		showAvailability = true;
	}

	function handleDelete(preceptor: Preceptors) {
		selectedPreceptor = preceptor;
		showDeleteDialog = true;
	}

	async function handleFormSuccess() {
		showForm = false;
		selectedPreceptor = null;
		await invalidateAll();
	}

	function handleFormCancel() {
		showForm = false;
		selectedPreceptor = null;
	}

	async function handleAvailabilitySuccess() {
		showAvailability = false;
		selectedPreceptor = null;
		await invalidateAll();
	}

	function handleAvailabilityCancel() {
		showAvailability = false;
		selectedPreceptor = null;
	}

	async function handleDeleteConfirm(preceptor: Preceptors) {
		const response = await fetch(`/api/preceptors/${preceptor.id}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error?.message || 'Failed to delete preceptor');
		}

		showDeleteDialog = false;
		selectedPreceptor = null;
		await invalidateAll();
	}

	function handleDeleteCancel() {
		showDeleteDialog = false;
		selectedPreceptor = null;
	}
</script>

<div class="container mx-auto py-8">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold">Preceptors</h1>
		<Button onclick={handleAdd}>Add Preceptor</Button>
	</div>

	<PreceptorList
		preceptors={data.preceptors}
		onEdit={handleEdit}
		onDelete={handleDelete}
		onManageAvailability={handleManageAvailability}
	/>
</div>

<!-- Form Modal -->
{#if showForm}
	<div class="fixed inset-0 z-50 bg-black/50" onclick={handleFormCancel} role="presentation"></div>
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2">
		<PreceptorForm
			preceptor={selectedPreceptor}
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
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2">
		<AvailabilityManager
			preceptor={selectedPreceptor}
			onSuccess={handleAvailabilitySuccess}
			onCancel={handleAvailabilityCancel}
		/>
	</div>
{/if}

<!-- Delete Dialog -->
<DeletePreceptorDialog
	open={showDeleteDialog}
	preceptor={selectedPreceptor}
	onConfirm={handleDeleteConfirm}
	onCancel={handleDeleteCancel}
/>
