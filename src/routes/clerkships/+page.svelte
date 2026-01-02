<script lang="ts">
	import type { PageData } from './$types';
	import type { Clerkships } from '$lib/db/types';
	import ClerkshipList from '$lib/features/clerkships/components/clerkship-list.svelte';
	import ClerkshipForm from '$lib/features/clerkships/components/clerkship-form.svelte';
	import DeleteClerkshipDialog from '$lib/features/clerkships/components/delete-clerkship-dialog.svelte';
	import GlobalDefaultsForm from '$lib/features/scheduling-config/components/global-defaults-form.svelte';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	// Tab state
	let activeTab = $state<'clerkships' | 'scheduling-defaults'>('clerkships');

	let showForm = $state(false);
	let showDeleteDialog = $state(false);
	let selectedClerkship = $state<Clerkships | undefined>(undefined);

	function handleAdd() {
		showForm = true;
	}

	function handleDelete(clerkship: Clerkships) {
		selectedClerkship = clerkship;
		showDeleteDialog = true;
	}

	function handleConfigure(clerkship: Clerkships) {
		goto(`/clerkships/${clerkship.id}/config`);
	}

	async function handleFormSuccess() {
		showForm = false;
		await invalidateAll();
	}

	function handleFormCancel() {
		showForm = false;
	}

	async function handleDeleteConfirm(clerkship: Clerkships) {
		const response = await fetch(`/api/clerkships/${clerkship.id}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error?.message || 'Failed to delete clerkship');
		}

		showDeleteDialog = false;
		selectedClerkship = undefined;
		await invalidateAll();
	}

	function handleDeleteCancel() {
		showDeleteDialog = false;
		selectedClerkship = undefined;
	}
</script>

<div class="container mx-auto py-8">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Clerkships</h1>
	</div>

	<!-- Tabs -->
	<div class="mb-6 border-b">
		<nav class="-mb-px flex space-x-8">
			<button
				onclick={() => (activeTab = 'clerkships')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'clerkships'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Clerkships ({data.clerkships.length})
			</button>
			<button
				onclick={() => (activeTab = 'scheduling-defaults')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'scheduling-defaults'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Default Scheduling Rules
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'clerkships'}
		<div class="mb-6 flex items-center justify-end">
			<Button onclick={handleAdd}>Add Clerkship</Button>
		</div>

		<ClerkshipList
			clerkships={data.clerkships}
			onDelete={handleDelete}
			onConfigure={handleConfigure}
		/>
	{:else if activeTab === 'scheduling-defaults'}
		<GlobalDefaultsForm />
	{/if}
</div>

<!-- Form Modal (for adding new clerkships only) -->
{#if showForm}
	<div class="fixed inset-0 z-50 bg-black/50" onclick={handleFormCancel} role="presentation"></div>
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2">
		<ClerkshipForm
			sites={data.sites}
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
