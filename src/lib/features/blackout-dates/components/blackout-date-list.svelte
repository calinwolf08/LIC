<script lang="ts">
	import type { BlackoutDatesTable } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		blackoutDates: BlackoutDatesTable[];
		loading?: boolean;
		onDelete?: (blackoutDate: BlackoutDatesTable) => void;
	}

	let { blackoutDates, loading = false, onDelete }: Props = $props();

	let sortColumn = $state<'start_date' | 'end_date' | 'reason' | null>(null);
	let sortDirection = $state<'asc' | 'desc'>('asc');

	let sortedBlackoutDates = $derived(() => {
		if (!sortColumn) return blackoutDates;

		return [...blackoutDates].sort((a, b) => {
			const aVal = a[sortColumn];
			const bVal = b[sortColumn];

			if (aVal === bVal) return 0;

			const comparison = aVal < bVal ? -1 : 1;
			return sortDirection === 'asc' ? comparison : -comparison;
		});
	});

	function handleSort(column: 'start_date' | 'end_date' | 'reason') {
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

	function calculateDuration(startDate: string, endDate: string): number {
		const start = new Date(startDate);
		const end = new Date(endDate);
		const diffTime = Math.abs(end.getTime() - start.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
		return diffDays + 1; // Include both start and end dates
	}
</script>

<Card class="w-full">
	<div class="overflow-x-auto">
		<table class="w-full border-collapse">
			<thead>
				<tr class="border-b bg-muted/50">
					<th
						class="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted"
						onclick={() => handleSort('start_date')}
					>
						<div class="flex items-center gap-2">
							Start Date
							{#if sortColumn === 'start_date'}
								<span class="text-xs">
									{sortDirection === 'asc' ? '↑' : '↓'}
								</span>
							{/if}
						</div>
					</th>
					<th
						class="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted"
						onclick={() => handleSort('end_date')}
					>
						<div class="flex items-center gap-2">
							End Date
							{#if sortColumn === 'end_date'}
								<span class="text-xs">
									{sortDirection === 'asc' ? '↑' : '↓'}
								</span>
							{/if}
						</div>
					</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Duration</th>
					<th
						class="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted"
						onclick={() => handleSort('reason')}
					>
						<div class="flex items-center gap-2">
							Reason
							{#if sortColumn === 'reason'}
								<span class="text-xs">
									{sortDirection === 'asc' ? '↑' : '↓'}
								</span>
							{/if}
						</div>
					</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Created</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					<tr>
						<td colspan="6" class="px-4 py-8 text-center text-muted-foreground">
							Loading...
						</td>
					</tr>
				{:else if sortedBlackoutDates().length === 0}
					<tr>
						<td colspan="6" class="px-4 py-8 text-center text-muted-foreground">
							No blackout dates found
						</td>
					</tr>
				{:else}
					{#each sortedBlackoutDates() as blackoutDate}
						<tr class="border-b transition-colors hover:bg-muted/50">
							<td class="px-4 py-3 text-sm">{blackoutDate.start_date}</td>
							<td class="px-4 py-3 text-sm">{blackoutDate.end_date}</td>
							<td class="px-4 py-3 text-sm">
								{calculateDuration(blackoutDate.start_date, blackoutDate.end_date)} days
							</td>
							<td class="px-4 py-3 text-sm font-medium">{blackoutDate.reason}</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">
								{formatDate(blackoutDate.created_at)}
							</td>
							<td class="px-4 py-3 text-sm">
								<div class="flex gap-2">
									{#if onDelete}
										<Button
											size="sm"
											variant="destructive"
											onclick={() => onDelete?.(blackoutDate)}
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
