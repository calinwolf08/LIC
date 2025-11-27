<script lang="ts">
	import type { PreceptorSchedule, CalendarDay } from '$lib/features/schedules/types/schedule-views';
	import {
		ScheduleCalendarGrid,
		PreceptorCapacitySummary
	} from '$lib/features/schedules/components';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { createClientLogger } from '$lib/utils/logger.client';

	const log = createClientLogger('preceptor-schedule');

	interface Props {
		data: {
			schedule: PreceptorSchedule;
			preceptorId: string;
		};
	}

	let { data }: Props = $props();

	let selectedDay = $state<CalendarDay | null>(null);

	function handleDayClick(day: CalendarDay) {
		if (day.assignment || day.availability) {
			selectedDay = day;
			log.debug('Day selected', {
				date: day.date,
				hasAssignment: !!day.assignment,
				availability: day.availability
			});
		}
	}

	function closeDetail() {
		selectedDay = null;
	}

	function handleStudentClick(studentId: string) {
		log.debug('Navigating to student schedule', { studentId });
		goto(`/students/${studentId}/schedule`);
	}

	log.info('Preceptor schedule loaded', {
		preceptorId: data.preceptorId,
		preceptorName: data.schedule.preceptor.name,
		availableDays: data.schedule.overallCapacity.availableDays,
		assignedDays: data.schedule.overallCapacity.assignedDays,
		utilization: data.schedule.overallCapacity.utilizationPercent
	});
</script>

<svelte:head>
	<title>{data.schedule.preceptor.name} - Schedule | LIC</title>
</svelte:head>

<div class="container mx-auto max-w-7xl p-6">
	<!-- Breadcrumb -->
	<nav class="mb-6 text-sm text-muted-foreground">
		<a href="/preceptors" class="hover:underline">Preceptors</a>
		<span class="mx-2">/</span>
		<span>{data.schedule.preceptor.name}</span>
		<span class="mx-2">/</span>
		<span>Schedule</span>
	</nav>

	<!-- Header -->
	<div class="mb-6 flex items-start justify-between">
		<div>
			<h1 class="text-3xl font-bold">{data.schedule.preceptor.name}</h1>
			<p class="text-muted-foreground">{data.schedule.preceptor.email}</p>
			{#if data.schedule.preceptor.healthSystemName}
				<p class="text-sm text-muted-foreground">
					{data.schedule.preceptor.healthSystemName}
				</p>
			{/if}
			{#if data.schedule.period}
				<p class="text-sm text-muted-foreground mt-1">
					Schedule Period: {data.schedule.period.name}
				</p>
			{/if}
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={() => goto('/schedule/results')}>
				View All Results
			</Button>
		</div>
	</div>

	{#if !data.schedule.period}
		<div class="rounded-lg border p-12 text-center">
			<p class="text-lg text-muted-foreground">
				No scheduling period is currently active.
			</p>
		</div>
	{:else}
		<div class="grid gap-6 lg:grid-cols-3">
			<!-- Left column: Capacity Summary and Assigned Students -->
			<div class="lg:col-span-1 space-y-6">
				<PreceptorCapacitySummary
					capacity={data.schedule.overallCapacity}
					monthlyCapacity={data.schedule.monthlyCapacity}
				/>

				<!-- Assigned Students -->
				<div class="border rounded-lg p-4">
					<h3 class="font-semibold text-lg mb-3">Assigned Students</h3>
					{#if data.schedule.assignedStudents.length === 0}
						<p class="text-sm text-muted-foreground">No students currently assigned.</p>
					{:else}
						<div class="space-y-2">
							{#each data.schedule.assignedStudents as assignment}
								<button
									type="button"
									class="w-full text-left p-3 rounded border hover:bg-muted/30 transition-colors"
									onclick={() => handleStudentClick(assignment.studentId)}
								>
									<p class="font-medium">{assignment.studentName}</p>
									<p class="text-xs text-muted-foreground">
										{assignment.clerkshipName} - {assignment.daysAssigned} days
									</p>
									<p class="text-xs text-muted-foreground">
										{assignment.dateRange.start} to {assignment.dateRange.end}
									</p>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Legend -->
				<div class="border rounded-lg p-4">
					<h3 class="font-semibold text-sm mb-2">Legend</h3>
					<div class="space-y-2 text-sm">
						<div class="flex items-center gap-2">
							<span class="w-4 h-4 rounded bg-green-100 border border-green-300"></span>
							<span class="text-muted-foreground">Available</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="w-4 h-4 rounded bg-red-100 border border-red-300"></span>
							<span class="text-muted-foreground">Unavailable</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="w-4 h-4 rounded bg-blue-200 border border-blue-400"></span>
							<span class="text-muted-foreground">Assigned</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Right column: Calendar -->
			<div class="lg:col-span-2">
				<div class="border rounded-lg p-4">
					<h2 class="text-lg font-semibold mb-4">Schedule Calendar</h2>
					<ScheduleCalendarGrid
						months={data.schedule.calendar}
						mode="preceptor"
						onDayClick={handleDayClick}
					/>
				</div>

				<!-- Day Detail Modal -->
				{#if selectedDay}
					<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog">
						<div class="bg-background rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
							<div class="flex items-start justify-between mb-4">
								<h3 class="text-lg font-semibold">Day Details</h3>
								<button
									type="button"
									onclick={closeDetail}
									class="text-muted-foreground hover:text-foreground"
								>
									&times;
								</button>
							</div>
							<div class="space-y-3">
								<div>
									<span class="text-sm text-muted-foreground">Date:</span>
									<span class="ml-2 font-medium">{selectedDay.date}</span>
								</div>
								<div>
									<span class="text-sm text-muted-foreground">Status:</span>
									<span class="ml-2 font-medium capitalize">
										{#if selectedDay.assignment}
											Assigned
										{:else if selectedDay.availability === 'available'}
											Available
										{:else if selectedDay.availability === 'unavailable'}
											Unavailable
										{:else}
											Unset
										{/if}
									</span>
								</div>
								{#if selectedDay.assignment}
									<div>
										<span class="text-sm text-muted-foreground">Student:</span>
										<span class="ml-2 font-medium">
											{selectedDay.assignedStudent?.name || 'Unknown'}
										</span>
									</div>
									<div>
										<span class="text-sm text-muted-foreground">Clerkship:</span>
										<span
											class="ml-2 font-medium"
											style="color: {selectedDay.assignment.color};"
										>
											{selectedDay.assignment.clerkshipName}
										</span>
									</div>
								{/if}
							</div>
							<div class="mt-6 flex justify-end gap-2">
								{#if selectedDay.assignedStudent}
									<Button
										variant="outline"
										onclick={() => handleStudentClick(selectedDay?.assignedStudent?.id || '')}
									>
										View Student
									</Button>
								{/if}
								<Button variant="outline" onclick={closeDetail}>Close</Button>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
