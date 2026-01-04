<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { goto, invalidateAll } from '$app/navigation';
	import { browser } from '$app/environment';
	import WelcomeScheduleModal from '$lib/features/schedules/components/welcome-schedule-modal.svelte';

	let { data }: { data: PageData } = $props();

	let stats = $derived(data.stats);

	// Check if this is first visit (schedule not configured yet)
	let showWelcome = $state(false);

	$effect(() => {
		if (browser && data.activeSchedule) {
			const configured = localStorage.getItem('schedule_configured');
			// Show welcome if schedule has default name and not previously configured
			if (!configured && data.activeSchedule.name === 'My Schedule') {
				showWelcome = true;
			}
		}
	});

	function handleWelcomeComplete() {
		showWelcome = false;
		invalidateAll();
	}

	function navigateTo(path: string) {
		goto(path);
	}

	function getPercentage(value: number, total: number): string {
		if (total === 0) return '0';
		return ((value / total) * 100).toFixed(0);
	}
</script>

{#if !data.isAuthenticated}
	<!-- Landing Page for Unauthenticated Users -->
	<div class="min-h-screen bg-gradient-to-b from-teal-50 to-white">
		<!-- Navigation -->
		<nav class="container mx-auto px-6 py-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<div class="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center">
						<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
					</div>
					<span class="text-2xl font-bold text-gray-900">LICFlow</span>
				</div>
				<div class="flex items-center gap-4">
					<Button href="/login" variant="ghost" class="text-gray-700 hover:text-teal-700">
						Log in
					</Button>
					<Button href="/register" class="bg-teal-600 hover:bg-teal-700 text-white">
						Get Started
					</Button>
				</div>
			</div>
		</nav>

		<!-- Hero Section -->
		<section class="container mx-auto px-6 py-16 md:py-24">
			<div class="max-w-4xl mx-auto text-center">
				<h1 class="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
					Automate Your <span class="text-teal-600">LIC Scheduling</span> in Minutes
				</h1>
				<p class="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
					Stop spending hours on spreadsheets. LICFlow automatically generates conflict-free
					clerkship schedules while tracking every requirement for your students.
				</p>
				<div class="flex flex-col sm:flex-row gap-4 justify-center">
					<Button href="/register" size="lg" class="bg-teal-600 hover:bg-teal-700 text-white px-8 py-6 text-lg">
						Start Free Trial
					</Button>
					<Button href="/login" variant="outline" size="lg" class="px-8 py-6 text-lg border-teal-600 text-teal-700 hover:bg-teal-50">
						Sign In
					</Button>
				</div>
				<p class="mt-4 text-sm text-gray-500">No credit card required</p>
			</div>
		</section>

		<!-- Pain Point Section -->
		<section class="bg-white py-16">
			<div class="container mx-auto px-6">
				<div class="max-w-3xl mx-auto text-center mb-12">
					<h2 class="text-3xl font-bold text-gray-900 mb-4">
						Clerkship Scheduling Shouldn't Be This Hard
					</h2>
					<p class="text-gray-600">
						Medical school coordinators spend countless hours manually juggling schedules,
						tracking requirements, and resolving conflicts. There's a better way.
					</p>
				</div>
			</div>
		</section>

		<!-- Features Section -->
		<section class="py-16 bg-gray-50">
			<div class="container mx-auto px-6">
				<h2 class="text-3xl font-bold text-center text-gray-900 mb-12">
					Everything You Need to Manage LIC Rotations
				</h2>
				<div class="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
					<!-- Feature 1 -->
					<Card class="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
						<div class="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
							<svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
							</svg>
						</div>
						<h3 class="text-xl font-semibold text-gray-900 mb-2">Automated Scheduling</h3>
						<p class="text-gray-600">
							Generate complete, conflict-free schedules in seconds. Our algorithm considers
							preceptor availability, site capacity, and student requirements automatically.
						</p>
					</Card>

					<!-- Feature 2 -->
					<Card class="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
						<div class="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
							<svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
							</svg>
						</div>
						<h3 class="text-xl font-semibold text-gray-900 mb-2">Requirement Tracking</h3>
						<p class="text-gray-600">
							Never miss a requirement again. Track each student's progress across all clerkships
							with real-time dashboards and completion alerts.
						</p>
					</Card>

					<!-- Feature 3 -->
					<Card class="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
						<div class="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
							<svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
							</svg>
						</div>
						<h3 class="text-xl font-semibold text-gray-900 mb-2">Easy Adjustments</h3>
						<p class="text-gray-600">
							Need to make a change? Drag-and-drop editing with instant conflict detection
							makes schedule modifications quick and error-free.
						</p>
					</Card>
				</div>
			</div>
		</section>

		<!-- How It Works -->
		<section class="py-16 bg-white">
			<div class="container mx-auto px-6">
				<h2 class="text-3xl font-bold text-center text-gray-900 mb-12">
					Get Started in 3 Simple Steps
				</h2>
				<div class="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
					<div class="text-center">
						<div class="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
							1
						</div>
						<h3 class="text-lg font-semibold text-gray-900 mb-2">Add Your Data</h3>
						<p class="text-gray-600">
							Import students, preceptors, and clerkship requirements. CSV upload supported.
						</p>
					</div>
					<div class="text-center">
						<div class="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
							2
						</div>
						<h3 class="text-lg font-semibold text-gray-900 mb-2">Set Constraints</h3>
						<p class="text-gray-600">
							Define availability patterns, blackout dates, and capacity rules.
						</p>
					</div>
					<div class="text-center">
						<div class="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
							3
						</div>
						<h3 class="text-lg font-semibold text-gray-900 mb-2">Generate Schedule</h3>
						<p class="text-gray-600">
							Click generate and let LICFlow create your optimized schedule automatically.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Benefits for Decision Makers -->
		<section class="py-16 bg-teal-600">
			<div class="container mx-auto px-6">
				<div class="max-w-4xl mx-auto text-center text-white">
					<h2 class="text-3xl font-bold mb-8">
						Save Time. Reduce Errors. Focus on Education.
					</h2>
					<div class="grid md:grid-cols-3 gap-8">
						<div>
							<div class="text-4xl font-bold mb-2">80%</div>
							<p class="text-teal-100">Less time spent on scheduling</p>
						</div>
						<div>
							<div class="text-4xl font-bold mb-2">0</div>
							<p class="text-teal-100">Scheduling conflicts</p>
						</div>
						<div>
							<div class="text-4xl font-bold mb-2">100%</div>
							<p class="text-teal-100">Requirement visibility</p>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Final CTA -->
		<section class="py-20 bg-white">
			<div class="container mx-auto px-6">
				<div class="max-w-2xl mx-auto text-center">
					<h2 class="text-3xl font-bold text-gray-900 mb-4">
						Ready to Streamline Your LIC Scheduling?
					</h2>
					<p class="text-gray-600 mb-8">
						Join medical schools already using LICFlow to automate their clerkship scheduling.
					</p>
					<div class="flex flex-col sm:flex-row gap-4 justify-center">
						<Button href="/register" size="lg" class="bg-teal-600 hover:bg-teal-700 text-white px-8 py-6 text-lg">
							Create Free Account
						</Button>
						<Button href="/login" variant="outline" size="lg" class="px-8 py-6 text-lg border-gray-300 hover:bg-gray-50">
							Sign In
						</Button>
					</div>
				</div>
			</div>
		</section>

		<!-- Footer -->
		<footer class="bg-gray-900 text-gray-400 py-8">
			<div class="container mx-auto px-6 text-center">
				<div class="flex items-center justify-center gap-2 mb-4">
					<div class="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
						<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
					</div>
					<span class="text-lg font-semibold text-white">LICFlow</span>
				</div>
				<p class="text-sm">&copy; 2025 LICFlow. Simplifying medical education scheduling.</p>
			</div>
		</footer>
	</div>
{:else}
	<!-- Dashboard for Authenticated Users -->
	<div class="container mx-auto py-8">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="text-4xl font-bold">Dashboard</h1>
			<p class="text-gray-600 mt-2">Welcome to LICFlow</p>
		</div>

		<!-- Main Statistics Grid -->
		{#if stats}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
			<!-- Total Students -->
			<Card class="p-6">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-600">Total Students</p>
						<p class="text-3xl font-bold mt-2">{stats.total_students}</p>
					</div>
					<div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
						<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
						</svg>
					</div>
				</div>
			</Card>

			<!-- Total Preceptors -->
			<Card class="p-6">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-600">Total Preceptors</p>
						<p class="text-3xl font-bold mt-2">{stats.total_preceptors}</p>
					</div>
					<div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
						<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
				</div>
			</Card>

			<!-- Clerkship Types -->
			<Card class="p-6">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-600">Clerkship Types</p>
						<p class="text-3xl font-bold mt-2">{stats.total_clerkships}</p>
					</div>
					<div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
						<svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
						</svg>
					</div>
				</div>
			</Card>

			<!-- Active Assignments -->
			<Card class="p-6">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-600">Active Assignments</p>
						<p class="text-3xl font-bold mt-2">{stats.total_assignments}</p>
					</div>
					<div class="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
						<svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
					</div>
				</div>
			</Card>
		</div>

		<!-- Student Scheduling Status -->
		<div class="mb-8">
			<h2 class="text-2xl font-bold mb-4">Student Scheduling Status</h2>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<!-- Fully Scheduled -->
				<Card class="p-6">
					<div class="flex items-center justify-between mb-2">
						<p class="text-sm font-medium text-gray-600">Fully Scheduled</p>
						<div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
							<svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
						</div>
					</div>
					<p class="text-3xl font-bold text-green-600">{stats.fully_scheduled_students}</p>
					<p class="text-sm text-gray-500 mt-1">
						{getPercentage(stats.fully_scheduled_students, stats.total_students)}% of students
					</p>
				</Card>

				<!-- Partially Scheduled -->
				<Card class="p-6">
					<div class="flex items-center justify-between mb-2">
						<p class="text-sm font-medium text-gray-600">Partially Scheduled</p>
						<div class="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
							<svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
							</svg>
						</div>
					</div>
					<p class="text-3xl font-bold text-amber-600">{stats.partially_scheduled_students}</p>
					<p class="text-sm text-gray-500 mt-1">
						{getPercentage(stats.partially_scheduled_students, stats.total_students)}% of students
					</p>
				</Card>

				<!-- Unscheduled -->
				<Card class="p-6">
					<div class="flex items-center justify-between mb-2">
						<p class="text-sm font-medium text-gray-600">Unscheduled</p>
						<div class="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
							<svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</div>
					</div>
					<p class="text-3xl font-bold text-red-600">{stats.unscheduled_students}</p>
					<p class="text-sm text-gray-500 mt-1">
						{getPercentage(stats.unscheduled_students, stats.total_students)}% of students
					</p>
				</Card>
			</div>
		</div>
		{/if}

		<!-- Quick Actions -->
		<div class="mb-8">
			<h2 class="text-2xl font-bold mb-4">Quick Actions</h2>
			<Card class="p-6">
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
					<Button onclick={() => navigateTo('/calendar')} class="w-full h-20 bg-teal-600 hover:bg-teal-700">
						<div class="flex flex-col items-center gap-2">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
							<span>View Calendar</span>
						</div>
					</Button>

					<Button onclick={() => navigateTo('/students')} variant="outline" class="w-full h-20">
						<div class="flex flex-col items-center gap-2">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
							</svg>
							<span>Manage Students</span>
						</div>
					</Button>

					<Button onclick={() => navigateTo('/preceptors')} variant="outline" class="w-full h-20">
						<div class="flex flex-col items-center gap-2">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<span>Manage Preceptors</span>
						</div>
					</Button>

					<Button onclick={() => navigateTo('/clerkships')} variant="outline" class="w-full h-20">
						<div class="flex flex-col items-center gap-2">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
							</svg>
							<span>Manage Clerkships</span>
						</div>
					</Button>
				</div>
			</Card>
		</div>

		<!-- Getting Started -->
		{#if stats && (stats.total_students === 0 || stats.total_preceptors === 0 || stats.total_clerkships === 0)}
			<Card class="p-6 bg-blue-50 border-blue-200">
				<h2 class="text-xl font-bold mb-2 text-blue-900">Getting Started</h2>
				<p class="text-blue-800 mb-4">
					To generate schedules, you need to add students, preceptors, and clerkships first.
				</p>
				<div class="space-y-2 text-sm text-blue-700">
					{#if stats.total_students === 0}
						<p>Add students in the <strong>Students</strong> section</p>
					{/if}
					{#if stats.total_preceptors === 0}
						<p>Add preceptors in the <strong>Preceptors</strong> section</p>
					{/if}
					{#if stats.total_clerkships === 0}
						<p>Add clerkships in the <strong>Clerkships</strong> section</p>
					{/if}
				</div>
			</Card>
		{/if}
	</div>

	<!-- Welcome Modal for new users -->
	{#if showWelcome && data.activeSchedule}
		<WelcomeScheduleModal
			open={showWelcome}
			schedule={data.activeSchedule}
			onComplete={handleWelcomeComplete}
		/>
	{/if}
{/if}
