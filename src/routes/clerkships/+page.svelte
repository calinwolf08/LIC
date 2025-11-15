<script lang="ts">
	import type { PageData } from './$types';
	import type { ClerkshipsTable } from '$lib/db/types';
	import ClerkshipList from '$lib/features/clerkships/components/clerkship-list.svelte';
	import ClerkshipForm from '$lib/features/clerkships/components/clerkship-form.svelte';
	import DeleteClerkshipDialog from '$lib/features/clerkships/components/delete-clerkship-dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let showForm = $state(false);
	let showDeleteDialog = $state(false);
	let selectedClerkship = $state<ClerkshipsTable | null>(null);

	function handleAdd() {
		selectedClerkship = null;
		showForm = true;
	}

	function handleEdit(clerkship: ClerkshipsTable) {
		selectedClerkship = clerkship;
		showForm = true;
	}

	function handleDelete(clerkship: ClerkshipsTable) {
		selectedClerkship = clerkship;
		showDeleteDialog = true;
	}

	async function handleFormSuccess() {
		showForm = false;
		selectedClerkship = null;
		await invalidateAll();
	}

	function handleFormCancel() {
		showForm = false;
		selectedClerkship = null;
	}

	async function handleDeleteConfirm(clerkship: ClerkshipsTable) {
		const response = await fetch(`/api/clerkships/${clerkship.id}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error?.message || 'Failed to delete clerkship');
		}

		showDeleteDialog = false;
		selectedClerkship = null;
		await invalidateAll();
	}

	function handleDeleteCancel() {
		showDeleteDialog = false;
		selectedClerkship = null;
	}
</script>

<div class="container mx-auto py-8">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold">Clerkships</h1>
		<Button onclick={handleAdd}>Add Clerkship</Button>
	</div>

	<ClerkshipList clerkships={data.clerkships} onEdit={handleEdit} onDelete={handleDelete} />
</div>

<!-- Form Modal -->
{#if showForm}
	<div class="fixed inset-0 z-50 bg-black/50" onclick={handleFormCancel} role="presentation"></div>
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2">
		<ClerkshipForm
			clerkship={selectedClerkship}
			onSuccess={handleFormSuccess}
			onCancel={handleFormCancel}
		/>
	</div>
{/if}

<!-- Delete Dialog -->
<DeleteClerkshipDialog
	open={showDeleteDialog}
	clerkship={selectedClerkship}
	onConfirm={handleDeleteConfirm}
	onCancel={handleDeleteCancel}
/>
