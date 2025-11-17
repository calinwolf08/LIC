/**
 * Test Fixtures
 *
 * Mock data generators for testing
 */

import type {
	StudentsTable,
	PreceptorsTable,
	ClerkshipsTable,
	ScheduleAssignmentsTable
} from '$lib/db/types';

let studentCounter = 0;
let preceptorCounter = 0;
let clerkshipCounter = 0;
let assignmentCounter = 0;

/**
 * Creates a mock student with random data
 */
export function createMockStudent(
	overrides?: Partial<StudentsTable>
): StudentsTable {
	studentCounter++;
	const timestamp = new Date().toISOString();

	return {
		id: crypto.randomUUID(),
		name: `Student ${studentCounter}`,
		email: `student${studentCounter}@example.com`,
		created_at: timestamp,
		updated_at: timestamp,
		...overrides
	};
}

/**
 * Creates a mock preceptor with random data
 */
export function createMockPreceptor(
	overrides?: Partial<PreceptorsTable>
): PreceptorsTable {
	preceptorCounter++;
	const timestamp = new Date().toISOString();

	return {
		id: crypto.randomUUID(),
		name: `Dr. Preceptor ${preceptorCounter}`,
		email: `preceptor${preceptorCounter}@example.com`,
		specialty: 'Internal Medicine',
		max_students: 1,
		created_at: timestamp,
		updated_at: timestamp,
		...overrides
	};
}

/**
 * Creates a mock clerkship with random data
 */
export function createMockClerkship(
	overrides?: Partial<ClerkshipsTable>
): ClerkshipsTable {
	clerkshipCounter++;
	const timestamp = new Date().toISOString();

	return {
		id: crypto.randomUUID(),
		name: `Internal Medicine ${clerkshipCounter}`,
		specialty: 'Internal Medicine',
		required_days: 20,
		description: `A ${clerkshipCounter * 20}-day rotation in Internal Medicine`,
		created_at: timestamp,
		updated_at: timestamp,
		...overrides
	};
}

/**
 * Creates a mock schedule assignment
 */
export function createMockAssignment(
	overrides?: Partial<ScheduleAssignmentsTable>
): ScheduleAssignmentsTable {
	assignmentCounter++;
	const timestamp = new Date().toISOString();
	const date = new Date();
	date.setDate(date.getDate() + assignmentCounter);

	return {
		id: crypto.randomUUID(),
		student_id: crypto.randomUUID(),
		preceptor_id: crypto.randomUUID(),
		clerkship_id: crypto.randomUUID(),
		date: date.toISOString().split('T')[0],
		status: 'scheduled',
		created_at: timestamp,
		updated_at: timestamp,
		...overrides
	};
}
