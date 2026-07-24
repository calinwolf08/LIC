<script lang="ts">
	import ClerkshipForm from '$lib/features/clerkships/components/clerkship-form.svelte';
	import { PageHeader } from '$lib/components';
	import { Card } from '$lib/components/ui/card';
	import { goto } from '$app/navigation';

	function handleSuccess() {
		goto('/clerkships');
	}
</script>

<svelte:head>
	<title>New clerkship | LIC</title>
</svelte:head>

<div class="container mx-auto max-w-2xl py-8">
	<PageHeader
		title="New clerkship"
		description="Define a clerkship and how many days each student must complete."
		breadcrumbs={[{ label: 'Clerkships', href: '/clerkships' }, { label: 'New' }]}
	/>
	<Card class="p-6">
		<ClerkshipForm onSuccess={handleSuccess} onCancel={() => goto('/clerkships')} />
	</Card>
</div>
