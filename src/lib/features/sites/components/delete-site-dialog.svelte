<script lang="ts">
	import type { Selectable } from 'kysely';
	import type { Sites } from '$lib/db/types';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import { onMount } from 'svelte';

	interface Props {
		site: Selectable<Sites>;
		open: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { site, open, onConfirm, onCancel }: Props = $props();

	interface Dependencies {
		clerkships: number;
		preceptorClerkships: number;
		electives: number;
		preceptors: number;
		total: number;
	}

	let dependencies = $state<Dependencies | null>(null);
	let loading = $state(true);

	// Fetch dependencies when dialog opens
	$effect(() => {
		if (open && site) {
			loadDependencies();
		}
	});

	async function loadDependencies() {
		loading = true;
		try {
			const response = await fetch(`/api/sites/${site.id}/dependencies`);
			const result = await response.json();
			if (result.success && result.data) {
				dependencies = result.data;
			}
		} catch (error) {
			console.error('Failed to load dependencies:', error);
		} finally {
			loading = false;
		}
	}

	function getDependencyMessage(): string {
		if (!dependencies) return '';

		if (dependencies.total === 0) {
			return 'This site has no dependencies and can be safely deleted.';
		}

		const parts: string[] = [];
		if (dependencies.clerkships > 0) {
			parts.push(`${dependencies.clerkships} clerkship${dependencies.clerkships > 1 ? 's' : ''}`);
		}
		if (dependencies.preceptorClerkships > 0) {
			parts.push(
				`${dependencies.preceptorClerkships} preceptor-clerkship association${dependencies.preceptorClerkships > 1 ? 's' : ''}`
			);
		}
		if (dependencies.electives > 0) {
			parts.push(`${dependencies.electives} elective${dependencies.electives > 1 ? 's' : ''}`);
		}
		if (dependencies.preceptors > 0) {
			parts.push(`${dependencies.preceptors} preceptor${dependencies.preceptors > 1 ? 's' : ''}`);
		}

		return `Cannot delete - ${parts.join(', ')} depend on this site. Remove these dependencies first.`;
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
		<Card class="w-full max-w-md p-6">
			<h2 class="text-xl font-bold mb-4">Delete Site</h2>
			<p class="text-sm text-muted-foreground mb-4">
				Are you sure you want to delete <strong>{site.name}</strong>? This action cannot be undone.
			</p>

			{#if loading}
				<p class="text-sm text-muted-foreground mb-6">Checking dependencies...</p>
			{:else if dependencies}
				{@const hasDependencies = dependencies.total > 0}
				<div
					class="mb-6 rounded-md border p-3 {hasDependencies
						? 'border-destructive bg-destructive/10'
						: 'border-green-500 bg-green-50'}"
				>
					<p class="text-sm {hasDependencies ? 'text-destructive' : 'text-green-700'}">
						{getDependencyMessage()}
					</p>
				</div>
			{/if}

			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={onCancel}>Cancel</Button>
				<Button
					variant="destructive"
					disabled={loading || (dependencies?.total ?? 0) > 0}
					onclick={onConfirm}
				>
					Delete
				</Button>
			</div>
		</Card>
	</div>
{/if}
