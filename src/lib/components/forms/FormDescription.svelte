<script lang="ts">
	import { cn } from "$lib/utils";

	interface Props {
		children: any;
		class?: string;
	}

	let { children, class: className }: Props = $props();
</script>

<p class={cn("text-sm text-muted-foreground", className)}>
	{@render children()}
</p>
