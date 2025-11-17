<script lang="ts">
	import type { PageData } from './$types';
	import type { StudentsTable } from '$lib/db/types';
	import StudentList from '$lib/features/students/components/student-list.svelte';
	import DeleteStudentDialog from '$lib/features/students/components/delete-student-dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let showDeleteDialog = $state(false);
	let studentToDelete = $state<StudentsTable | null>(null);

	function handleEdit(student: StudentsTable) {
		goto(`/students/${student.id}/edit`);
	}

	function handleDelete(student: StudentsTable) {
		studentToDelete = student;
		showDeleteDialog = true;
	}

	async function handleDeleteConfirm(student: StudentsTable) {
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
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold">Students</h1>
		<Button href="/students/new">Add Student</Button>
	</div>

	<StudentList students={data.students} onEdit={handleEdit} onDelete={handleDelete} />

	<DeleteStudentDialog
		open={showDeleteDialog}
		student={studentToDelete}
		onConfirm={handleDeleteConfirm}
		onCancel={handleCancelDelete}
	/>
</div>
