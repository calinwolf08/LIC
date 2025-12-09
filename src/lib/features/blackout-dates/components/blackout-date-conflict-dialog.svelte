<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

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
		open: boolean;
		date: string;
		conflicts: ConflictInfo | null;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { open, date, conflicts, onConfirm, onCancel }: Props = $props();

	// Format date for display
	function formatDate(dateStr: string): string {
		if (!dateStr) return '';
		const d = new Date(dateStr + 'T00:00:00Z');
		return d.toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}
</script>

{#if open && conflicts}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 bg-black/50"
		onclick={onCancel}
		role="presentation"
	></div>

	<!-- Dialog -->
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2">
		<Card class="p-6">
			<h3 class="text-lg font-semibold mb-2 text-amber-600">Scheduling Conflict</h3>

			<p class="text-muted-foreground mb-4">
				There {conflicts.count === 1 ? 'is' : 'are'} <strong>{conflicts.count}</strong> existing
				assignment{conflicts.count === 1 ? '' : 's'} on <strong>{formatDate(date)}</strong>.
			</p>

			<p class="text-sm mb-4">
				Adding this blackout date will delete these assignments. The affected students may need to be rescheduled.
			</p>

			<!-- Affected Assignments -->
			<div class="border rounded-md mb-4 max-h-48 overflow-y-auto">
				<table class="w-full text-sm">
					<thead class="bg-muted/50 sticky top-0">
						<tr>
							<th class="px-3 py-2 text-left font-medium">Student</th>
							<th class="px-3 py-2 text-left font-medium">Clerkship</th>
							<th class="px-3 py-2 text-left font-medium">Preceptor</th>
						</tr>
					</thead>
					<tbody>
						{#each conflicts.assignments as assignment}
							<tr class="border-t">
								<td class="px-3 py-2">{assignment.studentName}</td>
								<td class="px-3 py-2">{assignment.clerkshipName}</td>
								<td class="px-3 py-2">{assignment.preceptorName}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 mb-4">
				<strong>Warning:</strong> This action cannot be undone. Consider rescheduling affected students
				after adding the blackout date.
			</div>

			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={onCancel}>
					Cancel
				</Button>
				<Button variant="destructive" onclick={onConfirm}>
					Delete Assignments & Add Blackout Date
				</Button>
			</div>
		</Card>
	</div>
{/if}
