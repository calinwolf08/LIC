<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import BlackoutDateConflictDialog from './blackout-date-conflict-dialog.svelte';

	interface BlackoutDate {
		id: string;
		date: string;
		reason: string | null;
		created_at: string;
	}

	interface ConflictInfo {
		hasConflicts: boolean;
		count: number;
		assignments: Array<{
			id: string | null;
			studentId: string;
			studentName: string;
			preceptorId: string;
			preceptorName: string;
			clerkshipId: string;
			clerkshipName: string;
		}>;
	}

	interface Props {
		blackoutDates: BlackoutDate[];
		onAdd?: () => void;
		onDelete?: () => void;
	}

	let { blackoutDates = [], onAdd, onDelete }: Props = $props();

	// Form state
	let newDate = $state('');
	let newReason = $state('');
	let isAdding = $state(false);
	let addError = $state<string | null>(null);

	// Conflict dialog state
	let showConflictDialog = $state(false);
	let conflictInfo = $state<ConflictInfo | null>(null);
	let pendingDate = $state('');
	let pendingReason = $state('');

	// Delete state
	let deletingId = $state<string | null>(null);

	// Format date for display
	function formatDate(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00Z');
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	// Check for conflicts before adding
	async function checkConflicts(): Promise<ConflictInfo | null> {
		try {
			const response = await fetch('/api/blackout-dates/conflicts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ date: newDate })
			});

			if (!response.ok) {
				throw new Error('Failed to check conflicts');
			}

			const result = await response.json();
			return result.data;
		} catch (error) {
			console.error('Error checking conflicts:', error);
			return null;
		}
	}

	// Add blackout date (after optional conflict confirmation)
	async function addBlackoutDate(deleteConflicts: boolean = false) {
		isAdding = true;
		addError = null;

		try {
			// If we need to delete conflicts first
			if (deleteConflicts && conflictInfo?.assignments) {
				for (const assignment of conflictInfo.assignments) {
					if (assignment.id) {
						await fetch(`/api/schedules/assignments/${assignment.id}`, {
							method: 'DELETE'
						});
					}
				}
			}

			// Create the blackout date
			const response = await fetch('/api/blackout-dates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					date: pendingDate || newDate,
					reason: (pendingReason || newReason).trim() || undefined
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error?.message || 'Failed to add blackout date');
			}

			// Reset form
			newDate = '';
			newReason = '';
			pendingDate = '';
			pendingReason = '';
			showConflictDialog = false;
			conflictInfo = null;

			// Notify parent
			onAdd?.();
		} catch (error) {
			addError = error instanceof Error ? error.message : 'An error occurred';
		} finally {
			isAdding = false;
		}
	}

	// Handle form submit
	async function handleSubmit() {
		if (!newDate) return;

		addError = null;
		isAdding = true;

		// Check for conflicts first
		const conflicts = await checkConflicts();

		if (conflicts?.hasConflicts) {
			// Store pending values and show dialog
			pendingDate = newDate;
			pendingReason = newReason;
			conflictInfo = conflicts;
			showConflictDialog = true;
			isAdding = false;
		} else {
			// No conflicts, add directly
			pendingDate = newDate;
			pendingReason = newReason;
			await addBlackoutDate(false);
		}
	}

	// Handle conflict dialog confirm
	async function handleConflictConfirm() {
		await addBlackoutDate(true);
	}

	// Handle conflict dialog cancel
	function handleConflictCancel() {
		showConflictDialog = false;
		conflictInfo = null;
		pendingDate = '';
		pendingReason = '';
	}

	// Delete blackout date
	async function handleDelete(id: string) {
		deletingId = id;

		try {
			const response = await fetch(`/api/blackout-dates/${id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error?.message || 'Failed to delete blackout date');
			}

			// Notify parent
			onDelete?.();
		} catch (error) {
			console.error('Error deleting blackout date:', error);
			alert(error instanceof Error ? error.message : 'Failed to delete blackout date');
		} finally {
			deletingId = null;
		}
	}
</script>

<Card class="p-4">
	<h3 class="font-semibold mb-4">Blackout Dates</h3>
	<p class="text-sm text-muted-foreground mb-4">
		Days when no scheduling can occur. Existing assignments on these dates will need to be rescheduled.
	</p>

	<!-- Add Form -->
	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-3 mb-4">
		<div class="flex gap-2">
			<div class="flex-1">
				<Label for="blackout-date" class="sr-only">Date</Label>
				<Input
					id="blackout-date"
					type="date"
					bind:value={newDate}
					placeholder="Select date"
					disabled={isAdding}
				/>
			</div>
			<Button type="submit" size="sm" disabled={!newDate || isAdding}>
				{isAdding ? 'Adding...' : 'Add'}
			</Button>
		</div>
		<div>
			<Label for="blackout-reason" class="sr-only">Reason (optional)</Label>
			<Input
				id="blackout-reason"
				type="text"
				bind:value={newReason}
				placeholder="Reason (optional)"
				disabled={isAdding}
			/>
		</div>
		{#if addError}
			<p class="text-sm text-destructive">{addError}</p>
		{/if}
	</form>

	<!-- Blackout Dates List -->
	{#if blackoutDates.length === 0}
		<p class="text-sm text-muted-foreground text-center py-4">
			No blackout dates configured.
		</p>
	{:else}
		<div class="space-y-2 max-h-64 overflow-y-auto">
			{#each blackoutDates as bd}
				<div
					class="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
				>
					<div class="flex-1">
						<div class="font-medium text-sm">{formatDate(bd.date)}</div>
						{#if bd.reason}
							<div class="text-xs text-muted-foreground">{bd.reason}</div>
						{/if}
					</div>
					<Button
						size="sm"
						variant="ghost"
						class="text-destructive hover:text-destructive"
						onclick={() => handleDelete(bd.id)}
						disabled={deletingId === bd.id}
					>
						{deletingId === bd.id ? '...' : '×'}
					</Button>
				</div>
			{/each}
		</div>
	{/if}
</Card>

<!-- Conflict Dialog -->
<BlackoutDateConflictDialog
	open={showConflictDialog}
	date={pendingDate}
	conflicts={conflictInfo}
	onConfirm={handleConflictConfirm}
	onCancel={handleConflictCancel}
/>
