<script lang="ts">
	import type { StudentSchedule } from '../types/schedule-views';

	interface Props {
		summary: StudentSchedule['summary'];
	}

	let { summary }: Props = $props();

	const progressPercent = $derived(Math.min(100, summary.overallPercentComplete));
</script>

<div class="border rounded-lg p-4 space-y-4">
	<h3 class="font-semibold text-lg">Requirements Progress</h3>

	<!-- Overall progress bar -->
	<div class="space-y-2">
		<div class="flex justify-between text-sm">
			<span>Overall Completion</span>
			<span class="font-medium {summary.overallPercentComplete >= 100 ? 'text-green-600' : 'text-amber-600'}">
				{summary.overallPercentComplete}%
			</span>
		</div>
		<div class="h-3 bg-muted rounded-full overflow-hidden">
			<div
				class="h-full rounded-full transition-all duration-300 {summary.overallPercentComplete >= 100
					? 'bg-green-600'
					: 'bg-amber-500'}"
				style="width: {progressPercent}%;"
			></div>
		</div>
	</div>

	<!-- Stats grid -->
	<div class="grid grid-cols-2 gap-4 pt-2">
		<div class="text-center p-3 bg-muted/50 rounded-lg">
			<div class="text-2xl font-bold">{summary.totalAssignedDays}</div>
			<div class="text-xs text-muted-foreground">Days Assigned</div>
		</div>
		<div class="text-center p-3 bg-muted/50 rounded-lg">
			<div class="text-2xl font-bold">{summary.totalRequiredDays}</div>
			<div class="text-xs text-muted-foreground">Days Required</div>
		</div>
		<div class="text-center p-3 bg-muted/50 rounded-lg">
			<div class="text-2xl font-bold text-green-600">{summary.clerkshipsComplete}</div>
			<div class="text-xs text-muted-foreground">Clerkships Complete</div>
		</div>
		<div class="text-center p-3 bg-muted/50 rounded-lg">
			<div class="text-2xl font-bold">{summary.clerkshipsTotal}</div>
			<div class="text-xs text-muted-foreground">Total Clerkships</div>
		</div>
	</div>

	{#if summary.clerkshipsWithNoAssignments > 0}
		<div class="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
			<p class="text-sm text-amber-800 dark:text-amber-200">
				<span class="font-medium">{summary.clerkshipsWithNoAssignments}</span> clerkship(s) have no
				assignments yet
			</p>
		</div>
	{/if}
</div>
