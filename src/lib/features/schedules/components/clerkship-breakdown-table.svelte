<script lang="ts">
	import type { ScheduleResultsSummary } from '../types/schedule-views';
	import { getClerkshipColor } from '../clients/schedule-views-client';

	interface Props {
		breakdown: ScheduleResultsSummary['clerkshipBreakdown'];
	}

	let { breakdown }: Props = $props();

	const sortedBreakdown = $derived([...breakdown].sort((a, b) => b.totalAssignments - a.totalAssignments));
</script>

<div class="border rounded-lg overflow-hidden">
	<div class="bg-muted/50 px-4 py-3 border-b">
		<h3 class="font-semibold">Clerkship Breakdown</h3>
	</div>

	{#if breakdown.length === 0}
		<div class="p-8 text-center text-muted-foreground">
			No clerkship data available.
		</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/30">
						<th class="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Clerkship</th>
						<th class="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Assignments</th>
						<th class="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Students</th>
						<th class="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Avg Days/Student</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each sortedBreakdown as clerkship}
						{@const color = getClerkshipColor(clerkship.clerkshipName)}
						<tr class="hover:bg-muted/20">
							<td class="px-4 py-2">
								<div class="flex items-center gap-2">
									<span class="w-3 h-3 rounded-full" style="background-color: {color};"></span>
									<span class="font-medium">{clerkship.clerkshipName}</span>
								</div>
							</td>
							<td class="text-right px-4 py-2 font-mono">{clerkship.totalAssignments}</td>
							<td class="text-right px-4 py-2 font-mono">{clerkship.studentsAssigned}</td>
							<td class="text-right px-4 py-2 font-mono">{clerkship.averageDaysPerStudent.toFixed(1)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
