<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';

	interface Props {
		open: boolean;
		scheduleStartDate?: string;
		scheduleEndDate?: string;
		onConfirm?: () => void;
		onCancel?: () => void;
	}

	let { open, scheduleStartDate, scheduleEndDate, onConfirm, onCancel }: Props = $props();

	let startDate = $state('');
	let endDate = $state('');
	let regenerationMode = $state<'full' | 'smart' | 'completion'>('smart');
	let regenerateFromDate = $state('');
	// The minimal-change strategy and per-constraint bypass are not implemented
	// yet (review Phase 2), so their controls are hidden and generation always
	// runs full-reoptimize with no bypassed constraints.
	const strategy = 'full-reoptimize' as const;
	let isRegenerating = $state(false);
	let errors = $state<string[]>([]);
	let successMessage = $state('');

	// Initialize dates
	$effect(() => {
		if (open) {
			const today = new Date();

			// Use schedule dates if provided, otherwise fall back to year boundaries
			if (scheduleStartDate) {
				startDate = scheduleStartDate;
			} else {
				const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
				startDate = formatDateForInput(firstDayOfYear);
			}

			if (scheduleEndDate) {
				endDate = scheduleEndDate;
			} else {
				const lastDayOfYear = new Date(today.getFullYear(), 11, 31);
				endDate = formatDateForInput(lastDayOfYear);
			}

			regenerateFromDate = formatDateForInput(today);

			// Default to smart mode if we're past the start date
			const scheduleStart = new Date(startDate);
			const daysSinceStart = Math.floor(
				(today.getTime() - scheduleStart.getTime()) / (1000 * 60 * 60 * 24)
			);
			regenerationMode = daysSinceStart > 30 ? 'smart' : 'full';

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
			// Only delete if full regeneration mode
			let deletedCount = 0;
			if (regenerationMode === 'full') {
				const deleteResponse = await fetch('/api/schedules', {
					method: 'DELETE'
				});

				if (!deleteResponse.ok) {
					const result = await deleteResponse.json();
					errors = [result.error?.message || 'Failed to clear existing schedules'];
					return;
				}

				const deleteResult = await deleteResponse.json();
				deletedCount = deleteResult.data.deleted_count;
			}

			// Generate with appropriate parameters
			const requestBody: any = {
				startDate,
				endDate
			};

			if (regenerationMode === 'smart') {
				requestBody.regenerateFromDate = regenerateFromDate;
				requestBody.strategy = strategy;
			} else if (regenerationMode === 'completion') {
				requestBody.strategy = 'completion';
			}

			const generateResponse = await fetch('/api/schedules/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			if (!generateResponse.ok) {
				const result = await generateResponse.json();
				errors = [result.error?.message || 'Failed to generate schedule'];
				return;
			}

			const generateResult = await generateResponse.json();
			const data = generateResult.data;

			// Show appropriate success message
			if (regenerationMode === 'completion') {
				const preserved = data.existingAssignmentsPreserved || 0;
				const newGenerated = data.newAssignmentsGenerated || 0;
				const studentsCompleted = data.studentsCompleted || 0;
				successMessage = `Preserved ${preserved} existing assignments. Generated ${newGenerated} new assignments to complete ${studentsCompleted} student${studentsCompleted !== 1 ? 's' : ''}.`;
			} else if (regenerationMode === 'smart') {
				const preserved = data.totalPastAssignments || 0;
				const newAssignments = data.summary.totalAssignments;
				successMessage = `Preserved ${preserved} past assignments. Generated ${newAssignments} new assignments from ${regenerateFromDate}.`;
			} else {
				successMessage = `Successfully cleared ${deletedCount} assignments and generated ${data.summary.totalAssignments} new assignments.`;
			}

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
	<div class="fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2">
		<Card class="p-6">
			<h2 class="mb-4 text-xl font-semibold">Regenerate Schedule</h2>

			<!-- Warning - only show for full mode -->
			{#if regenerationMode === 'full'}
				<div
					class="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
				>
					<p class="font-semibold text-amber-800 dark:text-amber-200">⚠️ Warning</p>
					<p class="mt-1 text-sm text-amber-700 dark:text-amber-300">
						This will <strong>delete all existing assignments</strong> and generate a new schedule from
						scratch. This action cannot be undone.
					</p>
				</div>
			{/if}

			<!-- Mode Selection -->
			<div class="mb-4 space-y-3">
				<Label class="text-base font-semibold">Regeneration Mode</Label>

				<label
					class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
				>
					<input
						type="radio"
						value="full"
						bind:group={regenerationMode}
						disabled={isRegenerating}
						class="mt-1"
					/>
					<div class="flex-1">
						<p class="font-medium">Full Regeneration (Start Over)</p>
						<p class="text-sm text-muted-foreground">
							Delete all assignments and generate completely new schedule
						</p>
						<p class="mt-1 text-xs text-muted-foreground">
							Use when: Major requirement changes or complete restructure needed
						</p>
					</div>
				</label>

				<label
					class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
				>
					<input
						type="radio"
						value="smart"
						bind:group={regenerationMode}
						disabled={isRegenerating}
						class="mt-1"
					/>
					<div class="flex-1">
						<p class="font-medium">Smart Regeneration (Preserve Past)</p>
						<p class="text-sm text-muted-foreground">
							Keep assignments before cutoff date, only regenerate future
						</p>
						<p class="mt-1 text-xs text-muted-foreground">
							Use when: Mid-year adjustments or fixing specific issues
						</p>
					</div>
				</label>

				<label
					class="flex cursor-pointer items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 transition-colors hover:bg-muted/50 dark:border-blue-800 dark:bg-blue-900/10"
				>
					<input
						type="radio"
						value="completion"
						bind:group={regenerationMode}
						disabled={isRegenerating}
						class="mt-1"
					/>
					<div class="flex-1">
						<p class="font-medium">Completion Mode (Fill Gaps Only)</p>
						<p class="text-sm text-muted-foreground">
							Keep ALL existing assignments. Only generate new assignments for students with unmet
							requirements
						</p>
						<p class="mt-1 text-xs text-muted-foreground">
							Use when: Schedule 95% complete but blocked by strict constraints. Selectively relax
							constraints only for gap-filling
						</p>
					</div>
				</label>
			</div>

			<!-- Smart Mode Options -->
			{#if regenerationMode === 'smart'}
				<div class="mb-4 space-y-4 rounded-lg bg-muted/30 p-4">
					<!-- Cutoff Date -->
					<div class="space-y-2">
						<Label for="cutoff_date">Regenerate From Date</Label>
						<input
							id="cutoff_date"
							type="date"
							bind:value={regenerateFromDate}
							disabled={isRegenerating}
							min={startDate}
							max={endDate}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						/>
						<p class="text-xs text-muted-foreground">
							Assignments before this date will be preserved
						</p>
					</div>

					<!-- Strategy selection is hidden until the minimal-change
					     preservation path is implemented (review Phase 2); smart mode
					     always regenerates future dates from the cutoff. -->
				</div>
			{/if}

			<!-- Completion Mode Options -->
			{#if regenerationMode === 'completion'}
				<div
					class="mb-4 space-y-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
				>
					<div
						class="rounded border border-blue-300 bg-blue-100 p-3 dark:border-blue-700 dark:bg-blue-900/30"
					>
						<p class="mb-2 text-sm font-medium text-blue-900 dark:text-blue-100">
							ℹ️ Completion Mode Behavior:
						</p>
						<ul class="list-inside list-disc space-y-1 text-sm text-blue-800 dark:text-blue-200">
							<li>Preserves 100% of existing assignments</li>
							<li>Generates only for students with unmet requirements</li>
							<li>No deletions or modifications to current schedule</li>
						</ul>
					</div>
				</div>
			{/if}

			<!-- Date Range -->
			<div class="mb-4 space-y-4">
				<div class="space-y-2">
					<Label for="start_date">Schedule Start Date</Label>
					<input
						id="start_date"
						type="date"
						bind:value={startDate}
						disabled={isRegenerating}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					/>
				</div>

				<div class="space-y-2">
					<Label for="end_date">Schedule End Date</Label>
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
					<p class="mb-1 font-semibold">Errors:</p>
					<ul class="list-inside list-disc">
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
				<div class="mb-4 rounded bg-muted p-3 text-sm">
					<p>Regenerating schedule...</p>
					<div class="mt-2 h-2 overflow-hidden rounded bg-muted-foreground/20">
						<div class="h-full w-full animate-pulse bg-primary"></div>
					</div>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={onCancel} disabled={isRegenerating}>Cancel</Button>
				<Button
					variant={regenerationMode === 'full' ? 'destructive' : 'default'}
					onclick={handleRegenerate}
					disabled={isRegenerating}
				>
					{isRegenerating ? 'Regenerating...' : 'Apply Regeneration'}
				</Button>
			</div>
		</Card>
	</div>
{/if}
