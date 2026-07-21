<script lang="ts">
	import { page } from '$app/stores';
	import { PageHeader } from '$lib/components';

	let { children } = $props();

	const subnav = [
		{ href: '/generate', label: 'Run' },
		{ href: '/generate/results', label: 'Results' },
		{ href: '/generate/teams', label: 'Teams' },
		{ href: '/generate/settings', label: 'Settings' }
	];

	let currentPath = $derived($page.url.pathname);
	function isActive(href: string): boolean {
		return href === '/generate' ? currentPath === '/generate' : currentPath.startsWith(href);
	}
</script>

<div class="container mx-auto max-w-6xl py-8">
	<PageHeader
		title="Auto-Generate"
		description="Generate and optimize schedules automatically. Manually locked assignments are always preserved."
	/>

	<div class="mb-6 border-b">
		<nav class="-mb-px flex gap-8">
			{#each subnav as item (item.href)}
				<a
					href={item.href}
					class="border-b-2 px-1 py-3 text-sm font-medium {isActive(item.href)
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:text-foreground'}"
				>
					{item.label}
				</a>
			{/each}
		</nav>
	</div>

	{@render children()}
</div>
