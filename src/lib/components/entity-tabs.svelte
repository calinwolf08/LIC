<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Badge } from '$lib/components/ui/badge';
	import type { EntityTab } from './types';

	interface Props {
		tabs: EntityTab[];
		active: string;
		/** When set, the active tab is synced to this URL query param (e.g. "tab"). */
		urlParam?: string;
	}

	let { tabs, active = $bindable(), urlParam }: Props = $props();

	let tablist: HTMLDivElement | undefined = $state();

	// Restore the active tab from the URL param — on first load and on
	// back/forward — so a deep-linked or reloaded `?tab=…` opens that tab rather
	// than the default (finding P3-b). `select()` writes the param, so once active
	// matches the URL this is a no-op and cannot loop.
	$effect(() => {
		if (!urlParam) return;
		const fromUrl = $page.url.searchParams.get(urlParam);
		if (fromUrl && fromUrl !== active && tabs.some((t) => t.id === fromUrl)) {
			active = fromUrl;
		}
	});

	function select(id: string) {
		active = id;
		if (urlParam) {
			const url = new URL($page.url);
			url.searchParams.set(urlParam, id);
			goto(url, { replaceState: true, keepFocus: true, noScroll: true });
		}
	}

	function onKeydown(e: KeyboardEvent, index: number) {
		let next: number | null = null;
		if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
		else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = tabs.length - 1;
		if (next !== null) {
			e.preventDefault();
			select(tabs[next].id);
			const buttons = tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
			buttons?.[next]?.focus();
		}
	}
</script>

<div class="mb-6 border-b">
	<div bind:this={tablist} role="tablist" class="-mb-px flex gap-8">
		{#each tabs as tab, i (tab.id)}
			<button
				role="tab"
				type="button"
				aria-selected={active === tab.id}
				tabindex={active === tab.id ? 0 : -1}
				onclick={() => select(tab.id)}
				onkeydown={(e) => onKeydown(e, i)}
				class={`flex items-center gap-2 border-b-2 px-1 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
					active === tab.id
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				{tab.label}
				{#if tab.badge !== undefined}
					<Badge variant="secondary">{tab.badge}</Badge>
				{/if}
			</button>
		{/each}
	</div>
</div>
