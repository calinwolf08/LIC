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

	<!-- Main content area with left padding for sidebar -->
	<div class="lg:pl-64">
		{@render children?.()}
	</div>
</div>
