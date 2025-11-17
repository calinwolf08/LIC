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

describe('createAssignmentSchema', () => {
	it('validates valid assignment with all required fields', () => {
		const data = {
			student_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
			preceptor_id: 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
			clerkship_id: 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
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
			student_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
			preceptor_id: 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
			clerkship_id: 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
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
			preceptor_id: 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
			clerkship_id: 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
			date: '2024-01-15'
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects assignment missing preceptor_id', () => {
		const data = {
			student_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
			clerkship_id: 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
			date: '2024-01-15'
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects assignment missing clerkship_id', () => {
		const data = {
			student_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
			preceptor_id: 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
			date: '2024-01-15'
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects assignment missing date', () => {
		const data = {
			student_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
			preceptor_id: 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
			clerkship_id: 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f'
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects invalid UUID for student_id', () => {
		const data = {
			student_id: 'not-a-uuid',
			preceptor_id: 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
			clerkship_id: 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
			date: '2024-01-15'
		};
		const result = createAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});

	it('rejects invalid date format', () => {
		const data = {
			student_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
			preceptor_id: 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
			clerkship_id: 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
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
			preceptor_id: 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
			date: '2024-01-16',
			status: 'rescheduled'
		};
		const result = updateAssignmentSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('validates update with all fields', () => {
		const data = {
			student_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
			preceptor_id: 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
			clerkship_id: 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
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
			const errorMessages = result.error.issues.map(issue => issue.message);
			expect(errorMessages.some(msg => msg.includes('At least one field'))).toBe(true);
		}
	});

	it('rejects update with invalid UUID', () => {
		const data = { student_id: 'not-a-uuid' };
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
					student_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
					preceptor_id: 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
					clerkship_id: 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
					date: '2024-01-15'
				},
				{
					student_id: 'd4e5f6a7-b8c9-4d5e-8f9a-0b1c2d3e4f5a',
					preceptor_id: 'e5f6a7b8-c9d0-4e5f-8a9b-0c1d2e3f4a5b',
					clerkship_id: 'f6a7b8c9-d0e1-4f5a-8b9c-0d1e2f3a4b5c',
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
					student_id: 'not-a-uuid',
					preceptor_id: 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
					clerkship_id: 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
					date: '2024-01-15'
				}
			]
		};
		const result = bulkAssignmentSchema.safeParse(data);
		expect(result.success).toBe(false);
	});
});

describe('assignmentIdSchema', () => {
	it('validates valid UUID', () => {
		const data = { id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d' };
		const result = assignmentIdSchema.safeParse(data);
		expect(result.success).toBe(true);
	});

	it('rejects invalid UUID', () => {
		const data = { id: 'not-a-uuid' };
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
			student_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
			preceptor_id: 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
			clerkship_id: 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
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
		const data = { student_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d' };
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

	it('rejects invalid UUID in student_id filter', () => {
		const data = { student_id: 'not-a-uuid' };
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
