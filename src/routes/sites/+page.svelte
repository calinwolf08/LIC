<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import { SiteList } from '$lib/features/sites/components';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	async function handleDelete(site: any) {
		try {
			const response = await fetch(`/api/sites/${site.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				alert(result.error || 'Failed to delete site');
				return;
			}

			// Reload page to refresh data
			window.location.reload();
		} catch (error) {
			console.error('Error deleting site:', error);
			alert('An error occurred while deleting the site');
		}
	}

	function handleEdit(site: any) {
		goto(`/sites/${site.id}/edit`);
	}
</script>

<div class="container mx-auto py-8">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-3xl font-bold">Sites</h1>
			<p class="text-muted-foreground mt-1">Manage clinical rotation sites</p>
		</div>
		<Button href="/sites/new">+ New Site</Button>
	</div>

	{#if data.sites.length === 0}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">No sites found.</p>
			<p class="text-sm text-muted-foreground mt-2">
				Get started by creating your first site.
			</p>
			<Button href="/sites/new" class="mt-4">Create Site</Button>
		</Card>
	{:else}
		<SiteList sites={data.sites} onEdit={handleEdit} onDelete={handleDelete} />
	{/if}
</div>
