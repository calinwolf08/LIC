<script lang="ts">
	import type { PageData } from './$types';
	import type { Preceptors } from '$lib/db/types';
	import PreceptorList from '$lib/features/preceptors/components/preceptor-list.svelte';
	import PreceptorForm from '$lib/features/preceptors/components/preceptor-form.svelte';
	import PatternAvailabilityBuilder from '$lib/features/preceptors/components/pattern-availability-builder.svelte';
	import DeletePreceptorDialog from '$lib/features/preceptors/components/delete-preceptor-dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let showForm = $state(false);
	let showAvailability = $state(false);
	let showDeleteDialog = $state(false);
	let selectedPreceptor = $state<Preceptors | undefined>(undefined);

	function handleAdd() {
		selectedPreceptor = undefined;
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

	async function handleDeleteConfirm(preceptor: Preceptors) {
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

<!-- Delete Dialog -->
<DeletePreceptorDialog
	open={showDeleteDialog}
	preceptor={selectedPreceptor}
	onConfirm={handleDeleteConfirm}
	onCancel={handleDeleteCancel}
/>
