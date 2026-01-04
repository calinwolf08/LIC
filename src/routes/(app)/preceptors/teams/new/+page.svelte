<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card } from '$lib/components/ui/card';
	import { teamsClient, formatApiError } from '$lib/features/scheduling-config/clients/teams-client';
	import { createClientLogger } from '$lib/utils/logger.client';

	const log = createClientLogger('team-new');

	let { data }: { data: PageData } = $props();

	interface TeamMember {
		preceptorId: string;
		role?: string;
		priority: number;
		isFallbackOnly: boolean;
	}

	interface Preceptor {
		id: string;
		name: string;
		sites?: Array<{ id: string; name: string }>;
	}

	// Form state
	let selectedClerkshipId = $state('');
	let selectedSiteIds = $state<string[]>([]);
	let sameHealthSystemOnly = $state(false);
	let lockedHealthSystemId = $state<string | null>(null);
	let members = $state<TeamMember[]>([]);
	let availablePreceptors = $state<Preceptor[]>([]);
	let loadingPreceptors = $state(false);

	let formData = $state({
		name: '',
		requireSameHealthSystem: false,
		requireSameSite: false
	});

	let selectedPreceptorId = $state('');
	let newMemberRole = $state('');
	let newMemberFallbackOnly = $state(false);
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	// Sites filtered by selected clerkship
	let clerkshipSites = $state<Array<{ id: string; name: string; health_system_id: string | null }>>([]);
	let loadingClerkshipSites = $state(false);

	// Get clerkship name
	let selectedClerkshipName = $derived(
		data.clerkships.find((c) => c.id === selectedClerkshipId)?.name || ''
	);

	// Sites available for selection (filtered by health system if toggle is on)
	let availableSites = $derived(() => {
		if (!sameHealthSystemOnly || !lockedHealthSystemId) {
			return clerkshipSites;
		}
		return clerkshipSites.filter((s) => s.health_system_id === lockedHealthSystemId);
	});

	// Load sites when clerkship changes
	async function loadClerkshipSites() {
		if (!selectedClerkshipId) {
			clerkshipSites = [];
			return;
		}

		loadingClerkshipSites = true;
		try {
			const response = await fetch(`/api/clerkship-sites?clerkship_id=${selectedClerkshipId}`);
			const result = await response.json();
			if (result.success && result.data) {
				clerkshipSites = result.data;
			} else {
				clerkshipSites = [];
			}
		} catch (err) {
			console.error('Failed to load clerkship sites:', err);
			clerkshipSites = [];
		} finally {
			loadingClerkshipSites = false;
		}
	}

	// Load preceptors when sites change
	async function loadPreceptors() {
		if (selectedSiteIds.length === 0) {
			availablePreceptors = [];
			return;
		}

		loadingPreceptors = true;
		try {
			const response = await fetch(
				`/api/preceptors/teams/available-preceptors?siteIds=${selectedSiteIds.join(',')}`
			);
			const result = await response.json();
			if (result.success && result.data) {
				availablePreceptors = result.data;
			} else {
				availablePreceptors = [];
			}
		} catch (err) {
			console.error('Failed to load preceptors:', err);
			availablePreceptors = [];
		} finally {
			loadingPreceptors = false;
		}
	}

	// Handle clerkship change
	function handleClerkshipChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		selectedClerkshipId = target.value;
		// Reset downstream selections
		selectedSiteIds = [];
		lockedHealthSystemId = null;
		members = [];
		availablePreceptors = [];
		loadClerkshipSites();
	}

	// Handle site toggle
	function toggleSite(siteId: string) {
		const site = clerkshipSites.find((s) => s.id === siteId);
		if (!site) return;

		if (selectedSiteIds.includes(siteId)) {
			// Removing a site
			selectedSiteIds = selectedSiteIds.filter((id) => id !== siteId);

			// If we removed all sites, unlock health system
			if (selectedSiteIds.length === 0) {
				lockedHealthSystemId = null;
			}
		} else {
			// Adding a site
			if (sameHealthSystemOnly && selectedSiteIds.length === 0 && site.health_system_id) {
				// First site selected with toggle on - lock to this health system
				lockedHealthSystemId = site.health_system_id;
			}
			selectedSiteIds = [...selectedSiteIds, siteId];
		}

		// Reload preceptors
		loadPreceptors();
	}

	// Handle same health system toggle
	function handleSameHealthSystemToggle() {
		sameHealthSystemOnly = !sameHealthSystemOnly;

		if (sameHealthSystemOnly && selectedSiteIds.length > 0) {
			// Check if all selected sites are from the same health system
			const selectedSites = clerkshipSites.filter((s) => selectedSiteIds.includes(s.id));
			const healthSystems = new Set(selectedSites.map((s) => s.health_system_id).filter(Boolean));

			if (healthSystems.size > 1) {
				// Multiple health systems - reset selections
				selectedSiteIds = [];
				lockedHealthSystemId = null;
				members = [];
				availablePreceptors = [];
			} else if (healthSystems.size === 1) {
				// Lock to the common health system
				lockedHealthSystemId = [...healthSystems][0] as string;
			}
		} else {
			// Toggle off - unlock
			lockedHealthSystemId = null;
		}
	}

	// Add member
	function addMember() {
		if (!selectedPreceptorId) return;

		if (members.find((m) => m.preceptorId === selectedPreceptorId)) {
			error = 'This preceptor is already in the team';
			return;
		}

		const maxPriority = members.reduce((max, m) => Math.max(max, m.priority), 0);

		members = [
			...members,
			{
				preceptorId: selectedPreceptorId,
				role: newMemberRole || undefined,
				priority: maxPriority + 1,
				isFallbackOnly: newMemberFallbackOnly
			}
		];

		selectedPreceptorId = '';
		newMemberRole = '';
		newMemberFallbackOnly = false;
		error = null;
	}

	// Remove member
	function removeMember(preceptorId: string) {
		members = members.filter((m) => m.preceptorId !== preceptorId);
	}

	// Move member up
	function moveMemberUp(index: number) {
		if (index === 0) return;
		const temp = members[index - 1].priority;
		members[index - 1].priority = members[index].priority;
		members[index].priority = temp;
		members = [...members].sort((a, b) => a.priority - b.priority);
	}

	// Move member down
	function moveMemberDown(index: number) {
		if (index === members.length - 1) return;
		const temp = members[index + 1].priority;
		members[index + 1].priority = members[index].priority;
		members[index].priority = temp;
		members = [...members].sort((a, b) => a.priority - b.priority);
	}

	// Get preceptor name
	function getPreceptorName(id: string): string {
		return availablePreceptors.find((p) => p.id === id)?.name || 'Unknown';
	}

	// Get health system name
	function getHealthSystemName(id: string | null): string {
		if (!id) return 'No Health System';
		return data.healthSystems.find((hs) => hs.id === id)?.name || 'Unknown';
	}

	// Submit form
	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = null;

		if (!selectedClerkshipId) {
			log.warn('Attempted to create team without clerkship');
			error = 'Please select a clerkship';
			return;
		}

		if (members.length < 1) {
			log.warn('Attempted to create team with no members');
			error = 'Team must have at least 1 member';
			return;
		}

		isSubmitting = true;
		log.debug('Creating team', { clerkshipId: selectedClerkshipId, memberCount: members.length });

		try {
			const payload = {
				...formData,
				clerkshipId: selectedClerkshipId,
				siteIds: selectedSiteIds,
				members: members.map((m) => ({
					preceptorId: m.preceptorId,
					role: m.role || undefined,
					priority: m.priority,
					isFallbackOnly: m.isFallbackOnly
				}))
			};

			log.trace('Create payload', { payload });

			const result = await teamsClient.create(payload);

			if (!result.success) {
				log.error('Failed to create team', { error: result.error });
				error = formatApiError(result.error);
				isSubmitting = false;
				return;
			}

			log.info('Team created successfully', { teamId: result.data.id });
			// Navigate back to teams list
			goto('/preceptors?tab=teams');
		} catch (err) {
			log.error('Unexpected create error', { error: err });
			error = err instanceof Error ? err.message : 'Failed to create team';
			isSubmitting = false;
		}
	}

	// Available preceptors not already in team
	let filteredPreceptors = $derived(
		availablePreceptors.filter((p) => !members.find((m) => m.preceptorId === p.id))
	);
