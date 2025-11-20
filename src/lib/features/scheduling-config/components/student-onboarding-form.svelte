<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';

	interface Student {
		id: string;
		name: string;
		email: string;
		onboardedSystems: string[];
	}

	interface HealthSystem {
		id: string;
		name: string;
	}

	let students = $state<Student[]>([]);
	let healthSystems = $state<HealthSystem[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let searchTerm = $state('');

	let filteredStudents = $derived(
		students.filter((s) => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
	);

	async function loadData() {
		loading = true;
		error = null;
		try {
			const [studentsRes, healthSystemsRes, onboardingRes] = await Promise.all([
				fetch('/api/students'),
				fetch('/api/health-systems'),
				fetch('/api/student-onboarding')
			]);

			if (!studentsRes.ok || !healthSystemsRes.ok || !onboardingRes.ok) {
				throw new Error('Failed to load data');
			}

			const studentsData = await studentsRes.json();
			const healthSystemsData = await healthSystemsRes.json();
			const onboardingData = await onboardingRes.json();

			healthSystems = healthSystemsData.data || [];

			// Build onboarding map (only completed onboarding)
			const onboardingMap = new Map<string, string[]>();
			for (const record of onboardingData.data || []) {
				if (record.is_completed === 1) {
					if (!onboardingMap.has(record.student_id)) {
						onboardingMap.set(record.student_id, []);
					}
					onboardingMap.get(record.student_id)!.push(record.health_system_id);
				}
			}

			students = (studentsData.data || []).map((s: any) => ({
				...s,
				onboardedSystems: onboardingMap.get(s.id) || []
			}));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	async function toggleOnboarding(studentId: string, healthSystemId: string) {
		try {
			const student = students.find((s) => s.id === studentId);
			if (!student) return;

			const isCompleted = student.onboardedSystems.includes(healthSystemId);

			const response = await fetch('/api/student-onboarding', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					student_id: studentId,
					health_system_id: healthSystemId,
					is_completed: isCompleted ? 0 : 1,
					completed_date: isCompleted ? null : new Date().toISOString().split('T')[0]
				})
			});

			if (!response.ok) throw new Error('Failed to update onboarding');

			// Reload data
			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update';
		}
	}

	// Load on mount
	$effect(() => {
		loadData();
	});
</script>

<div class="space-y-6">
	<div>
		<h2 class="text-2xl font-bold">Student Health System Onboarding</h2>
		<p class="text-sm text-muted-foreground mt-1">
			Track completion of student onboarding at each health system
		</p>
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	<div class="space-y-2">
		<Label for="search">Search Students</Label>
		<Input
			id="search"
			type="text"
			placeholder="Search by name..."
			bind:value={searchTerm}
			class="max-w-md"
		/>
	</div>

	{#if loading}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">Loading...</p>
		</Card>
	{:else if filteredStudents.length === 0}
		<Card class="p-8 text-center">
			<p class="text-muted-foreground">No students found.</p>
		</Card>
	{:else}
		<div class="grid gap-4">
			{#each filteredStudents as student}
				<Card class="p-6">
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<div>
								<h3 class="font-semibold">{student.name}</h3>
								<p class="text-sm text-muted-foreground">{student.email}</p>
							</div>
							<Badge variant={student.onboardedSystems.length > 0 ? 'default' : 'secondary'}>
								{student.onboardedSystems.length} / {healthSystems.length} Completed
							</Badge>
						</div>

						<div>
							<Label class="text-sm font-medium mb-3 block">Onboarding Status</Label>
							<div class="space-y-2">
								{#each healthSystems as healthSystem}
									{@const isCompleted = student.onboardedSystems.includes(healthSystem.id)}
									<div
										class="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
									>
										<div class="flex items-center gap-3">
											<input
												type="checkbox"
												id={`onboarding-${student.id}-${healthSystem.id}`}
												checked={isCompleted}
												onchange={() => toggleOnboarding(student.id, healthSystem.id)}
												class="h-4 w-4 rounded border-gray-300"
											/>
											<label
												for={`onboarding-${student.id}-${healthSystem.id}`}
												class="text-sm font-medium cursor-pointer"
											>
												{healthSystem.name}
											</label>
										</div>
										{#if isCompleted}
											<Badge variant="outline" class="text-xs">
												<span class="text-green-600">✓ Completed</span>
											</Badge>
										{:else}
											<Badge variant="outline" class="text-xs">
												<span class="text-muted-foreground">Pending</span>
											</Badge>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>
