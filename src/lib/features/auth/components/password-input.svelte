<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { Eye, EyeOff } from "lucide-svelte";
	import type { HTMLInputAttributes } from "svelte/elements";

	let {
		value = $bindable(""),
		...restProps
	}: HTMLInputAttributes & { value?: string } = $props();

	let showPassword = $state(false);

	function togglePasswordVisibility() {
		showPassword = !showPassword;
	}
</script>

<div class="relative">
	<Input
		type={showPassword ? "text" : "password"}
		bind:value
		{...restProps}
		class="pr-10"
	/>
	<Button
		type="button"
		variant="ghost"
		size="icon-sm"
		class="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
		onclick={togglePasswordVisibility}
		aria-label={showPassword ? "Hide password" : "Show password"}
	>
		{#if showPassword}
			<EyeOff class="size-4 text-muted-foreground" />
		{:else}
			<Eye class="size-4 text-muted-foreground" />
		{/if}
	</Button>
</div>
