<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import PatternAvailabilityBuilder from '$lib/features/preceptors/components/pattern-availability-builder.svelte';

	let { data } = $props();

	function handleSuccess() {
		// Navigate back to preceptors list after saving
		goto('/preceptors');
	}

	function handleCancel() {
		goto('/preceptors');
	}
</script>

<svelte:head>
	<title>Availability - {data.preceptor.name}</title>
</svelte:head>

<div class="container mx-auto py-6 max-w-4xl">
	<!-- Header -->
	<div class="flex items-center justify-between mb-6">
		<div>
			<div class="flex items-center gap-2 text-sm text-muted-foreground mb-1">
				<a href="/preceptors" class="hover:underline">Preceptors</a>
				<span>/</span>
				<span>{data.preceptor.name}</span>
				<span>/</span>
				<span>Availability</span>
			</div>
			<h1 class="text-2xl font-bold">Manage Availability</h1>
		</div>
		<Button variant="outline" onclick={handleCancel}>
			Back to Preceptors
		</Button>
	</div>

	<!-- Pattern Builder -->
	<PatternAvailabilityBuilder
		preceptor={data.preceptor}
		onSuccess={handleSuccess}
		onCancel={handleCancel}
	/>
</div>
