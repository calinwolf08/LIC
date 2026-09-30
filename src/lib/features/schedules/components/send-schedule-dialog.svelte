<script lang="ts">
	/**
	 * Send schedule dialog (client feedback K1).
	 *
	 * Multi-select recipients across preceptors / students / sites, preview each
	 * recipient's minimum-necessary view (docs/plans/ferpa-scoping.md), then send.
	 * The preview and send both go through /api/schedules/distribute, so the
	 * redaction the API performs is exactly what the coordinator sees here.
	 */
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components';

	interface Props {
		open: boolean;
	}
	let { open = $bindable() }: Props = $props();

	type Entity = { id: string; name: string };
	type RecipientType = 'preceptor' | 'student' | 'site';
	interface RecipientDay {
		date: string;
		session: string;
		studentName?: string;
		clerkshipName?: string | null;
		preceptorName?: string | null;
		siteName?: string | null;
		kind?: string;
	}
	interface RecipientView {
		recipient: { type: RecipientType; id: string };
		recipientName: string;
		recipientEmail?: string;
		days: RecipientDay[];
	}

	let preceptors = $state<Entity[]>([]);
	let students = $state<Entity[]>([]);
	let sites = $state<Entity[]>([]);
	let selected = $state<Set<string>>(new Set()); // keys "type:id"
	let views = $state<RecipientView[]>([]);
	let previewing = $state(false);
	let sending = $state(false);
	let sentSummary = $state<{ recipientName: string; dayCount: number }[] | null>(null);

	$effect(() => {
		if (!open) return;
		// Reset on each open and load the schedule's entities.
		selected = new Set();
		views = [];
		sentSummary = null;
		void load();
	});

	async function load() {
		try {
			const [p, s, si] = await Promise.all([
				fetch('/api/preceptors').then((r) => r.json()),
				fetch('/api/students').then((r) => r.json()),
				fetch('/api/sites').then((r) => r.json())
			]);
			preceptors = (p.data ?? []).map((e: Entity) => ({ id: e.id, name: e.name }));
			students = (s.data ?? []).map((e: Entity) => ({ id: e.id, name: e.name }));
			sites = (si.data ?? []).map((e: Entity) => ({ id: e.id, name: e.name }));
		} catch {
			toast.error('Could not load recipients');
		}
	}

	function key(type: RecipientType, id: string) {
		return `${type}:${id}`;
	}
	function toggle(type: RecipientType, id: string) {
		const k = key(type, id);
		const next = new Set(selected);
		if (next.has(k)) next.delete(k);
		else next.add(k);
		selected = next;
		// A selection change invalidates a stale preview.
		views = [];
		sentSummary = null;
	}

	function recipients() {
		return [...selected].map((k) => {
			const [type, id] = k.split(':');
			return { type: type as RecipientType, id };
		});
	}

	async function preview() {
		if (selected.size === 0) return;
		previewing = true;
		sentSummary = null;
		try {
			const res = await fetch('/api/schedules/distribute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipients: recipients(), mode: 'preview' })
			});
			const body = await res.json();
			if (!res.ok || !body.success) {
				toast.error(body.error?.message ?? 'Could not build preview');
				return;
			}
			views = body.data.views ?? [];
		} finally {
			previewing = false;
		}
	}

	async function send() {
		if (selected.size === 0) return;
		sending = true;
		try {
			const res = await fetch('/api/schedules/distribute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipients: recipients(), mode: 'send' })
			});
			const body = await res.json();
			if (!res.ok || !body.success) {
				toast.error(body.error?.message ?? 'Could not send the schedule');
				return;
			}
			sentSummary = (body.data.records ?? []).map(
				(r: { recipientName: string; dayCount: number }) => ({
					recipientName: r.recipientName,
					dayCount: r.dayCount
				})
			);
			toast.success(`Schedule sent to ${sentSummary?.length ?? 0} recipient(s)`);
		} finally {
			sending = false;
		}
	}

	function sessionLabel(s: string) {
		return s === 'am' ? 'AM' : s === 'pm' ? 'PM' : 'Full day';
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[85vh] max-w-2xl overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Send schedule</Dialog.Title>
			<Dialog.Description>
				Each recipient sees only their own days — a preceptor sees only their students, a site only
				its own, a student only their own schedule. Personal notes are never shared.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4" data-testid="send-schedule">
			<div class="grid gap-4 md:grid-cols-3">
				{#each [{ type: 'preceptor' as const, label: 'Preceptors', list: preceptors }, { type: 'student' as const, label: 'Students', list: students }, { type: 'site' as const, label: 'Sites', list: sites }] as group (group.type)}
					<div class="space-y-1">
						<p class="text-sm font-medium">{group.label}</p>
						<div class="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
							{#each group.list as e (e.id)}
								<label class="flex cursor-pointer items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={selected.has(key(group.type, e.id))}
										onchange={() => toggle(group.type, e.id)}
										data-testid={`recipient-${group.type}-${e.id}`}
									/>
									<span>{e.name}</span>
								</label>
							{:else}
								<p class="text-xs text-muted-foreground">None in this schedule</p>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<div class="flex gap-2">
				<Button
					variant="outline"
					onclick={preview}
					disabled={selected.size === 0 || previewing}
					data-testid="preview-recipients"
				>
					{previewing ? 'Building…' : `Preview (${selected.size})`}
				</Button>
				<Button
					onclick={send}
					disabled={selected.size === 0 || sending}
					data-testid="send-recipients"
				>
					{sending ? 'Sending…' : 'Send'}
				</Button>
			</div>

			{#if sentSummary}
				<div
					class="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
					data-testid="send-confirmation"
				>
					<p class="font-medium">Sent to {sentSummary.length} recipient(s):</p>
					<ul class="mt-1 list-inside list-disc">
						{#each sentSummary as r (r.recipientName)}
							<li>{r.recipientName} — {r.dayCount} day(s)</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if views.length > 0}
				<div class="space-y-3">
					<p class="text-sm font-medium">Preview</p>
					{#each views as v (v.recipient.type + v.recipient.id)}
						<div
							class="rounded-md border p-3"
							data-testid={`recipient-preview-${v.recipient.type}-${v.recipient.id}`}
						>
							<p class="text-sm font-semibold">
								{v.recipientName}
								<span class="ml-1 text-xs font-normal text-muted-foreground">({v.recipient.type})</span>
								{#if v.recipientEmail}
									<span class="ml-1 text-xs font-normal text-muted-foreground">{v.recipientEmail}</span>
								{/if}
							</p>
							{#if v.days.length === 0}
								<p class="text-xs text-muted-foreground">No days in this schedule.</p>
							{:else}
								<ul class="mt-1 space-y-0.5 text-xs">
									{#each v.days as d (d.date + d.session + (d.studentName ?? '') + (d.clerkshipName ?? '') + (d.kind ?? ''))}
										<li>
											{d.date} · {sessionLabel(d.session)}
											{#if d.studentName}· {d.studentName}{/if}
											{#if d.clerkshipName}· {d.clerkshipName}{/if}
											{#if d.preceptorName}· {d.preceptorName}{/if}
											{#if d.siteName}· {d.siteName}{/if}
											{#if d.kind && d.kind !== 'clinical'}· {d.kind === 'exam' ? 'Exam' : 'Free day'}{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
