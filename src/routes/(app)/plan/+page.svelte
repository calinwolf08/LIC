<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { OVERRIDE_LABELS } from '$lib/features/scheduling/services/assignment-validation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Entity = { id: string; name: string };
	type Pin = {
		id: string;
		student_id: string;
		preceptor_id: string | null;
		clerkship_id: string | null;
		site_id: string | null;
		date: string;
		session: string;
		kind: string;
		override_codes: string;
	};
	type PinStatus = {
		hard: { code: string }[];
		soft: { code: string }[];
		unresolved: string[];
		committable: boolean;
	};

	// ---- form state -------------------------------------------------------
	let studentId = $state('');
	let clerkshipId = $state('');
	let preceptorId = $state('');
	let siteId = $state('');
	let kind = $state<'clinical' | 'free_day' | 'exam'>('clinical');
	let session = $state<'full' | 'am' | 'pm'>('full');
	let dateMode = $state<'single' | 'range'>('single');
	let singleDate = $state('');
	let rangeStart = $state('');
	let rangeEnd = $state('');
	let weekdays = $state<number[]>([1, 2, 3, 4, 5]);

	// ---- plan state -------------------------------------------------------
	let pins = $state<Pin[]>([]);
	let pinStatus = $state<Record<string, PinStatus>>({});
	let counts = $state<Record<string, number>>({});
	let violationCount = $state(0);
	let loading = $state(false);
	let error = $state('');

	const WEEKDAYS = [
		{ v: 1, l: 'Mon' },
		{ v: 2, l: 'Tue' },
		{ v: 3, l: 'Wed' },
		{ v: 4, l: 'Thu' },
		{ v: 5, l: 'Fri' },
		{ v: 6, l: 'Sat' },
		{ v: 0, l: 'Sun' }
	];

	const nameOf = (list: Entity[], id: string | null): string =>
		(id && list.find((e) => e.id === id)?.name) || '—';

	function codeLabel(code: string): string {
		return (OVERRIDE_LABELS as Record<string, string>)[code] ?? code;
	}

	/** The dates the current form would stage. */
	function formDates(): string[] {
		if (dateMode === 'single') return singleDate ? [singleDate] : [];
		if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return [];
		const out: string[] = [];
		const d = new Date(`${rangeStart}T00:00:00Z`);
		const end = new Date(`${rangeEnd}T00:00:00Z`);
		while (d <= end) {
			if (weekdays.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
			d.setUTCDate(d.getUTCDate() + 1);
		}
		return out;
	}

	const canAdd = $derived(
		!!studentId &&
			formDates().length > 0 &&
			(kind !== 'clinical' || (!!preceptorId && !!siteId))
	);

	async function refresh() {
		const res = await fetch('/api/schedules/plan/validate');
		const body = await res.json();
		const d = body.data ?? {};
		pins = d.pins ?? [];
		pinStatus = d.pinStatus ?? {};
		counts = d.counts ?? {};
		violationCount = d.violations?.length ?? 0;
	}

	async function addToPlan() {
		if (!canAdd) return;
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/schedules/plan/pins', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					student_id: studentId,
					kind,
					preceptor_id: kind === 'clinical' ? preceptorId : null,
					clerkship_id: kind === 'clinical' ? clerkshipId || null : null,
					site_id: kind === 'clinical' ? siteId : null,
					dates: formDates(),
					session
				})
			});
			if (!res.ok) {
				const b = await res.json().catch(() => ({}));
				error = b?.error?.message ?? 'Could not add to plan';
				return;
			}
			await refresh();
		} finally {
			loading = false;
		}
	}

	function acceptedOf(pin: Pin): string[] {
		try {
			const parsed = JSON.parse(pin.override_codes);
			return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
		} catch {
			return [];
		}
	}

	/** Accept a soft code on a pin so it would commit despite the warning. */
	async function acceptCode(pin: Pin, code: string) {
		const override_codes = [...new Set([...acceptedOf(pin), code])];
		await fetch(`/api/schedules/plan/pins/${pin.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ override_codes })
		});
		await refresh();
	}

	/** Drop every accepted override on a pin (back to blocking on its soft codes). */
	async function resetOverrides(pin: Pin) {
		await fetch(`/api/schedules/plan/pins/${pin.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ override_codes: [] })
		});
		await refresh();
	}

	async function removePin(id: string) {
		await fetch(`/api/schedules/plan/pins/${id}`, { method: 'DELETE' });
		await refresh();
	}

	async function clearPlan() {
		await fetch('/api/schedules/plan/pins', { method: 'DELETE' });
		await refresh();
	}

	function toggleWeekday(v: number) {
		weekdays = weekdays.includes(v) ? weekdays.filter((w) => w !== v) : [...weekdays, v];
	}

	$effect(() => {
		if (data.hasActiveSchedule) refresh();
	});
</script>

