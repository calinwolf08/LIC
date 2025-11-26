<script lang="ts">
	import type { Clerkships } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		clerkships: Clerkships[];
		loading?: boolean;
		onEdit?: (clerkship: Clerkships) => void;
		onDelete?: (clerkship: Clerkships) => void;
		onConfigure?: (clerkship: Clerkships) => void;
	}

	let { clerkships, loading = false, onEdit, onDelete, onConfigure }: Props = $props();

	let sortColumn = $state<'name' | 'specialty' | 'required_days' | null>(null);
	let sortDirection = $state<'asc' | 'desc'>('asc');

	let sortedClerkships = $derived(() => {
		if (!sortColumn) return clerkships;

		const column = sortColumn; // Capture non-null value
		return [...clerkships].sort((a, b) => {
			const aVal = a[column];
			const bVal = b[column];

			if (aVal === bVal) return 0;

			const comparison = aVal < bVal ? -1 : 1;
			return sortDirection === 'asc' ? comparison : -comparison;
		});
	});

	function handleSort(column: 'name' | 'specialty' | 'required_days') {
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

	function truncate(text: string | null, maxLength: number = 50): string {
		if (!text) return '';
		if (text.length <= maxLength) return text;
		return text.substring(0, maxLength) + '...';
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
						onclick={() => handleSort('specialty')}
					>
						<div class="flex items-center gap-2">
							Specialty
							{#if sortColumn === 'specialty'}
								<span class="text-xs">
									{sortDirection === 'asc' ? '↑' : '↓'}
								</span>
							{/if}
						</div>
					</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Type</th>
					<th
						class="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted"
						onclick={() => handleSort('required_days')}
					>
						<div class="flex items-center gap-2">
							Required Days
							{#if sortColumn === 'required_days'}
								<span class="text-xs">
									{sortDirection === 'asc' ? '↑' : '↓'}
								</span>
							{/if}
						</div>
					</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Description</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Created</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					<tr>
						<td colspan="7" class="px-4 py-8 text-center text-muted-foreground">
							Loading...
						</td>
					</tr>
				{:else if sortedClerkships().length === 0}
					<tr>
						<td colspan="7" class="px-4 py-8 text-center text-muted-foreground">
							No clerkships found
						</td>
					</tr>
				{:else}
					{#each sortedClerkships() as clerkship}
						<tr class="border-b transition-colors hover:bg-muted/50">
							<td class="px-4 py-3 text-sm font-medium">{clerkship.name}</td>
							<td class="px-4 py-3 text-sm">
								{#if clerkship.specialty}
									{clerkship.specialty}
								{:else}
									<span class="text-muted-foreground italic">Not specified</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-sm">
								<span
									class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {clerkship.clerkship_type ===
									'inpatient'
										? 'bg-blue-100 text-blue-700'
										: 'bg-green-100 text-green-700'}"
								>
									{clerkship.clerkship_type === 'inpatient' ? 'Inpatient' : 'Outpatient'}
								</span>
							</td>
							<td class="px-4 py-3 text-sm">
								{clerkship.required_days}
							</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">
								{truncate(clerkship.description)}
							</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">
								{formatDate(clerkship.created_at as unknown as string)}
							</td>
							<td class="px-4 py-3 text-sm">
								<div class="flex gap-2">
									{#if onConfigure}
										<Button size="sm" variant="default" onclick={() => onConfigure?.(clerkship)}>
											Configure
										</Button>
									{/if}
									{#if onEdit}
										<Button size="sm" variant="outline" onclick={() => onEdit?.(clerkship)}>
											Edit
										</Button>
									{/if}
									{#if onDelete}
										<Button
											size="sm"
											variant="destructive"
											onclick={() => onDelete?.(clerkship)}
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
