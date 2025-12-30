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
	let regenerationMode = $state<'full' | 'smart' | 'completion'>('smart');
	let regenerateFromDate = $state('');
	let strategy = $state<'minimal-change' | 'full-reoptimize'>('minimal-change');
	let bypassedConstraints = $state<string[]>([]);
	let isRegenerating = $state(false);
	let errors = $state<string[]>([]);
	let successMessage = $state('');

	const availableConstraints = [
		{ name: 'preceptor-capacity', label: 'Preceptor Capacity (allow exceeding max)' },
		{ name: 'site-capacity', label: 'Site Capacity (allow exceeding max)' },
		{ name: 'specialty-match', label: 'Specialty Matching (allow mismatches)' },
		{ name: 'health-system-continuity', label: 'Health System Continuity (allow switches)' },
		{ name: 'no-double-booking', label: 'Double Booking (allow same-day assignments)' }
	];

	// Initialize dates
	$effect(() => {
		if (open) {
			const today = new Date();
			const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
			const lastDayOfYear = new Date(today.getFullYear(), 11, 31);

			startDate = formatDateForInput(firstDayOfYear);
			endDate = formatDateForInput(lastDayOfYear);
			regenerateFromDate = formatDateForInput(today);

			// Default to smart mode if mid-year
			const dayOfYear = Math.floor((today.getTime() - firstDayOfYear.getTime()) / (1000 * 60 * 60 * 24));
			regenerationMode = dayOfYear > 30 ? 'smart' : 'full';

			strategy = 'minimal-change';
			bypassedConstraints = [];
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
				requestBody.bypassedConstraints = bypassedConstraints;
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
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2">
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Regenerate Schedule</h2>

			<!-- Warning - only show for full mode -->
			{#if regenerationMode === 'full'}
				<div class="mb-4 rounded-md bg-amber-50 border border-amber-200 p-4 dark:bg-amber-900/20 dark:border-amber-800">
					<p class="font-semibold text-amber-800 dark:text-amber-200">⚠️ Warning</p>
					<p class="text-sm text-amber-700 dark:text-amber-300 mt-1">
						This will <strong>delete all existing assignments</strong> and generate a new schedule
						from scratch. This action cannot be undone.
					</p>
				</div>
			{/if}

			<!-- Mode Selection -->
			<div class="space-y-3 mb-4">
				<Label class="text-base font-semibold">Regeneration Mode</Label>

				<label
					class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
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
						<p class="text-xs text-muted-foreground mt-1">
							Use when: Major requirement changes or complete restructure needed
						</p>
					</div>
				</label>

				<label
					class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
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
						<p class="text-xs text-muted-foreground mt-1">
							Use when: Mid-year adjustments or fixing specific issues
						</p>
					</div>
				</label>

				<label
					class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800"
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
						<p class="text-xs text-muted-foreground mt-1">
							Use when: Schedule 95% complete but blocked by strict constraints. Selectively
							relax constraints only for gap-filling
						</p>
					</div>
				</label>
			</div>

			<!-- Smart Mode Options -->
			{#if regenerationMode === 'smart'}
				<div class="space-y-4 mb-4 p-4 bg-muted/30 rounded-lg">
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

					<!-- Strategy Selection -->
					<div class="space-y-2">
						<Label class="text-sm font-semibold">Strategy</Label>

						<label class="flex items-start gap-2 cursor-pointer">
							<input
								type="radio"
								value="minimal-change"
								bind:group={strategy}
								disabled={isRegenerating}
								class="mt-1"
							/>
							<div>
								<p class="text-sm font-medium">Minimal Change</p>
								<p class="text-xs text-muted-foreground">
									Try to keep as many future assignments as possible
								</p>
							</div>
						</label>

						<label class="flex items-start gap-2 cursor-pointer">
							<input
								type="radio"
								value="full-reoptimize"
								bind:group={strategy}
								disabled={isRegenerating}
								class="mt-1"
							/>
							<div>
								<p class="text-sm font-medium">Full Reoptimize</p>
								<p class="text-xs text-muted-foreground">
									Find completely new optimal solution for future dates
								</p>
							</div>
						</label>
					</div>
				</div>
			{/if}

			<!-- Completion Mode Options -->
			{#if regenerationMode === 'completion'}
				<div class="space-y-4 mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
					<h4 class="font-semibold text-blue-900 dark:text-blue-100">
						Constraints to Relax (for new assignments only)
					</h4>
					<p class="text-sm text-muted-foreground">
						Select which constraints to bypass when filling gaps. These relaxed rules will ONLY
						apply to newly generated assignments, not existing ones.
					</p>

					<div class="space-y-2">
						{#each availableConstraints as constraint}
							<label class="flex items-start gap-2 py-1 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30 px-2 rounded transition-colors">
								<input
									type="checkbox"
									value={constraint.name}
									bind:group={bypassedConstraints}
									disabled={isRegenerating}
									class="mt-0.5"
								/>
								<span class="text-sm">{constraint.label}</span>
							</label>
						{/each}
					</div>

					<div class="bg-blue-100 dark:bg-blue-900/30 p-3 rounded border border-blue-300 dark:border-blue-700">
						<p class="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
							ℹ️ Completion Mode Behavior:
						</p>
						<ul class="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
							<li>Preserves 100% of existing assignments</li>
							<li>Generates only for students with unmet requirements</li>
							<li>Relaxed constraints apply ONLY to new assignments</li>
							<li>No deletions or modifications to current schedule</li>
						</ul>
					</div>
				</div>
			{/if}

			<!-- Date Range -->
			<div class="space-y-4 mb-4">
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
