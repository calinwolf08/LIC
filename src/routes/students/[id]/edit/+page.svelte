<script lang="ts">
	import type { PageData } from './$types';
	import StudentForm from '$lib/features/students/components/student-form.svelte';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();
</script>

<div class="container mx-auto py-8 max-w-2xl">
	<h1 class="text-3xl font-bold mb-6">Edit Student</h1>

	<StudentForm
		student={data.student}
		onSuccess={() => goto('/students')}
		onCancel={() => goto('/students')}
	/>
</div>
