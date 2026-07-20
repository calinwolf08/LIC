<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import { SiteList } from '$lib/features/sites/components';
	import { toast } from '$lib/components';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	async function handleDelete(site: { id: string | null }) {
		if (!site.id) return;
		try {
			const response = await fetch(`/api/sites/${site.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				toast.error(result.error || 'Failed to delete site');
				return;
			}

			toast.success('Site deleted');
			await invalidateAll();
		} catch (error) {
			console.error('Error deleting site:', error);
			toast.error('An error occurred while deleting the site');
		}
	}

	function handleEdit(site: any) {
		goto(`/sites/${site.id}/edit`);
	}
</script>

<div class="container mx-auto py-8">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Sites</h1>
			<p class="mt-1 text-muted-foreground">
				Manage clinical rotation sites. Each clinical location should be its own site. Sites are
				grouped by Health System.
			</p>
		</div>
		<Button href="/sites/new">+ New Site</Button>
	</div>

	{#if data.sites.length === 0}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">No sites found.</p>
			<p class="mt-2 text-sm text-muted-foreground">Get started by creating your first site.</p>
			<Button href="/sites/new" class="mt-4">+ New Site</Button>
		</Card>
	{:else}
		<SiteList sites={data.sites} onEdit={handleEdit} onDelete={handleDelete} />
	{/if}
</div>
