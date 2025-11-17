<script lang="ts">
	import type { Preceptors } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		open: boolean;
		preceptor: Preceptors | null;
		onConfirm: (preceptor: Preceptors) => Promise<void>;
		onCancel: () => void;
	}

	let { open, preceptor, onConfirm, onCancel }: Props = $props();

	let isDeleting = $state(false);
	let error = $state<string | null>(null);

	async function handleConfirm() {
		if (!preceptor) return;

		isDeleting = true;
		error = null;

		try {
			await onConfirm(preceptor);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete preceptor';
		} finally {
			isDeleting = false;
		}
	}
</script>

{#if open && preceptor}
	<!-- Backdrop -->
	<div class="fixed inset-0 z-50 bg-black/50" onclick={onCancel} role="presentation"></div>

	<!-- Dialog -->
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Delete Preceptor</h2>

			<p class="text-sm text-muted-foreground mb-4">
				Are you sure you want to delete <strong>{preceptor.name}</strong>? This action cannot be
				undone and will also delete all availability records.
			</p>

			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					{error}
				</div>
			{/if}

			<div class="flex gap-3 justify-end">
				<Button variant="outline" onclick={onCancel} disabled={isDeleting}> Cancel </Button>
				<Button variant="destructive" onclick={handleConfirm} disabled={isDeleting}>
					{isDeleting ? 'Deleting...' : 'Delete'}
				</Button>
			</div>
		</Card>
	</div>
{/if}
