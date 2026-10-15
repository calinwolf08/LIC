<script lang="ts">
	import type { StudentWithUnmetRequirements } from '../types/schedule-views';

	interface Props {
		students: StudentWithUnmetRequirements[];
		onStudentClick?: (studentId: string) => void;
	}

	let { students, onStudentClick }: Props = $props();

	function handleStudentClick(studentId: string) {
		if (onStudentClick) {
			onStudentClick(studentId);
		}
	}
</script>

<div class="overflow-hidden rounded-lg border">
	<div class="border-b bg-muted/50 px-4 py-3">
		<h3 class="font-semibold">Students with Unmet Requirements ({students.length})</h3>
	</div>

	{#if students.length === 0}
		<div class="p-8 text-center">
			<div class="text-lg font-medium text-green-600">All Students Fully Scheduled</div>
			<p class="mt-1 text-sm text-muted-foreground">
				Every student has met all clerkship requirements.
			</p>
		</div>
	{:else}
		<div class="max-h-96 divide-y overflow-y-auto">
			{#each students as student}
				<button
					type="button"
					class="w-full px-4 py-3 text-left transition-colors hover:bg-muted/30"
					onclick={() => handleStudentClick(student.studentId)}
				>
					<div class="flex items-start justify-between">
						<div>
							<p class="font-medium">{student.studentName}</p>
							<div class="mt-1 flex flex-wrap gap-1">
								{#each student.unmetClerkships as clerkship}
									<span
										class="inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200"
									>
										{clerkship.clerkshipName}
										<span class="ml-1 text-red-600 dark:text-red-400">
											(-{clerkship.gap}d)
										</span>
									</span>
								{/each}
							</div>
						</div>
						<div class="text-right">
							<span class="text-lg font-bold text-red-600">{student.totalGap}</span>
							<p class="text-xs text-muted-foreground">days short</p>
						</div>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
