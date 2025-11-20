<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';

	interface Preceptor {
		id: string;
		name: string;
		site_id: string | null;
		health_system_id: string | null;
		site_name?: string;
		associations: Map<string, string[]>; // Map<site_id, clerkship_ids[]>
	}

	interface Site {
		id: string;
		name: string;
		health_system_id: string;
	}

	interface Clerkship {
		id: string;
		name: string;
		clerkship_type: 'inpatient' | 'outpatient';
	}

	let preceptors = $state<Preceptor[]>([]);
	let sites = $state<Site[]>([]);
	let clerkships = $state<Clerkship[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let searchTerm = $state('');
	let expandedPreceptors = $state<Set<string>>(new Set());

	let filteredPreceptors = $derived(
		preceptors.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
	);

	async function loadData() {
		loading = true;
		error = null;
		try {
			const [preceptorsRes, sitesRes, clerkshipsRes, associationsRes] = await Promise.all([
				fetch('/api/preceptors'),
				fetch('/api/sites'),
				fetch('/api/clerkships'),
				fetch('/api/preceptor-site-clerkship-associations')
			]);

			if (!preceptorsRes.ok || !sitesRes.ok || !clerkshipsRes.ok || !associationsRes.ok) {
				throw new Error('Failed to load data');
			}

			const preceptorsData = await preceptorsRes.json();
			const sitesData = await sitesRes.json();
			const clerkshipsData = await clerkshipsRes.json();
			const associationsData = await associationsRes.json();

			sites = sitesData.data || [];
			clerkships = clerkshipsData.data.filter(
				(c: Clerkship) => c.clerkship_type === 'inpatient' || c.clerkship_type === 'outpatient'
			) || [];

			// Build associations map: preceptor_id -> site_id -> clerkship_ids
			const associationsMap = new Map<string, Map<string, string[]>>();
			for (const assoc of associationsData.data || []) {
				if (!associationsMap.has(assoc.preceptor_id)) {
					associationsMap.set(assoc.preceptor_id, new Map());
				}
				const preceptorMap = associationsMap.get(assoc.preceptor_id)!;
				if (!preceptorMap.has(assoc.site_id)) {
					preceptorMap.set(assoc.site_id, []);
				}
				preceptorMap.get(assoc.site_id)!.push(assoc.clerkship_id);
			}

			// Build site name lookup
			const siteNameMap = new Map<string, string>();
			for (const site of sites) {
				siteNameMap.set(site.id, site.name);
			}

			preceptors = (preceptorsData.data || []).map((p: any) => ({
				...p,
				site_name: p.site_id ? siteNameMap.get(p.site_id) : undefined,
				associations: associationsMap.get(p.id) || new Map()
			}));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	async function toggleAssociation(preceptorId: string, siteId: string, clerkshipId: string) {
		try {
			const preceptor = preceptors.find((p) => p.id === preceptorId);
			if (!preceptor) return;

			const siteAssociations = preceptor.associations.get(siteId) || [];
			const isAssociated = siteAssociations.includes(clerkshipId);

			const response = await fetch('/api/preceptor-site-clerkship-associations', {
				method: isAssociated ? 'DELETE' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					preceptor_id: preceptorId,
					site_id: siteId,
					clerkship_id: clerkshipId
				})
			});

			if (!response.ok) throw new Error('Failed to update association');

			// Reload data
			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update';
		}
	}

	function togglePreceptor(preceptorId: string) {
		if (expandedPreceptors.has(preceptorId)) {
			expandedPreceptors.delete(preceptorId);
		} else {
			expandedPreceptors.add(preceptorId);
		}
		expandedPreceptors = new Set(expandedPreceptors);
	}

	function getTotalAssociations(preceptor: Preceptor): number {
		let total = 0;
		for (const clerkships of preceptor.associations.values()) {
			total += clerkships.length;
		}
		return total;
	}

	// Load on mount
	$effect(() => {
		loadData();
	});
</script>

<div class="space-y-6">
	<div>
		<h2 class="text-2xl font-bold">Preceptor-Site-Clerkship Associations</h2>
		<p class="text-sm text-muted-foreground mt-1">
			Manage which clerkships each preceptor can supervise at each site
		</p>
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	<div class="space-y-2">
		<Label for="search">Search Preceptors</Label>
		<Input
			id="search"
			type="text"
			placeholder="Search by name..."
			bind:value={searchTerm}
			class="max-w-md"
		/>
	</div>

	{#if loading}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">Loading...</p>
		</Card>
	{:else if filteredPreceptors.length === 0}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">No preceptors found.</p>
		</Card>
	{:else}
		<div class="grid gap-4">
			{#each filteredPreceptors as preceptor}
				{@const isExpanded = expandedPreceptors.has(preceptor.id)}
				{@const totalAssociations = getTotalAssociations(preceptor)}
				<Card class="p-6">
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<button
										onclick={() => togglePreceptor(preceptor.id)}
										class="text-left hover:opacity-70 transition-opacity"
									>
										<h3 class="font-semibold">{preceptor.name}</h3>
										<div class="flex items-center gap-2 mt-1">
											{#if preceptor.site_name}
												<Badge variant="outline" class="text-xs">
													Primary: {preceptor.site_name}
												</Badge>
											{/if}
											<span class="text-sm text-muted-foreground">
												{totalAssociations} association{totalAssociations === 1 ? '' : 's'}
											</span>
										</div>
									</button>
								</div>
							</div>
							<Button size="sm" variant="ghost" onclick={() => togglePreceptor(preceptor.id)}>
								{isExpanded ? '▼' : '▶'}
							</Button>
						</div>

						{#if isExpanded}
							<div class="space-y-4 pt-2 border-t">
								{#each sites as site}
									{@const siteAssociations = preceptor.associations.get(site.id) || []}
									<div class="space-y-2">
										<div class="flex items-center justify-between">
											<Label class="text-sm font-medium">
												{site.name}
												{#if siteAssociations.length > 0}
													<Badge variant="secondary" class="ml-2 text-xs">
														{siteAssociations.length}
													</Badge>
												{/if}
											</Label>
										</div>
										<div class="flex flex-wrap gap-2">
											{#each clerkships as clerkship}
												{@const isAssociated = siteAssociations.includes(clerkship.id)}
												<button
													onclick={() => toggleAssociation(preceptor.id, site.id, clerkship.id)}
													class={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
														isAssociated
															? 'bg-primary text-primary-foreground hover:bg-primary/80'
															: 'bg-muted text-muted-foreground hover:bg-muted/80'
													}`}
												>
													{clerkship.name}
													<span class="ml-1 text-xs">
														{clerkship.clerkship_type === 'inpatient' ? '(IP)' : '(OP)'}
													</span>
													{#if isAssociated}
														<span class="ml-1">✓</span>
													{/if}
												</button>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>
