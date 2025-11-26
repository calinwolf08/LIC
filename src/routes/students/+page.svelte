<script lang="ts">
	import type { PageData } from './$types';
	import type { Students } from '$lib/db/types';
	import StudentList from '$lib/features/students/components/student-list.svelte';
	import DeleteStudentDialog from '$lib/features/students/components/delete-student-dialog.svelte';
	import StudentOnboardingForm from '$lib/features/scheduling-config/components/student-onboarding-form.svelte';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	// Tab state
	let activeTab = $state<'students' | 'onboarding'>('students');

	let showDeleteDialog = $state(false);
	let studentToDelete = $state<Students | null>(null);

	function handleEdit(student: Students) {
		goto(`/students/${student.id}/edit`);
	}

	function handleDelete(student: Students) {
		studentToDelete = student;
		showDeleteDialog = true;
	}

	async function handleDeleteConfirm(student: Students) {
		const response = await fetch(`/api/students/${student.id}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error?.message || 'Failed to delete student');
		}

		showDeleteDialog = false;
		studentToDelete = null;

		// Refresh the page data
		await invalidateAll();
	}

	function handleCancelDelete() {
		showDeleteDialog = false;
		studentToDelete = null;
	}
</script>

<div class="container mx-auto py-8">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Students</h1>
	</div>

	<!-- Tabs -->
	<div class="mb-6 border-b">
		<nav class="-mb-px flex space-x-8">
			<button
				onclick={() => (activeTab = 'students')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'students'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Students ({data.students.length})
			</button>
			<button
				onclick={() => (activeTab = 'onboarding')}
				class={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
					activeTab === 'onboarding'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
				}`}
			>
				Health System Onboarding
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'students'}
		<div class="mb-6 flex items-center justify-end">
			<Button href="/students/new">Add Student</Button>
		</div>

		<StudentList students={data.students} onEdit={handleEdit} onDelete={handleDelete} />
	{:else if activeTab === 'onboarding'}
		<StudentOnboardingForm />
	{/if}

	<DeleteStudentDialog
		open={showDeleteDialog}
		student={studentToDelete}
		onConfirm={handleDeleteConfirm}
		onCancel={handleCancelDelete}
	/>
</div>
