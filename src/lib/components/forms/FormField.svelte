<script lang="ts">
	import { Label } from "$lib/components/ui/label";
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";

	interface Props {
		label: string;
		name: string;
		error?: string | string[];
		description?: string;
		required?: boolean;
		class?: string;
		children: Snippet;
	}

	let {
		label,
		name,
		error,
		description,
		required = false,
		class: className,
		children
	}: Props = $props();

	const errorId = `${name}-error`;
	const descriptionId = `${name}-description`;
	const errors = $derived(Array.isArray(error) ? error : error ? [error] : []);
	const hasError = $derived(errors.length > 0);
</script>

<div class={cn("space-y-2", className)}>
	<Label for={name} class={cn(hasError && "text-destructive")}>
		{label}
		{#if required}
			<span class="text-destructive" aria-label="required">*</span>
		{/if}
	</Label>

	{@render children()}

	{#if description && !hasError}
		<p id={descriptionId} class="text-sm text-muted-foreground">
			{description}
		</p>
	{/if}

	{#if hasError}
		<div id={errorId} class="space-y-1" role="alert" aria-live="polite">
			{#each errors as errorMsg}
				<p class="text-sm font-medium text-destructive">
					{errorMsg}
				</p>
			{/each}
		</div>
	{/if}
</div>
