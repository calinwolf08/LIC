<script lang="ts">
	import type { PageData } from './$types';
	import type { HealthSystems } from '$lib/db/types';
	import { Button } from '$lib/components/ui/button';
	import { invalidateAll } from '$app/navigation';
	import HealthSystemTable from '$lib/features/health-systems/components/health-system-table.svelte';
	import HealthSystemForm from '$lib/features/health-systems/components/health-system-form.svelte';

	let { data }: { data: PageData } = $props();

	let showForm = $state(false);

	function handleAdd() {
		showForm = true;
	}

	async function handleDelete(healthSystem: HealthSystems) {
		// Fetch dependencies to show cascade delete warning
		try {
			const depsResponse = await fetch(
				`/api/health-systems/${healthSystem.id}/dependencies`
			);
			const depsResult = await depsResponse.json();

			if (depsResult.success && depsResult.data) {
				const deps = depsResult.data;

				// If there are blocking dependencies, don't allow delete
				if (deps.total > 0) {
					const parts: string[] = [];
					if (deps.sites > 0) parts.push(`${deps.sites} site(s)`);
					if (deps.preceptors > 0) parts.push(`${deps.preceptors} preceptor(s)`);

					alert(
						`Cannot delete "${healthSystem.name}" - ${parts.join(', ')} depend on this health system. Remove these dependencies first.`
					);
					return;
				}

				// Build confirmation message with cascade delete warning
				let confirmMessage = `Are you sure you want to delete "${healthSystem.name}"?`;

				if (deps.studentOnboarding > 0) {
					confirmMessage += `\n\nWarning: This will also delete ${deps.studentOnboarding} student onboarding record${deps.studentOnboarding > 1 ? 's' : ''}.`;
				}

				if (!confirm(confirmMessage)) {
					return;
				}
			} else {
				// Fallback to simple confirmation if dependency check fails
				if (!confirm(`Are you sure you want to delete "${healthSystem.name}"?`)) {
					return;
				}
			}
		} catch (error) {
			console.error('Error checking dependencies:', error);
			// Fallback to simple confirmation
			if (!confirm(`Are you sure you want to delete "${healthSystem.name}"?`)) {
				return;
			}
		}

		// Proceed with deletion
		try {
			const response = await fetch(`/api/health-systems/${healthSystem.id}`, {
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

	<HealthSystemTable
		healthSystems={data.healthSystems}
		onDelete={handleDelete}
	/>
</div>

<!-- Form Modal for Adding -->
{#if showForm}
	<div
		class="fixed inset-0 z-50 bg-black/50"
		onclick={handleFormCancel}
		role="presentation"
	></div>
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2">
		<HealthSystemForm
			onSuccess={handleFormSuccess}
			onCancel={handleFormCancel}
		/>
	</div>
{/if}
