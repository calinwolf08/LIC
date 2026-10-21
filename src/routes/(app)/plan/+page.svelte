<script lang="ts">
	import { tick } from 'svelte';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import { OVERRIDE_LABELS } from '$lib/features/scheduling/services/assignment-validation';
	import PlanCalendar, {
		type PlanCalendarItem
	} from '$lib/features/schedules/components/plan-calendar.svelte';
	import type {
		PlanDateCheck,
		PlanOption,
		PlanOptions
	} from '$lib/features/schedules/services/plan-options';
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
		override_note: string | null;
	};
	type Finding = { code: string; message: string; assignment_ids: string[] };
	type PinStatus = {
		hard: Finding[];
		soft: Finding[];
		unresolved: string[];
		committable: boolean;
	};
	type Saved = {
		id: string;
		student_id: string;
		preceptor_id: string | null;
		clerkship_id: string | null;
		site_id: string | null;
		date: string;
		session: string;
		kind: string;
	};

	/** Marks a pin the coordinator added despite hidden conflicts (kept on commit). */
	const OVERRIDE_NOTE_PREFIX = 'Added in the planner despite: ';

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
	/** Off: pickers offer only choices that work. On: everything, with the reasons. */
	let showAll = $state(false);

	// ---- plan state -------------------------------------------------------
	let pins = $state<Pin[]>([]);
	let pinStatus = $state<Record<string, PinStatus>>({});
	let counts = $state<Record<string, number>>({});
	let violations = $state<Finding[]>([]);
	let committed = $state<Saved[]>([]);
	let blackoutDates = $state<string[]>([]);
	let planVersion = $state(0);
	let loading = $state(false);
	let error = $state('');
	let committing = $state(false);
	let commitResult = $state<{ committed: number; skipped: number } | null>(null);
	let selectedPinId = $state<string | null>(null);
	let confirmOpen = $state(false);

	// ---- options (what's valid for the current selection) -------------------
	let options = $state<PlanOptions | null>(null);
	let optionsFor = $state('');

	const violationCount = $derived(violations.length);
	const committableCount = $derived(pins.filter((p) => pinStatus[p.id]?.committable).length);

	// Don't let the coordinator stage a past date: commit runs a create-time past_date
	// check the dry-run doesn't, so a past pin would read OK then be skipped. The floor
	// is the later of today and the schedule start.
	const todayISO = new Date().toISOString().slice(0, 10);
	const minDate = $derived(
		data.activeSchedule && data.activeSchedule.startDate > todayISO
			? data.activeSchedule.startDate
			: todayISO
	);

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
	const dates = $derived.by(() => {
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
	});

	const clinical = $derived(kind === 'clinical');

	/** What the options endpoint is asked about; also the key for "are options current?". */
	const selectionKey = $derived(
		JSON.stringify({
			studentId: studentId || null,
			kind,
			clerkshipId: clinical ? clerkshipId || null : null,
			preceptorId: clinical ? preceptorId || null : null,
			siteId: clinical ? siteId || null : null,
			dates,
			session: clinical ? session : 'full',
			v: planVersion
		})
	);
	const optionsReady = $derived(options !== null && optionsFor === selectionKey);

	let optionsSeq = 0;
	async function loadOptions(key: string) {
		const seq = ++optionsSeq;
		const { v: _version, ...selection } = JSON.parse(key);
		const res = await fetch('/api/schedules/plan/options', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(selection)
		});
		if (!res.ok || seq !== optionsSeq) return;
		const body = await res.json();
		options = body.data;
		optionsFor = key;
	}

	$effect(() => {
		if (!data.hasActiveSchedule) return;
		const key = selectionKey;
		const timer = setTimeout(() => loadOptions(key), 120);
		return () => clearTimeout(timer);
	});

	/** A picker's options: only the ones that work, unless "Show all options" is on.
	 * The current pick always stays listed so the select never silently changes. */
	function shown(list: PlanOption[] | undefined, fallback: Entity[], selected: string) {
		const all = list ?? fallback.map((e) => ({ ...e, eligible: true, reasons: [], codes: [] }));
		return showAll ? all : all.filter((o) => o.eligible || o.id === selected);
	}

	function hiddenCount(list: PlanOption[] | undefined): number {
		return showAll || !list ? 0 : list.filter((o) => !o.eligible).length;
	}

	function optionLabel(o: PlanOption): string {
		if (!o.eligible) return `${o.name} — ${o.reasons.join('; ')}`;
		if (o.totalDays && o.validDays !== undefined && o.validDays < o.totalDays) {
			return `${o.name} (${o.validDays} of ${o.totalDays} days)`;
		}
		return o.name;
	}

	/** Why the current pick for a field doesn't work, if it doesn't. */
	function pickIssue(list: PlanOption[] | undefined, selected: string): string | null {
		if (!selected || !list) return null;
		const o = list.find((x) => x.id === selected);
		return o && !o.eligible ? o.reasons.join('; ') : null;
	}

	const checks = $derived(new Map((options?.dates ?? []).map((c) => [c.date, c])));
	const validDates = $derived(dates.filter((d) => checks.get(d)?.valid));
	const invalidChecks = $derived(
		dates.map((d) => checks.get(d)).filter((c): c is PlanDateCheck => !!c && !c.valid)
	);
	/** By default only the days that work are staged; "Show all" stages every day. */
	const daysToAdd = $derived(showAll ? dates : validDates);
	const overriding = $derived(daysToAdd.some((d) => !checks.get(d)?.valid));

	const fieldsFilled = $derived(!!studentId && (!clinical || (!!preceptorId && !!siteId)));
	const canAdd = $derived(fieldsFilled && optionsReady && daysToAdd.length > 0);

	const openDates = $derived(
		studentId || clerkshipId || preceptorId || siteId
			? new Set(options?.openDates ?? [])
			: new Set<string>()
	);
	const nextOpen = $derived((options?.openDates ?? []).filter((d) => d >= minDate).slice(0, 5));

	async function refresh() {
		const res = await fetch('/api/schedules/plan/validate');
		const body = await res.json();
		const d = body.data ?? {};
		pins = d.pins ?? [];
		pinStatus = d.pinStatus ?? {};
		counts = d.counts ?? {};
		violations = d.violations ?? [];
		committed = d.committed ?? [];
		blackoutDates = d.blackoutDates ?? [];
		planVersion++;
	}

	function issueCodes(check: PlanDateCheck | undefined): string[] {
		return [...new Set((check?.issues ?? []).map((i) => i.code))]
			.filter((c) => c !== 'no_preceptor')
			.sort();
	}

	/** Stage the days: working days as-is, overridden days grouped by what they override. */
	async function addDays(days: string[]) {
		const groups = new Map<string, string[]>();
		for (const day of days) {
			const key = issueCodes(checks.get(day)).join(',');
			groups.set(key, [...(groups.get(key) ?? []), day]);
		}
		for (const [key, group] of groups) {
			const codes = key ? key.split(',') : [];
			const res = await fetch('/api/schedules/plan/pins', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					student_id: studentId,
					kind,
					preceptor_id: clinical ? preceptorId : null,
					clerkship_id: clinical ? clerkshipId || null : null,
					site_id: clinical ? siteId : null,
					dates: group,
					session: clinical ? session : 'full',
					override_codes: codes,
					override_note: codes.length
						? `${OVERRIDE_NOTE_PREFIX}${codes.map(codeLabel).join(', ')}`
						: null
				})
			});
			if (!res.ok) {
				const b = await res.json().catch(() => ({}));
				error = b?.error?.message ?? 'Could not add to plan';
				return;
			}
		}
	}

	async function addToPlan() {
		if (!canAdd) return;
		if (overriding && !confirmOpen) {
			confirmOpen = true;
			return;
		}
		confirmOpen = false;
		loading = true;
		error = '';
		try {
			await addDays(daysToAdd);
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

	const isOverridden = (pin: Pin) => !!pin.override_note?.startsWith(OVERRIDE_NOTE_PREFIX);

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
			body: JSON.stringify({ override_codes: [], override_note: null })
		});
		await refresh();
	}

	async function removePin(id: string) {
		await fetch(`/api/schedules/plan/pins/${id}`, { method: 'DELETE' });
		if (selectedPinId === id) selectedPinId = null;
		await refresh();
	}

	async function clearPlan() {
		await fetch('/api/schedules/plan/pins', { method: 'DELETE' });
		commitResult = null;
		selectedPinId = null;
		await refresh();
	}

	/** Turn committable pins into real assignments; skipped pins stay in the draft. */
	async function commitPlan() {
		committing = true;
		error = '';
		try {
			const res = await fetch('/api/schedules/plan/commit', { method: 'POST' });
			const body = await res.json();
			if (!res.ok) {
				error = body?.error?.message ?? 'Could not commit the plan';
				return;
			}
			commitResult = { committed: body.data.committed, skipped: body.data.skipped };
			await refresh();
		} finally {
			committing = false;
		}
	}

	function toggleWeekday(v: number) {
		weekdays = weekdays.includes(v) ? weekdays.filter((w) => w !== v) : [...weekdays, v];
	}

	function useDate(date: string) {
		if (date < minDate || (data.activeSchedule && date > data.activeSchedule.endDate)) return;
		dateMode = 'single';
		singleDate = date;
	}

	async function selectPin(id: string) {
		selectedPinId = id;
		await tick();
		document
			.querySelector(`[data-testid="plan-pin-${id}"]`)
			?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	// ---- calendar ---------------------------------------------------------
	const calendarItems = $derived.by((): PlanCalendarItem[] => {
		const conflictsOf = new Map<string, string[]>();
		for (const v of violations) {
			for (const id of v.assignment_ids) {
				conflictsOf.set(id, [...(conflictsOf.get(id) ?? []), v.message]);
			}
		}
		const describe = (row: {
			kind: string;
			student_id: string;
			clerkship_id: string | null;
			preceptor_id: string | null;
			site_id: string | null;
		}) =>
			row.kind === 'clinical'
				? {
						label: `${nameOf(data.students, row.student_id)} · ${nameOf(data.clerkships, row.clerkship_id)}`,
						detail: `${nameOf(data.preceptors, row.preceptor_id)} · ${nameOf(data.sites, row.site_id)}`
					}
				: {
						label: nameOf(data.students, row.student_id),
						detail: row.kind === 'free_day' ? 'Free day' : 'Exam'
					};

		const saved: PlanCalendarItem[] = committed.map((a) => ({
			id: a.id,
			kind: 'saved',
			studentId: a.student_id,
			preceptorId: a.preceptor_id,
			date: a.date,
			session: a.session,
			conflicts: conflictsOf.get(a.id) ?? [],
			overridden: false,
			...describe(a)
		}));
		const drafts: PlanCalendarItem[] = pins.map((p) => {
			const st = pinStatus[p.id];
			const open = st && !st.committable;
			const conflicts = open
				? [...st.hard, ...st.soft.filter((v) => st.unresolved.includes(v.code))].map(
						(v) => v.message
					)
				: [];
			return {
				id: p.id,
				kind: 'draft',
				studentId: p.student_id,
				preceptorId: p.preceptor_id,
				date: p.date,
				session: p.session,
				conflicts,
				overridden: isOverridden(p) || acceptedOf(p).length > 0,
				...describe(p)
			};
		});
		return [...saved, ...drafts];
	});

	// One approved site left for this preceptor/clerkship: pick it (as the assignment
	// dialog does) so the coordinator isn't asked a question with one answer.
	$effect(() => {
		if (!clinical || siteId || !optionsReady || !preceptorId) return;
		const fitting = (options?.sites ?? []).filter((s) => s.eligible);
		if (fitting.length === 1) siteId = fitting[0].id;
	});

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
			<div class="flex gap-2">
				<Button variant="outline" onclick={clearPlan} data-testid="plan-clear">Clear plan</Button>
				<Button
					onclick={commitPlan}
					disabled={committing || committableCount === 0}
					data-testid="plan-commit"
				>
					Commit {committableCount} assignment{committableCount === 1 ? '' : 's'}
				</Button>
			</div>
		{/if}
	</div>

	{#if !data.hasActiveSchedule}
		<Card class="p-6" data-testid="plan-no-schedule">
			<p class="text-sm">Activate a schedule to start planning.</p>
		</Card>
	{:else}
		{#if commitResult}
			<div class="mb-4 rounded-md border bg-muted/40 p-3 text-sm" data-testid="plan-commit-result">
				Committed {commitResult.committed} assignment{commitResult.committed === 1
					? ''
					: 's'}.{commitResult.skipped > 0
					? ` ${commitResult.skipped} pin${commitResult.skipped === 1 ? '' : 's'} still need attention below.`
					: ' The plan is clear.'}
			</div>
		{/if}
		<div class="grid gap-6 lg:grid-cols-[360px_1fr]">
			<!-- ---- Add to plan ---------------------------------------------- -->
			<Card class="space-y-3 p-4" data-testid="plan-form">
				<div class="flex items-center justify-between gap-2">
					<h2 class="font-medium">Add to plan</h2>
					<label class="flex cursor-pointer items-center gap-2 text-xs">
						<input type="checkbox" bind:checked={showAll} data-testid="plan-show-all" />
						Show all options
					</label>
				</div>
				<p class="text-xs text-muted-foreground" data-testid="plan-filter-hint">
					{showAll
						? 'Showing every choice. Ones that conflict are labelled, and adding them asks you to confirm the override.'
						: 'Only choices that work with your other picks, the schedule and this plan are listed.'}
				</p>

				<div class="space-y-1">
					<Label for="plan-student">Student</Label>
					<select
						id="plan-student"
						class="w-full rounded-md border bg-background p-2 text-sm"
						bind:value={studentId}
						data-testid="plan-student"
					>
						<option value="">Select a student…</option>
						{#each shown(options?.students, data.students, studentId) as s (s.id)}
							<option value={s.id}>{optionLabel(s)}</option>
						{/each}
					</select>
					{@render fieldNote('student', options?.students, studentId)}
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
							{#each shown(options?.clerkships, data.clerkships, clerkshipId) as c (c.id)}
								<option value={c.id}>{optionLabel(c)}</option>
							{/each}
						</select>
						{@render fieldNote('clerkship', options?.clerkships, clerkshipId)}
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
							{#each shown(options?.preceptors, data.preceptors, preceptorId) as p (p.id)}
								<option value={p.id}>{optionLabel(p)}</option>
							{/each}
						</select>
						{@render fieldNote('preceptor', options?.preceptors, preceptorId)}
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
							{#each shown(options?.sites, data.sites, siteId) as s (s.id)}
								<option value={s.id}>{optionLabel(s)}</option>
							{/each}
						</select>
						{@render fieldNote('site', options?.sites, siteId)}
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
							class="rounded-md border px-3 py-1 {dateMode === 'single'
								? 'bg-primary text-primary-foreground'
								: ''}"
							onclick={() => (dateMode = 'single')}
							data-testid="plan-mode-single">Single</button
						>
						<button
							type="button"
							class="rounded-md border px-3 py-1 {dateMode === 'range'
								? 'bg-primary text-primary-foreground'
								: ''}"
							onclick={() => (dateMode = 'range')}
							data-testid="plan-mode-range">Range</button
						>
					</div>
				</div>

				{#if dateMode === 'single'}
					<Input
						type="date"
						min={minDate}
						max={data.activeSchedule?.endDate}
						bind:value={singleDate}
						data-testid="plan-date"
					/>
				{:else}
					<div class="flex gap-2">
						<Input
							type="date"
							min={minDate}
							max={data.activeSchedule?.endDate}
							bind:value={rangeStart}
							data-testid="plan-range-start"
						/>
						<Input
							type="date"
							min={minDate}
							max={data.activeSchedule?.endDate}
							bind:value={rangeEnd}
							data-testid="plan-range-end"
						/>
					</div>
					<div class="flex flex-wrap gap-1">
						{#each WEEKDAYS as w (w.v)}
							<button
								type="button"
								class="rounded-md border px-2 py-1 text-xs {weekdays.includes(w.v)
									? 'bg-primary text-primary-foreground'
									: ''}"
								onclick={() => toggleWeekday(w.v)}
								data-testid="plan-weekday-{w.v}">{w.l}</button
							>
						{/each}
					</div>
					<p class="text-xs text-muted-foreground" data-testid="plan-dates-count">
						{dates.length} day(s) selected
					</p>
				{/if}

				{#if optionsReady && dates.length > 0}
					{#if invalidChecks.length === 0}
						<p class="text-xs text-emerald-700 dark:text-emerald-400" data-testid="plan-days-ok">
							{dates.length === 1 ? 'This day works.' : `All ${dates.length} days work.`}
						</p>
					{:else}
						<div
							class="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
							data-testid="plan-days-summary"
						>
							<p class="font-medium">
								{#if showAll}
									{invalidChecks.length} of {dates.length} day(s) conflict and will be added as overrides.
								{:else if validDates.length === 0}
									{dates.length === 1 ? 'This day doesn’t work' : 'None of these days work'} for this
									selection. Pick another, or turn on “Show all options” to override.
								{:else}
									{validDates.length} of {dates.length} days work; the other {invalidChecks.length}
									will be skipped.
								{/if}
							</p>
							<ul class="space-y-0.5" data-testid="plan-skipped-days">
								{#each invalidChecks.slice(0, 6) as c (c.date)}
									<li>{c.date}: {c.issues.map((i) => i.message).join('; ')}</li>
								{/each}
								{#if invalidChecks.length > 6}
									<li>…and {invalidChecks.length - 6} more</li>
								{/if}
							</ul>
						</div>
					{/if}
				{/if}

				{#if nextOpen.length > 0 && (dates.length === 0 || validDates.length === 0)}
					<div class="flex flex-wrap items-center gap-1 text-xs" data-testid="plan-open-dates">
						<span class="text-muted-foreground">Next open days:</span>
						{#each nextOpen as d (d)}
							<button
								type="button"
								class="rounded border px-1.5 py-0.5 hover:bg-muted"
								onclick={() => useDate(d)}
								data-testid="plan-open-date-{d}">{d}</button
							>
						{/each}
					</div>
				{/if}

				{#if error}
					<p class="text-sm text-destructive" data-testid="plan-error">{error}</p>
				{/if}

				<Button
					class="w-full"
					variant={overriding ? 'outline' : 'default'}
					disabled={!canAdd || loading}
					onclick={addToPlan}
					data-testid="plan-add"
				>
					{#if overriding}
						Add with override…
					{:else if daysToAdd.length > 1}
						Add {daysToAdd.length} days to plan
					{:else}
						Add to plan
					{/if}
				</Button>
			</Card>

			<!-- ---- Plan + conflicts ----------------------------------------- -->
			<div class="space-y-4">
				<!-- conflict summary -->
				<Card class="p-4" data-testid="plan-conflicts">
					<div class="mb-2 flex items-center justify-between">
						<h2 class="font-medium">Conflicts</h2>
						<Badge
							variant={violationCount > 0 ? 'destructive' : 'secondary'}
							data-testid="plan-conflict-count"
						>
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
						<ul class="max-h-[28rem] divide-y overflow-y-auto">
							{#each pins as pin (pin.id)}
								{@const st = pinStatus[pin.id]}
								{@const accepted = acceptedOf(pin)}
								<li
									class="py-2 text-sm {selectedPinId === pin.id
										? 'rounded-md bg-primary/5 ring-2 ring-primary'
										: ''}"
									data-testid="plan-pin-{pin.id}"
									data-selected={selectedPinId === pin.id ? 'true' : undefined}
								>
									<div class="flex items-center justify-between gap-2 px-1">
										<button
											type="button"
											class="min-w-0 text-left"
											onclick={() => (selectedPinId = pin.id)}
										>
											<div class="truncate font-medium">
												{nameOf(data.students, pin.student_id)} · {pin.date}
												{#if pin.session !== 'full'}<span class="text-muted-foreground">
														({pin.session.toUpperCase()})</span
													>{/if}
											</div>
											<div class="truncate text-xs text-muted-foreground">
												{#if pin.kind === 'clinical'}
													{nameOf(data.clerkships, pin.clerkship_id)} · {nameOf(
														data.preceptors,
														pin.preceptor_id
													)} · {nameOf(data.sites, pin.site_id)}
												{:else}
													{pin.kind === 'free_day' ? 'Free day' : 'Exam'}
												{/if}
											</div>
										</button>
										<div class="flex shrink-0 items-center gap-2">
											{#if isOverridden(pin)}
												<Badge
													variant="outline"
													class="border-amber-500 text-amber-700 dark:text-amber-300"
													data-testid="plan-pin-overridden-{pin.id}">Overridden</Badge
												>
											{/if}
											{#if !st || st.committable}
												<Badge variant="secondary" data-testid="plan-pin-status-{pin.id}">OK</Badge>
											{:else if st.hard.length > 0}
												<Badge variant="destructive" data-testid="plan-pin-status-{pin.id}"
													>Blocked</Badge
												>
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
										<div
											class="mt-1 flex flex-wrap items-center gap-1 px-1"
											data-testid="plan-pin-overrides-{pin.id}"
										>
											{#each st.hard as v (v.code)}
												<Badge variant="destructive" class="text-xs"
													>Can’t override: {codeLabel(v.code)}</Badge
												>
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
												<Badge variant="secondary" class="text-xs"
													>Accepted: {codeLabel(code)}</Badge
												>
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

		<!-- ---- Calendar ---------------------------------------------------- -->
		{#if data.activeSchedule}
			<Card class="mt-6 p-4">
				<h2 class="mb-3 font-medium">Calendar</h2>
				<PlanCalendar
					start={data.activeSchedule.startDate}
					end={data.activeSchedule.endDate}
					items={calendarItems}
					students={data.students}
					preceptors={data.preceptors}
					{openDates}
					blackoutDates={new Set(blackoutDates)}
					selectedId={selectedPinId}
					onItemClick={(item) => {
						if (item.kind === 'draft') selectPin(item.id);
					}}
					onDayClick={useDate}
				/>
			</Card>
		{/if}
	{/if}
</div>

<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Content class="max-w-lg" data-testid="plan-override-confirm">
		<Dialog.Header>
			<Dialog.Title>Add with an override?</Dialog.Title>
			<Dialog.Description>
				These days conflict with the preceptor’s settings or the existing plan. They’ll be added
				with the conflicts accepted and marked as overridden, so they can still be committed.
			</Dialog.Description>
		</Dialog.Header>
		<ul class="max-h-60 space-y-1 overflow-y-auto text-sm" data-testid="plan-override-issues">
			{#each daysToAdd
				.map((d) => checks.get(d))
				.filter((c): c is PlanDateCheck => !!c && !c.valid) as c (c.date)}
				<li>
					<span class="font-medium">{c.date}</span>: {c.issues.map((i) => i.message).join('; ')}
				</li>
			{/each}
		</ul>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (confirmOpen = false)}>Cancel</Button>
			<Button onclick={addToPlan} data-testid="plan-override-accept">Add anyway</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

{#snippet fieldNote(field: string, list: PlanOption[] | undefined, selected: string)}
	{@const issue = pickIssue(list, selected)}
	{@const hidden = hiddenCount(list)}
	{#if issue}
		<p class="text-xs text-destructive" data-testid="plan-issue-{field}">{issue}</p>
	{:else if hidden > 0}
		<p class="text-xs text-muted-foreground" data-testid="plan-hidden-{field}">
			{hidden} hidden that don’t fit
		</p>
	{/if}
{/snippet}
