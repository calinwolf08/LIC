<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import { PageHeader, ConfirmDialog, EmptyState, toast } from '$lib/components';
	import { goto, invalidateAll } from '$app/navigation';
	import { selectSchedule, formatDateRange, refreshSchedules } from '$lib/stores/schedule-store';
	import { nextQuarter, validateQuarters } from '$lib/features/schedules/utils/quarters';
	import { Info } from '@lucide/svelte';

	let { data }: { data: PageData } = $props();

	let settingActive = $state<string | null>(null);

	// Edit dialog state
	let showEdit = $state(false);
	let editId = $state<string | null>(null);
	let editName = $state('');
	let editStart = $state('');
	let editEnd = $state('');
	let savingEdit = $state(false);
	let editError = $state<string | null>(null);

	// Delete state
	let showDelete = $state(false);
	let deleteTarget = $state<{ id: string; name: string } | null>(null);

	async function setActiveSchedule(scheduleId: string) {
		settingActive = scheduleId;
		try {
			const response = await fetch('/api/user/active-schedule', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ scheduleId })
			});
			if (response.ok) {
				selectSchedule(scheduleId);
				await invalidateAll();
				toast.success('Active schedule updated');
			} else {
				toast.error('Failed to set active schedule');
			}
		} catch (error) {
			console.error('Failed to set active schedule:', error);
			toast.error('Failed to set active schedule');
		} finally {
			settingActive = null;
		}
	}

	function openEdit(schedule: { id: string; name: string; start_date: string; end_date: string }) {
		editId = schedule.id;
		editName = schedule.name;
		editStart = schedule.start_date;
		editEnd = schedule.end_date;
		editError = null;
		showEdit = true;
		void loadQuarters(schedule.id);
	}

	// ---- Quarters (M4) ------------------------------------------------------
	let quarters = $state<{ id?: string; name: string; start_date: string; end_date: string }[]>([]);
	let savingQuarters = $state(false);

	async function loadQuarters(scheduleId: string) {
		quarters = [];
		try {
			const r = await fetch(`/api/scheduling-periods/${scheduleId}/quarters`);
			const b = await r.json();
			if (b?.success) {
				quarters = (b.data.quarters ?? []).map(
					(q: { id: string; name: string; start_date: string; end_date: string }) => ({
						id: q.id,
						name: q.name,
						start_date: q.start_date,
						end_date: q.end_date
					})
				);
			}
		} catch {
			// non-fatal — the editor just starts empty
		}
	}

	// The quarter "Add quarter" would create: Q<n>, starting the day after the
	// latest quarter ends, three months long, within the schedule's dates.
	let upcomingQuarter = $derived(
		nextQuarter(quarters, { start_date: editStart, end_date: editEnd })
	);
	// Problems with the quarters as edited, checked against the dates in this
	// dialog (the server re-checks against the saved schedule).
	let quarterIssues = $derived(
		validateQuarters(quarters, { start_date: editStart, end_date: editEnd })
	);
	const issuesFor = (index: number) =>
		quarterIssues.filter((issue) => issue.index === index).map((issue) => issue.message);

	function addQuarter() {
		if (upcomingQuarter) quarters = [...quarters, upcomingQuarter];
	}

	function removeQuarter(index: number) {
		quarters = quarters.filter((_, i) => i !== index);
	}

	async function saveQuarters() {
		if (!editId) return;
		savingQuarters = true;
		try {
			const payload = quarters.map((q) => ({
				name: q.name.trim(),
				start_date: q.start_date,
				end_date: q.end_date
			}));
			const r = await fetch(`/api/scheduling-periods/${editId}/quarters`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ quarters: payload })
			});
			const b = await r.json();
			if (r.ok && b.success) {
				quarters = (b.data.quarters ?? []).map(
					(q: { id: string; name: string; start_date: string; end_date: string }) => ({
						id: q.id,
						name: q.name,
						start_date: q.start_date,
						end_date: q.end_date
					})
				);
				toast.success('Quarters saved');
			} else {
				toast.error(b.error?.message ?? 'Failed to save quarters');
			}
		} catch {
			toast.error('Network error saving quarters');
		} finally {
			savingQuarters = false;
		}
	}

	async function saveEdit() {
		if (!editId) return;
		savingEdit = true;
		editError = null;
		try {
			const response = await fetch(`/api/scheduling-periods/${editId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: editName, start_date: editStart, end_date: editEnd })
			});
			if (!response.ok) {
				const body = await response.json();
				editError = body.error?.message || body.error || 'Failed to update schedule';
				return;
			}
			showEdit = false;
			await invalidateAll();
			await refreshSchedules();
			toast.success('Schedule updated');
		} catch (error) {
			console.error('Failed to update schedule:', error);
			editError = 'Network error updating schedule';
		} finally {
			savingEdit = false;
		}
	}

	function requestDelete(schedule: { id: string; name: string }) {
		deleteTarget = schedule;
		showDelete = true;
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		const response = await fetch(`/api/scheduling-periods/${deleteTarget.id}`, {
			method: 'DELETE'
		});
		if (!response.ok) {
			const body = await response.json();
			throw new Error(body.error?.message || body.error || 'Failed to delete schedule');
		}
		toast.success('Schedule deleted');
		await invalidateAll();
		await refreshSchedules();
	}
</script>

<svelte:head>
	<title>Schedules | LIC Scheduler</title>
</svelte:head>

<div class="container mx-auto py-8">
	<PageHeader
		title="Schedules"
		description="Each schedule is a scheduling period with its own students, preceptors, and assignments. If you're just getting started, finish setting up your current schedule rather than creating a new one — create a new schedule only when you need a separate period (e.g. a new academic year)."
	>
		{#snippet actions()}
			<Button onclick={() => goto('/schedules/new')}>+ New schedule</Button>
		{/snippet}
	</PageHeader>

	{#if data.schedules.length === 0}
		<EmptyState
			icon="📅"
			title="No schedules yet"
			description="Create your first schedule to start managing clerkship assignments."
		>
			{#snippet action()}
				<Button onclick={() => goto('/schedules/new')}>Create schedule</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="grid gap-4">
			{#each data.schedules as schedule (schedule.id)}
				{@const isActive = schedule.id === data.activeScheduleId}
				<Card class="p-6 {isActive ? 'bg-blue-50/50 ring-2 ring-blue-500' : ''}">
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<div class="flex items-center gap-3">
								<h3 class="text-lg font-semibold text-gray-900">{schedule.name}</h3>
								{#if isActive}
									<span
										class="inline-flex items-center rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800"
									>
										Active
									</span>
								{/if}
							</div>
							<p class="mt-1 text-sm text-gray-600">
								{formatDateRange(schedule.start_date, schedule.end_date)}
								{#if schedule.year}
									<span class="ml-2">Year {schedule.year}</span>
								{/if}
							</p>
							<div class="mt-3 flex gap-6 text-sm text-gray-500">
								<span>{schedule.studentCount} students</span>
								<span>{schedule.preceptorCount} preceptors</span>
								<span>{schedule.clerkshipCount} clerkships</span>
							</div>
						</div>

						<div class="flex items-center gap-2">
							{#if !isActive}
								<Button
									variant="outline"
									size="sm"
									onclick={() => setActiveSchedule(schedule.id!)}
									disabled={settingActive === schedule.id}
								>
									{settingActive === schedule.id ? 'Setting…' : 'Set active'}
								</Button>
							{/if}
							<Button
								variant="outline"
								size="sm"
								onclick={() =>
									openEdit({
										id: schedule.id!,
										name: schedule.name,
										start_date: schedule.start_date,
										end_date: schedule.end_date
									})}
							>
								Edit
							</Button>
							<Button
								variant="outline"
								size="sm"
								onclick={() => goto(`/schedules/new?source=${schedule.id}`)}
							>
								Duplicate
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => requestDelete({ id: schedule.id!, name: schedule.name })}
								class="text-red-600 hover:bg-red-50 hover:text-red-700"
							>
								Delete
							</Button>
						</div>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>

<!-- Edit schedule dialog -->
<Dialog.Root bind:open={showEdit}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Edit schedule</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-4">
			{#if editError}
				<div
					class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
				>
					{editError}
				</div>
			{/if}
			<div class="space-y-2">
				<Label for="edit-name">Name</Label>
				<Input id="edit-name" bind:value={editName} />
			</div>
			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="edit-start">Start date</Label>
					<Input id="edit-start" type="date" bind:value={editStart} />
				</div>
				<div class="space-y-2">
					<Label for="edit-end">End date</Label>
					<Input id="edit-end" type="date" bind:value={editEnd} />
				</div>
			</div>

			<!-- Quarters (M4) -->
			<div class="space-y-2 border-t pt-4" data-testid="quarters-editor">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1.5">
						<Label>Quarters <span class="text-muted-foreground">(optional)</span></Label>
						<span
							class="text-muted-foreground"
							title="Quarters split the schedule into named periods (for example Q1–Q4 of an academic year). They're a reference for planning and don't change how assignments are scheduled or validated."
							data-testid="quarters-help"
						>
							<Info class="h-4 w-4" aria-hidden="true" />
							<span class="sr-only">About quarters</span>
						</span>
					</div>
					<Button
						size="sm"
						variant="outline"
						onclick={addQuarter}
						disabled={!upcomingQuarter}
						data-testid="add-quarter">Add quarter</Button
					>
				</div>
				<p class="text-xs text-muted-foreground">
					Split the schedule into named periods, such as Q1–Q4 of an academic year, to plan by term.
					Quarters must fall within the schedule's dates and can't overlap. Each new quarter starts
					the day after the previous one ends and runs three months; adjust as needed. They're for
					reference — they don't change how assignments are scheduled.
				</p>
				{#each quarters as q, i (i)}
					{@const rowIssues = issuesFor(i)}
					<div class="space-y-1" data-testid="quarter-row">
						<div class="grid grid-cols-[5rem_1fr_1fr_auto] items-center gap-2">
							<Input
								bind:value={q.name}
								aria-label="Quarter name"
								aria-invalid={rowIssues.length > 0}
								data-testid="quarter-name"
							/>
							<Input
								type="date"
								bind:value={q.start_date}
								min={editStart}
								max={editEnd}
								aria-label="{q.name || 'Quarter'} start date"
								aria-invalid={rowIssues.length > 0}
								data-testid="quarter-start"
							/>
							<Input
								type="date"
								bind:value={q.end_date}
								min={q.start_date || editStart}
								max={editEnd}
								aria-label="{q.name || 'Quarter'} end date"
								aria-invalid={rowIssues.length > 0}
								data-testid="quarter-end"
							/>
							<Button
								size="sm"
								variant="ghost"
								onclick={() => removeQuarter(i)}
								aria-label="Remove {q.name || 'quarter'}"
								data-testid="remove-quarter">✕</Button
							>
						</div>
						{#each rowIssues as message (message)}
							<p class="text-xs text-destructive" data-testid="quarter-issue">{message}</p>
						{/each}
					</div>
				{/each}
				{#if quarters.length > 0 && !upcomingQuarter}
					<p class="text-xs text-muted-foreground">
						The last quarter reaches the end of the schedule, so there's no room for another.
					</p>
				{/if}
				<Button
					size="sm"
					variant="secondary"
					onclick={saveQuarters}
					disabled={savingQuarters || quarterIssues.length > 0}
					data-testid="save-quarters"
				>
					{savingQuarters ? 'Saving…' : 'Save quarters'}
				</Button>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (showEdit = false)} disabled={savingEdit}
				>Cancel</Button
			>
			<Button onclick={saveEdit} disabled={savingEdit || !editName || !editStart || !editEnd}>
				{savingEdit ? 'Saving…' : 'Save changes'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete confirmation -->
<ConfirmDialog
	bind:open={showDelete}
	title={`Delete ${deleteTarget?.name ?? 'schedule'}?`}
	description="This permanently deletes the schedule and its assignments. Entities shared with other schedules are kept."
	confirmLabel="Delete schedule"
	onConfirm={confirmDelete}
/>
