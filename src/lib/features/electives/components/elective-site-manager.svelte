<script lang="ts">
	import type { ClerkshipElective } from '$lib/features/scheduling-config/types/elective-types';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { addSiteToElective, removeSiteFromElective } from '../services/elective-client';

	interface Site {
		id: string;
		name: string;
	}

	interface Props {
		elective: ClerkshipElective;
		associatedSites: Site[];
		availableSites: Site[];
		onUpdate?: () => void;
	}

	let { elective, associatedSites, availableSites, onUpdate }: Props = $props();

	let selectedSiteId = $state('');
	let isAdding = $state(false);
	let addError = $state<string | null>(null);

	async function handleAddSite() {
		if (!selectedSiteId) return;

		isAdding = true;
		addError = null;

		try {
			await addSiteToElective(elective.id, selectedSiteId);
			selectedSiteId = '';
			onUpdate?.();
		} catch (error) {
			addError = error instanceof Error ? error.message : 'Failed to add site';
		} finally {
			isAdding = false;
		}
	}

	async function handleRemoveSite(siteId: string) {
		try {
			await removeSiteFromElective(elective.id, siteId);
			onUpdate?.();
		} catch (error) {
			console.error('Failed to remove site:', error);
		}
	}
</script>

<Card class="p-6">
	<div class="space-y-4">
		<div>
			<h3 class="text-lg font-semibold">Manage Sites</h3>
			<p class="text-sm text-muted-foreground">
				Assign specific sites where this elective can be completed
			</p>
		</div>

		<!-- Associated Sites -->
		{#if associatedSites.length > 0}
			<div class="space-y-2">
				<Label>Associated Sites ({associatedSites.length})</Label>
				<div class="flex flex-wrap gap-2">
					{#each associatedSites as site (site.id)}
						<Badge variant="secondary" class="gap-1 pr-1">
							{site.name}
							<button
								onclick={() => handleRemoveSite(site.id)}
								class="ml-1 rounded-full hover:bg-destructive/20"
								aria-label="Remove {site.name}"
							>
								<svg
									class="h-3 w-3"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</Badge>
					{/each}
				</div>
			</div>
		{:else}
			<div class="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
				No sites associated. Add sites to specify where this elective is available.
			</div>
		{/if}

		<!-- Add Site -->
		{#if availableSites.length > 0}
			<div class="space-y-2">
				<Label for="site-select">Add Site</Label>
				{#if addError}
					<div class="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
						{addError}
					</div>
				{/if}
				<div class="flex gap-2">
					<select
						id="site-select"
						bind:value={selectedSiteId}
						disabled={isAdding}
						class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
					>
						<option value="">Select a site...</option>
						{#each availableSites as site (site.id)}
							<option value={site.id}>{site.name}</option>
						{/each}
					</select>
					<Button onclick={handleAddSite} disabled={!selectedSiteId || isAdding}>
						{isAdding ? 'Adding...' : 'Add'}
					</Button>
				</div>
			</div>
		{:else if associatedSites.length > 0}
			<p class="text-sm text-muted-foreground">All available sites have been associated.</p>
		{/if}
	</div>
</Card>
