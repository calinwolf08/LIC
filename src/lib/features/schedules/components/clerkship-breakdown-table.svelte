<script lang="ts">
	import type { ScheduleResultsSummary } from '../types/schedule-views';
	import { getClerkshipColor } from '../clients/schedule-views-client';

	interface Props {
		breakdown: ScheduleResultsSummary['clerkshipBreakdown'];
	}

	let { breakdown }: Props = $props();

	const sortedBreakdown = $derived(
		[...breakdown].sort((a, b) => b.totalAssignments - a.totalAssignments)
	);
</script>

<div class="overflow-hidden rounded-lg border">
	<div class="border-b bg-muted/50 px-4 py-3">
		<h3 class="font-semibold">Clerkship Breakdown</h3>
	</div>

	{#if breakdown.length === 0}
		<div class="p-8 text-center text-muted-foreground">No clerkship data available.</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/30">
						<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Clerkship</th>
						<th class="px-4 py-2 text-right text-xs font-medium text-muted-foreground"
							>Assignments</th
						>
						<th class="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Students</th>
						<th class="px-4 py-2 text-right text-xs font-medium text-muted-foreground"
							>Avg Days/Student</th
						>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each sortedBreakdown as clerkship}
						{@const color = getClerkshipColor(clerkship.clerkshipName)}
						<tr class="hover:bg-muted/20">
							<td class="px-4 py-2">
								<div class="flex items-center gap-2">
									<span class="h-3 w-3 rounded-full" style="background-color: {color};"></span>
									<span class="font-medium">{clerkship.clerkshipName}</span>
								</div>
							</td>
							<td class="px-4 py-2 text-right font-mono">{clerkship.totalAssignments}</td>
							<td class="px-4 py-2 text-right font-mono">{clerkship.studentsAssigned}</td>
							<td class="px-4 py-2 text-right font-mono"
								>{clerkship.averageDaysPerStudent.toFixed(1)}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
