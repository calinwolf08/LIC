<script lang="ts">
	import type { HealthSystems } from '$lib/db/types';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		healthSystems: HealthSystems[];
		onEdit: (healthSystem: HealthSystems) => void;
		onDelete: (healthSystem: HealthSystems) => void;
	}

	let { healthSystems, onEdit, onDelete }: Props = $props();
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
					<div class="mt-4 flex gap-2">
						<Button size="sm" variant="outline" onclick={() => onEdit(healthSystem)}>Edit</Button>
						<Button size="sm" variant="destructive" onclick={() => onDelete(healthSystem)}>
							Delete
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
