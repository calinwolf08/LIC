<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { goto, invalidateAll } from '$app/navigation';
	import {
		PageHeader,
		EntityTabs,
		ConfirmDialog,
		DetailSummary,
		toast,
		type EntityTab,
		type DetailSummaryItem
	} from '$lib/components';
	import SiteForm from '$lib/features/sites/components/site-form.svelte';

	let { data }: { data: PageData } = $props();

	const tabs: EntityTab[] = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'details', label: 'Details' }
	];
	let activeTab = $state('overview');

	let healthSystemName = $derived(
		data.healthSystems.find((hs: { id: string; name: string }) => hs.id === data.site.health_system_id)
			?.name ?? null
	);

	let summaryItems = $derived<DetailSummaryItem[]>([
		{ label: 'Health system', value: healthSystemName },
		{ label: 'Address', value: data.site.address },
		{ label: 'Office phone', value: data.site.office_phone },
		{ label: 'Contact person', value: data.site.contact_person },
		{ label: 'Contact email', value: data.site.contact_email }
	]);

	let successMessage = $state<string | null>(null);
	async function handleFormSuccess() {
		successMessage = 'Site updated';
		await invalidateAll();
		setTimeout(() => (successMessage = null), 3000);
		activeTab = 'overview';
	}

	let showDelete = $state(false);
	async function confirmDelete() {
		const res = await fetch(`/api/sites/${data.siteId}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = await res.json();
			throw new Error(body.error?.message || body.error || 'Failed to delete site');
		}
		toast.success('Site deleted');
		goto('/locations?tab=sites');
	}
</script>

<svelte:head>
	<title>{data.site.name} | Locations | LIC</title>
</svelte:head>

<div class="container mx-auto max-w-4xl p-6">
	<PageHeader
		title={data.site.name}
		description={healthSystemName ?? undefined}
		breadcrumbs={[{ label: 'Locations', href: '/locations?tab=sites' }, { label: data.site.name }]}
	/>

	<EntityTabs {tabs} bind:active={activeTab} urlParam="tab" />

	{#if activeTab === 'overview'}
		<Card class="p-6">
			<h2 class="mb-4 text-xl font-semibold">Site details</h2>
			<DetailSummary items={summaryItems} onEdit={() => (activeTab = 'details')} />
		</Card>
	{:else if activeTab === 'details'}
		<Card class="p-6">
			<h2 class="mb-4 text-xl font-semibold">Edit site</h2>
			{#if successMessage}
				<div class="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
					{successMessage}
				</div>
			{/if}
			<div class="max-w-xl">
				<SiteForm site={data.site} healthSystems={data.healthSystems} onSuccess={handleFormSuccess} />
			</div>
		</Card>

		<Card class="mt-6 border-red-200 p-6">
			<h2 class="mb-2 text-xl font-semibold text-red-600">Danger zone</h2>
			<div class="flex items-center justify-between">
				<p class="text-sm text-muted-foreground">Deleting a site cannot be undone.</p>
				<Button variant="destructive" onclick={() => (showDelete = true)}>Delete site</Button>
			</div>
		</Card>
	{/if}
</div>

<ConfirmDialog
	bind:open={showDelete}
	title={`Delete ${data.site.name}?`}
	description="This permanently deletes the site. Assignments and availability that reference it may be affected."
	confirmLabel="Delete site"
	onConfirm={confirmDelete}
/>
