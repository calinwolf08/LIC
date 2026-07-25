<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { goto, invalidateAll } from '$app/navigation';
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
	import { CreateAssignmentDialog } from '$lib/features/schedules/components';
	import StudentForm from '$lib/features/students/components/student-form.svelte';
	import SharedEntityWarning from '$lib/components/shared-entity-warning.svelte';
	import { completionPercent } from '$lib/features/scheduling/services/requirement-status';

	let { data }: { data: PageData } = $props();

	const tabs: EntityTab[] = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'schedule', label: 'Schedule' },
		{ id: 'details', label: 'Details' },
		{ id: 'onboarding', label: 'Onboarding' }
	];
	let activeTab = $state('overview');

	let status = $derived(data.status);
	let overallPct = $derived(status ? completionPercent(status.overall) : 0);

	let summaryItems = $derived<DetailSummaryItem[]>([
		{ label: 'Name', value: data.student.name },
		{ label: 'Email', value: data.student.email }
	]);

	// ---- Create assignment ----
	let showCreate = $state(false);
	let prefillClerkship = $state('');
	function addDays(clerkshipId = '') {
		prefillClerkship = clerkshipId;
		showCreate = true;
	}
	async function onAssignmentSaved() {
		await invalidateAll();
	}

	// ---- Delete assignment ----
	let showDelete = $state(false);
	let deleteId = $state<string | null>(null);
	function requestDelete(id: string) {
		deleteId = id;
		showDelete = true;
	}
	async function confirmDelete() {
		if (!deleteId) return;
		const res = await fetch(`/api/schedules/assignments/${deleteId}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = await res.json();
			throw new Error(body.error?.message || 'Failed to delete assignment');
		}
		toast.success('Assignment removed');
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

	{#if activeTab === 'overview'}
		{#if status && status.conflict_count > 0}
			<div class="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
				This student has {status.conflict_count} scheduling conflict{status.conflict_count > 1 ? 's' : ''}.
			</div>
		{/if}

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
		<Card class="p-6">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-semibold">Schedule</h2>
				<Button onclick={() => addDays('')}>Add assignment</Button>
			</div>
			{#if !data.schedule || data.schedule.assignments.length === 0}
				<EmptyState
					icon="📅"
					title="No assignments yet"
					description="Add assignments to build this student's schedule."
				>
					{#snippet action()}
						<Button onclick={() => addDays('')}>Add assignment</Button>
					{/snippet}
				</EmptyState>
			{:else}
				<div class="overflow-x-auto rounded-lg border">
					<table class="w-full text-sm">
						<thead class="bg-muted/50">
							<tr>
								<th class="px-3 py-2 text-left font-medium">Date</th>
								<th class="px-3 py-2 text-left font-medium">Clerkship</th>
								<th class="px-3 py-2 text-left font-medium">Preceptor</th>
								<th class="px-3 py-2 text-left font-medium"></th>
							</tr>
						</thead>
						<tbody>
							{#each data.schedule.assignments as a (a.id)}
								<tr class="border-t">
									<td class="px-3 py-2">{a.date}</td>
									<td class="px-3 py-2">
										<a href="/clerkships/{a.clerkship_id}" class="text-primary hover:underline">{a.clerkship_name}</a>
									</td>
									<td class="px-3 py-2">
										<a href="/preceptors/{a.preceptor_id}" class="text-primary hover:underline">{a.preceptor_name}</a>
									</td>
									<td class="px-3 py-2 text-right">
										<Button size="sm" variant="ghost" class="text-red-600 hover:bg-red-50" onclick={() => requestDelete(a.id)}>
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

<CreateAssignmentDialog
	bind:open={showCreate}
	studentId={data.studentId}
	lockStudent={true}
	clerkshipId={prefillClerkship}
	onSaved={onAssignmentSaved}
/>

<ConfirmDialog
	bind:open={showDelete}
	title="Remove assignment?"
	description="This removes the assignment from the schedule."
	confirmLabel="Remove"
	onConfirm={confirmDelete}
/>
