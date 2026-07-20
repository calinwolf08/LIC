<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ConfirmDialog, toast } from '$lib/components';
	import { invalidateAll } from '$app/navigation';
	import HealthSystemTable from '$lib/features/health-systems/components/health-system-table.svelte';
	import HealthSystemForm from '$lib/features/health-systems/components/health-system-form.svelte';

	let { data }: { data: PageData } = $props();

	let showForm = $state(false);

	// Delete confirmation state
	let showConfirm = $state(false);
	let target = $state<{ id: string; name: string } | null>(null);
	let dependencyNote = $state<string | null>(null);
	let cascadeNote = $state<string | null>(null);

	function handleAdd() {
		showForm = true;
	}

	async function handleDelete(healthSystem: { id: string | null; name: string }) {
		if (!healthSystem.id) return;
		dependencyNote = null;
		cascadeNote = null;
		// Fetch dependencies to decide whether deletion is allowed / needs a warning
		try {
			const depsResponse = await fetch(`/api/health-systems/${healthSystem.id}/dependencies`);
			const depsResult = await depsResponse.json();

			if (depsResult.success && depsResult.data) {
				const deps = depsResult.data;
				if (deps.total > 0) {
					const parts: string[] = [];
					if (deps.sites > 0) parts.push(`${deps.sites} site(s)`);
					if (deps.preceptors > 0) parts.push(`${deps.preceptors} preceptor(s)`);
					dependencyNote = `${parts.join(', ')} depend on this health system. Remove them first.`;
				} else if (deps.studentOnboarding > 0) {
					cascadeNote = `This will also delete ${deps.studentOnboarding} student onboarding record${deps.studentOnboarding > 1 ? 's' : ''}.`;
				}
			}
		} catch (error) {
			console.error('Error checking dependencies:', error);
		}

		target = { id: healthSystem.id, name: healthSystem.name };
		showConfirm = true;
	}

	async function confirmDelete() {
		if (!target || dependencyNote) return;
		const response = await fetch(`/api/health-systems/${target.id}`, { method: 'DELETE' });
		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error || 'Failed to delete health system');
		}
		toast.success('Health system deleted');
		await invalidateAll();
	}

	async function handleFormSuccess() {
		showForm = false;
		await invalidateAll();
	}

	function handleFormCancel() {
		showForm = false;
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

	<HealthSystemTable healthSystems={data.healthSystems} onDelete={handleDelete} />
</div>

<!-- Add Health System dialog -->
<Dialog.Root bind:open={showForm}>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Add Health System</Dialog.Title>
		</Dialog.Header>
		<HealthSystemForm onSuccess={handleFormSuccess} onCancel={handleFormCancel} />
	</Dialog.Content>
</Dialog.Root>

<!-- Delete confirmation -->
<ConfirmDialog
	bind:open={showConfirm}
	title={`Delete ${target?.name ?? 'health system'}?`}
	description={dependencyNote
		? 'This health system cannot be deleted yet.'
		: 'This action cannot be undone.'}
	confirmLabel="Delete"
	confirmDisabled={!!dependencyNote}
	onConfirm={confirmDelete}
>
	{#snippet details()}
		{#if dependencyNote}
			<p class="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800">
				{dependencyNote}
			</p>
		{:else if cascadeNote}
			<p class="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800">
				{cascadeNote}
			</p>
		{/if}
	{/snippet}
</ConfirmDialog>
