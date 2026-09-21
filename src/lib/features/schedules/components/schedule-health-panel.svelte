<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { OVERRIDE_LABELS } from '$lib/features/scheduling/services/assignment-validation';
	import type { GroupedOverride } from '$lib/features/schedules/services/assignment-service';

	interface Props {
		/** Whole-schedule violations, grouped by code, from /api/schedules/validation. */
		countsByCode: Record<string, number>;
		violationCount: number;
		/** Open the edit dialog for an assignment (health rows link back to it). */
		onOpenAssignment?: (assignmentId: string) => void;
		/** Bumped by the caller after any assignment change, to refetch overrides. */
		refreshKey?: number;
	}

	let { countsByCode, violationCount, onOpenAssignment, refreshKey = 0 }: Props = $props();

	let open = $state(false);

	// Override list state (this panel owns the filter/toggle/pagination).
	let overrides = $state<GroupedOverride[]>([]);
	let total = $state(0);
	let page = $state(1);
	const pageSize = 15;
	let includeResolved = $state(false);
	let codeFilter = $state('');
	let overrideCounts = $state<Record<string, number>>({});

	function label(code: string): string {
		return (OVERRIDE_LABELS as Record<string, string>)[code] ?? code;
	}

	let codeRows = $derived(
		Object.entries(countsByCode)
			.filter(([, n]) => n > 0)
			.sort((a, b) => b[1] - a[1])
	);

	let pageCount = $derived(Math.max(1, Math.ceil(total / pageSize)));

	// Refetch whenever the panel opens or a filter/page/refreshKey changes.
	$effect(() => {
		// Track dependencies explicitly.
		void refreshKey;
		if (!open) return;
		const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
		if (includeResolved) params.set('includeResolved', 'true');
		if (codeFilter) params.set('code', codeFilter);
		let cancelled = false;
		fetch(`/api/schedules/overrides?${params}`)
			.then((r) => r.json())
			.then((body) => {
				if (cancelled || !body?.success) return;
				overrides = body.data.overrides ?? [];
				total = body.data.total ?? 0;
				overrideCounts = body.data.countsByCode ?? {};
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	function setCodeFilter(code: string) {
		codeFilter = code;
		page = 1;
	}

	function toggleResolved() {
		includeResolved = !includeResolved;
		page = 1;
	}

	function fmtRange(o: GroupedOverride): string {
		return o.days === 1 ? o.startDate : `${o.startDate} → ${o.endDate} (${o.days} days)`;
	}
</script>

<Card class="mb-4 p-4" data-testid="schedule-health">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<h2 class="text-lg font-semibold">Schedule health</h2>
			{#if violationCount === 0}
				<Badge class="bg-green-600">No conflicts</Badge>
			{:else}
				<Badge variant="destructive" data-testid="health-violation-count">
					{violationCount} conflict{violationCount === 1 ? '' : 's'}
				</Badge>
			{/if}
		</div>
		<Button size="sm" variant="outline" onclick={() => (open = !open)}>
			{open ? 'Hide details' : 'Show details'}
		</Button>
	</div>

	{#if open}
		<div class="mt-4 grid gap-6 md:grid-cols-2">
			<!-- Violations grouped by code -->
			<div>
				<h3 class="text-sm font-medium">Conflicts by type</h3>
				<p class="mb-2 text-xs text-muted-foreground">Problems live in the schedule right now.</p>
				{#if codeRows.length === 0}
					<p class="text-sm text-muted-foreground">Nothing to fix — this schedule is clean.</p>
				{:else}
					<ul class="space-y-1 text-sm">
						{#each codeRows as [code, n] (code)}
							<li
								class="flex items-center justify-between rounded border px-3 py-2"
								data-testid="health-type-row"
								data-code={code}
							>
								<span>{label(code)}</span>
								<Badge variant="outline">{n}</Badge>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<!-- Accepted overrides, each linking back to its assignment -->
			<div>
				<h3 class="text-sm font-medium">Overrides</h3>
				<p class="mb-2 text-xs text-muted-foreground">
					Exceptions you explicitly accepted. An <em>active</em> one is suppressing a conflict that
					would otherwise show under “Conflicts by type”; a <em>resolved</em> one no longer applies.
				</p>

				<div class="mb-2 flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						variant={codeFilter === '' ? 'default' : 'outline'}
						onclick={() => setCodeFilter('')}
					>
						All
					</Button>
					{#each Object.entries(overrideCounts).filter(([, n]) => n > 0) as [code, n] (code)}
						<Button
							size="sm"
							variant={codeFilter === code ? 'default' : 'outline'}
							data-testid="override-count"
							data-code={code}
							onclick={() => setCodeFilter(code)}
						>
							{label(code)} ({n})
						</Button>
					{/each}
					<label class="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
						<input
							type="checkbox"
							checked={includeResolved}
							onchange={toggleResolved}
							data-testid="include-resolved"
						/>
						Include resolved
					</label>
				</div>

				{#if overrides.length === 0}
					<p class="text-sm text-muted-foreground">
						No overrides{codeFilter ? ' of this type' : ''}{includeResolved ? '' : ' outstanding'}.
					</p>
				{:else}
					<ul class="space-y-2 text-sm" data-testid="override-list">
						{#each overrides as o (o.assignmentIds[0])}
							<li class="rounded border px-3 py-2">
								<div class="flex items-start justify-between gap-2">
									<div>
										<p class="font-medium">
											{o.studentName} · {fmtRange(o)}
											{#if o.status === 'resolved'}
												<Badge variant="outline" class="ml-1 text-xs" data-testid="override-status"
													>resolved</Badge
												>
											{:else}
												<Badge
													variant="outline"
													class="ml-1 border-amber-400 text-xs text-amber-700"
													data-testid="override-status">suppressing a conflict</Badge
												>
											{/if}
										</p>
										<p class="text-xs text-muted-foreground">
											{o.clerkshipName} · {o.preceptorName}
										</p>
										<div class="mt-1 flex flex-wrap gap-1">
											{#each o.codes as code (code)}
												<Badge variant="secondary" class="text-xs">{label(code)}</Badge>
											{/each}
										</div>
										{#if o.note}
											<p class="mt-1 text-xs italic text-muted-foreground">“{o.note}”</p>
										{/if}
									</div>
									{#if onOpenAssignment}
										<Button
											size="sm"
											variant="ghost"
											onclick={() => onOpenAssignment?.(o.assignmentIds[0])}
										>
											Review
										</Button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>

					{#if pageCount > 1}
						<div class="mt-2 flex items-center justify-between text-xs">
							<Button size="sm" variant="outline" disabled={page <= 1} onclick={() => (page -= 1)}>
								Previous
							</Button>
							<span class="text-muted-foreground">Page {page} of {pageCount}</span>
							<Button
								size="sm"
								variant="outline"
								disabled={page >= pageCount}
								onclick={() => (page += 1)}
							>
								Next
							</Button>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</Card>
