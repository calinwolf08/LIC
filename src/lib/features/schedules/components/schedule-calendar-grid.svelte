<script lang="ts">
	import type { CalendarMonth, CalendarDay, CalendarDayAssignment } from '../types/schedule-views';

	interface Props {
		months: CalendarMonth[];
		/**
		 * Which identity is implied by context and can therefore be left off the
		 * cell: 'student' pages already know the student, 'preceptor' pages the
		 * preceptor, and 'schedule' (the calendar) knows neither.
		 */
		mode?: 'student' | 'preceptor' | 'schedule';
		blackoutDates?: Set<string>;
		/** Dates with validation conflicts (red corner marker). Optional message per date for the tooltip. */
		violationDates?: Set<string>;
		violationMessages?: Record<string, string[]>;
		onDayClick?: (day: CalendarDay) => void;
		onAssignmentClick?: (day: CalendarDay, assignment: CalendarDayAssignment) => void;
		/** Opens a drawer listing every assignment on a day that could not fit. */
		onShowMore?: (day: CalendarDay) => void;
		/** How many assignments fit in a cell before "+N more". */
		fitLimit?: number;
	}

	let {
		months,
		mode = 'student',
		blackoutDates = new Set(),
		violationDates = new Set(),
		violationMessages = {},
		onDayClick,
		onAssignmentClick,
		onShowMore,
		fitLimit = 3
	}: Props = $props();

	/**
	 * Days outside the schedule range are inert — they are not part of this
	 * schedule, so clicking them would create an assignment nobody asked for.
	 * `isInRange` is optional on the type; treat "not stated" as in range.
	 */
	function isInteractive(day: CalendarDay): boolean {
		return day.isCurrentMonth && day.isInRange !== false;
	}

	/**
	 * The cell's own words. Never fall back to a meaningless truncation like
	 * "Int" — an unreadable label is worse than a longer one that wraps.
	 */
	function primaryLabel(a: CalendarDayAssignment): string {
		if (mode === 'student') return a.clerkshipName;
		if (mode === 'preceptor') return a.studentName ?? a.clerkshipName;
		return a.studentName ? `${a.studentName} · ${a.clerkshipName}` : a.clerkshipName;
	}

	function secondaryLabel(a: CalendarDayAssignment): string {
		if (mode === 'student') return a.preceptorName;
		if (mode === 'preceptor') return a.clerkshipName;
		return a.preceptorName;
	}

	function assignmentTitle(a: CalendarDayAssignment): string {
		return [a.studentName, a.clerkshipName, a.preceptorName].filter(Boolean).join(' · ');
	}

	function isBlackoutDate(date: string): boolean {
		return blackoutDates.has(date);
	}

	function getDayClasses(day: CalendarDay): string {
		const classes = ['calendar-day'];

		if (!day.isCurrentMonth) classes.push('opacity-30');
		if (day.isInRange === false) classes.push('out-of-range bg-muted/40 opacity-50');
		if (day.isToday) classes.push('ring-2 ring-primary');

		// Blackout dates take precedence over weekend styling
		if (isBlackoutDate(day.date)) {
			classes.push('blackout-date bg-red-100 dark:bg-red-900/40');
		} else if (day.isWeekend) {
			classes.push('bg-muted/30');
		}

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
		if (!isInteractive(day)) return;
		if (onDayClick) {
			onDayClick(day);
		}
	}

	function handleAssignmentClick(event: MouseEvent, day: CalendarDay, assignment: CalendarDayAssignment) {
		event.stopPropagation();
		if (!isInteractive(day)) return;
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
							<div
								role="button"
								tabindex={day.isCurrentMonth ? 0 : -1}
								data-date={day.date}
								data-in-range={day.isInRange !== false}
								class="{getDayClasses(day)} min-h-[76px] p-1 border-r last:border-r-0 text-left hover:bg-muted/50 transition-colors relative cursor-pointer {!isInteractive(day) ? 'pointer-events-none' : ''}"
								onclick={() => handleDayClick(day)}
								onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleDayClick(day)}
							>
								<span class="text-xs font-medium {day.isToday ? 'text-primary' : ''}">
									{day.dayOfMonth}
								</span>

								{#if violationDates.has(day.date) && day.isCurrentMonth}
									<span
										class="absolute right-0.5 top-0.5 z-10 h-2.5 w-2.5 rounded-full bg-red-500 ring-1 ring-white dark:ring-gray-900"
										title={(violationMessages[day.date] ?? ['Scheduling conflict']).join('\n')}
										aria-label="Scheduling conflict"
									></span>
								{/if}

								{#if day.assignments && day.assignments.length > 0}
									<div class="mt-1 space-y-0.5 overflow-hidden">
										{#each day.assignments.slice(0, fitLimit) as assignment}
											<button
												type="button"
												data-testid="calendar-assignment"
												data-assignment-id={assignment.id}
												class="w-full rounded px-1 py-0.5 text-left text-[10px] leading-tight transition-opacity hover:opacity-80"
												style="background-color: {assignment.color}20; color: {assignment.color}; border-left: 2px solid {assignment.color};"
												title={assignmentTitle(assignment)}
												onclick={(e) => handleAssignmentClick(e, day, assignment)}
											>
												<span class="block truncate font-medium">{primaryLabel(assignment)}</span>
												{#if secondaryLabel(assignment)}
													<span class="block truncate opacity-80">{secondaryLabel(assignment)}</span>
												{/if}
											</button>
										{/each}
										{#if day.assignments.length > fitLimit}
											<button
												type="button"
												class="w-full text-center text-[9px] text-muted-foreground hover:underline"
												onclick={(e) => {
													e.stopPropagation();
													onShowMore ? onShowMore(day) : handleDayClick(day);
												}}
											>
												+{day.assignments.length - fitLimit} more
											</button>
										{/if}
									</div>
								{:else if isBlackoutDate(day.date) && day.isCurrentMonth}
									<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
										<span class="text-[9px] text-red-500 dark:text-red-400 font-medium opacity-60">BLOCKED</span>
									</div>
								{:else if mode === 'preceptor' && day.availability === 'available' && day.isCurrentMonth}
									<div class="absolute bottom-1 right-1">
										<span class="w-2 h-2 bg-green-500 rounded-full block"></span>
									</div>
								{/if}
							</div>
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

	.blackout-date {
		background-image: repeating-linear-gradient(
			45deg,
			transparent,
			transparent 4px,
			rgba(239, 68, 68, 0.1) 4px,
			rgba(239, 68, 68, 0.1) 8px
		);
	}

	:global(.dark) .blackout-date {
		background-image: repeating-linear-gradient(
			45deg,
			transparent,
			transparent 4px,
			rgba(239, 68, 68, 0.2) 4px,
			rgba(239, 68, 68, 0.2) 8px
		);
	}
</style>
