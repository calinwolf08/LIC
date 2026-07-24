<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		destructive?: boolean;
		/** When true, the confirm button is disabled (e.g. blocked by dependencies). */
		confirmDisabled?: boolean;
		/** Extra content (e.g. a dependency list) rendered above the buttons. */
		details?: Snippet;
		onConfirm: () => void | Promise<void>;
		onCancel?: () => void;
	}

	let {
		open = $bindable(),
		title,
		description,
		confirmLabel = 'Delete',
		cancelLabel = 'Cancel',
		destructive = true,
		confirmDisabled = false,
		details,
		onConfirm,
		onCancel
	}: Props = $props();

	let pending = $state(false);
	let error = $state<string | null>(null);

	async function handleConfirm() {
		pending = true;
		error = null;
		try {
			await onConfirm();
			open = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong';
		} finally {
			pending = false;
		}
	}

	function handleOpenChange(next: boolean) {
		if (!next && !pending) {
			open = false;
			error = null;
			onCancel?.();
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			{#if description}
				<Dialog.Description>{description}</Dialog.Description>
			{/if}
		</Dialog.Header>

		{#if details}
			<div class="text-sm">{@render details()}</div>
		{/if}

		{#if error}
			<div
				class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
			>
				{error}
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => handleOpenChange(false)} disabled={pending}>
				{cancelLabel}
			</Button>
			<Button
				variant={destructive ? 'destructive' : 'default'}
				onclick={handleConfirm}
				disabled={pending || confirmDisabled}
			>
				{pending ? 'Working…' : confirmLabel}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
