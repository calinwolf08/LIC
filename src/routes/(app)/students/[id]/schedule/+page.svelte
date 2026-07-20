<script lang="ts">
	import type { StudentSchedule, CalendarDay } from '$lib/features/schedules/types/schedule-views';
	import {
		ScheduleCalendarGrid,
		ClerkshipProgressCard,
		StudentRequirementsSummary
	} from '$lib/features/schedules/components';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
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
		const hasAssignments = day.assignments && day.assignments.length > 0;
		if (hasAssignments || day.assignment) {
			selectedDay = day;
			const firstAssignment = day.assignments?.[0] || day.assignment;
			log.debug('Day selected', { date: day.date, clerkship: firstAssignment?.clerkshipName });
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
				<p class="mt-1 text-sm text-muted-foreground">
					Schedule Period: {data.schedule.period.name}
				</p>
			{/if}
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={() => goto(`/students/${data.studentId}/edit`)}>
				Edit Student
			</Button>
			<Button variant="outline" onclick={() => goto('/schedule/results')}>View All Results</Button>
		</div>
	</div>

	{#if !data.schedule.period}
		<div class="rounded-lg border p-12 text-center">
			<p class="text-lg text-muted-foreground">No scheduling period is currently active.</p>
		</div>
	{:else}
		<div class="grid gap-6 lg:grid-cols-3">
			<!-- Left column: Summary and Progress Cards -->
			<div class="space-y-6 lg:col-span-1">
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
				<div class="rounded-lg border p-4">
					<h2 class="mb-4 text-lg font-semibold">Schedule Calendar</h2>
					<ScheduleCalendarGrid
						months={data.schedule.calendar}
						mode="student"
						onDayClick={handleDayClick}
					/>
				</div>

				<!-- Day Detail dialog -->
				{#if selectedDay}
					{@const displayAssignments =
						selectedDay.assignments?.length > 0
							? selectedDay.assignments
							: selectedDay.assignment
								? [selectedDay.assignment]
								: []}
					<Dialog.Root
						open={displayAssignments.length > 0}
						onOpenChange={(o) => {
							if (!o) closeDetail();
						}}
					>
						<Dialog.Content class="max-w-md">
							<Dialog.Header>
								<Dialog.Title>
									{displayAssignments.length === 1
										? 'Assignment Details'
										: `${displayAssignments.length} Assignments`}
								</Dialog.Title>
							</Dialog.Header>
							<div class="space-y-3">
								<div>
									<span class="text-sm text-muted-foreground">Date:</span>
									<span class="ml-2 font-medium">{selectedDay.date}</span>
								</div>
								{#each displayAssignments as assignment (assignment.id ?? assignment.clerkshipName)}
									<div
										class="rounded-lg border p-3"
										style="border-left: 3px solid {assignment.color};"
									>
										<div>
											<span class="text-sm text-muted-foreground">Clerkship:</span>
											<span class="ml-2 font-medium" style="color: {assignment.color};">
												{assignment.clerkshipName}
											</span>
										</div>
										<div>
											<span class="text-sm text-muted-foreground">Preceptor:</span>
											<span class="ml-2 font-medium">{assignment.preceptorName}</span>
										</div>
									</div>
								{/each}
							</div>
							<Dialog.Footer>
								<Button variant="outline" onclick={closeDetail}>Close</Button>
							</Dialog.Footer>
						</Dialog.Content>
					</Dialog.Root>
				{/if}
			</div>
		</div>
	{/if}
</div>
