<script lang="ts">
	/**
	 * Block/grid view (J3): rows = students, columns = dates. A student's assigned
	 * days show as highlighted cells, so a contiguous block reads as a run of
	 * adjacent coloured cells. Display-only — clicking a filled cell opens it.
	 */
	interface GridCell {
		id: string;
		color: string;
		label: string;
	}
	interface Props {
		students: Array<{ id: string; name: string }>;
		/** Ordered YYYY-MM-DD columns. */
		dates: string[];
		/** `${studentId}:${date}` -> cell, when the student has an assignment that day. */
		cells: Map<string, GridCell>;
		onCellClick?: (assignmentId: string) => void;
	}
	let { students, dates, cells, onCellClick }: Props = $props();

	function dayNum(date: string): string {
		return String(Number(date.slice(8, 10)));
	}
	function isWeekend(date: string): boolean {
		const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
		return dow === 0 || dow === 6;
	}
	function monthLabel(date: string): string {
		return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
			month: 'short',
			timeZone: 'UTC'
		});
	}
	// First column index of each month, so we can label month spans in the header.
	let monthStarts = $derived(
		new Set(dates.filter((d, i) => i === 0 || monthLabel(d) !== monthLabel(dates[i - 1])))
	);
</script>

{#if students.length === 0 || dates.length === 0}
	<div class="rounded-lg border p-8 text-center text-muted-foreground" data-testid="block-grid-empty">
		No students or dates to display.
	</div>
{:else}
	<div class="overflow-x-auto rounded-lg border" data-testid="block-grid">
		<table class="border-collapse text-xs">
			<thead>
				<tr>
					<th
						class="sticky left-0 z-10 border-b border-r bg-background px-3 py-1 text-left font-medium"
					>
						Student
					</th>
					{#each dates as d}
						<th
							class="border-b px-1 py-1 text-center font-normal {isWeekend(d)
								? 'bg-muted/50'
								: ''} {monthStarts.has(d) ? 'border-l' : ''}"
							title={d}
						>
							<div class="text-[9px] leading-none text-muted-foreground">
								{monthStarts.has(d) ? monthLabel(d) : ''}
							</div>
							<div>{dayNum(d)}</div>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each students as student (student.id)}
					<tr data-testid="grid-row-{student.id}">
						<td
							class="sticky left-0 z-10 max-w-[12rem] truncate border-b border-r bg-background px-3 py-1 font-medium"
							title={student.name}
						>
							{student.name}
						</td>
						{#each dates as d}
							{@const cell = cells.get(`${student.id}:${d}`)}
							<td
								class="border-b p-0 text-center {isWeekend(d) ? 'bg-muted/40' : ''} {monthStarts.has(d)
									? 'border-l'
									: ''}"
								data-testid="grid-cell-{student.id}-{d}"
								data-filled={cell ? 'true' : 'false'}
							>
								{#if cell}
									<button
										type="button"
										class="h-6 w-6 rounded-sm transition-opacity hover:opacity-80"
										style="background-color: {cell.color};"
										title="{student.name} · {cell.label} · {d}"
										aria-label="{student.name} {cell.label} {d}"
										onclick={() => onCellClick?.(cell.id)}
									></button>
								{:else}
									<div class="h-6 w-6"></div>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
