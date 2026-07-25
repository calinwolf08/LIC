<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	export interface DetailSummaryItem {
		label: string;
		value: string | null | undefined;
	}

	interface Props {
		items: DetailSummaryItem[];
		/** Optional "Edit details" affordance (usually switches to the Details tab). */
		onEdit?: () => void;
		editLabel?: string;
		title?: string;
	}

	let { items, onEdit, editLabel = 'Edit details', title }: Props = $props();

	// Only show fields that actually have a value; empty optionals are omitted
	// rather than rendered as a wall of "—".
	let shown = $derived(
		items.filter((i) => i.value !== null && i.value !== undefined && String(i.value).trim() !== '')
	);
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		{#if title}
			<h3 class="text-sm font-medium text-muted-foreground">{title}</h3>
		{:else}
			<span></span>
		{/if}
		{#if onEdit}
			<Button size="sm" variant="outline" onclick={onEdit}>{editLabel}</Button>
		{/if}
	</div>
	{#if shown.length === 0}
		<p class="text-sm text-muted-foreground">No details recorded yet.</p>
	{:else}
		<dl class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{#each shown as item (item.label)}
				<div>
					<dt class="text-xs text-muted-foreground">{item.label}</dt>
					<dd class="text-sm">{item.value}</dd>
				</div>
			{/each}
		</dl>
	{/if}
</div>