</script>

<div class="container mx-auto py-8 max-w-4xl">
	<div class="mb-6">
		<a href="/preceptors" class="text-sm text-muted-foreground hover:text-foreground">
			&larr; Back to Preceptors & Teams
		</a>
		<h1 class="text-3xl font-bold mt-2">Create New Team</h1>
	</div>

	{#if error}
		<div class="mb-6 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	<form onsubmit={handleSubmit} class="space-y-6">
		<!-- Step 1: Select Clerkship -->
		<Card class="p-6">
			<h2 class="text-xl font-semibold mb-4">1. Select Clerkship</h2>
			<div class="space-y-2">
				<Label for="clerkship">Clerkship *</Label>
				<select
					id="clerkship"
					value={selectedClerkshipId}
					onchange={handleClerkshipChange}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					disabled={isSubmitting}
				>
					<option value="">Select a clerkship...</option>
					{#each data.clerkships as clerkship}
						<option value={clerkship.id}>{clerkship.name}</option>
					{/each}
				</select>
			</div>
		</Card>

		<!-- Step 2: Select Sites -->
		{#if selectedClerkshipId}
			<Card class="p-6">
				<h2 class="text-xl font-semibold mb-4">2. Select Sites</h2>
				<p class="text-sm text-muted-foreground mb-4">
					Select the sites where this team will operate. Sites shown are those that offer {selectedClerkshipName}.
				</p>

				<!-- Same Health System Toggle -->
				<div class="mb-4 flex items-center gap-2">
					<input
						type="checkbox"
						id="sameHealthSystem"
						checked={sameHealthSystemOnly}
						onchange={handleSameHealthSystemToggle}
						class="h-4 w-4 rounded border-gray-300"
						disabled={isSubmitting}
					/>
					<Label for="sameHealthSystem" class="cursor-pointer">
						Only show sites from the same health system
						<span class="block text-xs font-normal text-muted-foreground">
							When enabled, selecting a site will filter to only show other sites from the same health system
						</span>
					</Label>
				</div>

				{#if lockedHealthSystemId}
					<div class="mb-4 text-sm bg-muted p-2 rounded">
						Showing sites from: <strong>{getHealthSystemName(lockedHealthSystemId)}</strong>
					</div>
				{/if}

				{#if loadingClerkshipSites}
					<p class="text-muted-foreground">Loading sites...</p>
				{:else if availableSites().length === 0}
					<p class="text-muted-foreground">
						{clerkshipSites.length === 0
							? 'No sites are configured for this clerkship.'
							: 'No sites available with current filter.'}
					</p>
				{:else}
					<div class="max-h-48 overflow-y-auto space-y-1 border rounded p-2">
						{#each availableSites() as site}
							<label class="flex items-center gap-2 py-1 hover:bg-muted/50 rounded px-2 cursor-pointer">
								<input
									type="checkbox"
									checked={selectedSiteIds.includes(site.id)}
									onchange={() => toggleSite(site.id)}
									disabled={isSubmitting}
									class="h-4 w-4 rounded border-gray-300"
								/>
								<span class="text-sm flex-1">{site.name}</span>
								<span class="text-xs text-muted-foreground">
									{getHealthSystemName(site.health_system_id)}
								</span>
							</label>
						{/each}
					</div>
					{#if selectedSiteIds.length > 0}
						<p class="mt-2 text-sm text-muted-foreground">
							{selectedSiteIds.length} site{selectedSiteIds.length === 1 ? '' : 's'} selected
						</p>
					{/if}
				{/if}
			</Card>
		{/if}

		<!-- Step 3: Select Preceptors -->
		{#if selectedSiteIds.length > 0}
			<Card class="p-6">
				<h2 class="text-xl font-semibold mb-4">3. Add Team Members</h2>
				<p class="text-sm text-muted-foreground mb-4">
					Add preceptors to the team. Showing preceptors who work at the selected sites.
				</p>

				<!-- Add Member -->
				<div class="flex flex-wrap gap-2 mb-4 items-end">
					<div class="flex-1 min-w-[200px]">
						<Label class="text-xs text-muted-foreground mb-1">Preceptor</Label>
						<select
							bind:value={selectedPreceptorId}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							disabled={isSubmitting || loadingPreceptors}
						>
							<option value="">
								{loadingPreceptors ? 'Loading preceptors...' : 'Select preceptor...'}
							</option>
							{#each filteredPreceptors as preceptor}
								<option value={preceptor.id}>{preceptor.name}</option>
							{/each}
						</select>
					</div>
					<div class="w-36">
						<Label class="text-xs text-muted-foreground mb-1">Role (optional)</Label>
						<Input
							type="text"
							bind:value={newMemberRole}
							placeholder="Role"
							disabled={isSubmitting}
						/>
					</div>
					<div class="flex items-center gap-2 pb-2">
						<input
							type="checkbox"
							id="fallbackOnly"
							bind:checked={newMemberFallbackOnly}
							class="h-4 w-4 rounded border-gray-300"
							disabled={isSubmitting}
						/>
						<Label for="fallbackOnly" class="cursor-pointer text-sm whitespace-nowrap">
							Fallback only
						</Label>
					</div>
					<Button type="button" variant="outline" onclick={addMember} disabled={isSubmitting || !selectedPreceptorId}>
						Add
					</Button>
				</div>
				<p class="text-xs text-muted-foreground mb-4">
					<strong>Fallback only:</strong> This preceptor will only be assigned when primary members reach capacity.
				</p>

				<!-- Member List -->
				{#if members.length > 0}
					<div class="space-y-2">
						{#each members as member, index}
							<div class="flex items-center justify-between rounded border p-3 {member.isFallbackOnly ? 'bg-muted/50 border-dashed' : ''}">
								<div class="flex-1">
									<p class="font-medium flex items-center gap-2">
										{index + 1}. {getPreceptorName(member.preceptorId)}
										{#if member.isFallbackOnly}
											<span class="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">Fallback</span>
										{/if}
									</p>
									<div class="mt-1 flex gap-3 text-xs text-muted-foreground">
										{#if member.role}
											<span>Role: {member.role}</span>
										{/if}
										<span>{member.role ? '| ' : ''}Priority: {member.priority}</span>
									</div>
								</div>
								<div class="flex gap-1">
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onclick={() => moveMemberUp(index)}
										disabled={index === 0 || isSubmitting}
									>
										&uarr;
									</Button>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onclick={() => moveMemberDown(index)}
										disabled={index === members.length - 1 || isSubmitting}
									>
										&darr;
									</Button>
									<Button
										type="button"
										size="sm"
										variant="destructive"
										onclick={() => removeMember(member.preceptorId)}
										disabled={isSubmitting}
									>
										Remove
									</Button>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">No members added yet. Add at least 1 member.</p>
				{/if}
			</Card>
		{/if}

		<!-- Step 4: Team Details -->
		{#if members.length > 0}
			<Card class="p-6">
				<h2 class="text-xl font-semibold mb-4">4. Team Details</h2>

				<!-- Team Name -->
				<div class="mb-4">
					<Label for="name">Team Name (Optional)</Label>
					<Input
						id="name"
						type="text"
						bind:value={formData.name}
						placeholder="e.g., Cardiology Team A"
						disabled={isSubmitting}
					/>
					<p class="mt-1 text-xs text-muted-foreground">
						If left blank, team will be auto-named based on members
					</p>
				</div>

				<!-- Formation Rules -->
				<div class="space-y-3">
					<h3 class="font-medium">Team Formation Rules</h3>

					<div class="flex items-center gap-2">
						<input
							type="checkbox"
							id="requireSameHealthSystem"
							bind:checked={formData.requireSameHealthSystem}
							class="h-4 w-4 rounded border-gray-300"
							disabled={isSubmitting}
						/>
						<Label for="requireSameHealthSystem" class="cursor-pointer">
							Require Same Health System
						</Label>
					</div>

					<div class="flex items-center gap-2">
						<input
							type="checkbox"
							id="requireSameSite"
							bind:checked={formData.requireSameSite}
							class="h-4 w-4 rounded border-gray-300"
							disabled={isSubmitting}
						/>
						<Label for="requireSameSite" class="cursor-pointer">
							Require Same Site
						</Label>
					</div>
				</div>
			</Card>
		{/if}

		<!-- Action Buttons -->
		<div class="flex justify-end gap-2">
			<Button type="button" variant="outline" onclick={() => goto('/preceptors')} disabled={isSubmitting}>
				Cancel
			</Button>
			<Button type="submit" disabled={isSubmitting || members.length < 1 || !selectedClerkshipId}>
				{isSubmitting ? 'Creating...' : 'Create Team'}
			</Button>
		</div>
	</form>
</div>
