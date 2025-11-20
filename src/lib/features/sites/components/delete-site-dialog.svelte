<script lang="ts">
	import type { Sites } from '$lib/db/types';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';

	interface Props {
		site: Sites;
		open: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { site, open, onConfirm, onCancel }: Props = $props();
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
		<Card class="w-full max-w-md p-6">
			<h2 class="text-xl font-bold mb-4">Delete Site</h2>
			<p class="text-sm text-muted-foreground mb-6">
				Are you sure you want to delete <strong>{site.name}</strong>? This action cannot be undone.
			</p>
			<p class="text-sm text-muted-foreground mb-6">
				This site cannot be deleted if it has clerkships, preceptors, or scheduling data associated
				with it.
			</p>
			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={onCancel}>Cancel</Button>
				<Button variant="destructive" onclick={onConfirm}>Delete</Button>
			</div>
		</Card>
	</div>
{/if}
