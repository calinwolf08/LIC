<script lang="ts">
	import { page } from '$app/stores';
	import { authClient } from '$lib/auth-client';
	import ScheduleSelector from '$lib/features/schedules/components/schedule-selector.svelte';
	import { Toaster } from '$lib/components/toast';

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

	// Navigation order matches entity dependency hierarchy
	const navItems = [
		{
			href: '/dashboard',
			label: 'Dashboard',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
		},
		{
			href: '/schedules',
			label: 'Schedule Periods',
			icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
		},
		{
			href: '/health-systems',
			label: 'Health Systems',
			icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'
		},
		{
			href: '/sites',
			label: 'Sites',
			icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z'
		},
		{
			href: '/clerkships',
			label: 'Clerkships',
			icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'
		},
		{
			href: '/preceptors',
			label: 'Preceptors',
			icon: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z'
		},
		{
			href: '/students',
			label: 'Students',
			icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'
		},
		{
			href: '/calendar',
			label: 'Schedule Calendar',
			icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
		}
	];

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
				{#each navItems as item}
					<a
						href={item.href}
						onclick={closeMobileMenu}
						class="flex items-center gap-3 rounded-lg px-4 py-3 transition-colors {isActive(
							item.href
						)
							? 'bg-teal-600 text-white'
							: 'text-gray-300 hover:bg-gray-800 hover:text-white'}"
					>
						<svg
							class="h-5 w-5 flex-shrink-0"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
						</svg>
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
