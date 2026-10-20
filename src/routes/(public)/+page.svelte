<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import CalendarXIcon from '@lucide/svelte/icons/calendar-x';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SendIcon from '@lucide/svelte/icons/send';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import WandSparklesIcon from '@lucide/svelte/icons/wand-sparkles';

	// Every claim here should match a shipped feature. Keep it that way: no
	// testimonials, customer counts or performance numbers we can't back up.
	const features = [
		{
			icon: ShieldCheckIcon,
			title: 'Validation on every assignment',
			body: 'Assign a student by hand and LICFlow checks it as you go: double-bookings, preceptor capacity, availability, blackout dates and site restrictions. Hard conflicts are blocked; softer issues are flagged so you can decide.'
		},
		{
			icon: ListChecksIcon,
			title: 'Requirement tracking',
			body: 'Set the days each clerkship requires, then see every student’s status — met, partly met or not started — so gaps show up before the schedule is final.'
		},
		{
			icon: ClockIcon,
			title: 'Availability, down to the half day',
			body: 'Record when each preceptor can take students, including AM/PM sessions and “only if needed” days, along with how many students they take at once.'
		},
		{
			icon: LayersIcon,
			title: 'Built around LIC structure',
			body: 'Block and longitudinal (scattered) clerkships, required and optional electives, preceptor teams, core preceptors, health systems, sites and onboarding status.'
		},
		{
			icon: CalendarXIcon,
			title: 'Quarters and blackout dates',
			body: 'Split a schedule into named quarters and mark holidays or closures so nothing gets booked on days off.'
		},
		{
			icon: LayoutDashboardIcon,
			title: 'Dashboard and calendar',
			body: 'A setup checklist gets a new schedule ready, a health summary shows what still needs attention, and a calendar shows who is where on each day.'
		},
		{
			icon: FileSpreadsheetIcon,
			title: 'Excel export',
			body: 'Download the schedule as a workbook with student, preceptor, master and summary sheets.'
		},
		{
			icon: SendIcon,
			title: 'Send each person their part',
			body: 'Preview and send schedules to students and preceptors. Each recipient sees only the assignments that involve them.'
		}
	];

	const proFeatures = [
		{
			icon: WandSparklesIcon,
			title: 'Auto-generate a schedule',
			body: 'Generate assignments from your students, preceptors, availability and requirements, then review and adjust them by hand.'
		},
		{
			icon: RefreshCwIcon,
			title: 'Regenerate without starting over',
			body: 'When something changes, regenerate with minimal changes, fill in only what’s missing, or re-optimize everything. Past and locked assignments are kept.'
		},
		{
			icon: LightbulbIcon,
			title: 'Suggestions when requirements go unmet',
			body: 'If not every requirement can be met, LICFlow explains why and suggests changes, ranked by how much they would help.'
		}
	];

	const currentYear = new Date().getFullYear();
</script>

