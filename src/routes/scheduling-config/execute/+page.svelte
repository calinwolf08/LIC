<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	// Form state
	let selectedStudentIds = $state<string[]>([]);
	let selectedClerkshipIds = $state<string[]>([]);
	let enableTeamFormation = $state(false);
	let enableFallbacks = $state(true);
	let enableOptimization = $state(false);
	let maxRetriesPerStudent = $state(3);
	let dryRun = $state(true);

	// Execution state
	let isExecuting = $state(false);
	let executionResult = $state<any>(null);
	let executionError = $state<string | null>(null);

	// Selection helpers
	let selectAllStudents = $state(false);
	let selectAllClerkships = $state(false);

	$effect(() => {
		if (selectAllStudents) {
			selectedStudentIds = data.students.map((s) => s.id).filter((id): id is string => id !== null);
		} else if (selectedStudentIds.length === data.students.length) {
			selectedStudentIds = [];
		}
	});

	$effect(() => {
		if (selectAllClerkships) {
			selectedClerkshipIds = data.clerkships.map((c) => c.id).filter((id): id is string => id !== null);
		} else if (selectedClerkshipIds.length === data.clerkships.length) {
			selectedClerkshipIds = [];
		}
	});

	function toggleStudent(studentId: string) {
		if (selectedStudentIds.includes(studentId)) {
			selectedStudentIds = selectedStudentIds.filter((id) => id !== studentId);
		} else {
			selectedStudentIds = [...selectedStudentIds, studentId];
		}
	}

	function toggleClerkship(clerkshipId: string) {
		if (selectedClerkshipIds.includes(clerkshipId)) {
			selectedClerkshipIds = selectedClerkshipIds.filter((id) => id !== clerkshipId);
		} else {
			selectedClerkshipIds = [...selectedClerkshipIds, clerkshipId];
		}
	}

	async function executeScheduling() {
		if (selectedStudentIds.length === 0 || selectedClerkshipIds.length === 0) {
			executionError = 'Please select at least one student and one clerkship';
			return;
		}

		isExecuting = true;
		executionError = null;
		executionResult = null;

		try {
			const response = await fetch('/api/scheduling/execute', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					studentIds: selectedStudentIds,
					clerkshipIds: selectedClerkshipIds,
					options: {
						enableTeamFormation,
						enableFallbacks,
						enableOptimization,
						maxRetriesPerStudent,
						dryRun,
					},
				}),
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error?.message || 'Failed to execute scheduling');
			}

			executionResult = result.data;
		} catch (error) {
			executionError = error instanceof Error ? error.message : 'Unknown error occurred';
		} finally {
			isExecuting = false;
		}
	}

	function resetExecution() {
		executionResult = null;
		executionError = null;
	}
</script>

