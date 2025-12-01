<script lang="ts">
	import type { CalendarMonth, CalendarDay, CalendarDayAssignment } from '../types/schedule-views';

	interface Props {
		months: CalendarMonth[];
		mode?: 'student' | 'preceptor';
		onDayClick?: (day: CalendarDay) => void;
		onAssignmentClick?: (day: CalendarDay, assignment: CalendarDayAssignment) => void;
	}

	let { months, mode = 'student', onDayClick, onAssignmentClick }: Props = $props();

	function getDayClasses(day: CalendarDay): string {
		const classes = ['calendar-day'];

		if (!day.isCurrentMonth) classes.push('opacity-30');
		if (day.isToday) classes.push('ring-2 ring-primary');
		if (day.isWeekend) classes.push('bg-muted/30');

		const hasAssignments = day.assignments && day.assignments.length > 0;
		if (hasAssignments) {
			classes.push('has-assignment');
		} else if (mode === 'preceptor') {
			if (day.availability === 'available') {
				classes.push('bg-green-100 dark:bg-green-900/30');
			} else if (day.availability === 'unavailable') {
				classes.push('bg-red-100 dark:bg-red-900/30');
			}
		}

		return classes.join(' ');
	}

	function handleDayClick(day: CalendarDay) {
		if (onDayClick) {
			onDayClick(day);
		}
	}

	function handleAssignmentClick(event: MouseEvent, day: CalendarDay, assignment: CalendarDayAssignment) {
		event.stopPropagation();
		if (onAssignmentClick) {
			onAssignmentClick(day, assignment);
		} else if (onDayClick) {
			onDayClick(day);
		}
	}
</script>

<div class="calendar-grid space-y-6">
	{#each months as month}
		<div class="month-container">
			<h3 class="text-lg font-semibold mb-3">{month.monthName}</h3>

			<div class="border rounded-lg overflow-hidden">
				<!-- Header row -->
				<div class="grid grid-cols-7 bg-muted/50 border-b">
					{#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as dayName}
						<div class="py-2 text-center text-xs font-medium text-muted-foreground">
							{dayName}
						</div>
					{/each}
				</div>

				<!-- Calendar weeks -->
				{#each month.weeks as week}
					<div class="grid grid-cols-7 border-b last:border-b-0">
						{#each week.days as day}
							<button
								type="button"
								class="{getDayClasses(day)} min-h-[60px] p-1 border-r last:border-r-0 text-left hover:bg-muted/50 transition-colors relative"
								onclick={() => handleDayClick(day)}
								disabled={!day.isCurrentMonth}
							>
								<span class="text-xs font-medium {day.isToday ? 'text-primary' : ''}">
									{day.dayOfMonth}
								</span>

								{#if day.assignments && day.assignments.length > 0}
									<div class="mt-1 space-y-0.5 overflow-hidden" style="max-height: calc(100% - 20px);">
										{#each day.assignments.slice(0, 3) as assignment}
											<button
												type="button"
												class="w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate hover:opacity-80 transition-opacity"
												style="background-color: {assignment.color}20; color: {assignment.color}; border-left: 2px solid {assignment.color};"
												title="{assignment.clerkshipName} - {assignment.preceptorName}{assignment.studentName ? ' (' + assignment.studentName + ')' : ''}"
												onclick={(e) => handleAssignmentClick(e, day, assignment)}
											>
												{#if mode === 'student'}
													{assignment.clerkshipAbbrev || assignment.clerkshipName.slice(0, 3)}
												{:else}
													{assignment.studentInitials || assignment.studentName?.split(' ').map(n => n[0]).join('') || assignment.clerkshipName.slice(0, 3)}
												{/if}
											</button>
										{/each}
										{#if day.assignments.length > 3}
											<div class="text-[9px] text-muted-foreground text-center">
												+{day.assignments.length - 3} more
											</div>
										{/if}
									</div>
								{:else if mode === 'preceptor' && day.availability === 'available' && day.isCurrentMonth}
									<div class="absolute bottom-1 right-1">
										<span class="w-2 h-2 bg-green-500 rounded-full block"></span>
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	.calendar-day {
		cursor: pointer;
	}

	.calendar-day:disabled {
		cursor: default;
	}
</style>
