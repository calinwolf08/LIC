<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Emoji or short icon string. */
		icon?: string;
		title: string;
		description?: string;
		/** Optional action(s), e.g. an "Add" button. */
		action?: Snippet;
	}

	let { icon, title, description, action }: Props = $props();
</script>

<div
	class="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center"
>
	{#if icon}
		<div class="mb-3 text-4xl" aria-hidden="true">{icon}</div>
	{/if}
	<h3 class="text-lg font-semibold">{title}</h3>
	{#if description}
		<p class="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
	{/if}
	{#if action}
		<div class="mt-4">{@render action()}</div>
	{/if}
</div>
