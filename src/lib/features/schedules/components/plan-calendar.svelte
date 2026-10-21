<script lang="ts" module>
	export interface PlanCalendarItem {
		id: string;
		kind: 'saved' | 'draft';
		studentId: string;
		preceptorId: string | null;
		date: string;
		session: string;
		/** e.g. "Ana Ruiz · Family Medicine". */
		label: string;
		/** Secondary line, e.g. preceptor name or "Free day". */
		detail: string;
		/** Unresolved problems; non-empty draws the item in red. */
		conflicts: string[];
		/** A draft added despite its conflicts (accepted overrides). */
		overridden: boolean;
	}
</script>

<script lang="ts">
	/**
	 * The planner's calendar (planner feedback): one month at a time, showing saved
	 * assignments and draft pins together so the coordinator can see the plan
	 * taking shape. Drafts are dashed; anything with a conflict is red, with the
	 * reasons on hover. Days that work for the current picker selection are tinted
	 * green. Clicking a draft selects it in the planner list; clicking a day picks it
	 * as the date.
	 */

	interface Props {
		start: string;
		end: string;
		items: PlanCalendarItem[];
		students: { id: string; name: string }[];
		preceptors: { id: string; name: string }[];
		openDates?: Set<string>;
		blackoutDates?: Set<string>;
		selectedId?: string | null;
		onItemClick?: (item: PlanCalendarItem) => void;
		onDayClick?: (date: string) => void;
	}

	let {
		start,
		end,
		items,
		students,
		preceptors,
		openDates = new Set(),
		blackoutDates = new Set(),
		selectedId = null,
		onItemClick,
		onDayClick
	}: Props = $props();

	const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const FIT = 3;

	let studentFilter = $state('');
	let preceptorFilter = $state('');

	const monthKey = (date: string) => date.slice(0, 7);

	/** Every month the schedule touches, as YYYY-MM. */
	const months = $derived.by(() => {
		const out: string[] = [];
		if (!start || !end) return out;
		const d = new Date(`${monthKey(start)}-01T00:00:00Z`);
		const last = monthKey(end);
		while (d.toISOString().slice(0, 7) <= last) {
			out.push(d.toISOString().slice(0, 7));
			d.setUTCMonth(d.getUTCMonth() + 1);
		}
		return out;
	});

	// Open on the month of the first draft, else today's month (if in range), else the start.
	let month = $state('');
	$effect(() => {
		if (month && months.includes(month)) return;
		const firstDraft = items.find((i) => i.kind === 'draft')?.date;
		const today = monthKey(new Date().toISOString());
		month = firstDraft ? monthKey(firstDraft) : months.includes(today) ? today : (months[0] ?? '');
	});

	/** Jump to the month holding the selected draft. */
	$effect(() => {
		const selected = items.find((i) => i.id === selectedId);
		if (selected && months.includes(monthKey(selected.date))) month = monthKey(selected.date);
	});

	const monthIndex = $derived(months.indexOf(month));
	const monthLabel = $derived(
		month
			? new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
					month: 'long',
					year: 'numeric',
					timeZone: 'UTC'
				})
			: ''
	);

	const visible = $derived(
		items.filter(
			(i) =>
				(!studentFilter || i.studentId === studentFilter) &&
				(!preceptorFilter || i.preceptorId === preceptorFilter)
		)
	);

	const byDate = $derived.by(() => {
		const map = new Map<string, PlanCalendarItem[]>();
		for (const item of visible) {
			const list = map.get(item.date) ?? [];
			list.push(item);
			map.set(item.date, list);
		}
		// Drafts first, then conflicts, so what's being planned is what fits.
		for (const list of map.values()) {
			list.sort(
				(a, b) =>
					Number(b.kind === 'draft') - Number(a.kind === 'draft') ||
					b.conflicts.length - a.conflicts.length
			);
		}
		return map;
	});

	/** The grid's weeks: Monday-first, padded with blanks outside the month. */
	const weeks = $derived.by(() => {
		if (!month) return [] as (string | null)[][];
		const first = new Date(`${month}-01T00:00:00Z`);
		const lead = (first.getUTCDay() + 6) % 7;
		const days: (string | null)[] = Array(lead).fill(null);
		const d = new Date(first);
		while (d.toISOString().slice(0, 7) === month) {
			days.push(d.toISOString().slice(0, 10));
			d.setUTCDate(d.getUTCDate() + 1);
		}
		while (days.length % 7 !== 0) days.push(null);
		const out: (string | null)[][] = [];
		for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
		return out;
	});

	const draftCount = $derived(visible.filter((i) => i.kind === 'draft').length);
	const conflictCount = $derived(visible.filter((i) => i.conflicts.length > 0).length);

	function dayClasses(date: string): string {
		const out = ['h-24 border p-1 text-left align-top'];
		if (date < start || date > end) out.push('bg-muted/40 opacity-50');
		else if (blackoutDates.has(date)) out.push('bg-red-50 dark:bg-red-950/30');
		else if (openDates.has(date)) out.push('bg-green-50 dark:bg-green-950/30');
		return out.join(' ');
	}

	function itemClasses(item: PlanCalendarItem): string {
		const out = ['block w-full truncate rounded px-1 py-0.5 text-left text-xs'];
		if (item.kind === 'draft') out.push('border border-dashed');
		else out.push('border border-transparent bg-muted');
		if (item.conflicts.length > 0) {
			out.push('border-red-500 bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100');
		} else if (item.kind === 'draft' && item.overridden) {
			out.push('border-amber-500 bg-amber-50 dark:bg-amber-950/40');
		} else if (item.kind === 'draft') {
			out.push('border-primary bg-primary/10');
		}
		if (item.id === selectedId) out.push('ring-2 ring-primary');
		return out.join(' ');
	}

	function itemTitle(item: PlanCalendarItem): string {
		const head = `${item.kind === 'draft' ? 'Draft' : 'Saved'}: ${item.label} — ${item.detail}`;
		const session = item.session !== 'full' ? ` (${item.session.toUpperCase()})` : '';
		const problems = item.conflicts.length ? `\n${item.conflicts.join('\n')}` : '';
		const overridden = item.overridden ? '\nAdded with an override' : '';
		return head + session + problems + overridden;
	}
