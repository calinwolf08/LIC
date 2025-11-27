<script lang="ts">
	import type { StudentSchedule, CalendarDay } from '$lib/features/schedules/types/schedule-views';
	import {
		ScheduleCalendarGrid,
		ClerkshipProgressCard,
		StudentRequirementsSummary
	} from '$lib/features/schedules/components';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { createClientLogger } from '$lib/utils/logger.client';

	const log = createClientLogger('student-schedule');

	interface Props {
		data: {
			schedule: StudentSchedule;
			studentId: string;
		};
	}

	let { data }: Props = $props();

	let selectedDay = $state<CalendarDay | null>(null);

	function handleDayClick(day: CalendarDay) {
		if (day.assignment) {
			selectedDay = day;
			log.debug('Day selected', { date: day.date, clerkship: day.assignment.clerkshipName });
		}
	}

	function closeDetail() {
		selectedDay = null;
	}

	log.info('Student schedule loaded', {
		studentId: data.studentId,
		studentName: data.schedule.student.name,
		totalAssigned: data.schedule.summary.totalAssignedDays,
		overallPercent: data.schedule.summary.overallPercentComplete
	});
</script>

<svelte:head>
	<title>{data.schedule.student.name} - Schedule | LIC</title>
</svelte:head>

<div class="container mx-auto max-w-7xl p-6">
	<!-- Breadcrumb -->
	<nav class="mb-6 text-sm text-muted-foreground">
		<a href="/students" class="hover:underline">Students</a>
		<span class="mx-2">/</span>
		<span>{data.schedule.student.name}</span>
		<span class="mx-2">/</span>
		<span>Schedule</span>
	</nav>

	<!-- Header -->
	<div class="mb-6 flex items-start justify-between">
		<div>
			<h1 class="text-3xl font-bold">{data.schedule.student.name}</h1>
			<p class="text-muted-foreground">{data.schedule.student.email}</p>
			{#if data.schedule.period}
				<p class="text-sm text-muted-foreground mt-1">
					Schedule Period: {data.schedule.period.name}
				</p>
			{/if}
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={() => goto(`/students/${data.studentId}/edit`)}>
				Edit Student
			</Button>
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
			<!-- Left column: Summary and Progress Cards -->
			<div class="lg:col-span-1 space-y-6">
				<StudentRequirementsSummary summary={data.schedule.summary} />

				<div class="space-y-4">
					<h2 class="text-lg font-semibold">Clerkship Progress</h2>
					{#each data.schedule.clerkshipProgress as progress}
						<ClerkshipProgressCard {progress} />
					{/each}
				</div>
			</div>

			<!-- Right column: Calendar -->
			<div class="lg:col-span-2">
				<div class="border rounded-lg p-4">
					<h2 class="text-lg font-semibold mb-4">Schedule Calendar</h2>
					<ScheduleCalendarGrid
						months={data.schedule.calendar}
						mode="student"
						onDayClick={handleDayClick}
					/>
				</div>

				<!-- Day Detail Modal -->
				{#if selectedDay && selectedDay.assignment}
					<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog">
						<div class="bg-background rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
							<div class="flex items-start justify-between mb-4">
								<h3 class="text-lg font-semibold">Assignment Details</h3>
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
									<span class="text-sm text-muted-foreground">Clerkship:</span>
									<span
										class="ml-2 font-medium"
										style="color: {selectedDay.assignment.color};"
									>
										{selectedDay.assignment.clerkshipName}
									</span>
								</div>
								<div>
									<span class="text-sm text-muted-foreground">Preceptor:</span>
									<span class="ml-2 font-medium">{selectedDay.assignment.preceptorName}</span>
								</div>
							</div>
							<div class="mt-6 flex justify-end">
								<Button variant="outline" onclick={closeDetail}>Close</Button>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