<div class="container mx-auto py-8">
	<!-- Header -->
	<div class="mb-6">
		<Button variant="ghost" onclick={() => goto('/scheduling-config')} class="mb-4">
			← Back to Configuration
		</Button>
		<h1 class="text-3xl font-bold">Execute Scheduling Engine</h1>
		<p class="mt-2 text-muted-foreground">
			Run the configurable scheduling engine to generate student-preceptor assignments
		</p>
	</div>

	{#if !executionResult}
		<!-- Configuration Form -->
		<div class="grid gap-6 lg:grid-cols-3">
			<!-- Students Selection -->
			<div class="rounded-lg border p-6">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-semibold">Students</h2>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							bind:checked={selectAllStudents}
							class="rounded border-gray-300"
						/>
						Select All
					</label>
				</div>
				<div class="max-h-96 space-y-2 overflow-y-auto">
					{#each data.students as student}
						{#if student.id}
							{@const studentId = student.id}
							<label class="flex items-center gap-2 rounded p-2 hover:bg-muted">
								<input
									type="checkbox"
									checked={selectedStudentIds.includes(studentId)}
									onchange={() => toggleStudent(studentId)}
									class="rounded border-gray-300"
								/>
								<span class="text-sm">
									{student.name}
								</span>
							</label>
						{/if}
					{/each}
				</div>
				<p class="mt-4 text-sm text-muted-foreground">
					Selected: {selectedStudentIds.length} / {data.students.length}
				</p>
			</div>

			<!-- Clerkships Selection -->
			<div class="rounded-lg border p-6">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-semibold">Clerkships</h2>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							bind:checked={selectAllClerkships}
							class="rounded border-gray-300"
						/>
						Select All
					</label>
				</div>
				<div class="max-h-96 space-y-2 overflow-y-auto">
					{#each data.clerkships as clerkship}
						{#if clerkship.id}
							{@const clerkshipId = clerkship.id}
							<label class="flex items-center gap-2 rounded p-2 hover:bg-muted">
								<input
									type="checkbox"
									checked={selectedClerkshipIds.includes(clerkshipId)}
									onchange={() => toggleClerkship(clerkshipId)}
									class="rounded border-gray-300"
								/>
								<div class="text-sm">
									<p class="font-medium">{clerkship.name}</p>
									<p class="text-xs text-muted-foreground">{clerkship.specialty}</p>
								</div>
							</label>
						{/if}
					{/each}
				</div>
				<p class="mt-4 text-sm text-muted-foreground">
					Selected: {selectedClerkshipIds.length} / {data.clerkships.length}
				</p>
			</div>

			<!-- Options -->
			<div class="rounded-lg border p-6">
				<h2 class="mb-4 text-lg font-semibold">Options</h2>
				<div class="space-y-4">
					<label class="flex items-start gap-3">
						<input
							type="checkbox"
							bind:checked={enableTeamFormation}
							class="mt-1 rounded border-gray-300"
						/>
						<div>
							<p class="text-sm font-medium">Enable Team Formation</p>
							<p class="text-xs text-muted-foreground">
								Dynamically form preceptor teams
							</p>
						</div>
					</label>

					<label class="flex items-start gap-3">
						<input
							type="checkbox"
							bind:checked={enableFallbacks}
							class="mt-1 rounded border-gray-300"
						/>
						<div>
							<p class="text-sm font-medium">Enable Fallbacks</p>
							<p class="text-xs text-muted-foreground">
								Use fallback preceptors when primary unavailable
							</p>
						</div>
					</label>

					<label class="flex items-start gap-3">
						<input
							type="checkbox"
							bind:checked={enableOptimization}
							class="mt-1 rounded border-gray-300"
						/>
						<div>
							<p class="text-sm font-medium">Enable Optimization</p>
							<p class="text-xs text-muted-foreground">
								Optimize assignments for better distribution
							</p>
						</div>
					</label>

					<label class="flex items-start gap-3">
						<input
							type="checkbox"
							bind:checked={dryRun}
							class="mt-1 rounded border-gray-300"
						/>
						<div>
							<p class="text-sm font-medium">Dry Run</p>
							<p class="text-xs text-muted-foreground">
								Preview results without saving to database
							</p>
						</div>
					</label>

					<div>
						<label for="maxRetries" class="block text-sm font-medium">
							Max Retries Per Student
						</label>
						<input
							id="maxRetries"
							type="number"
							bind:value={maxRetriesPerStudent}
							min="1"
							max="10"
							class="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
						/>
						<p class="mt-1 text-xs text-muted-foreground">
							Number of attempts before marking as unmet
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Error Display -->
		{#if executionError}
			<div class="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
				<p class="font-semibold">Error</p>
				<p class="mt-1 text-sm">{executionError}</p>
			</div>
		{/if}

		<!-- Execute Button -->
		<div class="mt-6 flex justify-end gap-3">
			<Button variant="outline" onclick={() => goto('/scheduling-config')}>Cancel</Button>
			<Button onclick={executeScheduling} disabled={isExecuting}>
				{#if isExecuting}
					Executing...
				{:else}
					{dryRun ? 'Preview Scheduling' : 'Execute Scheduling'}
				{/if}
			</Button>
		</div>
	{:else}
		<!-- Results Display -->
		<div class="space-y-6">
			<!-- Summary Cards -->
			<div class="grid gap-4 md:grid-cols-4">
				<div class="rounded-lg border p-4">
					<p class="text-sm text-muted-foreground">Total Assignments</p>
					<p class="text-2xl font-bold">{executionResult.assignments.length}</p>
				</div>
				<div class="rounded-lg border p-4">
					<p class="text-sm text-muted-foreground">Fully Scheduled</p>
					<p class="text-2xl font-bold">{executionResult.statistics.fullyScheduledStudents}</p>
				</div>
				<div class="rounded-lg border p-4">
					<p class="text-sm text-muted-foreground">Unmet Requirements</p>
					<p class="text-2xl font-bold">{executionResult.unmetRequirements.length}</p>
				</div>
				<div class="rounded-lg border p-4">
					<p class="text-sm text-muted-foreground">Completion Rate</p>
					<p class="text-2xl font-bold">
						{executionResult.statistics.completionRate.toFixed(1)}%
					</p>
				</div>
			</div>

			<!-- Detailed Statistics -->
			<div class="rounded-lg border p-6">
				<h2 class="mb-4 text-lg font-semibold">Scheduling Statistics</h2>
				<div class="grid gap-4 md:grid-cols-3">
					<div>
						<p class="text-sm text-muted-foreground">Total Students</p>
						<p class="font-medium">{executionResult.statistics.totalStudents}</p>
					</div>
					<div>
						<p class="text-sm text-muted-foreground">Partially Scheduled</p>
						<p class="font-medium">
							{executionResult.statistics.partiallyScheduledStudents}
						</p>
					</div>
					<div>
						<p class="text-sm text-muted-foreground">Unscheduled</p>
						<p class="font-medium">{executionResult.statistics.unscheduledStudents}</p>
					</div>
					<div>
						<p class="text-sm text-muted-foreground">Total Days Scheduled</p>
						<p class="font-medium">{executionResult.statistics.totalDaysScheduled}</p>
					</div>
					<div>
						<p class="text-sm text-muted-foreground">Preceptors Utilized</p>
						<p class="font-medium">{executionResult.statistics.preceptorsUtilized}</p>
					</div>
					<div>
						<p class="text-sm text-muted-foreground">Avg Assignments/Preceptor</p>
						<p class="font-medium">
							{executionResult.statistics.averageAssignmentsPerPreceptor.toFixed(1)}
						</p>
					</div>
				</div>
			</div>

			<!-- Unmet Requirements -->
			{#if executionResult.unmetRequirements.length > 0}
				<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
					<h2 class="mb-4 text-lg font-semibold text-yellow-900">
						Unmet Requirements ({executionResult.unmetRequirements.length})
					</h2>
					<div class="space-y-2">
						{#each executionResult.unmetRequirements as unmet}
							<div class="rounded bg-white p-3 text-sm">
								<p class="font-medium">Student: {unmet.studentId}</p>
								<p class="text-muted-foreground">Clerkship: {unmet.clerkshipId}</p>
								<p class="text-muted-foreground">Reason: {unmet.reason}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Violations -->
			{#if executionResult.violations.length > 0}
				<div class="rounded-lg border border-red-200 bg-red-50 p-6">
					<h2 class="mb-4 text-lg font-semibold text-red-900">
						Constraint Violations ({executionResult.violations.length})
					</h2>
					<div class="space-y-2">
						{#each executionResult.violations as violation}
							<div class="rounded bg-white p-3 text-sm">
								<p class="font-medium">{violation.type}</p>
								<p class="text-muted-foreground">{violation.message}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex justify-end gap-3">
				<Button variant="outline" onclick={resetExecution}>Run Again</Button>
				{#if dryRun}
					<Button onclick={() => (dryRun = false)}>Execute for Real</Button>
				{:else}
					<Button onclick={() => goto('/calendar')}>View Calendar</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>
