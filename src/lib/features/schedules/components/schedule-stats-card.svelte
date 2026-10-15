<script lang="ts">
	import type { ScheduleResultsSummary } from '../types/schedule-views';

	interface Props {
		stats: ScheduleResultsSummary['stats'];
		isComplete: boolean;
	}

	let { stats, isComplete }: Props = $props();
</script>

<div class="space-y-4 rounded-lg border p-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold">Schedule Overview</h3>
		{#if isComplete}
			<span
				class="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-200"
			>
				Complete
			</span>
		{:else}
			<span
				class="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
			>
				Incomplete
			</span>
		{/if}
	</div>

	<!-- Stats grid -->
	<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
		<div class="rounded-lg bg-muted/50 p-3 text-center">
			<div class="text-2xl font-bold">{stats.totalAssignments}</div>
			<div class="text-xs text-muted-foreground">Total Assignments</div>
		</div>
		<div class="rounded-lg bg-muted/50 p-3 text-center">
			<div class="text-2xl font-bold">{stats.totalStudents}</div>
			<div class="text-xs text-muted-foreground">Students</div>
		</div>
		<div class="rounded-lg bg-muted/50 p-3 text-center">
			<div class="text-2xl font-bold">{stats.totalPreceptors}</div>
			<div class="text-xs text-muted-foreground">Preceptors</div>
		</div>
		<div class="rounded-lg bg-muted/50 p-3 text-center">
			<div class="text-2xl font-bold text-green-600">{stats.studentsFullyScheduled}</div>
			<div class="text-xs text-muted-foreground">Fully Scheduled</div>
		</div>
	</div>

	<!-- Scheduling status breakdown -->
	<div class="border-t pt-2">
		<p class="mb-2 text-xs font-medium text-muted-foreground">Student Status</p>
		<div class="space-y-2">
			<div class="flex items-center justify-between text-sm">
				<span class="flex items-center gap-2">
					<span class="h-3 w-3 rounded-full bg-green-500"></span>
					Fully Scheduled
				</span>
				<span class="font-medium">{stats.studentsFullyScheduled}</span>
			</div>
			<div class="flex items-center justify-between text-sm">
				<span class="flex items-center gap-2">
					<span class="h-3 w-3 rounded-full bg-amber-500"></span>
					Partially Scheduled
				</span>
				<span class="font-medium">{stats.studentsPartiallyScheduled}</span>
			</div>
			<div class="flex items-center justify-between text-sm">
				<span class="flex items-center gap-2">
					<span class="h-3 w-3 rounded-full bg-red-500"></span>
					No Assignments
				</span>
				<span class="font-medium">{stats.studentsWithNoAssignments}</span>
			</div>
		</div>
	</div>
</div>
