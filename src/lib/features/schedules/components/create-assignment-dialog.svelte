<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from '$lib/components';

	interface Option {
		id: string;
		name: string;
	}

	interface Props {
		open: boolean;
		/** Pre-fill + lock context (e.g. from a student page or a calendar day). */
		studentId?: string;
		preceptorId?: string;
		clerkshipId?: string;
		date?: string;
		lockStudent?: boolean;
		lockPreceptor?: boolean;
		lockDate?: boolean;
		onSaved?: () => void;
	}

	let {
		open = $bindable(),
		studentId = '',
		preceptorId = '',
		clerkshipId = '',
		date = '',
		lockStudent = false,
		lockPreceptor = false,
		lockDate = false,
		onSaved
	}: Props = $props();

	// Option lists
	let students = $state<Option[]>([]);
	let preceptors = $state<Option[]>([]);
	let clerkships = $state<Option[]>([]);
	let sites = $state<Option[]>([]);
	let loaded = $state(false);

	// Form fields
	let student = $state('');
	let preceptor = $state('');
	let clerkship = $state('');
	let site = $state('');
	let mode = $state<'single' | 'range'>('single');
	let singleDate = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let weekdays = $state<number[]>([1, 2, 3, 4, 5]);
	let locked = $state(false);

	// Validation state
	let hard = $state<{ code: string; message: string }[]>([]);
	let soft = $state<{ code: string; message: string }[]>([]);
	let submitting = $state(false);

	const weekdayLabels = [
		{ v: 0, l: 'Sun' },
		{ v: 1, l: 'Mon' },
		{ v: 2, l: 'Tue' },
		{ v: 3, l: 'Wed' },
		{ v: 4, l: 'Thu' },
		{ v: 5, l: 'Fri' },
		{ v: 6, l: 'Sat' }
	];

	async function loadOptions() {
		if (loaded) return;
		try {
			const [s, p, c, si] = await Promise.all([
				fetch('/api/students').then((r) => r.json()),
				fetch('/api/preceptors').then((r) => r.json()),
				fetch('/api/clerkships').then((r) => r.json()),
				fetch('/api/sites').then((r) => r.json())
			]);
			students = (s.data ?? []).map((x: any) => ({ id: x.id, name: x.name }));
			preceptors = (p.data ?? []).map((x: any) => ({ id: x.id, name: x.name }));
			clerkships = (c.data ?? []).map((x: any) => ({ id: x.id, name: x.name }));
			sites = (si.data ?? []).map((x: any) => ({ id: x.id, name: x.name }));
			loaded = true;
		} catch (e) {
			console.error('Failed to load assignment options', e);
		}
	}

	// Reset + prefill each time the dialog opens
	$effect(() => {
		if (open) {
			loadOptions();
			student = studentId;
			preceptor = preceptorId;
			clerkship = clerkshipId;
			site = '';
			singleDate = date;
			startDate = date;
			endDate = date;
			mode = 'single';
			locked = false;
			hard = [];
			soft = [];
		}
	});

	// Debounced dry-run validation for single mode.
	let validateTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		// track dependencies
		const ready = student && preceptor && clerkship && (mode === 'single' ? singleDate : startDate);
		if (!open || !ready) {
			hard = [];
			soft = [];
			return;
		}
		clearTimeout(validateTimer);
		const payload =
			mode === 'single'
				? {
						student_id: student,
						preceptor_id: preceptor,
						clerkship_id: clerkship,
						site_id: site || null,
						date: singleDate,
						dry_run: true
					}
				: {
						student_id: student,
						preceptor_id: preceptor,
						clerkship_id: clerkship,
						site_id: site || null,
						start_date: startDate,
						end_date: endDate,
						dry_run: true
					};
		validateTimer = setTimeout(async () => {
			try {
				const res = await fetch('/api/schedules/assignments', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});
				const body = await res.json();
				if (body.success) {
					hard = body.data.hard ?? [];
					soft = body.data.soft ?? [];
				}
			} catch (e) {
				console.error(e);
			}
		}, 300);
	});

	function toggleWeekday(v: number) {
		weekdays = weekdays.includes(v) ? weekdays.filter((d) => d !== v) : [...weekdays, v];
	}

	async function submit(force: boolean) {
		submitting = true;
		try {
			const payload =
				mode === 'single'
					? {
							student_id: student,
							preceptor_id: preceptor,
							clerkship_id: clerkship,
							site_id: site || null,
							date: singleDate,
							locked,
							force
						}
					: {
							student_id: student,
							preceptor_id: preceptor,
							clerkship_id: clerkship,
							site_id: site || null,
							start_date: startDate,
							end_date: endDate,
							weekdays,
							locked,
							force
						};
			const res = await fetch('/api/schedules/assignments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json();
			if (res.ok && body.success) {
				if (mode === 'single') {
					toast.success('Assignment created');
				} else {
					toast.success(`${body.data.createdCount} assignment(s) created`);
				}
				open = false;
				onSaved?.();
			} else {
				hard = body.error?.hard ?? [];
				soft = body.error?.soft ?? [];
				if (hard.length === 0 && soft.length === 0) {
					toast.error(body.error?.message ?? 'Failed to create assignment');
				}
			}
		} catch (e) {
			console.error(e);
			toast.error('Failed to create assignment');
		} finally {
			submitting = false;
		}
	}

	let canSubmit = $derived(
		!submitting &&
			!!student &&
			!!preceptor &&
			!!clerkship &&
			(mode === 'single' ? !!singleDate : !!startDate && !!endDate) &&
			hard.length === 0
	);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Add assignment</Dialog.Title>
		</Dialog.Header>

		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="ca-student">Student</Label>
				<select
					id="ca-student"
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

			<div class="space-y-2">
				<Label for="ca-clerkship">Clerkship</Label>
				<select
					id="ca-clerkship"
					bind:value={clerkship}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
				>
					<option value="">Select a clerkship…</option>
					{#each clerkships as c (c.id)}
						<option value={c.id}>{c.name}</option>
					{/each}
				</select>
			</div>

			<div class="space-y-2">
				<Label for="ca-preceptor">Preceptor</Label>
				<select
					id="ca-preceptor"
					bind:value={preceptor}
					disabled={lockPreceptor}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
				>
					<option value="">Select a preceptor…</option>
					{#each preceptors as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</div>

			<div class="space-y-2">
				<Label for="ca-site">Site <span class="text-muted-foreground">(optional)</span></Label>
				<select
					id="ca-site"
					bind:value={site}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
				>
					<option value="">No specific site</option>
					{#each sites as si (si.id)}
						<option value={si.id}>{si.name}</option>
					{/each}
				</select>
			</div>

			<!-- Mode toggle -->
			<div class="flex gap-2">
				<Button
					variant={mode === 'single' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (mode = 'single')}
				>
					Single date
				</Button>
				<Button
					variant={mode === 'range' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (mode = 'range')}
					disabled={lockDate}
				>
					Date range
				</Button>
			</div>

			{#if mode === 'single'}
				<div class="space-y-2">
					<Label for="ca-date">Date</Label>
					<Input id="ca-date" type="date" bind:value={singleDate} disabled={lockDate} />
				</div>
			{:else}
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="ca-start">Start</Label>
						<Input id="ca-start" type="date" bind:value={startDate} />
					</div>
					<div class="space-y-2">
						<Label for="ca-end">End</Label>
						<Input id="ca-end" type="date" bind:value={endDate} />
					</div>
				</div>
				<div class="space-y-2">
					<Label>Days of week</Label>
					<div class="flex flex-wrap gap-1">
						{#each weekdayLabels as w (w.v)}
							<button
								type="button"
								onclick={() => toggleWeekday(w.v)}
								class="rounded-md border px-2 py-1 text-xs {weekdays.includes(w.v)
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-input'}"
							>
								{w.l}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={locked} />
				Lock this assignment (preserved by auto-generation)
			</label>

			<!-- Validation feedback -->
			{#if hard.length > 0}
				<div
					class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
				>
					<p class="font-medium">Cannot create:</p>
					<ul class="list-inside list-disc">
						{#each hard as v (v.code + v.message)}<li>{v.message}</li>{/each}
					</ul>
				</div>
			{:else if soft.length > 0}
				<div class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
					<p class="font-medium">Warnings:</p>
					<ul class="list-inside list-disc">
						{#each soft as v (v.code + v.message)}<li>{v.message}</li>{/each}
					</ul>
				</div>
			{:else if student && preceptor && clerkship}
				<p class="text-sm text-green-700">No conflicts.</p>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)} disabled={submitting}>Cancel</Button>
			{#if soft.length > 0 && hard.length === 0}
				<Button
					variant="destructive"
					onclick={() => submit(true)}
					disabled={submitting || !canSubmit}
				>
					Create anyway
				</Button>
			{:else}
				<Button onclick={() => submit(false)} disabled={!canSubmit}>
					{submitting ? 'Creating…' : 'Create'}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
