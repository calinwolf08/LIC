<script lang="ts">
	import { page } from '$app/stores';
	import { authClient } from '$lib/auth-client';
	import ScheduleSelector from '$lib/features/schedules/components/schedule-selector.svelte';
	import { Toaster } from '$lib/components/toast';
	import {
		LayoutDashboard,
		CalendarDays,
		Users,
		Stethoscope,
		GraduationCap,
		Building2,
		MapPin,
		CalendarRange,
		Wand2,
		type Icon as IconType
	} from '@lucide/svelte';

	let { children } = $props();

	// Mobile drawer state
	let mobileMenuOpen = $state(false);

	async function handleLogout() {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = '/login';
				}
			}
		});
	}

	let currentPath = $derived($page.url.pathname);
	let hasAutogen = $derived(($page.data.entitlements ?? []).includes('autogen'));

	type NavItem = { href: string; label: string; icon: typeof IconType; autogenOnly?: boolean };

	// Navigation order follows the user's mental model (see spec §6):
	// work happens on the Calendar; entities feed it; schedules scope it;
	// auto-generation is a gated Stage 2 area.
	const allNavItems: NavItem[] = [
		{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/calendar', label: 'Calendar', icon: CalendarDays },
		{ href: '/students', label: 'Students', icon: Users },
		{ href: '/preceptors', label: 'Preceptors', icon: Stethoscope },
		{ href: '/clerkships', label: 'Clerkships', icon: GraduationCap },
		{ href: '/health-systems', label: 'Health Systems', icon: Building2 },
		{ href: '/sites', label: 'Sites', icon: MapPin },
		{ href: '/schedules', label: 'Schedules', icon: CalendarRange },
		{ href: '/schedule/results', label: 'Auto-Generate', icon: Wand2, autogenOnly: true }
	];

	let navItems = $derived(allNavItems.filter((item) => !item.autogenOnly || hasAutogen));

	function isActive(href: string): boolean {
		if (href === '/dashboard') {
			return currentPath === '/dashboard';
		}
		return currentPath.startsWith(href);
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Mobile Header -->
	<header
		class="fixed top-0 right-0 left-0 z-40 flex h-14 items-center bg-gray-900 px-4 text-white lg:hidden"
	>
		<button
			type="button"
			onclick={() => (mobileMenuOpen = true)}
			class="-ml-2 rounded-md p-2 hover:bg-gray-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
			aria-label="Open menu"
		>
			<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 6h16M4 12h16M4 18h16"
				/>
			</svg>
		</button>
		<div class="ml-4 flex items-center gap-2">
			<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600">
				<svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
					/>
				</svg>
			</div>
			<span class="text-lg font-bold">LICFlow</span>
		</div>
	</header>

	<!-- Mobile Drawer Backdrop -->
	{#if mobileMenuOpen}
		<div
			class="fixed inset-0 z-40 bg-black/50 lg:hidden"
			onclick={closeMobileMenu}
			onkeydown={(e) => e.key === 'Escape' && closeMobileMenu()}
			role="button"
			tabindex="0"
			aria-label="Close menu"
		></div>
	{/if}

	<!-- Sidebar / Mobile Drawer -->
	<aside
		class="fixed inset-y-0 left-0 z-50 w-72 transform bg-gray-900 text-white transition-transform duration-300 ease-in-out
			{mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
			lg:translate-x-0"
	>
		<div class="flex h-full flex-col">
			<!-- Logo/Brand -->
			<div class="flex items-center justify-between p-6">
				<div>
					<div class="flex items-center gap-2">
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600">
							<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
								/>
							</svg>
						</div>
						<div>
							<h1 class="text-xl font-bold">LICFlow</h1>
							<p class="text-xs text-gray-400">Medical Education</p>
						</div>
					</div>
				</div>
				<!-- Close button for mobile -->
				<button
					type="button"
					onclick={closeMobileMenu}
					class="rounded-md p-2 hover:bg-gray-800 focus:ring-2 focus:ring-teal-500 focus:outline-none lg:hidden"
					aria-label="Close menu"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Schedule Selector -->
			<div class="border-b border-gray-800 px-4 pb-4">
				<ScheduleSelector />
			</div>

			<!-- Navigation -->
			<nav class="flex-1 space-y-1 overflow-y-auto px-4 py-4">
				{#each navItems as item (item.href)}
					{@const Icon = item.icon}
					<a
						href={item.href}
						onclick={closeMobileMenu}
						class="flex items-center gap-3 rounded-lg px-4 py-3 transition-colors {isActive(
							item.href
						)
							? 'bg-teal-600 text-white'
							: 'text-gray-300 hover:bg-gray-800 hover:text-white'}"
					>
						<Icon class="h-5 w-5 flex-shrink-0" />
						<span class="font-medium">{item.label}</span>
					</a>
				{/each}
			</nav>

			<!-- User Actions -->
			<div class="border-t border-gray-800 p-4">
				<button
					type="button"
					onclick={handleLogout}
					class="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
						/>
					</svg>
					<span class="font-medium">Logout</span>
				</button>
			</div>

			<!-- Footer -->
			<div class="border-t border-gray-800 p-4 text-xs text-gray-500">
				<p>&copy; 2025 LICFlow</p>
			</div>
		</div>
	</aside>

	<Toaster />

	<!-- Main content area -->
	<div class="pt-14 lg:pt-0 lg:pl-72">
		<main class="p-4 sm:p-6 lg:p-8">
			{@render children?.()}
		</main>
	</div>
</div>