<div class="min-h-screen bg-gradient-to-b from-teal-50 to-white">
	<nav class="container mx-auto px-6 py-4">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600">
					<CalendarDaysIcon class="h-6 w-6 text-white" />
				</div>
				<span class="text-2xl font-bold text-gray-900">LICFlow</span>
			</div>
			<div class="flex items-center gap-4">
				<Button href="/login" variant="ghost" class="text-gray-700 hover:text-teal-700">
					Log in
				</Button>
				<Button href="/register" class="bg-teal-600 text-white hover:bg-teal-700">
					Get started
				</Button>
			</div>
		</div>
	</nav>

	<section class="container mx-auto px-6 py-16 md:py-24">
		<div class="mx-auto max-w-4xl text-center">
			<h1 class="mb-6 text-4xl font-bold text-gray-900 md:text-6xl">
				Scheduling for <span class="text-teal-600">longitudinal integrated clerkships</span>
			</h1>
			<p class="mx-auto mb-8 max-w-2xl text-xl text-gray-600">
				Keep students, preceptors, sites and clerkship requirements in one place. Build the schedule
				by hand with every assignment checked as you go, or let LICFlow generate it for you on the
				Pro plan.
			</p>
			<div class="flex flex-col justify-center gap-4 sm:flex-row">
				<Button
					href="/register"
					size="lg"
					class="bg-teal-600 px-8 py-6 text-lg text-white hover:bg-teal-700"
				>
					Get started
				</Button>
				<Button
					href="/login"
					variant="outline"
					size="lg"
					class="border-teal-600 px-8 py-6 text-lg text-teal-700 hover:bg-teal-50"
				>
					Sign in
				</Button>
			</div>
		</div>
	</section>

	<section class="bg-gray-50 py-16">
		<div class="container mx-auto px-6">
			<div class="mx-auto mb-12 max-w-3xl text-center">
				<h2 class="mb-4 text-3xl font-bold text-gray-900">What you can do with it</h2>
				<p class="text-xl text-gray-600">Included on every plan.</p>
			</div>
			<div class="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-4">
				{#each features as feature (feature.title)}
					<Card class="border-0 bg-white p-6 shadow-md">
						<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-teal-100">
							<feature.icon class="h-6 w-6 text-teal-600" />
						</div>
						<h3 class="mb-2 text-lg font-semibold text-gray-900">{feature.title}</h3>
						<p class="text-sm text-gray-600">{feature.body}</p>
					</Card>
				{/each}
			</div>
		</div>
	</section>

	<section class="bg-white py-16">
		<div class="container mx-auto px-6">
			<div class="mx-auto mb-12 max-w-3xl text-center">
				<div
					class="mb-4 inline-block rounded-full bg-teal-100 px-4 py-1 text-sm font-medium text-teal-800"
				>
					Pro plan
				</div>
				<h2 class="mb-4 text-3xl font-bold text-gray-900">Automatic schedule generation</h2>
				<p class="text-xl text-gray-600">
					Pro adds a scheduling engine on top of everything above.
				</p>
			</div>
			<div class="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
				{#each proFeatures as feature (feature.title)}
					<Card class="border-0 bg-teal-50 p-6 shadow-md">
						<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white">
							<feature.icon class="h-6 w-6 text-teal-600" />
						</div>
						<h3 class="mb-2 text-lg font-semibold text-gray-900">{feature.title}</h3>
						<p class="text-sm text-gray-600">{feature.body}</p>
					</Card>
				{/each}
			</div>
		</div>
	</section>

	<section class="bg-gray-50 py-16">
		<div class="container mx-auto px-6">
			<h2 class="mb-12 text-center text-3xl font-bold text-gray-900">How it works</h2>
			<div class="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
				{#each [{ title: 'Set up your schedule', body: 'Create an account, name your organization and set the schedule’s dates. A checklist walks you through the rest.' }, { title: 'Add your people and rules', body: 'Enter students, preceptors, sites and clerkships, then availability, requirements, quarters and blackout dates.' }, { title: 'Build, review, share', body: 'Assign by hand or generate on Pro, fix anything flagged, then export to Excel or send each person their schedule.' }] as step, index (step.title)}
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-600 text-2xl font-bold text-white"
						>
							{index + 1}
						</div>
						<h3 class="mb-2 text-lg font-semibold text-gray-900">{step.title}</h3>
						<p class="text-gray-600">{step.body}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<section class="bg-white py-20">
		<div class="container mx-auto px-6">
			<div class="mx-auto max-w-3xl">
				<h2 class="mb-8 text-center text-3xl font-bold text-gray-900">Plans</h2>
				<div class="grid gap-6 md:grid-cols-2">
					<div class="rounded-xl border border-gray-200 p-6">
						<h3 class="mb-1 text-xl font-semibold text-gray-900">Standard</h3>
						<p class="mb-4 text-sm text-gray-600">Build and manage schedules by hand.</p>
						<ul class="space-y-2 text-sm text-gray-700">
							{#each ['Everything under “What you can do with it”', 'Real-time validation on every assignment', 'Requirement tracking, Excel export and schedule sending'] as item (item)}
								<li class="flex items-start gap-2">
									<CheckIcon class="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600" />
									<span>{item}</span>
								</li>
							{/each}
						</ul>
					</div>
					<div class="rounded-xl border-2 border-teal-600 p-6">
						<h3 class="mb-1 text-xl font-semibold text-gray-900">Pro</h3>
						<p class="mb-4 text-sm text-gray-600">Everything in Standard, plus generation.</p>
						<ul class="space-y-2 text-sm text-gray-700">
							{#each ['Automatic schedule generation', 'Regeneration that keeps past and locked assignments', 'Explanations and ranked suggestions for unmet requirements'] as item (item)}
								<li class="flex items-start gap-2">
									<CheckIcon class="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600" />
									<span>{item}</span>
								</li>
							{/each}
						</ul>
					</div>
				</div>
				<p class="mt-6 text-center text-sm text-gray-500">
					Both plans are free to use for now. No payment details are needed to sign up.
				</p>
				<div class="mt-8 flex justify-center">
					<Button
						href="/register"
						size="lg"
						class="bg-teal-600 px-8 py-6 text-lg text-white hover:bg-teal-700"
					>
						Get started
					</Button>
				</div>
			</div>
		</div>
	</section>

	<footer class="bg-gray-900 py-8 text-gray-400">
		<div class="container mx-auto px-6 text-center">
			<div class="mb-4 flex items-center justify-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600">
					<CalendarDaysIcon class="h-5 w-5 text-white" />
				</div>
				<span class="text-lg font-semibold text-white">LICFlow</span>
			</div>
			<p class="text-sm">&copy; {currentYear} LICFlow. Scheduling for medical education.</p>
		</div>
	</footer>
</div>
