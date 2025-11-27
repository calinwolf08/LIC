/**
 * Schedule Assignments - Schema Validation Tests
 *
 * Tests for Zod validation schemas for schedule assignments
 */

import { describe, it, expect } from 'vitest';
import {
	createAssignmentSchema,
	updateAssignmentSchema,
	bulkAssignmentSchema,
	assignmentIdSchema,
	assignmentFiltersSchema
} from './schemas';

// Valid CUID2-like test IDs (20-30 chars starting with letter)
const validStudentId = 'clstudent00000000001';
const validPreceptorId = 'clpreceptor000000001';
const validClerkshipId = 'clclerkship000000001';
const validStudentId2 = 'clstudent00000000002';
const validPreceptorId2 = 'clpreceptor000000002';
const validClerkshipId2 = 'clclerkship000000002';
const validAssignmentId = 'classignment00000001';

describe('createAssignmentSchema', () => {
	it('validates valid assignment with all required fields', () => {
		const data = {
			student_id: validStudentId,
			preceptor_id: validPreceptorId,
			clerkship_id: validClerkshipId,
			date: '2024-01-15'
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.status).toBe('scheduled'); // default value
		}
	});

	it('validates assignment with explicit status', () => {
		const data = {
			student_id: validStudentId,
			preceptor_id: validPreceptorId,
			clerkship_id: validClerkshipId,
			date: '2024-01-15',
			status: 'completed'
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.status).toBe('completed');
		}
	});

	it('rejects assignment missing student_id', () => {
		const data = {
			preceptor_id: validPreceptorId,
			clerkship_id: validClerkshipId,
			date: '2024-01-15'
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects assignment missing preceptor_id', () => {
		const data = {
			student_id: validStudentId,
			clerkship_id: validClerkshipId,
			date: '2024-01-15'
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects assignment missing clerkship_id', () => {
		const data = {
			student_id: validStudentId,
			preceptor_id: validPreceptorId,
			date: '2024-01-15'
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects assignment missing date', () => {
		const data = {
			student_id: validStudentId,
			preceptor_id: validPreceptorId,
			clerkship_id: validClerkshipId
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects invalid ID format for student_id', () => {
		const data = {
			student_id: 'short', // too short for CUID2
			preceptor_id: validPreceptorId,
			clerkship_id: validClerkshipId,
			date: '2024-01-15'
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects invalid date format', () => {
		const data = {
			student_id: validStudentId,
			preceptor_id: validPreceptorId,
			clerkship_id: validClerkshipId,
			date: '01/15/2024'
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});
});

describe('updateAssignmentSchema', () => {
	it('validates update with single field', () => {
		const data = { status: 'completed' };
		const result = updateAssignmentSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('validates update with multiple fields', () => {
		const data = {
			preceptor_id: validPreceptorId,
			date: '2024-01-16',
			status: 'rescheduled'
		};
		const result = updateAssignmentSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('validates update with all fields', () => {
		const data = {
			student_id: validStudentId,
			preceptor_id: validPreceptorId,
			clerkship_id: validClerkshipId,
			date: '2024-01-15',
			status: 'scheduled'
		};
		const result = updateAssignmentSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('rejects update with no fields', () => {
		const data = {};
		const result = updateAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
		if (!result.success) {
			const errorMessages = result.error.issues.map((issue) => issue.message);
			expect(errorMessages.some((msg) => msg.includes('At least one field'))).toBe(true);
		}
	});

	it('rejects update with invalid ID format', () => {
		const data = { student_id: 'short' };
		const result = updateAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects update with invalid date format', () => {
		const data = { date: '01/15/2024' };
		const result = updateAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});
});

describe('bulkAssignmentSchema', () => {
	it('validates bulk assignment with multiple assignments', () => {
		const data = {
			assignments: [
				{
					student_id: validStudentId,
					preceptor_id: validPreceptorId,
					clerkship_id: validClerkshipId,
					date: '2024-01-15'
				},
				{
					student_id: validStudentId2,
					preceptor_id: validPreceptorId2,
					clerkship_id: validClerkshipId2,
					date: '2024-01-16'
				}
			]
		};
		const result = bulkAssignmentSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('validates empty assignments array', () => {
		const data = { assignments: [] };
		const result = bulkAssignmentSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('rejects bulk assignment missing assignments array', () => {
		const data = {};
		const result = bulkAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects bulk assignment with invalid assignment', () => {
		const data = {
			assignments: [
				{
					student_id: 'short',
					preceptor_id: validPreceptorId,
					clerkship_id: validClerkshipId,
					date: '2024-01-15'
				}
			]
		};
		const result = bulkAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});
});

describe('assignmentIdSchema', () => {
	it('validates valid ID', () => {
		const data = { id: validAssignmentId };
		const result = assignmentIdSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('rejects invalid ID format', () => {
		const data = { id: 'short' };
		const result = assignmentIdSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects missing id', () => {
		const data = {};
		const result = assignmentIdSchema.safeParse(data);
		expect(result.success).toBe(false);
	});
});

describe('assignmentFiltersSchema', () => {
	it('validates filters with all fields', () => {
		const data = {
			student_id: validStudentId,
			preceptor_id: validPreceptorId,
			clerkship_id: validClerkshipId,
			start_date: '2024-01-01',
			end_date: '2024-12-31'
		};
		const result = assignmentFiltersSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('validates empty filters object', () => {
		const data = {};
		const result = assignmentFiltersSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('validates filters with only student_id', () => {
		const data = { student_id: validStudentId };
		const result = assignmentFiltersSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('validates filters with only date range', () => {
		const data = {
			start_date: '2024-01-01',
			end_date: '2024-12-31'
		};
		const result = assignmentFiltersSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('validates filters with only start_date', () => {
		const data = { start_date: '2024-01-01' };
		const result = assignmentFiltersSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('validates filters with only end_date', () => {
		const data = { end_date: '2024-12-31' };
		const result = assignmentFiltersSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('rejects invalid ID format in student_id filter', () => {
		const data = { student_id: 'short' };
		const result = assignmentFiltersSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects invalid date format in start_date', () => {
		const data = { start_date: '01/01/2024' };
		const result = assignmentFiltersSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects invalid date format in end_date', () => {
		const data = { end_date: '12/31/2024' };
		const result = assignmentFiltersSchema.safeParse(data);
		expect(result.success).toBe(false);
	});
});
