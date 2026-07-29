<script lang="ts">
	/**
	 * The one assignment dialog (Step 18).
	 *
	 * Used identically from the student page, the calendar and the preceptor
	 * page — the only difference is which field arrives pre-filled and locked.
	 * Selections cascade through /api/schedules/assignments/options, dates come
	 * from /day-states, and every soft violation becomes an explicit override
	 * conversation before anything is written.
	 */
	import { page } from '$app/stores';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ConfirmDialog, toast } from '$lib/components';
	import AssignmentDatePicker from './assignment-date-picker.svelte';
	import AssignmentContextPanel from './assignment-context-panel.svelte';
	import type { EligibilityOption } from '$lib/features/scheduling/services/assignment-eligibility';
	import type { DayState } from '$lib/features/scheduling/services/assignment-day-state';
	import type { RequirementImpact } from '$lib/features/scheduling/services/requirement-preview';
	import type { OverrideSideEffect } from '../services/assignment-service';
	import {
		analyseSelection,
		buildSubmitPayload,
		CATEGORY_COPY,
		type FlagAnalysis,
		type FlaggedCategory,
		type OverrideCategory
	} from '../services/assignment-submit';

	interface Props {
		open: boolean;
		mode?: 'create' | 'edit';
		/** Required in edit mode. */
		assignmentId?: string;
		/** Pre-fill + lock context. */
		studentId?: string;
		preceptorId?: string;
		clerkshipId?: string;
		siteId?: string;
		date?: string;
		lockStudent?: boolean;
		lockPreceptor?: boolean;
		lockClerkship?: boolean;
		lockDate?: boolean;
		/** Show the student selector (the calendar's schedule-wide instance). */
		showStudentSelect?: boolean;
		dateMode?: 'single' | 'multi';
		onSaved?: () => void;
		onDeleted?: () => void;
	}

	let {
		open = $bindable(),
		mode = 'create',
		assignmentId,
		studentId = '',
		preceptorId = '',
		clerkshipId = '',
		siteId = '',
		date = '',
		lockStudent = false,
		lockPreceptor = false,
		lockClerkship = false,
		lockDate = false,
		showStudentSelect = true,
		dateMode = 'multi',
		onSaved,
		onDeleted
	}: Props = $props();

	// Edit mode edits exactly one day (the user's requirement).
	let singleOnly = $derived(mode === 'edit' || dateMode === 'single' || lockDate);
	let canLock = $derived(($page.data.entitlements ?? []).includes('autogen'));

	// ---- form state ---------------------------------------------------------
	let student = $state('');
	let clerkship = $state('');
	let preceptor = $state('');
	let site = $state('');
	let selectedDates = $state<string[]>([]);
	let pickerMode = $state<'single' | 'range' | 'individual'>('single');
	let locked = $state(false);
	let note = $state('');
	let clearedNotice = $state<string | null>(null);

	// ---- loaded data --------------------------------------------------------
	let students = $state<{ id: string; name: string }[]>([]);
	let options = $state<{
		clerkships: EligibilityOption[];
		preceptors: EligibilityOption[];
		sites: EligibilityOption[];
	}>({ clerkships: [], preceptors: [], sites: [] });
	// Cached across visited months, keyed by the selection the states were fetched
	// for — days picked in January must keep their flags after paging to March.
	let dayCache = $state<{ key: string; map: Map<string, DayState> }>({
		key: '',
		map: new Map()
	});
	let impact = $state<RequirementImpact | null>(null);
	let range = $state<{ start: string; end: string } | null>(null);
	let visibleMonth = $state('');
	let serverSoftCodes = $state<string[]>([]);
	let hardErrors = $state<{ code: string; message: string }[]>([]);
	/**
	 * True while the dry run is in flight. Submitting before it lands would miss
	 * the codes only the server knows about (onboarding, site rules) and the days
	 * would be silently skipped.
	 */
	let probing = $state(false);
	let contextKey = $state(0);

	let submitting = $state(false);
	/** Plain (non-reactive) so the open/close effect cannot re-trigger itself. */
	let lastOpen = false;
	/** In edit mode, the day the assignment currently sits on. */
	let originalDate = $state('');

	// ---- override conversation ---------------------------------------------
	let analysis = $state<FlagAnalysis | null>(null);
	let queue = $state<FlaggedCategory[]>([]);
	let currentIndex = $state(0);
	let acceptedCodes = $state<OverrideCategory[]>([]);
	let sideEffects = $state<OverrideSideEffect[]>([]);
	let conversationOpen = $state(false);
	let capacityFollowUpOpen = $state(false);
	/**
	 * ConfirmDialog reports every close as a cancel, including the ones we drive
	 * ourselves from an extra choice — this flag tells them apart.
	 */
	let decisionMade = false;

	let current = $derived(queue[currentIndex] ?? null);

	function reset() {
		student = studentId;
		clerkship = clerkshipId;
		preceptor = preceptorId;
		site = siteId;
		selectedDates = date ? [date] : [];
		pickerMode = 'single';
		locked = false;
		note = '';
		clearedNotice = null;
		originalDate = '';
		serverSoftCodes = [];
		hardErrors = [];
		analysis = null;
		queue = [];
		currentIndex = 0;
		acceptedCodes = [];
		sideEffects = [];
		conversationOpen = false;
		capacityFollowUpOpen = false;
		decisionMade = false;
		dayCache = { key: '', map: new Map() };
		visibleMonth = (date || '').slice(0, 7);
	}

	async function loadRange() {
		try {
			const res = await fetch('/api/scheduling-periods/active');
			const body = await res.json();
			if (body?.success) {
				range = { start: body.data.start_date, end: body.data.end_date };
				if (!visibleMonth) {
					const today = new Date().toISOString().slice(0, 7);
					visibleMonth =
						today < range.start.slice(0, 7)
							? range.start.slice(0, 7)
							: today > range.end.slice(0, 7)
								? range.end.slice(0, 7)
								: today;
				}
			}
		} catch {
			range = null;
		}
	}

	async function loadStudents() {
		try {
			const res = await fetch('/api/students');
			const body = await res.json();
			students = (body?.data ?? []).map((s: { id: string; name: string }) => ({
				id: s.id,
				name: s.name
			}));
		} catch {
			students = [];
		}
	}

	async function loadExistingAssignment() {
		if (mode !== 'edit' || !assignmentId) return;
		try {
			const res = await fetch(`/api/schedules/assignments/${assignmentId}`);
			const body = await res.json();
			if (!body?.success) return;
			student = body.data.student_id;
			clerkship = body.data.clerkship_id;
			preceptor = body.data.preceptor_id;
			site = body.data.site_id ?? '';
			selectedDates = [body.data.date];
			originalDate = body.data.date;
			locked = body.data.locked === 1;
			visibleMonth = body.data.date.slice(0, 7);
		} catch {
			/* leave the prefill in place */
		}
	}

	// Open → reset, then load everything the dialog needs.
	$effect(() => {
		if (open === lastOpen) return;
		lastOpen = open;
		if (!open) return;
		reset();
		void Promise.all([loadRange(), loadStudents(), loadExistingAssignment()]);
	});

	/** Cascading options — refetched whenever any selection changes. */
	$effect(() => {
		if (!open) return;
		const params = new URLSearchParams();
		if (student) params.set('studentId', student);
		if (clerkship) params.set('clerkshipId', clerkship);
		if (preceptor) params.set('preceptorId', preceptor);
		if (site) params.set('siteId', site);

		let cancelled = false;
		fetch(`/api/schedules/assignments/options?${params}`)
			.then((r) => r.json())
			.then((body) => {
				if (cancelled || !body?.success) return;
				options = body.data;
				dropInvalidSelections();
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	/**
	 * A selection made invalid by a later change is cleared, with a notice —
	 * silently leaving an impossible combination selected is worse.
	 */
	function dropInvalidSelections() {
		const messages: string[] = [];
		const stillOk = (list: EligibilityOption[], id: string) =>
			!id || (list.find((o) => o.id === id)?.eligible ?? true);

		if (!lockPreceptor && preceptor && !stillOk(options.preceptors, preceptor)) {
			messages.push('preceptor');
			preceptor = '';
		}
		if (site && !stillOk(options.sites, site)) {
			messages.push('site');
			site = '';
		}
		if (!lockClerkship && clerkship && !stillOk(options.clerkships, clerkship)) {
			messages.push('clerkship');
			clerkship = '';
		}
		clearedNotice =
			messages.length > 0
				? `Cleared the ${messages.join(' and ')} — no longer valid with this selection.`
				: null;
	}

	/** Day states for the visible month. */
	$effect(() => {
		if (!open || !visibleMonth || !range) return;
		const [y, m] = visibleMonth.split('-').map(Number);
		const from = `${visibleMonth}-01`;
		const to = `${visibleMonth}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
		const params = new URLSearchParams({ from, to });
		if (preceptor) params.set('preceptorId', preceptor);
		if (student) params.set('studentId', student);
		if (site) params.set('siteId', site);
		// Edit mode: exclude this assignment so its own day never reads as busy/full.
		if (mode === 'edit' && assignmentId) params.set('excludeId', assignmentId);
		const key = `${preceptor}|${student}|${site}`;

		let cancelled = false;
		fetch(`/api/schedules/assignments/day-states?${params}`)
			.then((r) => r.json())
			.then((body) => {
				if (cancelled || !body?.success) return;
				const fetched = body.data.days as DayState[];
				const map = key === dayCache.key ? new Map(dayCache.map) : new Map<string, DayState>();
				for (const d of fetched) map.set(d.date, d);
				dayCache = { key, map };
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	/** Requirement strip. */
	$effect(() => {
		if (!open || !student || !clerkship) {
			impact = null;
			return;
		}
		const count = selectedDates.length;
		const excludeParam =
			mode === 'edit' && assignmentId ? `&excludeId=${assignmentId}` : '';
		let cancelled = false;
		fetch(
			`/api/schedules/assignments/requirement-preview?studentId=${student}&clerkshipId=${clerkship}&count=${count}${excludeParam}`
		)
			.then((r) => r.json())
			.then((body) => {
				if (cancelled || !body?.success) return;
				impact = body.data;
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	/**
	 * A dry run on the first selected day catches the codes only the server can
	 * know about (onboarding, site rules).
	 */
	$effect(() => {
		if (!open || !student || !clerkship || !preceptor || selectedDates.length === 0) {
			serverSoftCodes = [];
			hardErrors = [];
			probing = false;
			return;
		}
		const probe = selectedDates[0];
		let cancelled = false;
		probing = true;
		const timer = setTimeout(() => {
			fetch('/api/schedules/assignments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					student_id: student,
					preceptor_id: preceptor,
					clerkship_id: clerkship,
					site_id: site || null,
					date: probe,
					dry_run: true,
					...(mode === 'edit' && assignmentId ? { excludeId: assignmentId } : {})
				})
			})
				.then((r) => r.json())
				.then((body) => {
					if (cancelled || !body?.success) return;
					serverSoftCodes = (body.data.soft ?? []).map((v: { code: string }) => v.code);
					hardErrors = body.data.hard ?? [];
				})
				.catch(() => {})
				.finally(() => {
					if (!cancelled) probing = false;
				});
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	});

	/**
	 * While editing, the assignment being edited must not count as the student
	 * being busy (or as the preceptor's own booking) on its current day.
	 */
	let dayStates = $derived.by(() => {
		if (mode !== 'edit' || !originalDate) return dayCache.map;
		const own = dayCache.map.get(originalDate);
		if (!own) return dayCache.map;
		const patched = new Map(dayCache.map);
		const bookings = own.preceptorBookings.filter((b) => b.assignmentId !== assignmentId);
		patched.set(originalDate, {
			...own,
			studentBusy: false,
			preceptorBookings: bookings,
			preceptorAtCapacity: own.preceptorAtCapacity && bookings.length === own.preceptorBookings.length
		});
		return patched;
	});

	let selectionWide = $derived({
		overRequired: (impact?.exceedsBy ?? 0) > 0,
		notOnboarded: serverSoftCodes.includes('not_onboarded')
	});

	let liveAnalysis = $derived(analyseSelection(selectedDates, [...dayStates.values()], selectionWide));

	let canSubmit = $derived(
		!submitting &&
			!probing &&
			!!student &&
			!!clerkship &&
			!!preceptor &&
			selectedDates.length > 0 &&
			liveAnalysis.submittableDates.length > 0
	);

	// ---- submit -------------------------------------------------------------

	function startSubmit() {
		analysis = liveAnalysis;
		acceptedCodes = [];
		sideEffects = [];
		queue = analysis.categories;
		currentIndex = 0;
		if (queue.length === 0) {
			void performSubmit();
			return;
		}
		conversationOpen = true;
	}

	/**
	 * ConfirmDialog sets its own `open = false` right after `onConfirm` resolves,
	 * so opening the next question has to happen after that — a macrotask later.
	 */
	function advance() {
		conversationOpen = false;
		capacityFollowUpOpen = false;
		setTimeout(() => {
			decisionMade = false;
			if (currentIndex + 1 < queue.length) {
				currentIndex += 1;
				conversationOpen = true;
			} else {
				void performSubmit();
			}
		}, 0);
	}

	function acceptCurrent(effect?: OverrideSideEffect) {
		if (!current) return;
		decisionMade = true;
		acceptedCodes = [...acceptedCodes, current.category];
		if (effect) sideEffects = [...sideEffects, effect];
		advance();
	}

	function cancelConversation() {
		// A close we drove ourselves is not the user backing out.
		if (decisionMade) return;
		conversationOpen = false;
		capacityFollowUpOpen = false;
		queue = [];
		currentIndex = 0;
		acceptedCodes = [];
		sideEffects = [];
	}

	function markAvailableEffect(): OverrideSideEffect | undefined {
		if (!current || !site) return undefined;
		return {
			kind: 'mark_preceptor_available',
			preceptor_id: preceptor,
			site_id: site,
			dates: current.dates
		};
	}

	function moveOtherStudent() {
		if (!current) return;
		decisionMade = true;
		const effects: OverrideSideEffect[] = current.occupants.map((o) => ({
			kind: 'remove_conflicting_assignment',
			assignment_id: o.assignmentId
		}));
		acceptedCodes = [...acceptedCodes, current.category];
		sideEffects = [...sideEffects, ...effects];
		advance();
	}

	/** Second question: a one-time exception, or raise the limit for good? */
	function doubleBook() {
		decisionMade = true;
		conversationOpen = false;
		setTimeout(() => {
			decisionMade = false;
			capacityFollowUpOpen = true;
		}, 0);
	}

	function resolveCapacity(raiseLimit: boolean) {
		if (!current) return;
		decisionMade = true;
		acceptedCodes = [...acceptedCodes, current.category];
		if (raiseLimit) {
			sideEffects = [...sideEffects, { kind: 'bump_preceptor_capacity', preceptor_id: preceptor }];
		}
		advance();
	}

	async function performSubmit() {
		if (!analysis) return;
		submitting = true;
		try {
			if (mode === 'edit') {
				await submitEdit();
			} else {
				await submitCreate();
			}
		} finally {
			submitting = false;
		}
	}

	async function submitCreate() {
		const payload = buildSubmitPayload(
			{
				studentId: student,
				preceptorId: preceptor,
				clerkshipId: clerkship,
				siteId: site,
				locked: canLock && locked,
				note
			},
			analysis!,
			acceptedCodes,
			sideEffects
		);

		try {
			const res = await fetch('/api/schedules/assignments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json();
			if (!res.ok || !body.success) {
				hardErrors = body.error?.hard ?? [];
				toast.error(body.error?.message ?? 'Could not create the assignment');
				return;
			}

			// The bulk endpoint reports per-day outcomes rather than failing, so a
			// run where nothing was created must not read as success.
			const created: number = body.data.createdCount ?? 1;
			const results: { created: boolean; violations?: { message: string }[] }[] =
				body.data.results ?? [];
			if (created === 0) {
				const reason = results
					.flatMap((r) => (r.created ? [] : (r.violations ?? [])))
					.map((v) => v.message)[0];
				toast.error(reason ? `Nothing was assigned — ${reason}` : 'Nothing was assigned');
				return;
			}

			const skippedHere = results.filter((r) => !r.created).length;
			const skipped = analysis!.blockedDates.length + skippedHere;
			toast.success(
				skipped > 0 ? `${created} day(s) assigned · ${skipped} skipped` : `${created} day(s) assigned`
			);
			contextKey += 1;
			open = false;
			onSaved?.();
		} catch {
			toast.error('Could not create the assignment');
		}
	}

	async function submitEdit() {
		const day = analysis!.submittableDates[0];
		try {
			if (sideEffects.length > 0) {
				// Side effects are applied through the create endpoint's transaction;
				// for an edit we apply them as their own explicit request first.
				await fetch('/api/schedules/assignments/side-effects', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ side_effects: sideEffects })
				});
			}
			const res = await fetch(
				`/api/schedules/assignments/${assignmentId}?force=${acceptedCodes.includes('past_date')}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						student_id: student,
						preceptor_id: preceptor,
						clerkship_id: clerkship,
						site_id: site || null,
						date: day,
						...(canLock ? { locked } : {})
					})
				}
			);
			const body = await res.json();
			if (!res.ok || !body.success) {
				toast.error(body.error?.message ?? 'Could not update the assignment');
				return;
			}
			toast.success('Assignment updated');
			contextKey += 1;
			open = false;
			onSaved?.();
		} catch {
			toast.error('Could not update the assignment');
		}
	}

	// ---- removal (edit mode) ------------------------------------------------
	let confirmRemoveOpen = $state(false);

	async function requestRemove(force = false) {
		if (!assignmentId) return;
		const res = await fetch(`/api/schedules/assignments/${assignmentId}?force=${force}`, {
			method: 'DELETE'
		});
		const body = await res.json().catch(() => null);
		if (res.status === 409 && body?.error?.code === 'past_date') {
			confirmRemoveOpen = true;
			return;
		}
		if (!res.ok) {
			toast.error(body?.error?.message ?? 'Could not remove the assignment');
			return;
		}
		toast.success('Assignment removed');
		confirmRemoveOpen = false;
		open = false;
		onDeleted?.();
	}

	function optionLabel(o: EligibilityOption): string {
		return o.eligible ? o.name : `${o.name} — ${o.reason ?? 'not available'}`;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] max-w-3xl overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{mode === 'edit' ? 'Edit assignment' : 'Add assignment'}</Dialog.Title>
			<Dialog.Description>
				{mode === 'edit'
					? 'Changes apply to this day only.'
					: 'Pick who, where and which days. Anything unusual is confirmed before saving.'}
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
			<div class="space-y-4">
				{#if showStudentSelect}
					<div class="space-y-1">
						<Label for="ad-student">Student</Label>
						<select
							id="ad-student"
							bind:value={student}
							disabled={lockStudent}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
						>
							<option value="">Select a student…</option>
							{#each students as s (s.id)}
								<option value={s.id}>{s.name}</option>
							{/each}
						</select>
					</div>
				{/if}

				<div class="space-y-1">
					<Label for="ad-clerkship">Clerkship</Label>
					<select
						id="ad-clerkship"
						bind:value={clerkship}
						disabled={lockClerkship}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
					>
						<option value="">Select a clerkship…</option>
						{#each options.clerkships as c (c.id)}
							<option value={c.id} disabled={!c.eligible}>{optionLabel(c)}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-1">
					<Label for="ad-preceptor">Preceptor</Label>
					<select
						id="ad-preceptor"
						bind:value={preceptor}
						disabled={lockPreceptor}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
					>
						<option value="">Select a preceptor…</option>
						{#each options.preceptors as p (p.id)}
							<option value={p.id} disabled={!p.eligible}>{optionLabel(p)}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-1">
					<Label for="ad-site">Site <span class="text-muted-foreground">(optional)</span></Label>
					<select
						id="ad-site"
						bind:value={site}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					>
						<option value="">No specific site</option>
						{#each options.sites as s (s.id)}
							<option value={s.id} disabled={!s.eligible}>{optionLabel(s)}</option>
						{/each}
					</select>
				</div>

				{#if clearedNotice}
					<p class="text-sm text-amber-700" data-testid="cleared-notice">{clearedNotice}</p>
				{/if}

				{#if impact}
					<p class="text-sm" data-testid="requirement-strip">
						<span class="text-muted-foreground">
							Assigning {selectedDates.length} day(s) · {impact.unscheduled} of {impact.required} still
							needed for {impact.clerkshipName || 'this clerkship'}
						</span>
						{#if impact.exceedsBy > 0}
							<span class="ml-1 font-medium text-amber-700" data-testid="over-required-warning">
								{impact.exceedsBy} day(s) more than required
							</span>
						{/if}
					</p>
				{/if}

				{#if range}
					<AssignmentDatePicker
						rangeStart={range.start}
						rangeEnd={range.end}
						{dayStates}
						bind:selected={selectedDates}
						bind:mode={pickerMode}
						{singleOnly}
						disabled={lockDate}
						month={visibleMonth}
						onMonthChange={(m) => (visibleMonth = m)}
					/>
				{:else}
					<p class="text-sm text-muted-foreground">No active schedule — pick one first.</p>
				{/if}

				{#if liveAnalysis.blockedDates.length > 0}
					<div
						class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
						data-testid="blocked-days"
					>
						<p class="font-medium">
							The student already has an assignment on these days, so they will be skipped:
						</p>
						<p>{liveAnalysis.blockedDates.join(', ')}</p>
					</div>
				{/if}

				{#if hardErrors.length > 0}
					<div
						class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
					>
						<ul class="list-inside list-disc">
							{#each hardErrors as v (v.code + v.message)}<li>{v.message}</li>{/each}
						</ul>
					</div>
				{/if}

				{#if liveAnalysis.categories.length > 0}
					<div
						class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
						data-testid="override-summary"
					>
						<p class="font-medium">You will be asked to confirm:</p>
						<ul class="list-inside list-disc">
							{#each liveAnalysis.categories as c (c.category)}
								<li>
									{CATEGORY_COPY[c.category].title}{c.dates.length > 0
										? ` (${c.dates.length} day${c.dates.length === 1 ? '' : 's'})`
										: ''}
								</li>
							{/each}
						</ul>
					</div>

					<div class="space-y-1">
						<Label for="ad-note">Note <span class="text-muted-foreground">(optional)</span></Label>
						<Input
								id="ad-note"
								bind:value={note}
								placeholder={liveAnalysis.categories.length > 0
									? 'Why this exception is being made'
									: 'Optional note about this assignment'}
							/>
					</div>
				{/if}

				{#if canLock}
					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" bind:checked={locked} data-testid="lock-assignment" />
						Lock this assignment (kept by auto-generation)
					</label>
				{/if}
			</div>

			<div class="space-y-3">
				<AssignmentContextPanel studentId={student} refreshKey={contextKey} />
			</div>
		</div>

		<Dialog.Footer class="gap-2">
			{#if mode === 'edit'}
				<Button
					variant="destructive"
					class="mr-auto"
					disabled={submitting}
					onclick={() => requestRemove(false)}
				>
					Remove
				</Button>
			{/if}
			<Button variant="outline" onclick={() => (open = false)} disabled={submitting}>Cancel</Button>
			<Button onclick={startSubmit} disabled={!canSubmit}>
				{submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Override conversations: one question per flagged category. -->
{#if current}
	{#if current.category === 'preceptor_unavailable'}
		<ConfirmDialog
			bind:open={conversationOpen}
			title={CATEGORY_COPY.preceptor_unavailable.title}
			description="{CATEGORY_COPY.preceptor_unavailable.describe} {current.dates.join(', ')}"
			confirmLabel={site ? 'Assign and mark available' : 'Assign anyway'}
			cancelLabel="Cancel"
			destructive={false}
			onConfirm={() => acceptCurrent(markAvailableEffect())}
			onCancel={cancelConversation}
		>
			{#snippet details()}
				<p class="text-muted-foreground">
					{#if site}
						"Assign anyway" makes a one-time exception; "Assign and mark available" also updates the
						preceptor's availability for these days.
					{:else}
						Pick a site to also update the preceptor's availability for these days.
					{/if}
				</p>
				{#if site}
					<Button
						variant="outline"
						size="sm"
						class="mt-2"
						onclick={() => acceptCurrent(undefined)}
					>
						Assign anyway (one-time exception)
					</Button>
				{/if}
			{/snippet}
		</ConfirmDialog>
	{:else if current.category === 'preceptor_capacity'}
		<ConfirmDialog
			bind:open={conversationOpen}
			title={CATEGORY_COPY.preceptor_capacity.title}
			description="{CATEGORY_COPY.preceptor_capacity.describe} {current.dates.join(', ')}"
			confirmLabel="Double-book this day"
			cancelLabel="Cancel"
			destructive={false}
			onConfirm={doubleBook}
			onCancel={cancelConversation}
		>
			{#snippet details()}
				{#if current.occupants.length > 0}
					<p class="text-muted-foreground">
						Already with this preceptor: {current.occupants.map((o) => o.studentName).join(', ')}.
					</p>
					<Button variant="outline" size="sm" class="mt-2" onclick={moveOtherStudent}>
						Move {current.occupants.map((o) => o.studentName).join(', ')} off {current.dates.length ===
						1
							? 'this day'
							: 'these days'}
					</Button>
				{/if}
			{/snippet}
		</ConfirmDialog>
	{:else}
		<ConfirmDialog
			bind:open={conversationOpen}
			title={CATEGORY_COPY[current.category].title}
			description="{CATEGORY_COPY[current.category].describe}{current.dates.length > 0
				? ` ${current.dates.join(', ')}`
				: ''}"
			confirmLabel="Assign anyway"
			cancelLabel="Cancel"
			destructive={false}
			onConfirm={() => acceptCurrent()}
			onCancel={cancelConversation}
		/>
	{/if}
{/if}

<ConfirmDialog
	bind:open={capacityFollowUpOpen}
	title="Just this once, or raise the limit?"
	description="Double-booking can be a one-off exception, or you can raise this preceptor's student limit for good."
	confirmLabel="Raise the limit"
	cancelLabel="Just this exception"
	destructive={false}
	onConfirm={() => resolveCapacity(true)}
	onCancel={() => resolveCapacity(false)}
/>

<ConfirmDialog
	bind:open={confirmRemoveOpen}
	title="This day has already happened"
	description="Removing an assignment in the past changes the record of what took place. Remove it anyway?"
	confirmLabel="Remove anyway"
	onConfirm={() => requestRemove(true)}
	onCancel={() => (confirmRemoveOpen = false)}
/>
