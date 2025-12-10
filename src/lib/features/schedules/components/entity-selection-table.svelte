<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Entity {
		id: string;
		name: string;
		[key: string]: unknown;
	}

	interface Props {
		entities: Entity[];
		selectedIds: string[];
		onSelectionChange: (ids: string[]) => void;
		searchPlaceholder?: string;
		emptyMessage?: string;
		columns?: Snippet<[Entity]>;
	}

	let {
		entities,
		selectedIds,
		onSelectionChange,
		searchPlaceholder = 'Search...',
		emptyMessage = 'No items available',
		columns
	}: Props = $props();

	let searchQuery = $state('');

	let filteredEntities = $derived(
		entities.filter((entity) =>
			entity.name.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	let allSelected = $derived(
		filteredEntities.length > 0 && filteredEntities.every((e) => selectedIds.includes(e.id))
	);

	let someSelected = $derived(
		filteredEntities.some((e) => selectedIds.includes(e.id)) && !allSelected
	);

	function toggleAll(): void {
		if (allSelected) {
			// Deselect all filtered
			const filteredIds = new Set(filteredEntities.map((e) => e.id));
			onSelectionChange(selectedIds.filter((id) => !filteredIds.has(id)));
		} else {
			// Select all filtered
			const newIds = new Set([...selectedIds, ...filteredEntities.map((e) => e.id)]);
			onSelectionChange(Array.from(newIds));
		}
	}

	function toggleEntity(entityId: string): void {
		if (selectedIds.includes(entityId)) {
			onSelectionChange(selectedIds.filter((id) => id !== entityId));
		} else {
			onSelectionChange([...selectedIds, entityId]);
		}
	}

	function selectAll(): void {
		const newIds = new Set([...selectedIds, ...entities.map((e) => e.id)]);
		onSelectionChange(Array.from(newIds));
	}

	function deselectAll(): void {
		const entityIds = new Set(entities.map((e) => e.id));
		onSelectionChange(selectedIds.filter((id) => !entityIds.has(id)));
	}
</script>

<div class="space-y-4">
	<!-- Controls -->
	<div class="flex items-center gap-4">
		<!-- Search -->
		<div class="flex-1">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder={searchPlaceholder}
				class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
			/>
		</div>

		<!-- Bulk actions -->
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={selectAll}
				class="px-3 py-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
			>
				Select All
			</button>
			<button
				type="button"
				onclick={deselectAll}
				class="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
			>
				Deselect All
			</button>
		</div>

		<!-- Selected count -->
		<div class="text-sm text-gray-500">
			{selectedIds.length} selected
		</div>
	</div>

	<!-- Table -->
	<div class="border border-gray-200 rounded-lg overflow-hidden">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-gray-50">
				<tr>
					<th class="w-12 px-4 py-3">
						<input
							type="checkbox"
							checked={allSelected}
							indeterminate={someSelected}
							onchange={toggleAll}
							class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
						/>
					</th>
					<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Name
					</th>
					{#if columns}
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							Details
						</th>
					{/if}
				</tr>
			</thead>
			<tbody class="bg-white divide-y divide-gray-200">
				{#if filteredEntities.length === 0}
					<tr>
						<td colspan={columns ? 3 : 2} class="px-4 py-8 text-center text-gray-500">
							{emptyMessage}
						</td>
					</tr>
				{:else}
					{#each filteredEntities as entity}
						<tr
							class="hover:bg-gray-50 cursor-pointer {selectedIds.includes(entity.id) ? 'bg-blue-50' : ''}"
							onclick={() => toggleEntity(entity.id)}
						>
							<td class="w-12 px-4 py-3">
								<input
									type="checkbox"
									checked={selectedIds.includes(entity.id)}
									onchange={() => toggleEntity(entity.id)}
									onclick={(e) => e.stopPropagation()}
									class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
								/>
							</td>
							<td class="px-4 py-3 text-sm text-gray-900">
								{entity.name}
							</td>
							{#if columns}
								<td class="px-4 py-3 text-sm text-gray-500">
									{@render columns(entity)}
								</td>
							{/if}
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>
