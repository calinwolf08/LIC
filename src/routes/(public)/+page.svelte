<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
</script>

<!-- Landing Page for Public -->
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
