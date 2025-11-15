<script lang="ts">
	import type { BlackoutDatesTable } from '$lib/db/types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		open: boolean;
		blackoutDate: BlackoutDatesTable | null;
		onConfirm: (blackoutDate: BlackoutDatesTable) => Promise<void>;
		onCancel: () => void;
	}

	let { open, blackoutDate, onConfirm, onCancel }: Props = $props();

	let isDeleting = $state(false);
	let error = $state<string | null>(null);

	async function handleConfirm() {
		if (!blackoutDate) return;

		isDeleting = true;
		error = null;

		try {
			await onConfirm(blackoutDate);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete blackout date';
		} finally {
			isDeleting = false;
		}
	}
</script>

{#if open && blackoutDate}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 bg-black/50"
		onclick={onCancel}
		role="presentation"
	></div>

	<!-- Dialog -->
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Delete Blackout Date</h2>

			<p class="text-sm text-muted-foreground mb-4">
				Are you sure you want to delete the blackout date "<strong>{blackoutDate.reason}</strong>"
				({blackoutDate.start_date} to {blackoutDate.end_date})? This action cannot be undone.
			</p>

			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					{error}
				</div>
			{/if}

			<div class="flex gap-3 justify-end">
				<Button variant="outline" onclick={onCancel} disabled={isDeleting}>
					Cancel
				</Button>
				<Button variant="destructive" onclick={handleConfirm} disabled={isDeleting}>
					{isDeleting ? 'Deleting...' : 'Delete'}
				</Button>
			</div>
		</Card>
	</div>
{/if}
