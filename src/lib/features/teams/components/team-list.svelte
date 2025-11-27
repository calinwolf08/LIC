<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';

	interface TeamMember {
		id: string;
		preceptorId: string;
		preceptorName?: string;
		role?: string;
		priority: number;
	}

	interface Team {
		id: string;
		name?: string;
		clerkshipId: string;
		clerkshipName?: string;
		members: TeamMember[];
		sites?: Array<{ id: string; name: string }>;
		requireSameHealthSystem: boolean;
		requireSameSite: boolean;
		requireSameSpecialty: boolean;
		requiresAdminApproval: boolean;
	}

	interface Clerkship {
		id: string;
		name: string;
	}

	interface Props {
		teams: Team[];
		clerkships?: Clerkship[];
		onEdit: (team: Team) => void;
		onDelete: (team: Team) => void;
	}

	let { teams, clerkships = [], onEdit, onDelete }: Props = $props();

	// Filter state
	let filterClerkshipId = $state('');

	// Filtered teams based on clerkship selection
	let filteredTeams = $derived(
		filterClerkshipId ? teams.filter((t) => t.clerkshipId === filterClerkshipId) : teams
	);

	async function handleDelete(team: Team) {
		if (!confirm(`Are you sure you want to delete this team?`)) {
			return;
		}

		try {
			const response = await fetch(`/api/preceptors/teams/${team.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				alert(result.error?.message || 'Failed to delete team');
				return;
			}

			onDelete(team);
		} catch (error) {
			alert(error instanceof Error ? error.message : 'Failed to delete team');
		}
	}
</script>

<div class="space-y-4">
	<!-- Clerkship Filter -->
	{#if clerkships.length > 0}
		<div class="flex items-center gap-4">
			<Label for="clerkship-filter">Filter by Clerkship:</Label>
			<select
				id="clerkship-filter"
				bind:value={filterClerkshipId}
				class="rounded-md border border-input bg-background px-3 py-2 text-sm"
			>
				<option value="">All Clerkships</option>
				{#each clerkships as clerkship}
					<option value={clerkship.id}>{clerkship.name}</option>
				{/each}
			</select>
			{#if filterClerkshipId}
				<span class="text-sm text-muted-foreground">
					Showing {filteredTeams.length} of {teams.length} teams
				</span>
			{/if}
		</div>
	{/if}

	<!-- Teams Table -->
	<Card class="w-full">
		<div class="overflow-x-auto">
			<table class="w-full border-collapse">
				<thead>
					<tr class="border-b bg-muted/50">
						<th class="px-4 py-3 text-left text-sm font-medium">Team Name</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Clerkship</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Sites</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Members</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#if filteredTeams.length === 0}
						<tr>
							<td colspan="5" class="px-4 py-8 text-center text-muted-foreground">
								No teams configured{filterClerkshipId ? ' for this clerkship' : ''}.
							</td>
						</tr>
					{:else}
						{#each filteredTeams as team}
							<tr class="border-b transition-colors hover:bg-muted/50">
								<td class="px-4 py-3 text-sm">
									<a
										href="/preceptors/teams/{team.id}"
										class="text-blue-600 hover:underline font-medium"
									>
										{team.name || 'Unnamed Team'}
									</a>
								</td>
								<td class="px-4 py-3 text-sm">
									{#if team.clerkshipName}
										<a
											href="/clerkships/{team.clerkshipId}/config"
											class="text-blue-600 hover:underline"
										>
											{team.clerkshipName}
										</a>
									{:else}
										<span class="text-muted-foreground">—</span>
									{/if}
								</td>
								<td class="px-4 py-3 text-sm">
									{#if team.sites && team.sites.length > 0}
										{#each team.sites as site, i}
											<a href="/sites/{site.id}/edit" class="text-blue-600 hover:underline">
												{site.name}
											</a>{i < team.sites.length - 1 ? ', ' : ''}
										{/each}
									{:else}
										<span class="text-muted-foreground">—</span>
									{/if}
								</td>
								<td class="px-4 py-3 text-sm">
									{team.members?.length || 0} member{team.members?.length !== 1 ? 's' : ''}
								</td>
								<td class="px-4 py-3 text-sm">
									<div class="flex gap-2">
										<Button size="sm" variant="outline" onclick={() => onEdit(team)}>
											Edit
										</Button>
										<Button size="sm" variant="destructive" onclick={() => handleDelete(team)}>
											Delete
										</Button>
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</Card>
</div>
