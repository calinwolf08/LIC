<script lang="ts">
	/**
	 * The "no active schedule" empty state (step 39).
	 *
	 * Distinct from a per-entity "no data yet" empty state: here the user has not
	 * selected or created a schedule at all, so every schedule-scoped surface is
	 * legitimately empty. One shared component owns this copy so it stays
	 * consistent across the dashboard, calendar, locations and entity lists.
	 */
	import EmptyState from './empty-state.svelte';
	import { Button } from './ui/button';

	interface Props {
		/** What the user was looking at, e.g. "calendar" — folded into the copy. */
		surface?: string;
	}

	let { surface }: Props = $props();
</script>

<EmptyState
	icon="🗓️"
	title="No active schedule"
	description={surface
		? `Select or create a schedule to see your ${surface}.`
		: 'Select or create a schedule to get started.'}
>
	{#snippet action()}
		<Button href="/schedules" data-testid="no-schedule-cta">Manage schedules</Button>
	{/snippet}
</EmptyState>