<svelte:head><title>Planner</title></svelte:head>

<div class="p-6" data-testid="plan-workspace">
	<div class="mb-4 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold">Planner</h1>
			<p class="text-sm text-muted-foreground">
				Stage assignments and see conflicts before committing. Nothing is saved to the schedule
				until you commit the plan.
			</p>
		</div>
		{#if pins.length > 0}
			<Button variant="outline" onclick={clearPlan} data-testid="plan-clear">Clear plan</Button>
		{/if}
	</div>

	{#if !data.hasActiveSchedule}
		<Card class="p-6" data-testid="plan-no-schedule">
			<p class="text-sm">Activate a schedule to start planning.</p>
		</Card>
	{:else}
		<div class="grid gap-6 lg:grid-cols-[360px_1fr]">
			<!-- ---- Add to plan ---------------------------------------------- -->
			<Card class="space-y-3 p-4" data-testid="plan-form">
				<h2 class="font-medium">Add to plan</h2>

				<div class="space-y-1">
					<Label for="plan-student">Student</Label>
					<select
						id="plan-student"
						class="w-full rounded-md border bg-background p-2 text-sm"
						bind:value={studentId}
						data-testid="plan-student"
					>
						<option value="">Select a student…</option>
						{#each data.students as s (s.id)}
							<option value={s.id}>{s.name}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-1">
					<Label for="plan-kind">Type</Label>
					<select
						id="plan-kind"
						class="w-full rounded-md border bg-background p-2 text-sm"
						bind:value={kind}
						data-testid="plan-kind"
					>
						<option value="clinical">Clinical</option>
						<option value="free_day">Free day</option>
						<option value="exam">Exam</option>
					</select>
				</div>

				{#if kind === 'clinical'}
					<div class="space-y-1">
						<Label for="plan-clerkship">Clerkship</Label>
						<select
							id="plan-clerkship"
							class="w-full rounded-md border bg-background p-2 text-sm"
							bind:value={clerkshipId}
							data-testid="plan-clerkship"
						>
							<option value="">Select a clerkship…</option>
							{#each data.clerkships as c (c.id)}
								<option value={c.id}>{c.name}</option>
							{/each}
						</select>
					</div>

					<div class="space-y-1">
						<Label for="plan-preceptor">Preceptor</Label>
						<select
							id="plan-preceptor"
							class="w-full rounded-md border bg-background p-2 text-sm"
							bind:value={preceptorId}
							data-testid="plan-preceptor"
						>
							<option value="">Select a preceptor…</option>
							{#each data.preceptors as p (p.id)}
								<option value={p.id}>{p.name}</option>
							{/each}
						</select>
					</div>

					<div class="space-y-1">
						<Label for="plan-site">Site</Label>
						<select
							id="plan-site"
							class="w-full rounded-md border bg-background p-2 text-sm"
							bind:value={siteId}
							data-testid="plan-site"
						>
							<option value="">Select a site…</option>
							{#each data.sites as s (s.id)}
								<option value={s.id}>{s.name}</option>
							{/each}
						</select>
					</div>

					<div class="space-y-1">
						<Label for="plan-session">Session</Label>
						<select
							id="plan-session"
							class="w-full rounded-md border bg-background p-2 text-sm"
							bind:value={session}
							data-testid="plan-session"
						>
							<option value="full">Full day</option>
							<option value="am">Morning</option>
							<option value="pm">Afternoon</option>
						</select>
					</div>
				{/if}

				<!-- dates -->
				<div class="space-y-1">
					<Label>Dates</Label>
					<div class="flex gap-2 text-sm">
						<button
							type="button"
							class="rounded-md border px-3 py-1 {dateMode === 'single' ? 'bg-primary text-primary-foreground' : ''}"
							onclick={() => (dateMode = 'single')}
							data-testid="plan-mode-single">Single</button
						>
						<button
							type="button"
							class="rounded-md border px-3 py-1 {dateMode === 'range' ? 'bg-primary text-primary-foreground' : ''}"
							onclick={() => (dateMode = 'range')}
							data-testid="plan-mode-range">Range</button
						>
					</div>
				</div>

				{#if dateMode === 'single'}
					<Input
						type="date"
						min={data.activeSchedule?.startDate}
						max={data.activeSchedule?.endDate}
						bind:value={singleDate}
						data-testid="plan-date"
					/>
				{:else}
					<div class="flex gap-2">
						<Input
							type="date"
							min={data.activeSchedule?.startDate}
							max={data.activeSchedule?.endDate}
							bind:value={rangeStart}
							data-testid="plan-range-start"
						/>
						<Input
							type="date"
							min={data.activeSchedule?.startDate}
							max={data.activeSchedule?.endDate}
							bind:value={rangeEnd}
							data-testid="plan-range-end"
						/>
					</div>
					<div class="flex flex-wrap gap-1">
						{#each WEEKDAYS as w (w.v)}
							<button
								type="button"
								class="rounded-md border px-2 py-1 text-xs {weekdays.includes(w.v) ? 'bg-primary text-primary-foreground' : ''}"
								onclick={() => toggleWeekday(w.v)}
								data-testid="plan-weekday-{w.v}">{w.l}</button
							>
						{/each}
					</div>
					<p class="text-xs text-muted-foreground">{formDates().length} day(s) selected</p>
				{/if}

				{#if error}
					<p class="text-sm text-destructive" data-testid="plan-error">{error}</p>
				{/if}

				<Button class="w-full" disabled={!canAdd || loading} onclick={addToPlan} data-testid="plan-add">
					Add to plan
				</Button>
			</Card>

			<!-- ---- Plan + conflicts ----------------------------------------- -->
			<div class="space-y-4">
				<!-- conflict summary -->
				<Card class="p-4" data-testid="plan-conflicts">
					<div class="mb-2 flex items-center justify-between">
						<h2 class="font-medium">Conflicts</h2>
						<Badge variant={violationCount > 0 ? 'destructive' : 'secondary'} data-testid="plan-conflict-count">
							{violationCount}
						</Badge>
					</div>
					{#if violationCount === 0}
						<p class="text-sm text-muted-foreground">No conflicts in the current plan.</p>
					{:else}
						<ul class="space-y-1 text-sm">
							{#each Object.entries(counts) as [code, n] (code)}
								<li class="flex justify-between" data-testid="plan-conflict-{code}">
									<span>{codeLabel(code)}</span>
									<span class="text-muted-foreground">{n}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</Card>

				<!-- pin list -->
				<Card class="p-4" data-testid="plan-pins">
					<h2 class="mb-2 font-medium">Planned ({pins.length})</h2>
					{#if pins.length === 0}
						<p class="text-sm text-muted-foreground" data-testid="plan-empty">
							Nothing planned yet. Add assignments on the left.
						</p>
					{:else}
						<ul class="divide-y">
							{#each pins as pin (pin.id)}
								{@const st = pinStatus[pin.id]}
								{@const accepted = acceptedOf(pin)}
								<li class="py-2 text-sm" data-testid="plan-pin-{pin.id}">
									<div class="flex items-center justify-between gap-2">
										<div class="min-w-0">
											<div class="truncate font-medium">
												{nameOf(data.students, pin.student_id)} · {pin.date}
												{#if pin.session !== 'full'}<span class="text-muted-foreground"> ({pin.session.toUpperCase()})</span>{/if}
											</div>
											<div class="truncate text-xs text-muted-foreground">
												{#if pin.kind === 'clinical'}
													{nameOf(data.clerkships, pin.clerkship_id)} · {nameOf(data.preceptors, pin.preceptor_id)} · {nameOf(data.sites, pin.site_id)}
												{:else}
													{pin.kind === 'free_day' ? 'Free day' : 'Exam'}
												{/if}
											</div>
										</div>
										<div class="flex shrink-0 items-center gap-2">
											{#if !st || st.committable}
												<Badge variant="secondary" data-testid="plan-pin-status-{pin.id}">OK</Badge>
											{:else if st.hard.length > 0}
												<Badge variant="destructive" data-testid="plan-pin-status-{pin.id}">Blocked</Badge>
											{:else}
												<Badge variant="outline" data-testid="plan-pin-status-{pin.id}">
													{st.unresolved.length} to resolve
												</Badge>
											{/if}
											<Button
												variant="ghost"
												size="sm"
												onclick={() => removePin(pin.id)}
												data-testid="plan-pin-remove-{pin.id}">Remove</Button
											>
										</div>
									</div>

									{#if st && (st.unresolved.length > 0 || accepted.length > 0 || st.hard.length > 0)}
										<div class="mt-1 flex flex-wrap items-center gap-1" data-testid="plan-pin-overrides-{pin.id}">
											{#each st.hard as v (v.code)}
												<Badge variant="destructive" class="text-xs">Can’t override: {codeLabel(v.code)}</Badge>
											{/each}
											{#each st.unresolved as code (code)}
												<button
													type="button"
													class="rounded-md border border-amber-400 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-50 dark:text-amber-300"
													onclick={() => acceptCode(pin, code)}
													data-testid="plan-pin-accept-{pin.id}-{code}"
												>
													Accept: {codeLabel(code)}
												</button>
											{/each}
											{#each accepted as code (code)}
												<Badge variant="secondary" class="text-xs">Accepted: {codeLabel(code)}</Badge>
											{/each}
											{#if accepted.length > 0}
												<button
													type="button"
													class="text-xs text-muted-foreground underline"
													onclick={() => resetOverrides(pin)}
													data-testid="plan-pin-reset-{pin.id}">Reset</button
												>
											{/if}
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Card>
			</div>
		</div>
	{/if}
</div>
