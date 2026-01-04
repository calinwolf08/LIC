<script lang="ts">
	import { goto } from '$app/navigation';
	import { SiteForm } from '$lib/features/sites/components';
	import SharedEntityWarning from '$lib/components/shared-entity-warning.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function handleSuccess() {
		goto('/sites');
	}

	function handleCancel() {
		goto('/sites');
	}
</script>

<div class="container mx-auto py-8 max-w-2xl">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Edit Site</h1>
		<p class="text-muted-foreground mt-1">Update site information</p>
	</div>

	<SharedEntityWarning
		entityType="sites"
		entityId={data.site.id ?? ''}
		entityName={data.site.name}
	/>

	<SiteForm
		site={data.site}
		healthSystems={data.healthSystems}
		onSuccess={handleSuccess}
		onCancel={handleCancel}
	/>
</div>
