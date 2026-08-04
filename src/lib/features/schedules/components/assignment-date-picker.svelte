<script lang="ts">
	/**
	 * Availability-aware date picker (Step 18.3).
	 *
	 * A month grid bounded by the schedule range, coloured from the step-17 day
	 * states, with the three selection modes the availability builder already
	 * uses: Single, Range (+ weekday filter) and Individual days.
	 */
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import type { DayState } from '$lib/features/scheduling/services/assignment-day-state';

	type SelectMode = 'single' | 'range' | 'individual';

	interface Props {
		/** Schedule range bounds (YYYY-MM-DD). */
		rangeStart: string;
		rangeEnd: string;
		/** Day states for the visible month, keyed by date. */
		dayStates: Map<string, DayState>;
		selected: string[];
		mode: SelectMode;
		/** Edit mode collapses the picker to exactly one day. */
		singleOnly?: boolean;
		disabled?: boolean;
		/** Month currently shown, as YYYY-MM. */
		month: string;
		onMonthChange: (month: string) => void;
	}

	let {
		rangeStart,
		rangeEnd,
		dayStates,
		selected = $bindable(),
		mode = $bindable(),
		singleOnly = false,
		disabled = false,
		month,
		onMonthChange
	}: Props = $props();

	const WEEKDAYS = [
		{ v: 0, l: 'Sun' },
		{ v: 1, l: 'Mon' },
		{ v: 2, l: 'Tue' },
		{ v: 3, l: 'Wed' },
		{ v: 4, l: 'Thu' },
		{ v: 5, l: 'Fri' },
		{ v: 6, l: 'Sat' }
	];

	let weekdayFilter = $state<number[]>([1, 2, 3, 4, 5]);
	let rangeAnchor = $state<string | null>(null);

	function monthLabel(m: string): string {
		const [y, mm] = m.split('-').map(Number);
		return new Date(Date.UTC(y, mm - 1, 1)).toLocaleDateString('en-US', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
	}

	function shiftMonth(m: string, by: number): string {
		const [y, mm] = m.split('-').map(Number);
		const d = new Date(Date.UTC(y, mm - 1 + by, 1));
		return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
	}

	/** Leading blanks + every day of the visible month. */
	let cells = $derived.by(() => {
		const [y, mm] = month.split('-').map(Number);
		const first = new Date(Date.UTC(y, mm - 1, 1));
		const daysInMonth = new Date(Date.UTC(y, mm, 0)).getUTCDate();
		const lead = first.getUTCDay();
		const out: { date: string | null; dayOfMonth: number }[] = [];
		for (let i = 0; i < lead; i++) out.push({ date: null, dayOfMonth: 0 });
		for (let d = 1; d <= daysInMonth; d++) {
			out.push({
				date: `${month}-${String(d).padStart(2, '0')}`,
				dayOfMonth: d
			});
		}
		return out;
	});

	let canGoBack = $derived(shiftMonth(month, -1) >= rangeStart.slice(0, 7));
	let canGoForward = $derived(shiftMonth(month, 1) <= rangeEnd.slice(0, 7));

	function inRange(date: string): boolean {
		return date >= rangeStart && date <= rangeEnd;
	}

	/**
	 * A machine-readable state for the day, independent of selection. Taken /
	 * full / busy are distinct so the cell can render (and be tested) distinctly.
	 */
	function dataState(date: string): string {
		if (!inRange(date)) return 'out-of-range';
		const day = dayStates.get(date);
		if (!day) return 'unset';
		if (day.studentBusy) return 'busy';
		if (day.preceptorAtCapacity) return 'full';
		if (day.preceptorBookings.length > 0) return 'taken';
		if (day.state === 'blackout') return 'blackout';
		return day.state; // available | unavailable | unset
	}

	/** The fill/colour for the day's state — never short-circuited by selection. */
	function baseStateClass(date: string): string {
		if (!inRange(date)) return 'cursor-not-allowed bg-muted/40 text-muted-foreground/50';
		const day = dayStates.get(date);
		// Hard conflict for the student takes precedence over preceptor state.
		if (day?.studentBusy) return 'bg-red-100 text-red-800 border-red-300';
		if (day?.preceptorAtCapacity) return 'bg-orange-200 text-orange-900 border-orange-400';
		if (day && day.preceptorBookings.length > 0)
			return 'bg-amber-100 text-amber-900 border-amber-300';
		switch (day?.state) {
			case 'blackout':
				return 'bg-slate-200 text-slate-600 border-slate-300';
			case 'unavailable':
				return 'bg-red-50 text-red-700 border-red-200';
			case 'available':
				return 'bg-green-50 text-green-800 border-green-200';
			default:
				return 'bg-background text-foreground border-input';
		}
	}

	/**
	 * Selection composes with state: keep the state colour and add an
	 * unmistakable ring, so a day that is both selected AND a problem reads as
	 * both at a glance (the reported "fills solid so the conflict disappears").
	 */
	function classesFor(date: string): string {
		const base = baseStateClass(date);
		if (inRange(date) && selected.includes(date)) {
			return `${base} ring-2 ring-primary ring-offset-1 font-semibold`;
		}
		return base;
	}

	/**
	 * Short marker under the day number. A glyph + word so the state is legible
	 * without relying on colour (accessibility).
	 */
	function markerFor(date: string): string {
		const day = dayStates.get(date);
		if (!day) return '';
		if (day.studentBusy) return '⛔ busy';
		if (day.preceptorAtCapacity) return '● full';
		if (day.preceptorBookings.length > 0) {
			const first = day.preceptorBookings[0].studentName.split(' ')[0];
			return day.preceptorBookings.length > 1
				? `👤 ${first} +${day.preceptorBookings.length - 1}`
				: `👤 ${first}`;
		}
		if (day.state === 'blackout') return '× blackout';
		if (day.isPast) return 'past';
		return '';
	}

	const CONFLICT_REASON: Record<string, string> = {
		busy: 'student already assigned',
		full: 'preceptor at capacity',
		taken: 'preceptor already booked',
		unavailable: 'preceptor unavailable',
		blackout: 'blackout date'
	};

	/** Selected days that carry a conflict — surfaced so one bad day in a big selection is not lost. */
	let selectedConflicts = $derived(
		selected
			.filter((d) => inRange(d))
			.map((d) => ({ date: d, reason: CONFLICT_REASON[dataState(d)] }))
			.filter((c): c is { date: string; reason: string } => Boolean(c.reason))
	);

	function titleFor(date: string): string {
		const day = dayStates.get(date);
		if (!inRange(date)) return `${date} — outside the schedule range`;
		const bits: string[] = [date];
		if (day) {
			bits.push(
				day.state === 'unset' ? 'availability not set' : `preceptor ${day.state.replace('_', ' ')}`
			);
			if (day.preceptorBookings.length > 0) {
				bits.push(`booked: ${day.preceptorBookings.map((b) => b.studentName).join(', ')}`);
			}
			if (day.preceptorAtCapacity) bits.push('at capacity');
			if (day.studentBusy) bits.push('student already has an assignment');
			if (day.isPast) bits.push('already passed');
		}
		return bits.join(' · ');
	}

	function toggle(date: string) {
		if (disabled || !inRange(date)) return;

		if (singleOnly || mode === 'single') {
			selected = selected[0] === date ? [] : [date];
			return;
		}

		if (mode === 'individual') {
			selected = selected.includes(date)
				? selected.filter((d) => d !== date)
				: [...selected, date].sort();
			return;
		}

		// Range: first click anchors, second click fills.
		if (!rangeAnchor) {
			rangeAnchor = date;
			selected = [date];
			return;
		}
		const [from, to] = rangeAnchor <= date ? [rangeAnchor, date] : [date, rangeAnchor];
		const filter = new Set(weekdayFilter);
		const out: string[] = [];
		const cur = new Date(from + 'T00:00:00.000Z');
		const last = new Date(to + 'T00:00:00.000Z');
		while (cur <= last) {
			const iso = cur.toISOString().split('T')[0];
			if (inRange(iso) && (filter.size === 0 || filter.has(cur.getUTCDay()))) out.push(iso);
			cur.setUTCDate(cur.getUTCDate() + 1);
		}
		selected = out;
		rangeAnchor = null;
	}

	function setMode(next: SelectMode) {
		mode = next;
		rangeAnchor = null;
		if (next === 'single' && selected.length > 1) selected = [selected[0]];
	}

	function toggleWeekday(v: number) {
		weekdayFilter = weekdayFilter.includes(v)
			? weekdayFilter.filter((d) => d !== v)
			: [...weekdayFilter, v];
	}
</script>

<div class="space-y-3">
	{#if !singleOnly}
		<div class="flex flex-wrap items-center gap-2">
			<Label class="text-xs text-muted-foreground">Select</Label>
			{#each [{ v: 'single', l: 'Single' }, { v: 'range', l: 'Range' }, { v: 'individual', l: 'Individual days' }] as opt (opt.v)}
				<Button
					type="button"
					size="sm"
					variant={mode === opt.v ? 'default' : 'outline'}
					disabled={disabled}
					onclick={() => setMode(opt.v as SelectMode)}
				>
					{opt.l}
				</Button>
			{/each}
		</div>

		{#if mode === 'range'}
			<div class="space-y-1">
				<Label class="text-xs text-muted-foreground">Days of week</Label>
				<div class="flex flex-wrap gap-1">
					{#each WEEKDAYS as w (w.v)}
						<button
							type="button"
							disabled={disabled}
							onclick={() => toggleWeekday(w.v)}
							class="rounded-md border px-2 py-1 text-xs {weekdayFilter.includes(w.v)
								? 'border-primary bg-primary text-primary-foreground'
								: 'border-input'}"
						>
							{w.l}
						</button>
					{/each}
				</div>
				<p class="text-xs text-muted-foreground">
					{rangeAnchor ? 'Now pick the last day of the range.' : 'Pick the first day of the range.'}
				</p>
			</div>
		{/if}
	{/if}

	<div class="flex items-center justify-between">
		<Button
			type="button"
			size="sm"
			variant="outline"
			disabled={disabled || !canGoBack}
			onclick={() => onMonthChange(shiftMonth(month, -1))}
		>
			Previous month
		</Button>
		<span class="text-sm font-medium" data-testid="picker-month">{monthLabel(month)}</span>
		<Button
			type="button"
			size="sm"
			variant="outline"
			disabled={disabled || !canGoForward}
			onclick={() => onMonthChange(shiftMonth(month, 1))}
		>
			Next month
		</Button>
	</div>

	<div class="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
		{#each WEEKDAYS as w (w.v)}<span>{w.l}</span>{/each}
	</div>

	<div class="grid grid-cols-7 gap-1" data-testid="assignment-day-grid">
		{#each cells as cell, i (cell.date ?? `blank-${i}`)}
			{#if !cell.date}
				<span></span>
			{:else}
				<button
					type="button"
					data-testid="day-{cell.date}"
					data-date={cell.date}
					data-state={dataState(cell.date)}
					data-selected={selected.includes(cell.date)}
					disabled={disabled || !inRange(cell.date)}
					title={titleFor(cell.date)}
					onclick={() => cell.date && toggle(cell.date)}
					class="flex h-12 flex-col items-center justify-center rounded-md border text-xs leading-tight disabled:cursor-not-allowed {classesFor(
						cell.date
					)}"
				>
					<span class="font-medium">{cell.dayOfMonth}</span>
					{#if markerFor(cell.date)}
						<span class="max-w-full truncate px-0.5 text-[10px] opacity-80"
							>{markerFor(cell.date)}</span
						>
					{/if}
				</button>
			{/if}
		{/each}
	</div>

	{#if selectedConflicts.length > 0}
		<div
			class="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
			data-testid="selected-conflicts"
		>
			<p class="font-medium">Selected days needing attention:</p>
			<ul class="list-inside list-disc">
				{#each selectedConflicts as c (c.date)}
					<li>{c.date} — {c.reason}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-3 rounded border border-green-200 bg-green-50"></span
			>Available</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-3 rounded border border-red-200 bg-red-50"></span
			>Unavailable</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-3 rounded border border-input bg-background"></span>Not
			set</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-3 rounded border border-amber-300 bg-amber-100"></span>👤
			Taken</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-3 rounded border border-orange-400 bg-orange-200"></span>●
			Full</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-3 rounded border border-red-300 bg-red-100"></span>⛔ Student
			busy</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-3 rounded border border-slate-300 bg-slate-200"></span
			>Blackout</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-3 rounded border border-muted bg-muted/40"></span>Out of
			range</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-3 rounded border border-primary ring-2 ring-primary"></span
			>Selected</span
		>
	</div>
</div>
