<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		PageHeader,
		EntityTabs,
		ConfirmDialog,
		EmptyState,
		DetailSummary,
		toast,
		type EntityTab,
		type DetailSummaryItem
	} from '$lib/components';
	import { AssignmentDialog, ScheduleCalendarGrid } from '$lib/features/schedules/components';
	import StudentForm from '$lib/features/students/components/student-form.svelte';
	import SharedEntityWarning from '$lib/components/shared-entity-warning.svelte';
	import { completionPercent } from '$lib/features/scheduling/services/requirement-status';
	import type { StudentAssignment } from '$lib/features/schedules/types/schedule-views';

	let { data }: { data: PageData } = $props();

	const tabs: EntityTab[] = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'schedule', label: 'Schedule' },
		{ id: 'progress', label: 'Progress' },
		{ id: 'details', label: 'Details' },
		{ id: 'onboarding', label: 'Onboarding' }
	];
	let activeTab = $state('overview');

	let status = $derived(data.status);
	let overallPct = $derived(status ? completionPercent(status.overall) : 0);

	/** Typed, so the camelCase/snake_case mismatch cannot come back silently. */
	let assignments = $derived<StudentAssignment[]>(data.schedule?.assignments ?? []);

	let summaryItems = $derived<DetailSummaryItem[]>([
		{ label: 'Name', value: data.student.name },
		{ label: 'Email', value: data.student.email }
	]);

	// ---- Onboarding gaps -----------------------------------------------------
	/**
	 * Health systems this student is scheduled into but has not onboarded to.
	 * Computed from data already loaded — no extra endpoint.
	 */
	let onboardingGaps = $derived.by(() => {
		const byHealthSystem = new Map<string, { id: string; name: string; days: number }>();
		for (const a of assignments) {
			if (!a.healthSystemId) continue;
			if (data.onboardingStatus[a.healthSystemId]?.is_completed === 1) continue;
			const existing = byHealthSystem.get(a.healthSystemId);
			if (existing) existing.days += 1;
			else
				byHealthSystem.set(a.healthSystemId, {
					id: a.healthSystemId,
					name: a.healthSystemName ?? 'this health system',
					days: 1
				});
		}
		return [...byHealthSystem.values()];
	});

	// ---- Schedule tab view ---------------------------------------------------
	let scheduleView = $state<'calendar' | 'list'>('calendar');

	// The chosen view survives a reload and can be shared.
	$effect(() => {
		const fromUrl = $page.url.searchParams.get('view');
		if (fromUrl === 'list' || fromUrl === 'calendar') scheduleView = fromUrl;
	});

	function setScheduleView(next: 'calendar' | 'list') {
		scheduleView = next;
		const url = new URL($page.url);
		url.searchParams.set('view', next);
		void goto(`${url.pathname}${url.search}`, { replaceState: true, noScroll: true });
	}

	// ---- Create / edit assignment -------------------------------------------
	let showCreate = $state(false);
	let prefillClerkship = $state('');
	function addDays(clerkshipId = '') {
		prefillClerkship = clerkshipId;
		showCreate = true;
	}

	let showEdit = $state(false);
	let editId = $state<string | null>(null);
	function editAssignment(id: string) {
		editId = id;
		showEdit = true;
	}

	async function onAssignmentSaved() {
		await invalidateAll();
	}

	// ---- Delete assignment ---------------------------------------------------
	let showDelete = $state(false);
	let showPastDelete = $state(false);
	let deleteId = $state<string | null>(null);
	let pastDeleteMessage = $state('');

	function requestDelete(id: string) {
		deleteId = id;
		showDelete = true;
	}

	async function removeAssignment(force: boolean) {
		if (!deleteId) return;
		const res = await fetch(`/api/schedules/assignments/${deleteId}?force=${force}`, {
			method: 'DELETE'
		});
		if (res.status === 409) {
			// The day has already happened; ask for an explicit override.
			const body = await res.json().catch(() => null);
			pastDeleteMessage = body?.error?.message ?? 'This day has already passed.';
			showPastDelete = true;
			return;
		}
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			throw new Error(body?.error?.message || 'Failed to remove the assignment');
		}
		toast.success('Assignment removed');
		showPastDelete = false;
		await invalidateAll();
	}

	// ---- Details form ----
	let successMessage = $state<string | null>(null);
	async function handleFormSuccess() {
		successMessage = 'Student updated';
		await invalidateAll();
		setTimeout(() => (successMessage = null), 3000);
	}

	// ---- Onboarding ----
	let completedOnboarding = $derived(
		Object.values(data.onboardingStatus).filter((r) => r.is_completed === 1).length
	);
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
			toast.success(isCompleted ? 'Marked pending' : 'Marked complete');
			await invalidateAll();
		} catch (err) {
			console.error('Failed to update onboarding:', err);
			toast.error('Failed to update onboarding');
		}
	}
