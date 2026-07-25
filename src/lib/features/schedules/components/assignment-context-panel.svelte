<script lang="ts">
	/**
	 * Compact read-only summary of the selected student (Step 18.7): clerkship
	 * progress and the preceptors they are already assigned to, so the user has
	 * that context while assigning. The deeper view lives on the student page.
	 */
	import type { StudentSchedule } from '../types/schedule-views';

	interface Props {
		studentId: string;
		/** Bumped by the caller after a save so the panel refetches. */
		refreshKey?: number;
	}

	let { studentId, refreshKey = 0 }: Props = $props();

	let schedule = $state<StudentSchedule | null>(null);
	let loading = $state(false);

	$effect(() => {
		const id = studentId;
		void refreshKey;
		if (!id) {
			schedule = null;
			return;
		}
		let cancelled = false;
		loading = true;
		fetch(`/api/students/${id}/schedule`)
			.then((r) => r.json())
			.then((body) => {
				if (cancelled) return;
				schedule = body?.success ? body.data : null;
			})
			.catch(() => {
				if (!cancelled) schedule = null;
			})
			.finally(() => {
				if (!cancelled) loading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	let started = $derived((schedule?.clerkshipProgress ?? []).filter((c) => c.assignedDays > 0));

	let preceptors = $derived.by(() => {
		const map = new Map<string, { id: string; name: string; days: number }>();
		for (const c of schedule?.clerkshipProgress ?? []) {
			for (const p of c.preceptors) {
				const existing = map.get(p.id);
				if (existing) existing.days += p.daysAssigned;
				else map.set(p.id, { id: p.id, name: p.name, days: p.daysAssigned });
			}
		}
		return [...map.values()];
	});
</script>

<div class="rounded-md border bg-muted/30 p-3 text-sm" data-testid="assignment-context-panel">
	{#if loading && !schedule}
		<p class="text-muted-foreground">Loading student context…</p>
	{:else if !schedule}
		<p class="text-muted-foreground">Pick a student to see their progress.</p>
	{:else}
		<div class="flex items-baseline justify-between gap-2">
			<a href="/students/{schedule.student.id}" class="font-medium hover:underline"
				>{schedule.student.name}</a
			>
			<span class="text-xs text-muted-foreground">
				{schedule.summary.totalAssignedDays} of {schedule.summary.totalRequiredDays} days assigned
			</span>
		</div>

		{#if started.length > 0}
			<ul class="mt-2 space-y-1">
				{#each started as c (c.clerkshipId)}
					<li class="flex items-center justify-between gap-2 text-xs">
						<a href="/clerkships/{c.clerkshipId}" class="truncate hover:underline"
							>{c.clerkshipName}</a
						>
						<span class={c.isComplete ? 'text-green-700' : 'text-amber-700'}>
							{c.assignedDays}/{c.requiredDays}
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="mt-2 text-xs text-muted-foreground">No assignments yet.</p>
		{/if}

		{#if preceptors.length > 0}
			<p class="mt-3 text-xs font-medium text-muted-foreground">Assigned preceptors</p>
			<ul class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
				{#each preceptors as p (p.id)}
					<li>
						<a href="/preceptors/{p.id}" class="hover:underline">{p.name}</a>
						<span class="text-muted-foreground"> · {p.days}d</span>
					</li>
				{/each}
			</ul>
		{/if}

		<a
			href="/students/{schedule.student.id}?tab=progress"
			class="mt-3 inline-block text-xs text-primary hover:underline"
		>
			See full progress
		</a>
	{/if}
</div>
