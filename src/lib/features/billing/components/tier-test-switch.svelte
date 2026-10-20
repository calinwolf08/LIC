<script lang="ts">
	/**
	 * TEMPORARY sidebar switch between Standard and Pro for testing (shown only
	 * when ENABLE_TIER_TESTING is set). Reloads after switching so every page
	 * picks up the new entitlements.
	 */
	import { ENTITLEMENT_AUTOGEN, type PlanId } from '$lib/billing/plans';

	interface Props {
		entitlements: readonly string[];
	}

	let { entitlements }: Props = $props();

	let current = $derived<PlanId>(entitlements.includes(ENTITLEMENT_AUTOGEN) ? 'pro' : 'standard');
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function switchTo(planId: PlanId) {
		if (planId === current || busy) return;
		busy = true;
		error = null;
		try {
			const response = await fetch('/api/testing/plan', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ planId })
			});
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				error = body?.error?.message ?? 'Could not switch tier';
				return;
			}
			window.location.reload();
		} catch {
			error = 'Network error switching tier';
		} finally {
			busy = false;
		}
	}
</script>

<div class="rounded-lg border border-dashed border-amber-500/60 p-3" data-testid="tier-test-switch">
	<p class="mb-2 text-xs font-semibold tracking-wide text-amber-400 uppercase">Testing: tier</p>
	<div class="grid grid-cols-2 gap-1 rounded-md bg-gray-800 p-1 text-xs">
		{#each [{ id: 'standard', label: 'Basic' }, { id: 'pro', label: 'Advanced' }] as option (option.id)}
			<button
				type="button"
				disabled={busy}
				aria-pressed={current === option.id}
				onclick={() => switchTo(option.id as PlanId)}
				class="rounded px-2 py-1 font-medium transition-colors {current === option.id
					? 'bg-amber-500 text-gray-900'
					: 'text-gray-300 hover:bg-gray-700'}"
				data-testid="tier-switch-{option.id}"
			>
				{option.label}
			</button>
		{/each}
	</div>
	{#if error}
		<p class="mt-2 text-xs text-red-400">{error}</p>
	{/if}
</div>
