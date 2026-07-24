<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import GlobalDefaultsForm from '$lib/features/scheduling-config/components/global-defaults-form.svelte';
</script>

<Card class="p-6">
	<h2 class="mb-2 text-lg font-semibold">Global scheduling defaults</h2>
	<p class="mb-4 text-sm text-muted-foreground">
		Defaults the engine uses for each clerkship type. A clerkship can override these on its
		Auto-scheduling tab.
	</p>
	<GlobalDefaultsForm />
</Card>
