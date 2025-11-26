<script lang="ts">
	import { page } from '$app/stores';

	let currentPath = $derived($page.url.pathname);

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: '📊' },
		{ href: '/students', label: 'Students', icon: '👨‍🎓' },
		{ href: '/preceptors', label: 'Preceptors', icon: '👨‍⚕️' },
		{ href: '/clerkships', label: 'Clerkships', icon: '📚' },
		{ href: '/health-systems', label: 'Health Systems', icon: '🏥' },
		{ href: '/sites', label: 'Sites', icon: '📍' },
		{ href: '/calendar', label: 'Calendar', icon: '📅' }
	];

	function isActive(href: string): boolean {
		if (href === '/') {
			return currentPath === '/';
		}
		return currentPath.startsWith(href);
	}
</script>

<aside class="fixed inset-y-0 left-0 w-64 bg-gray-900 text-white hidden lg:block">
	<div class="flex flex-col h-full">
		<!-- Logo/Brand -->
		<div class="p-6">
			<h1 class="text-2xl font-bold">LIC Scheduler</h1>
			<p class="text-sm text-gray-400 mt-1">Medical Education</p>
		</div>

		<!-- Navigation -->
		<nav class="flex-1 px-4 space-y-1">
			{#each navItems as item}
				<a
					href={item.href}
					class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {isActive(item.href)
						? 'bg-gray-800 text-white'
						: 'text-gray-300 hover:bg-gray-800 hover:text-white'}"
				>
					<span class="text-xl">{item.icon}</span>
					<span class="font-medium">{item.label}</span>
				</a>
			{/each}
		</nav>

		<!-- Footer -->
		<div class="p-4 text-xs text-gray-500 border-t border-gray-800">
			<p>&copy; 2024 LIC Scheduler</p>
		</div>
	</div>
</aside>
