<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';

	interface Props {
		open: boolean;
		onConfirm?: () => void;
		onCancel?: () => void;
	}

	let { open, onConfirm, onCancel }: Props = $props();

	let startDate = $state('');
	let endDate = $state('');
	let isRegenerating = $state(false);
	let errors = $state<string[]>([]);
	let successMessage = $state('');

	// Initialize dates
	$effect(() => {
		if (open) {
			const today = new Date();
			const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
			const lastDayOfYear = new Date(today.getFullYear(), 11, 31);
			startDate = formatDateForInput(firstDayOfYear);
			endDate = formatDateForInput(lastDayOfYear);
			errors = [];
			successMessage = '';
		}
	});

	function formatDateForInput(date: Date): string {
		return date.toISOString().split('T')[0];
	}

	async function handleRegenerate() {
		isRegenerating = true;
		errors = [];
		successMessage = '';

		try {
			// Step 1: Clear all existing assignments
			const deleteResponse = await fetch('/api/schedules', {
				method: 'DELETE'
			});

			if (!deleteResponse.ok) {
				const result = await deleteResponse.json();
				errors = [result.error?.message || 'Failed to clear existing schedules'];
				return;
			}

			const deleteResult = await deleteResponse.json();
			const deletedCount = deleteResult.data.deleted_count;

			// Step 2: Generate new schedule
			const generateResponse = await fetch('/api/schedules/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startDate: startDate,
					endDate: endDate
				})
			});

			if (!generateResponse.ok) {
				const result = await generateResponse.json();
				errors = [result.error?.message || 'Failed to generate schedule'];
				return;
			}

			const generateResult = await generateResponse.json();
			const totalAssignments = generateResult.data.summary.totalAssignments;

			successMessage = `Successfully cleared ${deletedCount} assignments and generated ${totalAssignments} new assignments.`;

			// Wait a moment to show success message, then close and refresh
			setTimeout(() => {
				onConfirm?.();
			}, 2000);
		} catch (error) {
			errors = ['An unexpected error occurred'];
		} finally {
			isRegenerating = false;
		}
	}
</script>

{#if open}
	<!-- Backdrop -->
	<div class="fixed inset-0 z-50 bg-black/50" onclick={onCancel} role="presentation"></div>

	<!-- Dialog -->
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2">
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Regenerate Schedule</h2>

			<!-- Warning -->
			<div class="mb-4 rounded-md bg-amber-50 border border-amber-200 p-4">
				<p class="font-semibold text-amber-800">⚠️ Warning</p>
				<p class="text-sm text-amber-700 mt-1">
					This will <strong>delete all existing assignments</strong> and generate a new schedule from scratch.
					This action cannot be undone.
				</p>
			</div>

			<!-- Date Range -->
			<div class="space-y-4 mb-4">
				<div class="space-y-2">
					<Label for="start_date">Start Date</Label>
					<input
						id="start_date"
						type="date"
						bind:value={startDate}
						disabled={isRegenerating}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					/>
				</div>

				<div class="space-y-2">
					<Label for="end_date">End Date</Label>
					<input
						id="end_date"
						type="date"
						bind:value={endDate}
						disabled={isRegenerating}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					/>
				</div>
			</div>

			<!-- Errors -->
			{#if errors.length > 0}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					<p class="font-semibold mb-1">Errors:</p>
					<ul class="list-disc list-inside">
						{#each errors as error}
							<li>{error}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Success Message -->
			{#if successMessage}
				<div class="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
					<p class="font-semibold">✓ Success</p>
					<p class="mt-1">{successMessage}</p>
				</div>
			{/if}

			<!-- Progress -->
			{#if isRegenerating}
				<div class="mb-4 p-3 bg-muted rounded text-sm">
					<p>Regenerating schedule...</p>
					<div class="mt-2 h-2 bg-muted-foreground/20 rounded overflow-hidden">
						<div class="h-full bg-primary animate-pulse w-full"></div>
					</div>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={onCancel} disabled={isRegenerating}>
					Cancel
				</Button>
				<Button variant="destructive" onclick={handleRegenerate} disabled={isRegenerating}>
					{isRegenerating ? 'Regenerating...' : 'Regenerate Schedule'}
				</Button>
			</div>
		</Card>
	</div>
{/if}
