<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Breadcrumb } from './types';

	interface Props {
		title: string;
		description?: string;
		breadcrumbs?: Breadcrumb[];
		actions?: Snippet;
	}

	let { title, description, breadcrumbs = [], actions }: Props = $props();
</script>

<div class="mb-6">
	{#if breadcrumbs.length > 0}
		<nav class="mb-2 flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
			{#each breadcrumbs as crumb, i (i)}
				{#if crumb.href}
					<a href={crumb.href} class="hover:text-foreground hover:underline">{crumb.label}</a>
				{:else}
					<span class="text-foreground">{crumb.label}</span>
				{/if}
				{#if i < breadcrumbs.length - 1}
					<span aria-hidden="true" class="mx-1">/</span>
				{/if}
			{/each}
		</nav>
	{/if}
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{title}</h1>
			{#if description}
				<p class="mt-1 text-muted-foreground">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex shrink-0 items-center gap-2">
				{@render actions()}
			</div>
		{/if}
	</div>
</div>
