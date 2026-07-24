<script lang="ts">
	import type { Snippet } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import ConfirmDialog from './confirm-dialog.svelte';

	interface Props {
		/** Returns true when the form has unsaved changes. */
		isDirty: () => boolean;
		children: Snippet;
		message?: string;
	}

	let {
		isDirty,
		children,
		message = 'You have unsaved changes that will be lost.'
	}: Props = $props();

	let showDialog = $state(false);
	let pendingUrl = $state<URL | null>(null);
	let bypass = $state(false);

	beforeNavigate((nav) => {
		if (bypass || nav.willUnload || !isDirty()) return;
		if (nav.to?.url) {
			nav.cancel();
			pendingUrl = nav.to.url;
			showDialog = true;
		}
	});

	async function confirmLeave() {
		const target = pendingUrl;
		bypass = true;
		showDialog = false;
		if (target) {
			await goto(target);
		}
		bypass = false;
		pendingUrl = null;
	}

	function cancelLeave() {
		pendingUrl = null;
	}

	// Native beforeunload guard (browser tab close / reload) — the browser
	// controls this prompt; we only signal that there are unsaved changes.
	$effect(() => {
		function handler(e: BeforeUnloadEvent) {
			if (isDirty()) {
				e.preventDefault();
				e.returnValue = '';
			}
		}
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});
</script>

{@render children()}

<ConfirmDialog
	bind:open={showDialog}
	title="Discard unsaved changes?"
	description={message}
	confirmLabel="Discard changes"
	destructive
	onConfirm={confirmLeave}
	onCancel={cancelLeave}
/>
