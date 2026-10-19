<script lang="ts">
	/**
	 * TEMPORARY tier picker for testing (shown only when ENABLE_TIER_TESTING is
	 * set). Submits as a form field named `name`.
	 */
	import { PLAN_LIST, type PlanId } from '$lib/billing/plans';

	interface Props {
		name?: string;
		value?: PlanId;
		disabled?: boolean;
	}

	let { name = 'plan', value = $bindable('standard'), disabled = false }: Props = $props();

	const labels: Record<PlanId, string> = {
		standard: 'Basic — manual scheduling',
		pro: 'Advanced — adds auto-generation'
	};
</script>

<fieldset
	class="space-y-2 rounded-md border border-dashed border-amber-400 bg-amber-50 p-3"
	data-testid="tier-test-picker"
>
	<legend class="px-1 text-xs font-semibold tracking-wide text-amber-800 uppercase">
		Testing only — choose a tier
	</legend>
	{#each PLAN_LIST as plan (plan.id)}
		<label class="flex cursor-pointer items-start gap-2 text-sm">
			<input
				type="radio"
				{name}
				value={plan.id}
				bind:group={value}
				{disabled}
				class="mt-0.5"
				data-testid="tier-option-{plan.id}"
			/>
			<span>
				<span class="font-medium">{plan.name}</span>
				<span class="text-muted-foreground"> · {labels[plan.id]}</span>
			</span>
		</label>
	{/each}
</fieldset>
