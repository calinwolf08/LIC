<script lang="ts">
	import type { HealthSystems } from '$lib/db/types';
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';

	interface Props {
		healthSystems: HealthSystems[];
		onEdit: (healthSystem: HealthSystems) => void;
		onDelete: (healthSystem: HealthSystems) => void;
	}

	let { healthSystems, onEdit, onDelete }: Props = $props();

	interface Dependencies {
		sites: number;
		preceptors: number;
		studentOnboarding: number;
		total: number;
	}

	// Track dependencies for each health system
	let dependenciesMap = $state<Map<string, Dependencies>>(new Map());
	let loadingDependencies = $state(true);

	// Fetch dependencies for all health systems
	async function loadDependencies() {
		loadingDependencies = true;
		const promises = healthSystems.map(async (hs) => {
			try {
				const response = await fetch(`/api/scheduling-config/health-systems/${hs.id}/dependencies`);
				const result = await response.json();
				if (result.success && result.data) {
					dependenciesMap.set(hs.id, result.data);
				}
			} catch (error) {
				console.error(`Failed to load dependencies for ${hs.id}:`, error);
			}
		});
		await Promise.all(promises);
		loadingDependencies = false;
	}

	// Load dependencies when health systems change
	$effect(() => {
		if (healthSystems.length > 0) {
			loadDependencies();
		}
	});

	// Get dependency info for a health system
	function getDependencyInfo(healthSystemId: string): {
		hasDependencies: boolean;
		tooltip: string;
		displayText: string;
	} {
		const deps = dependenciesMap.get(healthSystemId);
		if (!deps) {
			return {
				hasDependencies: false,
				tooltip: 'Loading dependencies...',
				displayText: ''
			};
		}

		const hasDependencies = deps.total > 0;

		if (!hasDependencies && deps.studentOnboarding === 0) {
			return {
				hasDependencies: false,
				tooltip: 'No dependencies. Safe to delete.',
				displayText: ''
			};
		}

		// Build tooltip message
		const parts: string[] = [];
		if (deps.sites > 0) {
			parts.push(`${deps.sites} site${deps.sites > 1 ? 's' : ''}`);
		}
		if (deps.preceptors > 0) {
			parts.push(`${deps.preceptors} preceptor${deps.preceptors > 1 ? 's' : ''}`);
		}

		let tooltip = '';
		let displayText = '';

		if (hasDependencies) {
			tooltip = `Cannot delete - ${parts.join(', ')} depend on this health system. Remove these dependencies first.`;
			displayText = `(${deps.total} ${deps.total > 1 ? 'dependencies' : 'dependency'})`;
		} else if (deps.studentOnboarding > 0) {
			tooltip = `Warning: ${deps.studentOnboarding} student onboarding record${deps.studentOnboarding > 1 ? 's' : ''} will be deleted`;
			displayText = `(${deps.studentOnboarding} onboarding)`;
		}

		return { hasDependencies, tooltip, displayText };
	}
</script>

<div class="space-y-4">
	{#if healthSystems.length === 0}
		<div class="text-center text-muted-foreground py-8">
			<p>No health systems found.</p>
			<p class="text-sm mt-2">Create your first health system to get started.</p>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each healthSystems as healthSystem}
				<div class="rounded-lg border p-4 hover:border-primary transition-colors">
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<h3 class="font-semibold">{healthSystem.name}</h3>
							{#if healthSystem.location}
								<p class="mt-1 text-sm text-muted-foreground">{healthSystem.location}</p>
							{/if}
							{#if healthSystem.description}
								<p class="mt-2 text-sm text-muted-foreground line-clamp-2">
									{healthSystem.description}
								</p>
							{/if}
						</div>
					</div>
					<div class="mt-4 flex gap-2 items-center">
						<Button size="sm" variant="outline" onclick={() => onEdit(healthSystem)}>Edit</Button>
						{#if loadingDependencies}
							<Button size="sm" variant="destructive" disabled>
								Delete
							</Button>
						{:else}
							{@const depInfo = getDependencyInfo(healthSystem.id)}
							<div class="flex items-center gap-2">
								<Button
									size="sm"
									variant="destructive"
									disabled={depInfo.hasDependencies}
									title={depInfo.tooltip}
									onclick={() => onDelete(healthSystem)}
								>
									Delete
								</Button>
								{#if depInfo.displayText}
									<span
										class="text-xs text-muted-foreground"
										title={depInfo.tooltip}
									>
										{depInfo.displayText}
									</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
