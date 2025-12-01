<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Sidebar from '$lib/components/navigation/sidebar.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<Sidebar />

	<!-- Main content area with padding for sidebar and responsive spacing -->
	<div class="lg:pl-64 px-4 sm:px-6 lg:px-8">
		{@render children?.()}
	</div>
</div>
