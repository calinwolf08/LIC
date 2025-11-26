<script lang="ts">
	import type { PreceptorWithAssociations } from '$lib/features/preceptors/services/preceptor-service';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		preceptors: PreceptorWithAssociations[];
		loading?: boolean;
		onEdit?: (preceptor: PreceptorWithAssociations) => void;
		onDelete?: (preceptor: PreceptorWithAssociations) => void;
		onManageAvailability?: (preceptor: PreceptorWithAssociations) => void;
	}

	let { preceptors, loading = false, onEdit, onDelete, onManageAvailability }: Props = $props();

	let sortColumn = $state<'name' | 'email' | null>(null);
	let sortDirection = $state<'asc' | 'desc'>('asc');

	let sortedPreceptors = $derived(() => {
		if (!sortColumn) return preceptors;

		const column = sortColumn; // Capture non-null value
		return [...preceptors].sort((a, b) => {
			const aVal = a[column];
			const bVal = b[column];

			if (aVal === bVal) return 0;

			const comparison = aVal < bVal ? -1 : 1;
			return sortDirection === 'asc' ? comparison : -comparison;
		});
	});

	function handleSort(column: 'name' | 'email') {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString();
	}
</script>

<Card class="w-full">
	<div class="overflow-x-auto">
		<table class="w-full border-collapse">
			<thead>
				<tr class="border-b bg-muted/50">
					<th
						class="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted"
						onclick={() => handleSort('name')}
					>
						<div class="flex items-center gap-2">
							Name
							{#if sortColumn === 'name'}
								<span class="text-xs">
									{sortDirection === 'asc' ? '↑' : '↓'}
								</span>
							{/if}
						</div>
					</th>
					<th
						class="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted"
						onclick={() => handleSort('email')}
					>
						<div class="flex items-center gap-2">
							Email
							{#if sortColumn === 'email'}
								<span class="text-xs">
									{sortDirection === 'asc' ? '↑' : '↓'}
								</span>
							{/if}
						</div>
					</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Health System</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Sites</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Clerkships</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Teams</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Max Students</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					<tr>
						<td colspan="8" class="px-4 py-8 text-center text-muted-foreground">
							Loading...
						</td>
					</tr>
				{:else if sortedPreceptors().length === 0}
					<tr>
						<td colspan="8" class="px-4 py-8 text-center text-muted-foreground">
							No preceptors found
						</td>
					</tr>
				{:else}
					{#each sortedPreceptors() as preceptor}
						<tr class="border-b transition-colors hover:bg-muted/50">
							<td class="px-4 py-3 text-sm">{preceptor.name}</td>
							<td class="px-4 py-3 text-sm">{preceptor.email}</td>
							<td class="px-4 py-3 text-sm">
								{#if preceptor.health_system_name}
									<a href="/health-systems" class="text-blue-600 hover:underline">
										{preceptor.health_system_name}
									</a>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-sm">
								{#if preceptor.sites && preceptor.sites.length > 0}
									{#each preceptor.sites as site, i}
										<a href="/sites/{site.id}/edit" class="text-blue-600 hover:underline">
											{site.name}
										</a>{i < preceptor.sites.length - 1 ? ', ' : ''}
									{/each}
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-sm">
								{#if preceptor.clerkships && preceptor.clerkships.length > 0}
									{#each preceptor.clerkships as clerkship, i}
										<a href="/clerkships/{clerkship.id}/config" class="text-blue-600 hover:underline">
											{clerkship.name}
										</a>{i < preceptor.clerkships.length - 1 ? ', ' : ''}
									{/each}
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-sm">
								{#if preceptor.teams && preceptor.teams.length > 0}
									{#each preceptor.teams as team, i}
										<a href="/preceptors/teams/{team.id}" class="text-blue-600 hover:underline">
											{team.name || 'Unnamed'}
										</a>{i < preceptor.teams.length - 1 ? ', ' : ''}
									{/each}
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-sm">{preceptor.max_students}</td>
							<td class="px-4 py-3 text-sm">
								<div class="flex gap-2">
									{#if onEdit}
										<Button size="sm" variant="outline" onclick={() => onEdit?.(preceptor)}>
											Edit
										</Button>
									{/if}
									{#if onManageAvailability}
										<Button
											size="sm"
											variant="outline"
											onclick={() => onManageAvailability?.(preceptor)}
										>
											Availability
										</Button>
									{/if}
									{#if onDelete}
										<Button
											size="sm"
											variant="destructive"
											onclick={() => onDelete?.(preceptor)}
										>
											Delete
										</Button>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</Card>
