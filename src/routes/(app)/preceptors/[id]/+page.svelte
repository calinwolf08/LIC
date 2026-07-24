<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { goto, invalidateAll } from '$app/navigation';
	import { PageHeader, EntityTabs, EmptyState, toast, type EntityTab } from '$lib/components';
	import {
		ScheduleCalendarGrid,
		PreceptorCapacitySummary,
		CreateAssignmentDialog
	} from '$lib/features/schedules/components';
	import PreceptorForm from '$lib/features/preceptors/components/preceptor-form.svelte';
	import PatternAvailabilityBuilder from '$lib/features/preceptors/components/pattern-availability-builder.svelte';
	import type { CalendarDay } from '$lib/features/schedules/types/schedule-views';

	let { data }: { data: PageData } = $props();

	const tabs: EntityTab[] = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'availability', label: 'Availability' },
		{ id: 'schedule', label: 'Schedule' },
		{ id: 'details', label: 'Details' }
	];
	let activeTab = $state('overview');

	let schedule = $derived(data.schedule);

	// Create assignment (prefilled preceptor)
	let showCreate = $state(false);
	async function onAssignmentSaved() {
		await invalidateAll();
	}

	function handleDayClick(day: CalendarDay) {
		// Empty day → quick add for this preceptor on that date
		const hasAssignments = (day.assignments && day.assignments.length > 0) || day.assignment;
		if (!hasAssignments) {
			showCreate = true;
		}
	}

	async function handleFormSuccess() {
		toast.success('Preceptor updated');
		await invalidateAll();
	}

	async function handleAvailabilitySuccess() {
		toast.success('Availability saved');
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>{data.preceptor.name} | Preceptors | LIC</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-6">
	<PageHeader
		title={data.preceptor.name}
		description={data.preceptor.email}
		breadcrumbs={[{ label: 'Preceptors', href: '/preceptors' }, { label: data.preceptor.name }]}
	>
		{#snippet actions()}
			<Button onclick={() => (showCreate = true)}>Add assignment</Button>
		{/snippet}
	</PageHeader>

	<EntityTabs {tabs} bind:active={activeTab} urlParam="tab" />

	{#if activeTab === 'overview'}
		<div class="grid gap-6 lg:grid-cols-3">
			<div class="space-y-6 lg:col-span-1">
				{#if schedule?.overallCapacity}
					<PreceptorCapacitySummary
						capacity={schedule.overallCapacity}
						monthlyCapacity={schedule.monthlyCapacity}
					/>
				{/if}

				<Card class="p-4">
					<h3 class="mb-3 text-lg font-semibold">Contact</h3>
					<dl class="space-y-1 text-sm">
						<div><dt class="inline text-muted-foreground">Email:</dt> <dd class="inline">{data.preceptor.email}</dd></div>
						{#if data.preceptor.phone}
							<div><dt class="inline text-muted-foreground">Phone:</dt> <dd class="inline">{data.preceptor.phone}</dd></div>
						{/if}
					</dl>
					{#if data.preceptor.sites && data.preceptor.sites.length > 0}
						<h4 class="mt-4 mb-1 text-sm font-medium">Sites</h4>
						<ul class="space-y-1 text-sm">
							{#each data.preceptor.sites as site (site.id)}
								<li>{site.name}</li>
							{/each}
						</ul>
					{/if}
				</Card>
			</div>

			<div class="lg:col-span-2">
				<Card class="p-4">
					<h3 class="mb-3 text-lg font-semibold">Assigned students</h3>
					{#if !schedule || schedule.assignedStudents.length === 0}
						<p class="text-sm text-muted-foreground">No students currently assigned.</p>
					{:else}
						<div class="space-y-2">
							{#each schedule.assignedStudents as a (a.studentId + a.clerkshipId)}
								<a
									href="/students/{a.studentId}"
									class="block rounded border p-3 transition-colors hover:bg-muted/30"
								>
									<p class="font-medium text-primary">{a.studentName}</p>
									<p class="text-xs text-muted-foreground">
										{a.clerkshipName} · {a.daysAssigned} days · {a.dateRange.start} to {a.dateRange.end}
									</p>
								</a>
							{/each}
						</div>
					{/if}
				</Card>
			</div>
		</div>
	{:else if activeTab === 'availability'}
		<div class="space-y-6">
			<!-- Primary action first: set availability, then visualise it below. -->
			<Card class="p-4">
				<h3 class="mb-3 text-lg font-semibold">Set availability</h3>
				<PatternAvailabilityBuilder
					preceptor={data.preceptor}
					onSuccess={handleAvailabilitySuccess}
					onCancel={() => {}}
				/>
			</Card>

			<Card class="p-4">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="text-lg font-semibold">Availability calendar</h3>
					<div class="flex gap-4 text-xs">
						<span class="flex items-center gap-1"><span class="h-3 w-3 rounded border border-green-300 bg-green-100"></span> Available</span>
						<span class="flex items-center gap-1"><span class="h-3 w-3 rounded border border-red-300 bg-red-100"></span> Unavailable</span>
						<span class="flex items-center gap-1"><span class="h-3 w-3 rounded border border-blue-400 bg-blue-200"></span> Assigned</span>
					</div>
				</div>
				{#if schedule?.calendar && schedule.calendar.length > 0}
					<ScheduleCalendarGrid months={schedule.calendar} mode="preceptor" onDayClick={handleDayClick} />
				{:else}
					<EmptyState icon="📅" title="No active schedule" description="Availability is shown across the active schedule's dates." />
				{/if}
			</Card>
		</div>
	{:else if activeTab === 'schedule'}
		<Card class="p-4">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold">Schedule</h3>
				<Button onclick={() => (showCreate = true)}>Add assignment</Button>
			</div>
			{#if schedule?.calendar && schedule.calendar.length > 0}
				<ScheduleCalendarGrid months={schedule.calendar} mode="preceptor" onDayClick={handleDayClick} />
			{:else}
				<EmptyState icon="📅" title="No assignments" description="Add assignments to build this preceptor's schedule." />
			{/if}
		</Card>
	{:else if activeTab === 'details'}
		<Card class="p-6">
			<h3 class="mb-4 text-lg font-semibold">Preceptor information</h3>
			<div class="max-w-2xl">
				<PreceptorForm
					preceptor={data.preceptor}
					healthSystems={data.healthSystems}
					sites={data.sites}
					onSuccess={handleFormSuccess}
					onCancel={() => goto('/preceptors')}
				/>
			</div>
		</Card>
	{/if}
</div>

<CreateAssignmentDialog
	bind:open={showCreate}
	preceptorId={data.preceptorId}
	lockPreceptor={true}
	onSaved={onAssignmentSaved}
/>
