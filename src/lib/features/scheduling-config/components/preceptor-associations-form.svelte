<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';

	interface Preceptor {
		id: string;
		name: string;
		health_system_id: string | null;
		associatedClerkships: string[];
	}

	interface Clerkship {
		id: string;
		name: string;
		clerkship_type: 'inpatient' | 'outpatient';
	}

	let preceptors = $state<Preceptor[]>([]);
	let clerkships = $state<Clerkship[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let searchTerm = $state('');

	let filteredPreceptors = $derived(
		preceptors.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
	);

	async function loadData() {
		loading = true;
		error = null;
		try {
			const [preceptorsRes, clerkshipsRes, associationsRes] = await Promise.all([
				fetch('/api/preceptors'),
				fetch('/api/clerkships'),
				fetch('/api/preceptor-associations')
			]);

			if (!preceptorsRes.ok || !clerkshipsRes.ok || !associationsRes.ok) {
				throw new Error('Failed to load data');
			}

			const preceptorsData = await preceptorsRes.json();
			const clerkshipsData = await clerkshipsRes.json();
			const associationsData = await associationsRes.json();

			clerkships = clerkshipsData.data || [];

			// Build associations map
			const associationsMap = new Map<string, string[]>();
			for (const assoc of associationsData.data || []) {
				if (!associationsMap.has(assoc.preceptor_id)) {
					associationsMap.set(assoc.preceptor_id, []);
				}
				associationsMap.get(assoc.preceptor_id)!.push(assoc.clerkship_id);
			}

			preceptors = (preceptorsData.data || []).map((p: any) => ({
				...p,
				associatedClerkships: associationsMap.get(p.id) || []
			}));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	async function toggleAssociation(preceptorId: string, clerkshipId: string) {
		try {
			const preceptor = preceptors.find((p) => p.id === preceptorId);
			if (!preceptor) return;

			const isAssociated = preceptor.associatedClerkships.includes(clerkshipId);

			const response = await fetch('/api/preceptor-associations', {
				method: isAssociated ? 'DELETE' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					preceptor_id: preceptorId,
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

	// Load on mount
	$effect(() => {
		loadData();
	});
</script>

<div class="space-y-6">
	<div>
		<h2 class="text-2xl font-bold">Preceptor-Clerkship Associations</h2>
		<p class="text-sm text-muted-foreground mt-1">
			Manage which clerkships each preceptor can supervise
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
				<Card class="p-6">
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<div>
								<h3 class="font-semibold">{preceptor.name}</h3>
								<p class="text-sm text-muted-foreground">
									{preceptor.associatedClerkships.length} clerkship{preceptor.associatedClerkships
										.length === 1
										? ''
										: 's'} associated
								</p>
							</div>
						</div>

						<div>
							<Label class="text-sm font-medium mb-2 block">Associated Clerkships</Label>
							<div class="flex flex-wrap gap-2">
								{#each clerkships as clerkship}
									{@const isAssociated = preceptor.associatedClerkships.includes(clerkship.id)}
									<button
										onclick={() => toggleAssociation(preceptor.id, clerkship.id)}
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
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>
