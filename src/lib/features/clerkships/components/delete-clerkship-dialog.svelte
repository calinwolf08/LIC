<script lang="ts">
	import type { Clerkships } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		open: boolean;
		clerkship: Clerkships | null;
		onConfirm: (clerkship: Clerkships) => Promise<void>;
		onCancel: () => void;
	}

	let { open, clerkship, onConfirm, onCancel }: Props = $props();

	let isDeleting = $state(false);
	let error = $state<string | null>(null);

	async function handleConfirm() {
		if (!clerkship) return;

		isDeleting = true;
		error = null;

		try {
			await onConfirm(clerkship);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete clerkship';
		} finally {
			isDeleting = false;
		}
	}
</script>

{#if open && clerkship}
	<!-- Backdrop -->
	<div class="fixed inset-0 z-50 bg-black/50" onclick={onCancel} role="presentation"></div>

	<!-- Dialog -->
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Delete Clerkship</h2>

			<p class="text-sm text-muted-foreground mb-4">
				Are you sure you want to delete <strong>{clerkship.name}</strong>? This action cannot be
				undone.
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
