<script lang="ts">
	import type {
		GlobalOutpatientDefaults,
		GlobalInpatientDefaults,
		GlobalElectiveDefaults
	} from '../types/global-defaults';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Accordion from '$lib/components/ui/accordion';
	import { toast } from 'svelte-sonner';

	let outpatientDefaults = $state<GlobalOutpatientDefaults | null>(null);
	let inpatientDefaults = $state<GlobalInpatientDefaults | null>(null);
	let electiveDefaults = $state<GlobalElectiveDefaults | null>(null);
	let loading = $state(true);
	let saving = $state(false);

	// Load defaults on mount
	$effect(() => {
		loadDefaults();
	});

	async function loadDefaults() {
		loading = true;
		try {
			const [outpatient, inpatient, elective] = await Promise.all([
				fetch('/api/scheduling-config/global-defaults/outpatient').then((r) => r.json()),
				fetch('/api/scheduling-config/global-defaults/inpatient').then((r) => r.json()),
				fetch('/api/scheduling-config/global-defaults/elective').then((r) => r.json())
			]);

			outpatientDefaults = outpatient.data;
			inpatientDefaults = inpatient.data;
			electiveDefaults = elective.data;
		} catch (error) {
			toast.error('Failed to load global defaults');
			console.error(error);
		} finally {
			loading = false;
		}
	}

	async function saveOutpatientDefaults() {
		if (!outpatientDefaults) return;

		saving = true;
		try {
			const response = await fetch('/api/scheduling-config/global-defaults/outpatient', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					assignmentStrategy: outpatientDefaults.assignmentStrategy,
					healthSystemRule: outpatientDefaults.healthSystemRule,
					defaultMaxStudentsPerDay: outpatientDefaults.defaultMaxStudentsPerDay,
					defaultMaxStudentsPerYear: outpatientDefaults.defaultMaxStudentsPerYear,
					allowTeams: outpatientDefaults.allowTeams,
					allowFallbacks: outpatientDefaults.allowFallbacks,
					fallbackRequiresApproval: outpatientDefaults.fallbackRequiresApproval,
					fallbackAllowCrossSystem: outpatientDefaults.fallbackAllowCrossSystem,
					teamSizeMin: outpatientDefaults.teamSizeMin,
					teamSizeMax: outpatientDefaults.teamSizeMax,
					teamRequireSameHealthSystem: outpatientDefaults.teamRequireSameHealthSystem,
					teamRequireSameSpecialty: outpatientDefaults.teamRequireSameSpecialty
				})
			});

			if (!response.ok) {
				const error = await response.json();
				toast.error(error.error?.message || 'Failed to save outpatient defaults');
				return;
			}

			toast.success('Outpatient defaults saved successfully');
			await loadDefaults();
		} catch (error) {
			toast.error('Failed to save outpatient defaults');
			console.error(error);
		} finally {
			saving = false;
		}
	}

	async function saveInpatientDefaults() {
		if (!inpatientDefaults) return;

		saving = true;
		try {
			const response = await fetch('/api/scheduling-config/global-defaults/inpatient', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					assignmentStrategy: inpatientDefaults.assignmentStrategy,
					healthSystemRule: inpatientDefaults.healthSystemRule,
					defaultMaxStudentsPerDay: inpatientDefaults.defaultMaxStudentsPerDay,
					defaultMaxStudentsPerYear: inpatientDefaults.defaultMaxStudentsPerYear,
					allowTeams: inpatientDefaults.allowTeams,
					allowFallbacks: inpatientDefaults.allowFallbacks,
					fallbackRequiresApproval: inpatientDefaults.fallbackRequiresApproval,
					fallbackAllowCrossSystem: inpatientDefaults.fallbackAllowCrossSystem,
					blockSizeDays: inpatientDefaults.blockSizeDays,
					allowPartialBlocks: inpatientDefaults.allowPartialBlocks,
					preferContinuousBlocks: inpatientDefaults.preferContinuousBlocks,
					defaultMaxStudentsPerBlock: inpatientDefaults.defaultMaxStudentsPerBlock,
					defaultMaxBlocksPerYear: inpatientDefaults.defaultMaxBlocksPerYear,
					teamSizeMin: inpatientDefaults.teamSizeMin,
					teamSizeMax: inpatientDefaults.teamSizeMax,
					teamRequireSameHealthSystem: inpatientDefaults.teamRequireSameHealthSystem,
					teamRequireSameSpecialty: inpatientDefaults.teamRequireSameSpecialty
				})
			});

			if (!response.ok) {
				const error = await response.json();
				toast.error(error.error?.message || 'Failed to save inpatient defaults');
				return;
			}

			toast.success('Inpatient defaults saved successfully');
			await loadDefaults();
		} catch (error) {
			toast.error('Failed to save inpatient defaults');
			console.error(error);
		} finally {
			saving = false;
		}
	}

	async function saveElectiveDefaults() {
		if (!electiveDefaults) return;

		saving = true;
		try {
			const response = await fetch('/api/scheduling-config/global-defaults/elective', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					assignmentStrategy: electiveDefaults.assignmentStrategy,
					healthSystemRule: electiveDefaults.healthSystemRule,
					defaultMaxStudentsPerDay: electiveDefaults.defaultMaxStudentsPerDay,
					defaultMaxStudentsPerYear: electiveDefaults.defaultMaxStudentsPerYear,
					allowTeams: electiveDefaults.allowTeams,
					allowFallbacks: electiveDefaults.allowFallbacks,
					fallbackRequiresApproval: electiveDefaults.fallbackRequiresApproval,
					fallbackAllowCrossSystem: electiveDefaults.fallbackAllowCrossSystem
				})
			});

			if (!response.ok) {
				const error = await response.json();
				toast.error(error.error?.message || 'Failed to save elective defaults');
				return;
			}

			toast.success('Elective defaults saved successfully');
			await loadDefaults();
		} catch (error) {
			toast.error('Failed to save elective defaults');
			console.error(error);
		} finally {
			saving = false;
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h2 class="text-2xl font-bold">Global Scheduling Defaults</h2>
		<p class="mt-2 text-muted-foreground">
			Configure default scheduling constraints that apply to all clerkships. Individual clerkships
			can override these settings.
		</p>
	</div>

	{#if loading}
		<div class="py-12 text-center text-muted-foreground">Loading...</div>
	{:else}
		<Accordion.Root class="space-y-4">
			<!-- Outpatient Defaults -->
			<Accordion.Item value="outpatient">
				<Accordion.Trigger class="text-lg font-semibold">
					Outpatient Defaults
				</Accordion.Trigger>
				<Accordion.Content>
					{#if outpatientDefaults}
						<Card class="p-6 mt-4">
							<div class="space-y-4">
								<div class="grid grid-cols-2 gap-4">
									<div class="space-y-2">
										<Label>Assignment Strategy</Label>
										<select
											bind:value={outpatientDefaults.assignmentStrategy}
											class="w-full rounded-md border px-3 py-2"
										>
											<option value="continuous_single">Continuous Single</option>
											<option value="continuous_team">Continuous Team</option>
											<option value="block_based">Block Based</option>
											<option value="daily_rotation">Daily Rotation</option>
										</select>
									</div>

									<div class="space-y-2">
										<Label>Health System Rule</Label>
										<select
											bind:value={outpatientDefaults.healthSystemRule}
											class="w-full rounded-md border px-3 py-2"
										>
											<option value="enforce_same_system">Enforce Same System</option>
											<option value="prefer_same_system">Prefer Same System</option>
											<option value="no_preference">No Preference</option>
										</select>
									</div>

									<div class="space-y-2">
										<Label>Max Students Per Day</Label>
										<Input
											type="number"
											bind:value={outpatientDefaults.defaultMaxStudentsPerDay}
											min="1"
										/>
									</div>

									<div class="space-y-2">
										<Label>Max Students Per Year</Label>
										<Input
											type="number"
											bind:value={outpatientDefaults.defaultMaxStudentsPerYear}
											min="1"
										/>
									</div>
								</div>

								<div class="flex justify-end">
									<Button onclick={saveOutpatientDefaults} disabled={saving}>
										{saving ? 'Saving...' : 'Save Outpatient Defaults'}
									</Button>
								</div>
							</div>
						</Card>
					{/if}
				</Accordion.Content>
			</Accordion.Item>

			<!-- Inpatient Defaults -->
			<Accordion.Item value="inpatient">
				<Accordion.Trigger class="text-lg font-semibold">Inpatient Defaults</Accordion.Trigger>
				<Accordion.Content>
					{#if inpatientDefaults}
						<Card class="p-6 mt-4">
							<div class="space-y-4">
								<div class="grid grid-cols-2 gap-4">
									<div class="space-y-2">
										<Label>Assignment Strategy</Label>
										<select
											bind:value={inpatientDefaults.assignmentStrategy}
											class="w-full rounded-md border px-3 py-2"
										>
											<option value="continuous_single">Continuous Single</option>
											<option value="continuous_team">Continuous Team</option>
											<option value="block_based">Block Based</option>
											<option value="daily_rotation">Daily Rotation</option>
										</select>
									</div>

									<div class="space-y-2">
										<Label>Health System Rule</Label>
										<select
											bind:value={inpatientDefaults.healthSystemRule}
											class="w-full rounded-md border px-3 py-2"
										>
											<option value="enforce_same_system">Enforce Same System</option>
											<option value="prefer_same_system">Prefer Same System</option>
											<option value="no_preference">No Preference</option>
										</select>
									</div>

									<div class="space-y-2">
										<Label>Max Students Per Day</Label>
										<Input
											type="number"
											bind:value={inpatientDefaults.defaultMaxStudentsPerDay}
											min="1"
										/>
									</div>

									<div class="space-y-2">
										<Label>Max Students Per Year</Label>
										<Input
											type="number"
											bind:value={inpatientDefaults.defaultMaxStudentsPerYear}
											min="1"
										/>
									</div>

									{#if inpatientDefaults.assignmentStrategy === 'block_based'}
										<div class="space-y-2">
											<Label>Block Size (Days)</Label>
											<Input type="number" bind:value={inpatientDefaults.blockSizeDays} min="1" />
										</div>

										<div class="space-y-2">
											<Label>Max Students Per Block</Label>
											<Input
												type="number"
												bind:value={inpatientDefaults.defaultMaxStudentsPerBlock}
												min="1"
											/>
										</div>
									{/if}
								</div>

								<div class="flex justify-end">
									<Button onclick={saveInpatientDefaults} disabled={saving}>
										{saving ? 'Saving...' : 'Save Inpatient Defaults'}
									</Button>
								</div>
							</div>
						</Card>
					{/if}
				</Accordion.Content>
			</Accordion.Item>

			<!-- Elective Defaults -->
			<Accordion.Item value="elective">
				<Accordion.Trigger class="text-lg font-semibold">Elective Defaults</Accordion.Trigger>
				<Accordion.Content>
					{#if electiveDefaults}
						<Card class="p-6 mt-4">
							<div class="space-y-4">
								<div class="grid grid-cols-2 gap-4">
									<div class="space-y-2">
										<Label>Assignment Strategy</Label>
										<select
											bind:value={electiveDefaults.assignmentStrategy}
											class="w-full rounded-md border px-3 py-2"
										>
											<option value="continuous_single">Continuous Single</option>
											<option value="continuous_team">Continuous Team</option>
											<option value="block_based">Block Based</option>
											<option value="daily_rotation">Daily Rotation</option>
										</select>
									</div>

									<div class="space-y-2">
										<Label>Health System Rule</Label>
										<select
											bind:value={electiveDefaults.healthSystemRule}
											class="w-full rounded-md border px-3 py-2"
										>
											<option value="enforce_same_system">Enforce Same System</option>
											<option value="prefer_same_system">Prefer Same System</option>
											<option value="no_preference">No Preference</option>
										</select>
									</div>

									<div class="space-y-2">
										<Label>Max Students Per Day</Label>
										<Input
											type="number"
											bind:value={electiveDefaults.defaultMaxStudentsPerDay}
											min="1"
										/>
									</div>

									<div class="space-y-2">
										<Label>Max Students Per Year</Label>
										<Input
											type="number"
											bind:value={electiveDefaults.defaultMaxStudentsPerYear}
											min="1"
										/>
									</div>
								</div>

								<div class="flex justify-end">
									<Button onclick={saveElectiveDefaults} disabled={saving}>
										{saving ? 'Saving...' : 'Save Elective Defaults'}
									</Button>
								</div>
							</div>
						</Card>
					{/if}
				</Accordion.Content>
			</Accordion.Item>
		</Accordion.Root>
	{/if}
</div>
