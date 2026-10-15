<script lang="ts">
	import StudentForm from '$lib/features/students/components/student-form.svelte';
	import { goto } from '$app/navigation';
</script>

<div class="container mx-auto max-w-2xl py-8">
	<h1 class="mb-6 text-3xl font-bold">Add Student</h1>

	<StudentForm onSuccess={() => goto('/students')} onCancel={() => goto('/students')} />
</div>
