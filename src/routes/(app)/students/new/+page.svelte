<script lang="ts">
	import StudentForm from '$lib/features/students/components/student-form.svelte';
	import { goto } from '$app/navigation';
</script>

<div class="container mx-auto py-8 max-w-2xl">
	<h1 class="text-3xl font-bold mb-6">Add Student</h1>

	<StudentForm onSuccess={() => goto('/students')} onCancel={() => goto('/students')} />
</div>
