<script lang="ts">
	import type { Sites } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { DeleteSiteDialog } from './index';

	interface SiteWithHealthSystem extends Sites {
		health_system_name?: string;
	}

	interface Props {
		sites: SiteWithHealthSystem[];
		onEdit: (site: SiteWithHealthSystem) => void;
		onDelete: (site: SiteWithHealthSystem) => void;
	}

	let { sites, onEdit, onDelete }: Props = $props();

	let siteToDelete = $state<SiteWithHealthSystem | null>(null);
	let deleteDialogOpen = $state(false);

	function handleDeleteClick(site: SiteWithHealthSystem) {
		siteToDelete = site;
		deleteDialogOpen = true;
	}

	function handleDeleteConfirm() {
		if (siteToDelete) {
			onDelete(siteToDelete);
			deleteDialogOpen = false;
			siteToDelete = null;
		}
	}

	function handleDeleteCancel() {
		deleteDialogOpen = false;
		siteToDelete = null;
	}
</script>

<Card class="w-full">
	<div class="overflow-x-auto">
		<table class="w-full border-collapse">
			<thead>
				<tr class="border-b bg-muted/50">
					<th class="px-4 py-3 text-left text-sm font-medium">Site Name</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Health System</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Address</th>
					<th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#if sites.length === 0}
					<tr>
						<td colspan="4" class="px-4 py-8 text-center text-muted-foreground">
							No sites available
						</td>
					</tr>
				{:else}
					{#each sites as site}
						<tr class="border-b transition-colors hover:bg-muted/50">
							<td class="px-4 py-3 text-sm">{site.name}</td>
							<td class="px-4 py-3 text-sm">{site.health_system_name || '-'}</td>
							<td class="px-4 py-3 text-sm">{site.address || '-'}</td>
							<td class="px-4 py-3 text-sm">
								<div class="flex items-center gap-2">
									<Button size="sm" variant="outline" onclick={() => onEdit(site)}>Edit</Button>
									<Button size="sm" variant="destructive" onclick={() => handleDeleteClick(site)}>
										Delete
									</Button>
								</div>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</Card>

{#if siteToDelete}
	<DeleteSiteDialog
		site={siteToDelete}
		open={deleteDialogOpen}
		onConfirm={handleDeleteConfirm}
		onCancel={handleDeleteCancel}
	/>
{/if}