</script>

<div class="space-y-3" data-testid="plan-calendar">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="rounded-md border px-2 py-1 text-sm disabled:opacity-40"
				disabled={monthIndex <= 0}
				onclick={() => (month = months[monthIndex - 1])}
				data-testid="plan-cal-prev"
				aria-label="Previous month">‹</button
			>
			<span class="min-w-36 text-center font-medium" data-testid="plan-cal-month">
				{monthLabel}
			</span>
			<button
				type="button"
				class="rounded-md border px-2 py-1 text-sm disabled:opacity-40"
				disabled={monthIndex < 0 || monthIndex >= months.length - 1}
				onclick={() => (month = months[monthIndex + 1])}
				data-testid="plan-cal-next"
				aria-label="Next month">›</button
			>
		</div>
		<div class="flex flex-wrap gap-2">
			<select
				class="rounded-md border bg-background p-1 text-sm"
				bind:value={studentFilter}
				aria-label="Filter by student"
				data-testid="plan-cal-student"
			>
				<option value="">All students</option>
				{#each students as s (s.id)}
					<option value={s.id}>{s.name}</option>
				{/each}
			</select>
			<select
				class="rounded-md border bg-background p-1 text-sm"
				bind:value={preceptorFilter}
				aria-label="Filter by preceptor"
				data-testid="plan-cal-preceptor"
			>
				<option value="">All preceptors</option>
				{#each preceptors as p (p.id)}
					<option value={p.id}>{p.name}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-4 rounded border bg-muted"></span> Saved</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-4 rounded border border-dashed border-primary bg-primary/10"
			></span> Draft</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-4 rounded border border-red-500 bg-red-100"></span> Conflict</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-4 rounded border border-dashed border-amber-500 bg-amber-50"
			></span> Overridden</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block h-3 w-4 rounded border bg-green-50"></span> Open for your selection</span
		>
		<span data-testid="plan-cal-summary"
			>{draftCount} draft{draftCount === 1 ? '' : 's'} · {conflictCount} with conflicts</span
		>
	</div>

	<div class="overflow-x-auto">
		<table class="w-full min-w-[640px] table-fixed border-collapse">
			<thead>
				<tr>
					{#each WEEKDAYS as w (w)}
						<th class="p-1 text-xs font-medium text-muted-foreground">{w}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each weeks as week, wi (wi)}
					<tr>
						{#each week as date, di (di)}
							{#if date}
								{@const dayItems = byDate.get(date) ?? []}
								<td
									class={dayClasses(date)}
									data-testid="plan-cal-day-{date}"
									data-open={openDates.has(date) ? 'true' : undefined}
								>
									<button
										type="button"
										class="mb-1 text-xs text-muted-foreground hover:underline disabled:no-underline"
										disabled={date < start || date > end}
										onclick={() => onDayClick?.(date)}
										aria-label="Use {date} as the date"
										data-testid="plan-cal-pick-{date}">{Number(date.slice(8))}</button
									>
									<div class="space-y-0.5">
										{#each dayItems.slice(0, FIT) as item (item.id)}
											<button
												type="button"
												class={itemClasses(item)}
												title={itemTitle(item)}
												onclick={() => onItemClick?.(item)}
												data-testid="plan-cal-{item.kind === 'draft' ? 'pin' : 'saved'}-{item.id}"
												data-conflict={item.conflicts.length > 0 ? 'true' : undefined}
											>
												{item.label}
											</button>
										{/each}
										{#if dayItems.length > FIT}
											<span
												class="block text-xs text-muted-foreground"
												title={dayItems
													.slice(FIT)
													.map((i) => i.label)
													.join('\n')}
												data-testid="plan-cal-more-{date}">+{dayItems.length - FIT} more</span
											>
										{/if}
									</div>
								</td>
							{:else}
								<td class="border bg-muted/20"></td>
							{/if}
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
