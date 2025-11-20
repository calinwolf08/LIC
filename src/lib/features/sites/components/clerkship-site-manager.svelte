<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';

	interface Props {
		clerkshipId: string;
		clerkshipName: string;
	}

	let { clerkshipId, clerkshipName }: Props = $props();

	let sites = $state<Array<{ id: string; name: string; health_system_name?: string }>>([]);
	let associatedSiteIds = $state<Set<string>>(new Set());
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function loadData() {
		loading = true;
		error = null;
		try {
			const [sitesRes, associationsRes] = await Promise.all([
				fetch('/api/sites'),
				fetch(`/api/clerkship-sites?clerkship_id=${clerkshipId}`)
			]);

			if (!sitesRes.ok || !associationsRes.ok) {
				throw new Error('Failed to load data');
			}

			const sitesData = await sitesRes.json();
			const associationsData = await associationsRes.json();

			sites = sitesData.data || [];
			associatedSiteIds = new Set((associationsData.data || []).map((s: any) => s.id));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	async function toggleSite(siteId: string) {
		const isAssociated = associatedSiteIds.has(siteId);

		try {
			const response = await fetch('/api/clerkship-sites', {
				method: isAssociated ? 'DELETE' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clerkship_id: clerkshipId,
					site_id: siteId
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

<div class="space-y-4">
	<div>
		<h3 class="text-lg font-semibold">Sites Offering {clerkshipName}</h3>
		<p class="text-sm text-muted-foreground mt-1">
			Select which sites offer this clerkship
		</p>
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if loading}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">Loading sites...</p>
		</Card>
	{:else if sites.length === 0}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">No sites found.</p>
			<p class="text-sm text-muted-foreground mt-2">
				Create sites first before associating them with clerkships.
			</p>
			<Button href="/sites/new" class="mt-4">Create Site</Button>
		</Card>
	{:else}
		<Card class="p-6">
			<div class="space-y-2">
				{#each sites as site}
					{@const isAssociated = associatedSiteIds.has(site.id)}
					<div class="flex items-center justify-between p-3 rounded-lg border {isAssociated ? 'bg-primary/5 border-primary/20' : ''}">
						<div>
							<p class="font-medium">{site.name}</p>
							{#if site.health_system_name}
								<p class="text-sm text-muted-foreground">{site.health_system_name}</p>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							{#if isAssociated}
								<Badge variant="default">Active</Badge>
							{/if}
							<Button
								size="sm"
								variant={isAssociated ? 'outline' : 'default'}
								onclick={() => toggleSite(site.id)}
							>
								{isAssociated ? 'Remove' : 'Add'}
							</Button>
						</div>
					</div>
				{/each}
			</div>
		</Card>
	{/if}
</div>
