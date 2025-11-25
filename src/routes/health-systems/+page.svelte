<script lang="ts">
	import type { PageData } from './$types';
	import type { HealthSystems } from '$lib/db/types';
	import { Button } from '$lib/components/ui/button';
	import { invalidateAll } from '$app/navigation';
	import HealthSystemList from '$lib/features/health-systems/components/health-system-list.svelte';
	import HealthSystemForm from '$lib/features/health-systems/components/health-system-form.svelte';

	let { data }: { data: PageData } = $props();

	let showForm = $state(false);
	let selectedHealthSystem = $state<HealthSystems | undefined>(undefined);

	function handleAdd() {
		selectedHealthSystem = undefined;
		showForm = true;
	}

	function handleEdit(healthSystem: HealthSystems) {
		selectedHealthSystem = healthSystem;
		showForm = true;
	}

	async function handleDelete(healthSystem: HealthSystems) {
		if (!confirm(`Are you sure you want to delete "${healthSystem.name}"?`)) {
			return;
		}

		try {
			const response = await fetch(`/api/scheduling-config/health-systems/${healthSystem.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				alert(result.error || 'Failed to delete health system');
				return;
			}

			await invalidateAll();
		} catch (error) {
			console.error('Error deleting health system:', error);
			alert('An error occurred while deleting the health system');
		}
	}

	async function handleFormSuccess() {
		showForm = false;
		selectedHealthSystem = undefined;
		await invalidateAll();
	}

	function handleFormCancel() {
		showForm = false;
		selectedHealthSystem = undefined;
	}
</script>

<div class="container mx-auto py-8">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Health Systems</h1>
			<p class="mt-1 text-muted-foreground">Manage hospital systems and healthcare networks</p>
		</div>
		<Button onclick={handleAdd}>Add Health System</Button>
	</div>

	<HealthSystemList
		healthSystems={data.healthSystems}
		onEdit={handleEdit}
		onDelete={handleDelete}
	/>
</div>

<!-- Form Modal -->
{#if showForm}
	<div
		class="fixed inset-0 z-50 bg-black/50"
		onclick={handleFormCancel}
		role="presentation"
	></div>
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2">
		<HealthSystemForm
			healthSystem={selectedHealthSystem}
			onSuccess={handleFormSuccess}
			onCancel={handleFormCancel}
		/>
	</div>
{/if}
