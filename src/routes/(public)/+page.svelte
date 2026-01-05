<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
</script>

<!-- Landing Page -->
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
			<div class="inline-block bg-teal-100 text-teal-800 text-sm font-medium px-4 py-1 rounded-full mb-6">
				Purpose-Built for Longitudinal Integrated Clerkships
			</div>
			<h1 class="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
				LIC Scheduling Made <span class="text-teal-600">Simple</span>
			</h1>
			<p class="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
				LICFlow automatically generates conflict-free schedules for your Longitudinal Integrated Clerkship program, tracks every requirement,
				and handles the complexity that spreadsheets simply can't. Scale your LIC without scaling your stress.
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

	<!-- Pain Points Section -->
	<section class="bg-white py-16">
		<div class="container mx-auto px-6">
			<div class="max-w-3xl mx-auto text-center mb-12">
				<h2 class="text-3xl font-bold text-gray-900 mb-4">
					Sound Familiar?
				</h2>
			</div>
			<div class="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
				<div class="bg-red-50 border border-red-100 rounded-lg p-6">
					<div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mb-4">
						<svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<p class="text-gray-700">"I spend <strong>days rebuilding schedules</strong> in Excel when one preceptor's availability changes."</p>
				</div>
				<div class="bg-red-50 border border-red-100 rounded-lg p-6">
					<div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mb-4">
						<svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<p class="text-gray-700">"I'm always worried we'll <strong>miss a requirement</strong> and a student won't be able to graduate on time."</p>
				</div>
				<div class="bg-red-50 border border-red-100 rounded-lg p-6">
					<div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mb-4">
						<svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<p class="text-gray-700">"Our program is growing, but I <strong>can't handle more students</strong> with my current process."</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Solution Section -->
	<section class="py-16 bg-gray-50">
		<div class="container mx-auto px-6">
			<div class="max-w-3xl mx-auto text-center mb-12">
				<h2 class="text-3xl font-bold text-gray-900 mb-4">
					There's a Better Way
				</h2>
				<p class="text-xl text-gray-600">
					LICFlow handles the complexity of LIC scheduling so you can focus on education, not spreadsheets.
				</p>
			</div>
			<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
				<!-- Feature 1: Automated Scheduling -->
				<Card class="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
					<div class="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
						<svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</div>
					<h3 class="text-xl font-semibold text-gray-900 mb-2">Intelligent Auto-Scheduling</h3>
					<p class="text-gray-600">
						Generate complete, conflict-free schedules in seconds. Our algorithm juggles 14+ constraints
						simultaneously—preceptor availability, site capacity, requirements, and more.
					</p>
				</Card>

				<!-- Feature 2: Requirement Tracking -->
				<Card class="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
					<div class="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
						<svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
						</svg>
					</div>
					<h3 class="text-xl font-semibold text-gray-900 mb-2">100% Requirement Visibility</h3>
					<p class="text-gray-600">
						See exactly where every student stands. Track progress across all clerkships with real-time
						dashboards that show gaps before they become problems.
					</p>
				</Card>

				<!-- Feature 3: Quick Adjustments -->
				<Card class="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
					<div class="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
						<svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
					</div>
					<h3 class="text-xl font-semibold text-gray-900 mb-2">Last-Minute Changes? No Problem.</h3>
					<p class="text-gray-600">
						Preceptor called in sick? Regenerate affected assignments instantly while preserving what's working.
						Smart regeneration modes adapt to your situation.
					</p>
				</Card>

				<!-- Feature 4: Scale Confidently -->
				<Card class="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
					<div class="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
						<svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
						</svg>
					</div>
					<h3 class="text-xl font-semibold text-gray-900 mb-2">Scale Without Adding Staff</h3>
					<p class="text-gray-600">
						Handle 50 students as easily as 20. LICFlow manages complexity that would be impossible
						manually, letting you grow your program without growing your workload.
					</p>
				</Card>

				<!-- Feature 5: Conflict Detection -->
				<Card class="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
					<div class="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
						<svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
						</svg>
					</div>
					<h3 class="text-xl font-semibold text-gray-900 mb-2">Zero Scheduling Conflicts</h3>
					<p class="text-gray-600">
						Double-bookings, capacity overflows, blackout violations—caught automatically before they
						cause problems. Every constraint is validated in real-time.
					</p>
				</Card>

				<!-- Feature 6: Actionable Insights -->
				<Card class="p-6 bg-white border-0 shadow-md hover:shadow-lg transition-shadow">
					<div class="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
						<svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
						</svg>
					</div>
					<h3 class="text-xl font-semibold text-gray-900 mb-2">Smart Suggestions</h3>
					<p class="text-gray-600">
						When issues arise, get specific recommendations—not just error messages. LICFlow tells you
						exactly what to adjust and why, prioritized by impact.
					</p>
				</Card>
			</div>
		</div>
	</section>

	<!-- How It Works -->
	<section class="py-16 bg-white">
		<div class="container mx-auto px-6">
			<h2 class="text-3xl font-bold text-center text-gray-900 mb-12">
				Up and Running in Minutes
			</h2>
			<div class="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
				<div class="text-center">
					<div class="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
						1
					</div>
					<h3 class="text-lg font-semibold text-gray-900 mb-2">Add Your Data</h3>
					<p class="text-gray-600">
						Enter students, preceptors, sites, and clerkship requirements through our intuitive forms.
					</p>
				</div>
				<div class="text-center">
					<div class="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
						2
					</div>
					<h3 class="text-lg font-semibold text-gray-900 mb-2">Configure Constraints</h3>
					<p class="text-gray-600">
						Set availability patterns, blackout dates, capacity limits, and scheduling rules.
					</p>
				</div>
				<div class="text-center">
					<div class="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
						3
					</div>
					<h3 class="text-lg font-semibold text-gray-900 mb-2">Generate & Export</h3>
					<p class="text-gray-600">
						Click generate, review your schedule, make any adjustments, and export to Excel.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Stats/Benefits Section -->
	<section class="py-16 bg-teal-600">
		<div class="container mx-auto px-6">
			<div class="max-w-5xl mx-auto">
				<h2 class="text-3xl font-bold text-center text-white mb-12">
					What Changes When You Switch to LICFlow
				</h2>
				<div class="grid md:grid-cols-4 gap-8 text-center text-white">
					<div>
						<div class="text-4xl font-bold mb-2">Hours → Minutes</div>
						<p class="text-teal-100">Schedule generation time</p>
					</div>
					<div>
						<div class="text-4xl font-bold mb-2">Zero</div>
						<p class="text-teal-100">Scheduling conflicts</p>
					</div>
					<div>
						<div class="text-4xl font-bold mb-2">100%</div>
						<p class="text-teal-100">Requirement visibility</p>
					</div>
					<div>
						<div class="text-4xl font-bold mb-2">2x+</div>
						<p class="text-teal-100">Students you can manage</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Confidence Section -->
	<section class="py-16 bg-gray-50">
		<div class="container mx-auto px-6">
			<div class="max-w-4xl mx-auto">
				<div class="bg-white rounded-2xl shadow-lg p-8 md:p-12">
					<div class="grid md:grid-cols-2 gap-8 items-center">
						<div>
							<h2 class="text-3xl font-bold text-gray-900 mb-4">
								Sleep Better Knowing Nothing Falls Through the Cracks
							</h2>
							<p class="text-gray-600 mb-6">
								Every requirement tracked. Every conflict caught. Every change validated instantly.
								LICFlow gives you the confidence that comes from knowing your schedule is complete,
								correct, and ready—even when things change at the last minute.
							</p>
							<ul class="space-y-3">
								<li class="flex items-start gap-3">
									<svg class="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									</svg>
									<span class="text-gray-700">Real-time requirement gap analysis</span>
								</li>
								<li class="flex items-start gap-3">
									<svg class="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									</svg>
									<span class="text-gray-700">Automatic constraint validation on every edit</span>
								</li>
								<li class="flex items-start gap-3">
									<svg class="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									</svg>
									<span class="text-gray-700">Smart regeneration preserves working assignments</span>
								</li>
								<li class="flex items-start gap-3">
									<svg class="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									</svg>
									<span class="text-gray-700">Excel export with student and preceptor views</span>
								</li>
							</ul>
						</div>
						<div class="bg-teal-50 rounded-xl p-6">
							<div class="text-center">
								<svg class="w-16 h-16 text-teal-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
								</svg>
								<p class="text-xl font-semibold text-gray-900 mb-2">Built for Medical Education</p>
								<p class="text-gray-600 text-sm">
									LICFlow understands the unique constraints of longitudinal integrated clerkships—team continuity,
									site requirements, preceptor specialties, and more.
								</p>
							</div>
						</div>
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
					Ready to Take Control of Your Scheduling?
				</h2>
				<p class="text-gray-600 mb-8">
					Stop wrestling with spreadsheets. Start scheduling with confidence.
				</p>
				<div class="flex flex-col sm:flex-row gap-4 justify-center">
					<Button href="/register" size="lg" class="bg-teal-600 hover:bg-teal-700 text-white px-8 py-6 text-lg">
						Start Free Trial
					</Button>
					<Button href="/login" variant="outline" size="lg" class="px-8 py-6 text-lg border-gray-300 hover:bg-gray-50">
						Sign In
					</Button>
				</div>
				<p class="mt-4 text-sm text-gray-500">No credit card required. Set up in minutes.</p>
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
			<p class="text-sm">&copy; 2025 LICFlow. Simplifying Longitudinal Integrated Clerkship scheduling.</p>
		</div>
	</footer>
</div>
