<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import TeamList from '$lib/features/teams/components/team-list.svelte';

	let teams = $state<any[]>([]);
	let clerkships = $state<any[]>([]);
	let loading = $state(true);

	async function load() {
		loading = true;
		try {
			const [tRes, cRes] = await Promise.all([
				fetch('/api/preceptors/teams'),
				fetch('/api/clerkships')
			]);
			const t = await tRes.json();
			const c = await cRes.json();
			teams = t.success && t.data ? t.data : [];
			clerkships = c.data ?? [];
		} catch (e) {
			console.error('Failed to load teams', e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<p class="max-w-2xl text-sm text-muted-foreground">
			Generation assigns students to preceptor teams. A preceptor without a team is only used as a
			backup.
		</p>
		<Button onclick={() => goto('/preceptors/teams/new')}>Add team</Button>
	</div>

	{#if loading}
		<div class="rounded-lg border p-12 text-center text-muted-foreground">Loading teams…</div>
	{:else}
		<TeamList
			{teams}
			{clerkships}
			onEdit={(team) => goto(`/preceptors/teams/${team.id}`)}
			onDelete={load}
		/>
	{/if}
</div>
