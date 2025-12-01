<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { goto } from '$app/navigation';
	import {
		ClerkshipProgressCard,
		StudentRequirementsSummary
	} from '$lib/features/schedules/components';

	let { data }: { data: PageData } = $props();

	// Tab state
	let activeTab = $state<'onboarding' | 'progress' | 'calendar'>('onboarding');

	// Compute completed onboarding count
	let completedOnboarding = $derived(
		Object.values(data.onboardingStatus).filter((r) => r.is_completed === 1).length
	);

	// Toggle onboarding status
	async function toggleOnboarding(healthSystemId: string) {
		const existing = data.onboardingStatus[healthSystemId];
		const isCompleted = existing?.is_completed === 1;

		try {
			const response = await fetch('/api/student-onboarding', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					student_id: data.studentId,
					health_system_id: healthSystemId,
					is_completed: isCompleted ? 0 : 1,
					completed_date: isCompleted ? null : new Date().toISOString().split('T')[0]
				})
			});

			if (!response.ok) throw new Error('Failed to update onboarding');

			// Refresh the page to get updated data
			window.location.reload();
		} catch (err) {
			console.error('Failed to update onboarding:', err);
		}
	}
</script>

<svelte:head>
	<title>{data.student.name} | LIC</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-6">
	<!-- Breadcrumb -->
	<nav class="mb-6 text-sm text-muted-foreground">
		<a href="/students" class="hover:underline">Students</a>
		<span class="mx-2">/</span>
		<span>{data.student.name}</span>
	</nav>

	<!-- Header -->
	<div class="mb-6 flex items-start justify-between">
		<div>
			<h1 class="text-3xl font-bold">{data.student.name}</h1>
			<p class="text-muted-foreground">{data.student.email}</p>
			{#if data.student.cohort}
				<Badge variant="outline" class="mt-2">{data.student.cohort}</Badge>
			{/if}
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={() => goto(`/students/${data.studentId}/edit`)}>
				Edit Student
			</Button>
			<Button onclick={() => goto(`/students/${data.studentId}/schedule`)}>View Full Schedule</Button
			>
		</div>
	</div>

	<!-- Tabs -->
	<div class="mb-6 border-b">
		<nav class="-mb-px flex space-x-8">
			<button
				onclick={() => (activeTab = 'onboarding')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'onboarding'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Health System Onboarding
				<Badge variant="secondary" class="ml-2">
					{completedOnboarding} / {data.healthSystems.length}
				</Badge>
			</button>
			<button
				onclick={() => (activeTab = 'progress')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'progress'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Clerkship Progress
				{#if data.schedule}
					<Badge variant="secondary" class="ml-2">
						{data.schedule.summary.overallPercentComplete}%
					</Badge>
				{/if}
			</button>
			<button
				onclick={() => (activeTab = 'calendar')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'calendar'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Calendar
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'onboarding'}
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Health System Onboarding</h2>
			<p class="text-sm text-muted-foreground mb-6">
				Track {data.student.name}'s completion of onboarding at each health system. Students must
				complete onboarding before they can be scheduled at a health system.
			</p>

			{#if data.healthSystems.length === 0}
				<div class="text-center py-8 text-muted-foreground">
					<p>No health systems configured.</p>
					<Button variant="outline" class="mt-4" onclick={() => goto('/health-systems')}>
						Manage Health Systems
					</Button>
				</div>
			{:else}
				<div class="space-y-3">
					{#each data.healthSystems as healthSystem}
						{@const record = data.onboardingStatus[healthSystem.id]}
						{@const isCompleted = record?.is_completed === 1}
						<div
							class="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
						>
							<div class="flex items-center gap-4">
								<input
									type="checkbox"
									id={`onboarding-${healthSystem.id}`}
									checked={isCompleted}
									onchange={() => toggleOnboarding(healthSystem.id)}
									class="h-5 w-5 rounded border-gray-300"
								/>
								<label for={`onboarding-${healthSystem.id}`} class="font-medium cursor-pointer">
									{healthSystem.name}
								</label>
							</div>
							<div class="flex items-center gap-3">
								{#if isCompleted && record?.completed_date}
									<span class="text-sm text-muted-foreground">
										Completed {record.completed_date}
									</span>
								{/if}
								{#if isCompleted}
									<Badge variant="default" class="bg-green-600">Completed</Badge>
								{:else}
									<Badge variant="secondary">Pending</Badge>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</Card>
	{:else if activeTab === 'progress'}
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">Clerkship Progress</h2>

			{#if !data.schedule || !data.schedule.period}
				<div class="text-center py-8 text-muted-foreground">
					<p>No scheduling period is currently active.</p>
					<p class="text-sm mt-2">
						Generate a schedule to see clerkship progress for this student.
					</p>
					<Button variant="outline" class="mt-4" onclick={() => goto('/calendar')}>
						Go to Calendar
					</Button>
				</div>
			{:else if data.schedule.clerkshipProgress.length === 0}
				<div class="text-center py-8 text-muted-foreground">
					<p>No clerkship requirements found.</p>
				</div>
			{:else}
				<div class="mb-6">
					<StudentRequirementsSummary summary={data.schedule.summary} />
				</div>

				<div class="space-y-4">
					{#each data.schedule.clerkshipProgress as progress}
						<ClerkshipProgressCard {progress} />
					{/each}
				</div>
			{/if}
		</Card>
	{:else if activeTab === 'calendar'}
		<Card class="p-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-xl font-semibold">Schedule Calendar</h2>
				<Button onclick={() => goto(`/students/${data.studentId}/schedule`)}>
					View Full Schedule
				</Button>
			</div>

			{#if !data.schedule || !data.schedule.period}
				<div class="text-center py-8 text-muted-foreground">
					<p>No scheduling period is currently active.</p>
					<p class="text-sm mt-2">Generate a schedule to see calendar assignments.</p>
					<Button variant="outline" class="mt-4" onclick={() => goto('/calendar')}>
						Go to Calendar
					</Button>
				</div>
			{:else}
				<div class="mb-4">
					<p class="text-sm text-muted-foreground">
						Schedule Period: {data.schedule.period.name}
						({data.schedule.period.start_date} to {data.schedule.period.end_date})
					</p>
				</div>

				<!-- Summary stats -->
				<div class="grid grid-cols-3 gap-4 mb-6">
					<div class="border rounded-lg p-4 text-center">
						<div class="text-2xl font-bold">{data.schedule.summary.totalAssignedDays}</div>
						<div class="text-sm text-muted-foreground">Days Assigned</div>
					</div>
					<div class="border rounded-lg p-4 text-center">
						<div class="text-2xl font-bold">{data.schedule.summary.totalRequiredDays}</div>
						<div class="text-sm text-muted-foreground">Days Required</div>
					</div>
					<div class="border rounded-lg p-4 text-center">
						<div class="text-2xl font-bold">{data.schedule.summary.overallPercentComplete}%</div>
						<div class="text-sm text-muted-foreground">Complete</div>
					</div>
				</div>

				<!-- Assignment list (preview) -->
				<div class="border rounded-lg">
					<div class="p-3 border-b bg-muted/50 font-medium">Upcoming Assignments</div>
					{#if data.schedule.assignments.length === 0}
						<div class="p-8 text-center text-muted-foreground">No assignments scheduled</div>
					{:else}
						<div class="max-h-96 overflow-y-auto">
							{#each data.schedule.assignments.slice(0, 10) as assignment}
								<div class="flex items-center justify-between p-3 border-b last:border-b-0">
									<div>
										<div class="font-medium">{assignment.date}</div>
										<div class="text-sm text-muted-foreground">
											{assignment.clerkship_name}
										</div>
									</div>
									<div class="text-sm text-right">
										<div>{assignment.preceptor_name}</div>
										<div class="text-muted-foreground">{assignment.status}</div>
									</div>
								</div>
							{/each}
							{#if data.schedule.assignments.length > 10}
								<div class="p-3 text-center">
									<Button
										variant="ghost"
										onclick={() => goto(`/students/${data.studentId}/schedule`)}
									>
										View all {data.schedule.assignments.length} assignments
									</Button>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</Card>
	{/if}
</div>
