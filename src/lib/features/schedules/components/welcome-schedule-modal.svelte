<script lang="ts">
	/**
	 * Welcome Schedule Modal
	 *
	 * Shows on first dashboard visit after signup to let users configure
	 * their auto-created schedule's name and dates.
	 */

	interface Props {
		open: boolean;
		schedule: { id: string; name: string; start_date: string; end_date: string };
		onComplete: () => void;
	}

	let { open, schedule, onComplete }: Props = $props();

	let name = $state(schedule.name);
	let startDate = $state(schedule.start_date);
	let endDate = $state(schedule.end_date);
	let isSubmitting = $state(false);
	let error = $state('');

	// Reset form when schedule changes
	$effect(() => {
		name = schedule.name;
		startDate = schedule.start_date;
		endDate = schedule.end_date;
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		isSubmitting = true;
		error = '';

		// Validate dates
		if (new Date(endDate) <= new Date(startDate)) {
			error = 'End date must be after start date';
			isSubmitting = false;
			return;
		}

		try {
			const response = await fetch(`/api/scheduling-periods/${schedule.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, start_date: startDate, end_date: endDate })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to update schedule');
			}

			// Mark as configured in localStorage to prevent showing again
			localStorage.setItem('schedule_configured', 'true');
			onComplete();
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<div class="absolute inset-0 bg-black/50"></div>
		<div class="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
			<div class="text-center mb-6">
				<div class="text-4xl mb-2">&#128075;</div>
				<h2 class="text-2xl font-bold text-gray-900">Welcome to LIC Scheduler!</h2>
				<p class="text-gray-600 mt-2">
					Let's set up your first schedule. You can change these settings anytime.
				</p>
			</div>

			<form onsubmit={handleSubmit} class="space-y-4">
				<div>
					<label for="schedule-name" class="block text-sm font-medium text-gray-700 mb-1">
						Schedule Name
					</label>
					<input
						id="schedule-name"
						type="text"
						bind:value={name}
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						placeholder="e.g., Fall 2025 Clerkships"
						required
					/>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="start-date" class="block text-sm font-medium text-gray-700 mb-1">
							Start Date
						</label>
						<input
							id="start-date"
							type="date"
							bind:value={startDate}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							required
						/>
					</div>
					<div>
						<label for="end-date" class="block text-sm font-medium text-gray-700 mb-1">
							End Date
						</label>
						<input
							id="end-date"
							type="date"
							bind:value={endDate}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							required
						/>
					</div>
				</div>

				{#if error}
					<div class="bg-red-50 border border-red-200 rounded-lg p-3">
						<p class="text-red-600 text-sm">{error}</p>
					</div>
				{/if}

				<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
					<p class="text-blue-800 text-sm">
						<strong>Tip:</strong> After setting up your schedule, you can add health systems,
						sites, clerkships, preceptors, and students using the navigation menu.
					</p>
				</div>

				<div class="flex justify-end pt-4">
					<button
						type="submit"
						disabled={isSubmitting}
						class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
					>
						{isSubmitting ? 'Saving...' : 'Get Started'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
