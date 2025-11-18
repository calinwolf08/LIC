<script lang="ts">
	import { cn } from "$lib/utils";

	interface Props {
		errors?: string | string[];
		class?: string;
	}

	let { errors, class: className }: Props = $props();

	const errorArray = $derived(
		Array.isArray(errors) ? errors : errors ? [errors] : []
	);
	const hasErrors = $derived(errorArray.length > 0);
</script>

{#if hasErrors}
	<div class={cn("space-y-1", className)} role="alert" aria-live="polite">
		{#each errorArray as error}
			<p class="text-sm font-medium text-destructive">
				{error}
			</p>
		{/each}
	</div>
{/if}
