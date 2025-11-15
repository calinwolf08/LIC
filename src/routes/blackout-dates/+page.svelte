<script lang="ts">
	import type { PageData } from './$types';
	import type { BlackoutDatesTable } from '$lib/db/types';
	import BlackoutDateList from '$lib/features/blackout-dates/components/blackout-date-list.svelte';
	import BlackoutDateForm from '$lib/features/blackout-dates/components/blackout-date-form.svelte';
	import DeleteBlackoutDateDialog from '$lib/features/blackout-dates/components/delete-blackout-date-dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let showCreateModal = $state(false);
	let showDeleteDialog = $state(false);
	let blackoutDateToDelete = $state<BlackoutDatesTable | null>(null);

	function handleCreate() {
		showCreateModal = true;
	}

	function handleCreateSuccess() {
		showCreateModal = false;
		invalidateAll();
	}

	function handleCreateCancel() {
		showCreateModal = false;
	}

	function handleDelete(blackoutDate: BlackoutDatesTable) {
		blackoutDateToDelete = blackoutDate;
		showDeleteDialog = true;
	}

	async function handleDeleteConfirm(blackoutDate: BlackoutDatesTable) {
		const response = await fetch(`/api/blackout-dates/${blackoutDate.id}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error?.message || 'Failed to delete blackout date');
		}

		showDeleteDialog = false;
		blackoutDateToDelete = null;

		// Refresh the page data
		await invalidateAll();
	}

	function handleCancelDelete() {
		showDeleteDialog = false;
		blackoutDateToDelete = null;
	}
</script>

<div class="container mx-auto py-8">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold">Blackout Dates</h1>
		<Button onclick={handleCreate}>Add Blackout Date</Button>
	</div>

	<BlackoutDateList blackoutDates={data.blackoutDates} onDelete={handleDelete} />

	<!-- Create Modal -->
	{#if showCreateModal}
		<!-- Backdrop -->
		<div
			class="fixed inset-0 z-50 bg-black/50"
			onclick={handleCreateCancel}
			role="presentation"
		></div>

		<!-- Modal -->
		<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
			<div class="p-4">
				<h2 class="text-xl font-semibold mb-4 text-white">Add Blackout Date</h2>
				<BlackoutDateForm onSuccess={handleCreateSuccess} onCancel={handleCreateCancel} />
			</div>
		</div>
	{/if}

	<DeleteBlackoutDateDialog
		open={showDeleteDialog}
		blackoutDate={blackoutDateToDelete}
		onConfirm={handleDeleteConfirm}
		onCancel={handleCancelDelete}
	/>
</div>
