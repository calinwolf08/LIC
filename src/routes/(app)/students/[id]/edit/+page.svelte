<!-- This page redirects to /students/[id] - see +page.ts -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	// Fallback redirect in case the load function redirect doesn't work
	onMount(() => {
		goto(`/students/${$page.params.id}`);
	});
</script>

<div class="container mx-auto py-8 text-center">
	<p class="text-muted-foreground">Redirecting...</p>
</div>
