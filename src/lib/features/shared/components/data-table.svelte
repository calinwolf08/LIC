<script lang="ts" generics="T extends Record<string, any>">
	import { Card } from '$lib/components/ui/card';

	interface Column<T> {
		key: keyof T | string;
		label: string;
		sortable?: boolean;
		render?: (item: T) => any;
	}

	interface Props {
		data: T[];
		columns: Column<T>[];
		loading?: boolean;
		emptyMessage?: string;
		onRowClick?: (item: T) => void;
	}

	let { data, columns, loading = false, emptyMessage = 'No data available', onRowClick }: Props = $props();

	let sortColumn = $state<keyof T | string | null>(null);
	let sortDirection = $state<'asc' | 'desc'>('asc');

	// Sort data based on current sort state
	let sortedData = $derived(() => {
		if (!sortColumn) return data;

		return [...data].sort((a, b) => {
			const aVal = a[sortColumn as keyof T];
			const bVal = b[sortColumn as keyof T];

			if (aVal === bVal) return 0;

			const comparison = aVal < bVal ? -1 : 1;
			return sortDirection === 'asc' ? comparison : -comparison;
		});
	});

	function handleSort(column: Column<T>) {
		if (!column.sortable) return;

		if (sortColumn === column.key) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column.key;
			sortDirection = 'asc';
		}
	}

	function getCellValue(item: T, column: Column<T>): any {
		if (column.render) {
			return column.render(item);
		}
		return item[column.key as keyof T];
	}
</script>

<Card class="w-full">
	<div class="overflow-x-auto">
		<table class="w-full border-collapse">
			<thead>
				<tr class="border-b bg-muted/50">
					{#each columns as column}
						<th
							class="px-4 py-3 text-left text-sm font-medium {column.sortable
								? 'cursor-pointer hover:bg-muted'
								: ''}"
							onclick={() => handleSort(column)}
						>
							<div class="flex items-center gap-2">
								{column.label}
								{#if column.sortable && sortColumn === column.key}
									<span class="text-xs">
										{sortDirection === 'asc' ? '↑' : '↓'}
									</span>
								{/if}
							</div>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#if loading}
					<tr>
						<td colspan={columns.length} class="px-4 py-8 text-center text-muted-foreground">
							Loading...
						</td>
					</tr>
				{:else if sortedData().length === 0}
					<tr>
						<td colspan={columns.length} class="px-4 py-8 text-center text-muted-foreground">
							{emptyMessage}
						</td>
					</tr>
				{:else}
					{#each sortedData() as item}
						<tr
							class="border-b transition-colors {onRowClick
								? 'cursor-pointer hover:bg-muted/50'
								: ''}"
							onclick={() => onRowClick?.(item)}
						>
							{#each columns as column}
								<td class="px-4 py-3 text-sm">
									{@render getCellValue(item, column)}
								</td>
							{/each}
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</Card>
