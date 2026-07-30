<script lang="ts">
	/**
	 * Colour → student legend for the schedule-wide calendar (step 40).
	 *
	 * The calendar colours cells by student and the palette repeats past ~14
	 * students, so a legend (plus the initials chip on each cell) makes identity
	 * legible without relying on hue alone. Lists only the students passed in —
	 * the caller supplies those present in the visible range. Collapses behind a
	 * disclosure once it gets long.
	 */
	import { getStudentColor, getStudentInitials } from '../utils/entity-colors';

	interface LegendStudent {
		id: string;
		name: string;
	}

	interface Props {
		students: LegendStudent[];
		/** Show a "show all" toggle past this many. */
		collapseAfter?: number;
	}

	let { students, collapseAfter = 8 }: Props = $props();

	let expanded = $state(false);

	// Stable order by name so the legend does not reshuffle between renders.
	let sorted = $derived([...students].sort((a, b) => a.name.localeCompare(b.name)));
	let visible = $derived(expanded ? sorted : sorted.slice(0, collapseAfter));
	let hiddenCount = $derived(Math.max(0, sorted.length - collapseAfter));
</script>

{#if sorted.length > 0}
	<div class="mb-4 rounded-lg border p-3" data-testid="calendar-legend">
		<div class="mb-2 flex items-center justify-between">
			<h3 class="text-sm font-medium">Students in view</h3>
			{#if hiddenCount > 0}
				<button
					type="button"
					class="text-xs text-primary hover:underline"
					onclick={() => (expanded = !expanded)}
				>
					{expanded ? 'Show fewer' : `Show all ${sorted.length}`}
				</button>
			{/if}
		</div>
		<ul class="flex flex-wrap gap-x-4 gap-y-1.5">
			{#each visible as student (student.id)}
				{@const color = getStudentColor(student.id)}
				<li class="flex items-center gap-1.5 text-xs" data-testid="legend-entry" data-student-id={student.id}>
					<span
						class="flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-[9px] font-semibold text-white"
						style="background-color: {color};"
						data-testid="legend-swatch"
						data-color={color}
						aria-hidden="true"
					>
						{getStudentInitials(student.name)}
					</span>
					<span class="text-foreground">{student.name}</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}