</script>

<svelte:head>
	<title>{data.student.name} | LIC</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-6">
	<PageHeader
		title={data.student.name}
		description={data.student.email}
		breadcrumbs={[{ label: 'Students', href: '/students' }, { label: data.student.name }]}
	>
		{#snippet actions()}
			<Button onclick={() => addDays('')}>Add assignment</Button>
		{/snippet}
	</PageHeader>

	<EntityTabs {tabs} bind:active={activeTab} urlParam="tab" />

	{#snippet onboardingBanner()}
		{#if onboardingGaps.length > 0}
			<div
				class="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
				data-testid="onboarding-warning"
			>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<span>
						{#each onboardingGaps as gap, i (gap.id)}
							{i > 0 ? '; ' : ''}Not onboarded at <strong>{gap.name}</strong> — {gap.days} scheduled
							day{gap.days === 1 ? '' : 's'} affected
						{/each}
					</span>
					<Button size="sm" variant="outline" onclick={() => (activeTab = 'onboarding')}>
						Complete onboarding
					</Button>
				</div>
			</div>
		{/if}
	{/snippet}

	{#if activeTab === 'overview'}
		{#if status && status.conflict_count > 0}
			<div class="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
				This student has {status.conflict_count} scheduling conflict{status.conflict_count > 1 ? 's' : ''}.
			</div>
		{/if}

		{@render onboardingBanner()}

		<!-- Read-only identity summary; editing lives on the Details tab -->
		<Card class="mb-6 p-6">
			<DetailSummary
				title="Student details"
				items={summaryItems}
				onEdit={() => (activeTab = 'details')}
			/>
		</Card>

		<!-- Summary cards -->
		<div class="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
			<Card class="p-4 text-center">
				<div class="text-2xl font-bold">{status?.overall.required ?? 0}</div>
				<div class="text-sm text-muted-foreground">Days required</div>
			</Card>
			<Card class="p-4 text-center">
				<div class="text-2xl font-bold text-green-600">{status?.overall.completed ?? 0}</div>
				<div class="text-sm text-muted-foreground">Completed</div>
			</Card>
			<Card class="p-4 text-center">
				<div class="text-2xl font-bold text-blue-600">{status?.overall.scheduled ?? 0}</div>
				<div class="text-sm text-muted-foreground">Scheduled</div>
			</Card>
			<Card class="p-4 text-center">
				<div class="text-2xl font-bold text-amber-600">{status?.overall.unscheduled ?? 0}</div>
				<div class="text-sm text-muted-foreground">Unscheduled</div>
			</Card>
		</div>

		<Card class="p-6">
			<h2 class="mb-4 text-xl font-semibold">Clerkship progress <span class="text-sm font-normal text-muted-foreground">({overallPct}% overall)</span></h2>
			{#if !status || status.per_clerkship.length === 0}
				<EmptyState icon="📋" title="No clerkship requirements" description="Add clerkships with required days to track this student's progress." />
			{:else}
				<div class="space-y-4">
					{#each status.per_clerkship as c (c.clerkship_id)}
						{@const total = Math.max(c.required, c.completed + c.scheduled)}
						<div class="rounded-lg border p-4">
							<div class="mb-2 flex items-center justify-between">
								<a href="/clerkships/{c.clerkship_id}" class="font-medium text-primary hover:underline">
									{c.clerkship_name}
								</a>
								<span class="text-sm text-muted-foreground">
									{c.completed} done · {c.scheduled} scheduled · {c.unscheduled} left / {c.required}
								</span>
							</div>
							<!-- Segmented progress bar -->
							<div class="flex h-2 w-full overflow-hidden rounded-full bg-gray-200">
								<div class="h-full bg-green-500" style="width: {(c.completed / total) * 100}%"></div>
								<div class="h-full bg-blue-500" style="width: {(c.scheduled / total) * 100}%"></div>
							</div>
							{#if c.unscheduled > 0}
								<div class="mt-2">
									<Button size="sm" variant="outline" onclick={() => addDays(c.clerkship_id)}>
										Add days
									</Button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</Card>
	{:else if activeTab === 'schedule'}
		{@render onboardingBanner()}
		<Card class="p-6">
			<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-xl font-semibold">Schedule</h2>
				<div class="flex items-center gap-2">
					<div class="flex gap-1">
						<Button
							size="sm"
							variant={scheduleView === 'calendar' ? 'default' : 'outline'}
							onclick={() => setScheduleView('calendar')}
						>
							Calendar
						</Button>
						<Button
							size="sm"
							variant={scheduleView === 'list' ? 'default' : 'outline'}
							onclick={() => setScheduleView('list')}
						>
							List
						</Button>
					</div>
					<Button onclick={() => addDays('')}>Add assignment</Button>
				</div>
			</div>

			{#if assignments.length === 0}
				<EmptyState
					icon="📅"
					title="No assignments yet"
					description="Add assignments to build this student's schedule."
				>
					{#snippet action()}
						<Button onclick={() => addDays('')}>Add assignment</Button>
					{/snippet}
				</EmptyState>
			{:else if scheduleView === 'calendar'}
				<p class="mb-3 text-sm text-muted-foreground">
					Click a day to edit that assignment. Each day shows the clerkship and preceptor.
				</p>
				<ScheduleCalendarGrid
					months={data.schedule?.calendar ?? []}
					mode="student"
					onAssignmentClick={(_day, assignment) => editAssignment(assignment.id)}
				/>
			{:else}
				<div class="overflow-x-auto rounded-lg border">
					<table class="w-full text-sm">
						<thead class="bg-muted/50">
							<tr>
								<th class="px-3 py-2 text-left font-medium">Date</th>
								<th class="px-3 py-2 text-left font-medium">Clerkship</th>
								<th class="px-3 py-2 text-left font-medium">Preceptor</th>
								<th class="px-3 py-2 text-left font-medium">Site</th>
								<th class="px-3 py-2 text-left font-medium"></th>
							</tr>
						</thead>
						<tbody>
							{#each assignments as a (a.id)}
								<tr class="border-t">
									<td class="px-3 py-2">{a.date}</td>
									<td class="px-3 py-2">
										<a href="/clerkships/{a.clerkshipId}" class="text-primary hover:underline"
											>{a.clerkshipName}</a
										>
									</td>
									<td class="px-3 py-2">
										<a href="/preceptors/{a.preceptorId}" class="text-primary hover:underline"
											>{a.preceptorName}</a
										>
									</td>
									<td class="px-3 py-2 text-muted-foreground">{a.siteName ?? '—'}</td>
									<td class="px-3 py-2 text-right whitespace-nowrap">
										<Button size="sm" variant="ghost" onclick={() => editAssignment(a.id)}>
											Edit
										</Button>
										<Button
											size="sm"
											variant="ghost"
											class="text-red-600 hover:bg-red-50"
											onclick={() => requestDelete(a.id)}
										>
											Remove
										</Button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Card>
	{:else if activeTab === 'progress'}
		<Card class="p-6">
			<h2 class="mb-4 text-xl font-semibold">Clerkship progress</h2>
			{#if !data.schedule || data.schedule.clerkshipProgress.length === 0}
				<EmptyState
					icon="📈"
					title="Nothing to show yet"
					description="Add clerkships with required days to track this student's progress."
				/>
			{:else}
				<div class="overflow-x-auto rounded-lg border">
					<table class="w-full text-sm" data-testid="progress-table">
						<thead class="bg-muted/50">
							<tr>
								<th class="px-3 py-2 text-left font-medium">Clerkship</th>
								<th class="px-3 py-2 text-right font-medium">Required</th>
								<th class="px-3 py-2 text-right font-medium">Assigned</th>
								<th class="px-3 py-2 text-right font-medium">Remaining</th>
								<th class="px-3 py-2 text-left font-medium">Preceptors</th>
							</tr>
						</thead>
						<tbody>
							{#each data.schedule.clerkshipProgress as c (c.clerkshipId)}
								<tr class="border-t">
									<td class="px-3 py-2">
										<a href="/clerkships/{c.clerkshipId}" class="text-primary hover:underline"
											>{c.clerkshipName}</a
										>
									</td>
									<td class="px-3 py-2 text-right">{c.requiredDays}</td>
									<td class="px-3 py-2 text-right {c.isComplete ? 'text-green-700' : ''}"
										>{c.assignedDays}</td
									>
									<td class="px-3 py-2 text-right {c.remainingDays > 0 ? 'text-amber-700' : ''}"
										>{c.remainingDays}</td
									>
									<td class="px-3 py-2">
										{#if c.preceptors.length === 0}
											<span class="text-muted-foreground">—</span>
										{:else}
											{#each c.preceptors as p, i (p.id)}
												{i > 0 ? ', ' : ''}<a
													href="/preceptors/{p.id}"
													class="text-primary hover:underline">{p.name}</a
												><span class="text-muted-foreground"> ({p.daysAssigned}d)</span>
											{/each}
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Card>
	{:else if activeTab === 'details'}
		<Card class="p-6">
			<h2 class="mb-4 text-xl font-semibold">Student information</h2>
			<SharedEntityWarning entityType="students" entityId={data.studentId} entityName={data.student.name} />
			{#if successMessage}
				<div class="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
					{successMessage}
				</div>
			{/if}
			<div class="max-w-xl">
				<StudentForm student={data.student} onSuccess={handleFormSuccess} />
			</div>
			<div class="mt-6 border-t pt-6">
				<dl class="grid grid-cols-2 gap-4 text-sm">
					<div>
						<dt class="text-muted-foreground">Created</dt>
						<dd>{new Date(String(data.student.created_at)).toLocaleDateString()}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground">Last updated</dt>
						<dd>{new Date(String(data.student.updated_at)).toLocaleDateString()}</dd>
					</div>
				</dl>
			</div>
		</Card>
	{:else if activeTab === 'onboarding'}
		<Card class="p-6">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-semibold">Health system onboarding</h2>
				<Badge variant="secondary">{completedOnboarding} / {data.healthSystems.length}</Badge>
			</div>
			<p class="mb-6 text-sm text-muted-foreground">
				Students must complete onboarding at a health system before being scheduled there.
			</p>
			{#if data.healthSystems.length === 0}
				<EmptyState icon="🏥" title="No health systems" description="Add health systems in Locations.">
					{#snippet action()}
						<Button variant="outline" onclick={() => goto('/locations?tab=health-systems')}>Manage locations</Button>
					{/snippet}
				</EmptyState>
			{:else}
				<div class="space-y-3">
					{#each data.healthSystems as healthSystem (healthSystem.id)}
						{@const record = data.onboardingStatus[healthSystem.id]}
						{@const isCompleted = record?.is_completed === 1}
						<div class="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50">
							<div class="flex items-center gap-4">
								<input
									type="checkbox"
									id={`onboarding-${healthSystem.id}`}
									checked={isCompleted}
									onchange={() => toggleOnboarding(healthSystem.id)}
									class="h-5 w-5 rounded border-gray-300"
								/>
								<label for={`onboarding-${healthSystem.id}`} class="cursor-pointer font-medium">
									{healthSystem.name}
								</label>
							</div>
							{#if isCompleted}
								<Badge class="bg-green-600">Completed</Badge>
							{:else}
								<Badge variant="secondary">Pending</Badge>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</Card>
	{/if}
</div>

<AssignmentDialog
	bind:open={showCreate}
	studentId={data.studentId}
	lockStudent={true}
	showStudentSelect={false}
	clerkshipId={prefillClerkship}
	onSaved={onAssignmentSaved}
/>

<AssignmentDialog
	bind:open={showEdit}
	mode="edit"
	assignmentId={editId ?? undefined}
	studentId={data.studentId}
	lockStudent={true}
	showStudentSelect={false}
	onSaved={onAssignmentSaved}
	onDeleted={onAssignmentSaved}
/>

<ConfirmDialog
	bind:open={showDelete}
	title="Remove assignment?"
	description="This removes the assignment from the schedule."
	confirmLabel="Remove"
	onConfirm={() => removeAssignment(false)}
/>

<ConfirmDialog
	bind:open={showPastDelete}
	title="This day has already happened"
	description={pastDeleteMessage}
	confirmLabel="Remove anyway"
	onConfirm={() => removeAssignment(true)}
/>
