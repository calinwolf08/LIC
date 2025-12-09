<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';

	// Define a flexible type that works with both Kysely types and serialized data
	interface HealthSystemWithCounts {
		id: string | null;
		name: string;
		description?: string | null;
		location?: string | null;
		created_at: string | unknown;
		updated_at?: string | unknown;
		siteCount?: number;
		preceptorCount?: number;
	}

	interface Dependencies {
		sites: number;
		preceptors: number;
		studentOnboarding: number;
		total: number;
	}

	interface Props {
		healthSystems: HealthSystemWithCounts[];
		onDelete: (healthSystem: HealthSystemWithCounts) => void;
	}

	let { healthSystems, onDelete }: Props = $props();

	// Track dependencies for each health system
	let dependenciesMap = $state<Map<string, Dependencies>>(new Map());
	let loadingDependencies = $state(true);

	// Fetch dependencies for all health systems
	async function loadDependencies() {
		loadingDependencies = true;
		const promises = healthSystems.map(async (hs) => {
			if (!hs.id) return;
			try {
				const response = await fetch(`/api/health-systems/${hs.id}/dependencies`);
				const result = await response.json();
				if (result.success && result.data) {
					dependenciesMap.set(hs.id, result.data);
				}
			} catch (error) {
				console.error(`Failed to load dependencies for ${hs.id}:`, error);
			}
		});
		await Promise.all(promises);
		// Trigger reactivity by reassigning the map
		dependenciesMap = new Map(dependenciesMap);
		loadingDependencies = false;
	}

	// Load dependencies when health systems change
	$effect(() => {
		if (healthSystems.length > 0) {
			loadDependencies();
		}
	});

	// Sorting
	let sortColumn = $state<'name' | 'location' | 'created_at'>('name');
	let sortDirection = $state<'asc' | 'desc'>('asc');

	let sortedHealthSystems = $derived(() => {
		return [...healthSystems].sort((a, b) => {
			const aVal = a[sortColumn] ?? '';
			const bVal = b[sortColumn] ?? '';
			const comparison = String(aVal).localeCompare(String(bVal));
			return sortDirection === 'asc' ? comparison : -comparison;
		});
	});

	function handleSort(column: typeof sortColumn) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
	}

	function canDelete(hs: HealthSystemWithCounts): boolean {
		if (!hs.id) return false;
		const deps = dependenciesMap.get(hs.id);
		if (!deps) return false;
		return deps.sites === 0 && deps.preceptors === 0;
	}

	function getDeleteTooltip(hs: HealthSystemWithCounts): string {
		if (!hs.id) return 'Loading...';
		const deps = dependenciesMap.get(hs.id);
		if (!deps) return 'Loading...';
		if (canDelete(hs)) return '';

		const parts: string[] = ['Cannot delete: This health system has:'];
		if (deps.sites > 0) {
			parts.push(`• ${deps.sites} site${deps.sites > 1 ? 's' : ''}`);
		}
		if (deps.preceptors > 0) {
			parts.push(`• ${deps.preceptors} preceptor${deps.preceptors > 1 ? 's' : ''}`);
		}
		parts.push('', 'Remove or reassign these before deleting.');
		return parts.join('\n');
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
	}

	function handleRowClick(hs: HealthSystemWithCounts) {
		goto(`/health-systems/${hs.id}`);
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
								<span class="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</div>
					</th>
					<th
						class="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted"
						onclick={() => handleSort('location')}
					>
						<div class="flex items-center gap-2">
							Location
							{#if sortColumn === 'location'}
								<span class="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</div>
					</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Sites</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Preceptors</th>
					<th
						class="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted"
						onclick={() => handleSort('created_at')}
					>
						<div class="flex items-center gap-2">
							Created
							{#if sortColumn === 'created_at'}
								<span class="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</div>
					</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if healthSystems.length === 0}
					<tr>
						<td colspan="6" class="px-4 py-8 text-center text-muted-foreground">
							No health systems found. <a href="/health-systems/new" class="text-primary hover:underline">Add one</a>.
						</td>
					</tr>
				{:else}
					{#each sortedHealthSystems() as hs}
						{@const hsId = hs.id || ''}
						{@const deps = hsId ? dependenciesMap.get(hsId) : undefined}
						<tr
							class="border-b transition-colors hover:bg-muted/50 cursor-pointer"
							onclick={() => handleRowClick(hs)}
						>
							<td class="px-4 py-3 text-sm font-medium">{hs.name}</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">
								{hs.location || '—'}
							</td>
							<td class="px-4 py-3 text-sm">
								<span class="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs">
									{deps?.sites ?? hs.siteCount ?? '...'}
								</span>
							</td>
							<td class="px-4 py-3 text-sm">
								<span class="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs">
									{deps?.preceptors ?? hs.preceptorCount ?? '...'}
								</span>
							</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">
								{formatDate(String(hs.created_at))}
							</td>
							<td class="px-4 py-3 text-sm" onclick={(e) => e.stopPropagation()}>
								<div class="flex gap-2">
									<Button size="sm" variant="ghost" onclick={() => goto(`/health-systems/${hs.id}`)}>
										View
									</Button>
									{#if loadingDependencies}
										<Button size="sm" variant="destructive" disabled>
											Delete
										</Button>
									{:else}
										<div class="relative group">
											<Button
												size="sm"
												variant="destructive"
												disabled={!canDelete(hs)}
												onclick={() => onDelete(hs)}
											>
												Delete
											</Button>
											{#if !canDelete(hs)}
												<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
													<div class="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-pre-line min-w-[200px] max-w-[300px]">
														{getDeleteTooltip(hs)}
													</div>
												</div>
											{/if}
										</div>
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
