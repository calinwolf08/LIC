<script lang="ts">
	import type { Sites } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import DataTable from '$lib/features/shared/components/data-table.svelte';
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

	const columns = [
		{
			key: 'name',
			label: 'Site Name',
			sortable: true
		},
		{
			key: 'health_system_name',
			label: 'Health System',
			sortable: true
		},
		{
			key: 'address',
			label: 'Address',
			sortable: false
		},
		{
			key: 'actions',
			label: 'Actions',
			sortable: false
		}
	];

	function renderCell(site: SiteWithHealthSystem, column: { key: string }) {
		if (column.key === 'name') {
			return site.name;
		}
		if (column.key === 'health_system_name') {
			return site.health_system_name || 'Unknown';
		}
		if (column.key === 'address') {
			return site.address || '-';
		}
		return '';
	}
</script>

<div>
	<DataTable data={sites} {columns} {renderCell} searchPlaceholder="Search sites...">
		{#snippet actions(site: SiteWithHealthSystem)}
			<div class="flex items-center gap-2">
				<Button size="sm" variant="outline" onclick={() => onEdit(site)}>Edit</Button>
				<Button size="sm" variant="destructive" onclick={() => handleDeleteClick(site)}>
					Delete
				</Button>
			</div>
		{/snippet}
	</DataTable>

	{#if siteToDelete}
		<DeleteSiteDialog
			site={siteToDelete}
			open={deleteDialogOpen}
			onConfirm={handleDeleteConfirm}
			onCancel={handleDeleteCancel}
		/>
	{/if}
</div>
