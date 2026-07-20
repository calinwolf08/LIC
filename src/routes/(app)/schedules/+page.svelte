<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import { PageHeader, ConfirmDialog, EmptyState, toast } from '$lib/components';
	import { goto, invalidateAll } from '$app/navigation';
	import { selectSchedule, formatDateRange } from '$lib/stores/schedule-store';

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

	function openEdit(schedule: {
		id: string;
		name: string;
		start_date: string;
		end_date: string;
	}) {
		editId = schedule.id;
		editName = schedule.name;
		editStart = schedule.start_date;
		editEnd = schedule.end_date;
		editError = null;
		showEdit = true;
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
	}
</script>

<svelte:head>
	<title>Schedules | LIC Scheduler</title>
</svelte:head>

<div class="container mx-auto py-8">
	<PageHeader title="Schedules" description="Each schedule is a scheduling period with its own students, preceptors, and assignments.">
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
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Edit schedule</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-4">
			{#if editError}
				<div class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
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
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (showEdit = false)} disabled={savingEdit}>Cancel</Button>
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
