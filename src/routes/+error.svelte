<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
</script>

<svelte:head>
	<title>Something went wrong | LIC</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-center">
	<div class="text-6xl">😕</div>
	<h1 class="mt-4 text-3xl font-bold text-gray-900">
		{$page.status}
		{#if $page.status === 404}· Page not found{:else}· Something went wrong{/if}
	</h1>
	<p class="mt-2 max-w-md text-gray-600">
		{$page.error?.message || 'An unexpected error occurred. Please try again.'}
	</p>
	<div class="mt-6 flex gap-3">
		<Button onclick={() => history.back()} variant="outline">Go back</Button>
		<Button onclick={() => (window.location.href = '/dashboard')}>Back to dashboard</Button>
	</div>
</div>
