<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { invalidateAll } from '$app/navigation';

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
		members: TeamMember[];
		requireSameHealthSystem: boolean;
		requireSameSite: boolean;
		requireSameSpecialty: boolean;
		requiresAdminApproval: boolean;
	}

	interface Props {
		teams: Team[];
		clerkshipName?: string;
		onEdit: (team: Team) => void;
		onDelete: (team: Team) => void;
	}

	let { teams, clerkshipName, onEdit, onDelete }: Props = $props();

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
	{#if clerkshipName}
		<div class="text-sm text-muted-foreground">
			Teams for: <span class="font-medium">{clerkshipName}</span>
		</div>
	{/if}

	{#if teams.length > 0}
		<div class="space-y-4">
			{#each teams as team}
				<div class="rounded-lg border p-6">
					<div class="mb-4 flex items-start justify-between">
						<div>
							<h3 class="text-lg font-semibold">{team.name || 'Unnamed Team'}</h3>
							<p class="text-sm text-muted-foreground">
								{team.members?.length || 0} member{team.members?.length !== 1 ? 's' : ''}
							</p>
						</div>
						<div class="flex gap-2">
							<Button size="sm" variant="outline" onclick={() => onEdit(team)}>Edit</Button>
							<Button size="sm" variant="destructive" onclick={() => handleDelete(team)}>Delete</Button>
						</div>
					</div>

					{#if team.members && team.members.length > 0}
						<div class="mb-4 rounded border p-3">
							<p class="mb-2 text-sm font-medium">Team Members:</p>
							<div class="space-y-1">
								{#each team.members as member, index}
									<div class="text-sm text-muted-foreground">
										{index + 1}. {member.preceptorName || 'Unknown Preceptor'}
										{#if member.role}
											<span class="text-xs">({member.role})</span>
										{/if}
										<span class="text-xs">- Priority {member.priority}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<div class="text-sm">
						<p class="mb-2 font-medium">Formation Rules:</p>
						<ul class="ml-4 space-y-1 text-muted-foreground">
							{#if team.requireSameHealthSystem}
								<li>Same health system required</li>
							{/if}
							{#if team.requireSameSite}
								<li>Same site required</li>
							{/if}
							{#if team.requireSameSpecialty}
								<li>Same specialty required</li>
							{/if}
							{#if team.requiresAdminApproval}
								<li>Requires admin approval</li>
							{/if}
							{#if !team.requireSameHealthSystem && !team.requireSameSite && !team.requireSameSpecialty && !team.requiresAdminApproval}
								<li>No special rules</li>
							{/if}
						</ul>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="rounded-lg border p-12 text-center text-muted-foreground">
			<p>No teams configured{clerkshipName ? ` for ${clerkshipName}` : ''}.</p>
			<p class="mt-2 text-sm">
				Teams allow multiple preceptors to share teaching responsibilities.
			</p>
		</div>
	{/if}
</div>
