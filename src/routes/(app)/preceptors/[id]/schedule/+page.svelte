<script lang="ts">
	import type {
		PreceptorSchedule,
		CalendarDay
	} from '$lib/features/schedules/types/schedule-views';
	import {
		ScheduleCalendarGrid,
		PreceptorCapacitySummary
	} from '$lib/features/schedules/components';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
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
		const hasAssignments = (day.assignments && day.assignments.length > 0) || day.assignment;
		if (hasAssignments || day.availability) {
			selectedDay = day;
			log.debug('Day selected', {
				date: day.date,
				assignmentCount: day.assignments?.length || (day.assignment ? 1 : 0),
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
				<p class="mt-1 text-sm text-muted-foreground">
					Schedule Period: {data.schedule.period.name}
				</p>
			{/if}
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={() => goto('/schedule/results')}>View All Results</Button>
		</div>
	</div>

	{#if !data.schedule.period}
		<div class="rounded-lg border p-12 text-center">
			<p class="text-lg text-muted-foreground">No scheduling period is currently active.</p>
		</div>
	{:else}
		<div class="grid gap-6 lg:grid-cols-3">
			<!-- Left column: Capacity Summary and Assigned Students -->
			<div class="space-y-6 lg:col-span-1">
				<PreceptorCapacitySummary
					capacity={data.schedule.overallCapacity}
					monthlyCapacity={data.schedule.monthlyCapacity}
				/>

				<!-- Assigned Students -->
				<div class="rounded-lg border p-4">
					<h3 class="mb-3 text-lg font-semibold">Assigned Students</h3>
					{#if data.schedule.assignedStudents.length === 0}
						<p class="text-sm text-muted-foreground">No students currently assigned.</p>
					{:else}
						<div class="space-y-2">
							{#each data.schedule.assignedStudents as assignment}
								<button
									type="button"
									class="w-full rounded border p-3 text-left transition-colors hover:bg-muted/30"
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
				<div class="rounded-lg border p-4">
					<h3 class="mb-2 text-sm font-semibold">Legend</h3>
					<div class="space-y-2 text-sm">
						<div class="flex items-center gap-2">
							<span class="h-4 w-4 rounded border border-green-300 bg-green-100"></span>
							<span class="text-muted-foreground">Available</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="h-4 w-4 rounded border border-red-300 bg-red-100"></span>
							<span class="text-muted-foreground">Unavailable</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="h-4 w-4 rounded border border-blue-400 bg-blue-200"></span>
							<span class="text-muted-foreground">Assigned</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Right column: Calendar -->
			<div class="lg:col-span-2">
				<div class="rounded-lg border p-4">
					<h2 class="mb-4 text-lg font-semibold">Schedule Calendar</h2>
					<ScheduleCalendarGrid
						months={data.schedule.calendar}
						mode="preceptor"
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
					{@const hasAssignments = displayAssignments.length > 0}
					<Dialog.Root
						open={true}
						onOpenChange={(o) => {
							if (!o) closeDetail();
						}}
					>
						<Dialog.Content class="max-w-md">
							<Dialog.Header>
								<Dialog.Title>
									{hasAssignments && displayAssignments.length > 1
										? `${displayAssignments.length} Assignments`
										: 'Day Details'}
								</Dialog.Title>
							</Dialog.Header>
							<div class="space-y-3">
								<div>
									<span class="text-sm text-muted-foreground">Date:</span>
									<span class="ml-2 font-medium">{selectedDay.date}</span>
								</div>
								<div>
									<span class="text-sm text-muted-foreground">Status:</span>
									<span class="ml-2 font-medium capitalize">
										{#if hasAssignments}
											Assigned ({displayAssignments.length})
										{:else if selectedDay.availability === 'available'}
											Available
										{:else if selectedDay.availability === 'unavailable'}
											Unavailable
										{:else}
											Unset
										{/if}
									</span>
								</div>
								{#if hasAssignments}
									{#each displayAssignments as assignment}
										<div
											class="rounded-lg border p-3"
											style="border-left: 3px solid {assignment.color};"
										>
											<div>
												<span class="text-sm text-muted-foreground">Student:</span>
												<span class="ml-2 font-medium">
													{assignment.studentName || selectedDay.assignedStudent?.name || 'Unknown'}
												</span>
											</div>
											<div>
												<span class="text-sm text-muted-foreground">Clerkship:</span>
												<span class="ml-2 font-medium" style="color: {assignment.color};">
													{assignment.clerkshipName}
												</span>
											</div>
										</div>
									{/each}
								{/if}
							</div>
							<Dialog.Footer>
								{#if displayAssignments.length === 1 && (displayAssignments[0].studentId || selectedDay.assignedStudent)}
									<Button
										variant="outline"
										onclick={() =>
											handleStudentClick(
												displayAssignments[0].studentId || selectedDay?.assignedStudent?.id || ''
											)}
									>
										View Student
									</Button>
								{/if}
								<Button variant="outline" onclick={closeDetail}>Close</Button>
							</Dialog.Footer>
						</Dialog.Content>
					</Dialog.Root>
				{/if}
			</div>
		</div>
	{/if}
</div>
