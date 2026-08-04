<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { PageHeader, EntityTabs, ConfirmDialog, NoActiveSchedule, toast, type EntityTab } from '$lib/components';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import HealthSystemTable from '$lib/features/health-systems/components/health-system-table.svelte';
	import HealthSystemForm from '$lib/features/health-systems/components/health-system-form.svelte';
	import { SiteList } from '$lib/features/sites/components';
	import SiteForm from '$lib/features/sites/components/site-form.svelte';

	let { data }: { data: PageData } = $props();

	// Health systems as {id, name} for the site form dropdown.
	let healthSystemOptions = $derived(
		data.healthSystems
			.filter((hs): hs is typeof hs & { id: string } => hs.id !== null)
			.map((hs) => ({ id: hs.id, name: hs.name }))
	);

	const tabs: EntityTab[] = [
		{ id: 'health-systems', label: 'Health systems' },
		{ id: 'sites', label: 'Sites' }
	];
	let activeTab = $state($page.url.searchParams.get('tab') === 'sites' ? 'sites' : 'health-systems');

	// ---- Health system dialogs (create only; editing lives on the detail page) ----
	let showHsForm = $state(false);
	let showHsDelete = $state(false);
	let hsDeleteTarget = $state<{ id: string; name: string } | null>(null);
	let hsDependencyNote = $state<string | null>(null);

	function addHealthSystem() {
		showHsForm = true;
	}
	async function hsFormSuccess() {
		showHsForm = false;
		await invalidateAll();
	}
	async function requestHsDelete(hs: { id: string | null; name: string }) {
		if (!hs.id) return;
		hsDependencyNote = null;
		try {
			const res = await fetch(`/api/health-systems/${hs.id}/dependencies`);
			const result = await res.json();
			if (result.success && result.data?.total > 0) {
				const parts: string[] = [];
				if (result.data.sites > 0) parts.push(`${result.data.sites} site(s)`);
				if (result.data.preceptors > 0) parts.push(`${result.data.preceptors} preceptor(s)`);
				hsDependencyNote = `${parts.join(', ')} depend on this health system. Remove them first.`;
			}
		} catch (e) {
			console.error(e);
		}
		hsDeleteTarget = { id: hs.id, name: hs.name };
		showHsDelete = true;
	}
	async function confirmHsDelete() {
		if (!hsDeleteTarget || hsDependencyNote) return;
		const res = await fetch(`/api/health-systems/${hsDeleteTarget.id}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = await res.json();
			throw new Error(body.error || 'Failed to delete health system');
		}
		toast.success('Health system deleted');
		await invalidateAll();
	}

	// ---- Site dialogs (create only; editing lives on the detail page) ----
	let showSiteForm = $state(false);

	function addSite() {
		showSiteForm = true;
	}
	async function siteFormSuccess() {
		showSiteForm = false;
		await invalidateAll();
	}
	async function deleteSite(site: { id: string | null }) {
		if (!site.id) return;
		const res = await fetch(`/api/sites/${site.id}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = await res.json();
			toast.error(body.error || 'Failed to delete site');
			return;
		}
		toast.success('Site deleted');
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>Locations | LIC</title>
</svelte:head>

<div class="container mx-auto py-8">
	<PageHeader
		title="Locations"
		description="Clinical locations where students rotate. Each site is its own location and belongs to a health system."
	>
		{#snippet actions()}
			{#if data.hasActiveSchedule}
				{#if activeTab === 'health-systems'}
					<Button onclick={addHealthSystem}>Add health system</Button>
				{:else}
					<Button onclick={addSite}>Add site</Button>
				{/if}
			{/if}
		{/snippet}
	</PageHeader>

	{#if !data.hasActiveSchedule}
		<NoActiveSchedule surface="locations" />
	{:else}
		<EntityTabs {tabs} bind:active={activeTab} urlParam="tab" />

		{#if activeTab === 'health-systems'}
			<HealthSystemTable healthSystems={data.healthSystems} onDelete={requestHsDelete} />
		{:else}
			<SiteList sites={data.sites} onDelete={deleteSite} />
		{/if}
	{/if}
</div>

<!-- Health system create dialog -->
<Dialog.Root bind:open={showHsForm}>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Add health system</Dialog.Title>
		</Dialog.Header>
		<HealthSystemForm onSuccess={hsFormSuccess} onCancel={() => (showHsForm = false)} />
	</Dialog.Content>
</Dialog.Root>

<!-- Health system delete -->
<ConfirmDialog
	bind:open={showHsDelete}
	title={`Delete ${hsDeleteTarget?.name ?? 'health system'}?`}
	description={hsDependencyNote ? 'This health system cannot be deleted yet.' : 'This action cannot be undone.'}
	confirmLabel="Delete"
	confirmDisabled={!!hsDependencyNote}
	onConfirm={confirmHsDelete}
>
	{#snippet details()}
		{#if hsDependencyNote}
			<p class="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800">{hsDependencyNote}</p>
		{/if}
	{/snippet}
</ConfirmDialog>

<!-- Site create dialog -->
<Dialog.Root bind:open={showSiteForm}>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Add site</Dialog.Title>
		</Dialog.Header>
		<SiteForm
			healthSystems={healthSystemOptions}
			onSuccess={siteFormSuccess}
			onCancel={() => (showSiteForm = false)}
		/>
	</Dialog.Content>
</Dialog.Root>
