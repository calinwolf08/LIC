<script lang="ts">
	import type { ClerkshipElective } from '$lib/features/scheduling-config/types/elective-types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		open: boolean;
		elective?: ClerkshipElective;
		onConfirm: (elective: ClerkshipElective) => void | Promise<void>;
		onCancel: () => void;
	}

	let { open = $bindable(), elective, onConfirm, onCancel }: Props = $props();

	let isDeleting = $state(false);

	async function handleConfirm() {
		if (!elective) return;

		isDeleting = true;
		try {
			await onConfirm(elective);
		} finally {
			isDeleting = false;
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
		onclick={onCancel}
		role="presentation"
	></div>
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2">
		<Card class="p-6">
			<h3 class="text-lg font-semibold mb-4">Delete Elective</h3>
			<div class="mb-6 text-sm">
				{#if elective}
					<p class="mb-4">
						Are you sure you want to delete <strong>{elective.name}</strong>?
					</p>
					<p class="mb-2">This will remove:</p>
					<ul class="list-disc list-inside space-y-1 ml-4">
						<li>The elective configuration</li>
						<li>All associated site assignments</li>
						<li>All associated preceptor assignments</li>
					</ul>
					<p class="mt-4 text-destructive font-medium">This action cannot be undone.</p>
				{/if}
			</div>
			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={onCancel} disabled={isDeleting}>
					Cancel
				</Button>
				<Button
					onclick={handleConfirm}
					disabled={isDeleting}
					class="bg-destructive hover:bg-destructive/90"
				>
					{isDeleting ? 'Deleting...' : 'Delete'}
				</Button>
			</div>
		</Card>
	</div>
{/if}
