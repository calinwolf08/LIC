// @ts-nocheck
/**
 * Site Schema Tests
 *
 * Comprehensive tests for site Zod validation schemas
 */

import { describe, it, expect } from 'vitest';
import {
	createSiteSchema,
	updateSiteSchema,
	siteIdSchema,
	clerkshipSiteSchema,
	siteElectiveSchema,
	siteCapacityRuleSchema
} from './schemas';

describe('createSiteSchema', () => {
	it('validates valid input', () => {
		const validInput = {
			name: 'Main Hospital',
			health_system_id: 'clq1234567890123456789',
			address: '123 Main St, City, State 12345'
		};

		const result = createSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates without optional address', () => {
		const validInput = {
			name: 'Main Hospital',
			health_system_id: 'clq1234567890123456789'
		};

		const result = createSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('requires name', () => {
		const invalidInput = {
			health_system_id: 'clq1234567890123456789'
		};

		const result = createSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('transforms empty health_system_id to undefined', () => {
		const validInput = {
			name: 'Main Hospital',
			health_system_id: ''
		};

		const result = createSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.health_system_id).toBeUndefined();
		}
	});

	it('rejects name shorter than 2 characters', () => {
		const invalidInput = {
			name: 'A',
			health_system_id: 'clq1234567890123456789'
		};

		const result = createSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('accepts name with exactly 2 characters', () => {
		const validInput = {
			name: 'AB',
			health_system_id: 'clq1234567890123456789'
		};

		const result = createSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects name longer than 100 characters', () => {
		const invalidInput = {
			name: 'A'.repeat(101),
			health_system_id: 'clq1234567890123456789'
		};

		const result = createSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('accepts name with exactly 100 characters', () => {
		const validInput = {
			name: 'A'.repeat(100),
			health_system_id: 'clq1234567890123456789'
		};

		const result = createSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects invalid health_system_id format', () => {
		const invalidInput = {
			name: 'Main Hospital',
			health_system_id: 'not-a-uuid'
		};

		const result = createSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('transforms empty health_system_id to undefined', () => {
		const validInput = {
			name: 'Main Hospital',
			health_system_id: ''
		};

		const result = createSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.health_system_id).toBeUndefined();
		}
	});

	it('transforms empty address string to undefined', () => {
		const validInput = {
			name: 'Main Hospital',
			health_system_id: 'clq1234567890123456789',
			address: ''
		};

		const result = createSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.address).toBeUndefined();
		}
	});

	it('rejects address longer than 500 characters', () => {
		const invalidInput = {
			name: 'Main Hospital',
			health_system_id: 'clq1234567890123456789',
			address: 'A'.repeat(501)
		};

		const result = createSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('accepts address with exactly 500 characters', () => {
		const validInput = {
			name: 'Main Hospital',
			health_system_id: 'clq1234567890123456789',
			address: 'A'.repeat(500)
		};

		const result = createSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});
});

describe('updateSiteSchema', () => {
	it('allows updating name with empty health_system_id', () => {
		const validInput = {
			name: 'Updated Hospital',
			health_system_id: ''
		};

		const result = updateSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('allows updating health_system_id only', () => {
		const validInput = {
			health_system_id: 'clq1234567890123456789'
		};

		const result = updateSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('allows updating address with empty health_system_id', () => {
		const validInput = {
			address: '456 New Ave',
			health_system_id: ''
		};

		const result = updateSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('allows updating all fields', () => {
		const validInput = {
			name: 'Updated Hospital',
			health_system_id: 'clq1234567890123456789',
			address: '456 New Ave'
		};

		const result = updateSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('requires health_system_id field', () => {
		const invalidInput = {
			name: 'Updated Hospital'
		};

		const result = updateSiteSchema.safeParse(invalidInput);
		// health_system_id is required as a string input (even if empty)
		expect(result.success).toBe(false);
	});

	it('validates name format when provided', () => {
		const invalidInput = {
			name: 'A',
			health_system_id: ''
		};

		const result = updateSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('validates health_system_id format when provided', () => {
		const invalidInput = {
			health_system_id: 'not-a-cuid'
		};

		const result = updateSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('transforms empty address to undefined', () => {
		const validInput = {
			name: 'Test Site',
			health_system_id: '',
			address: ''
		};

		const result = updateSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.address).toBeUndefined();
		}
	});

	it('allows partial updates with name and address', () => {
		const validInput = {
			name: 'Updated Name',
			health_system_id: '',
			address: 'Updated Address'
		};

		const result = updateSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});
});

describe('siteIdSchema', () => {
	it('validates valid CUID2', () => {
		const validInput = {
			id: 'clq1234567890123456789'
		};

		const result = siteIdSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects invalid CUID2 format', () => {
		const invalidInput = {
			id: 'not-a-cuid'
		};

		const result = siteIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects empty string', () => {
		const invalidInput = {
			id: ''
		};

		const result = siteIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires id field', () => {
		const invalidInput = {};

		const result = siteIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects too short string', () => {
		const invalidInput = {
			id: 'abc123'
		};

		const result = siteIdSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});

describe('clerkshipSiteSchema', () => {
	it('validates valid input', () => {
		const validInput = {
			clerkship_id: 'clq1234567890123456789',
			site_id: 'clq9876543210987654321'
		};

		const result = clerkshipSiteSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('requires clerkship_id', () => {
		const invalidInput = {
			site_id: 'clq9876543210987654321'
		};

		const result = clerkshipSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires site_id', () => {
		const invalidInput = {
			clerkship_id: 'clq1234567890123456789'
		};

		const result = clerkshipSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects invalid clerkship_id format', () => {
		const invalidInput = {
			clerkship_id: 'not-a-uuid',
			site_id: 'clq9876543210987654321'
		};

		const result = clerkshipSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects invalid site_id format', () => {
		const invalidInput = {
			clerkship_id: 'clq1234567890123456789',
			site_id: 'not-a-uuid'
		};

		const result = clerkshipSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects empty clerkship_id', () => {
		const invalidInput = {
			clerkship_id: '',
			site_id: 'clq9876543210987654321'
		};

		const result = clerkshipSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects empty site_id', () => {
		const invalidInput = {
			clerkship_id: 'clq1234567890123456789',
			site_id: ''
		};

		const result = clerkshipSiteSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});

describe('siteElectiveSchema', () => {
	it('validates valid input', () => {
		const validInput = {
			site_id: 'clq1234567890123456789',
			elective_requirement_id: 'clq9876543210987654321'
		};

		const result = siteElectiveSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('requires site_id', () => {
		const invalidInput = {
			elective_requirement_id: 'clq9876543210987654321'
		};

		const result = siteElectiveSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires elective_requirement_id', () => {
		const invalidInput = {
			site_id: 'clq1234567890123456789'
		};

		const result = siteElectiveSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects invalid site_id format', () => {
		const invalidInput = {
			site_id: 'not-a-uuid',
			elective_requirement_id: 'clq9876543210987654321'
		};

		const result = siteElectiveSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects invalid elective_requirement_id format', () => {
		const invalidInput = {
			site_id: 'clq1234567890123456789',
			elective_requirement_id: 'not-a-uuid'
		};

		const result = siteElectiveSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});

describe('siteCapacityRuleSchema', () => {
	it('validates valid input with all required fields', () => {
		const validInput = {
			site_id: 'clq1234567890123456789',
			max_students_per_day: 5
		};

		const result = siteCapacityRuleSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates with optional clerkship_id', () => {
		const validInput = {
			site_id: 'clq1234567890123456789',
			clerkship_id: 'clq9876543210987654321',
			max_students_per_day: 5
		};

		const result = siteCapacityRuleSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('validates with optional requirement_type', () => {
		const validInput = {
			site_id: 'clq1234567890123456789',
			requirement_type: 'inpatient',
			max_students_per_day: 5
		};

		const result = siteCapacityRuleSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('accepts all valid requirement_type values', () => {
		const types = ['inpatient', 'outpatient', 'elective'];

		types.forEach((type) => {
			const validInput = {
				site_id: 'clq1234567890123456789',
				requirement_type: type,
				max_students_per_day: 5
			};

			const result = siteCapacityRuleSchema.safeParse(validInput);
			expect(result.success).toBe(true);
		});
	});

	it('rejects invalid requirement_type', () => {
		const invalidInput = {
			site_id: 'clq1234567890123456789',
			requirement_type: 'invalid',
			max_students_per_day: 5
		};

		const result = siteCapacityRuleSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('validates with all optional fields', () => {
		const validInput = {
			site_id: 'clq1234567890123456789',
			clerkship_id: 'clq9876543210987654321',
			requirement_type: 'outpatient',
			max_students_per_day: 5,
			max_students_per_year: 100,
			max_students_per_block: 20,
			max_blocks_per_year: 5
		};

		const result = siteCapacityRuleSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('requires site_id', () => {
		const invalidInput = {
			max_students_per_day: 5
		};

		const result = siteCapacityRuleSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('requires max_students_per_day', () => {
		const invalidInput = {
			site_id: 'clq1234567890123456789'
		};

		const result = siteCapacityRuleSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects zero max_students_per_day', () => {
		const invalidInput = {
			site_id: 'clq1234567890123456789',
			max_students_per_day: 0
		};

		const result = siteCapacityRuleSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects negative max_students_per_day', () => {
		const invalidInput = {
			site_id: 'clq1234567890123456789',
			max_students_per_day: -5
		};

		const result = siteCapacityRuleSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects non-integer max_students_per_day', () => {
		const invalidInput = {
			site_id: 'clq1234567890123456789',
			max_students_per_day: 5.5
		};

		const result = siteCapacityRuleSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects zero max_students_per_year', () => {
		const invalidInput = {
			site_id: 'clq1234567890123456789',
			max_students_per_day: 5,
			max_students_per_year: 0
		};

		const result = siteCapacityRuleSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects negative max_students_per_year', () => {
		const invalidInput = {
			site_id: 'clq1234567890123456789',
			max_students_per_day: 5,
			max_students_per_year: -100
		};

		const result = siteCapacityRuleSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects zero max_students_per_block', () => {
		const invalidInput = {
			site_id: 'clq1234567890123456789',
			max_students_per_day: 5,
			max_students_per_block: 0
		};

		const result = siteCapacityRuleSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects zero max_blocks_per_year', () => {
		const invalidInput = {
			site_id: 'clq1234567890123456789',
			max_students_per_day: 5,
			max_blocks_per_year: 0
		};

		const result = siteCapacityRuleSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('accepts null for optional nullable fields', () => {
		const validInput = {
			site_id: 'clq1234567890123456789',
			clerkship_id: null,
			requirement_type: null,
			max_students_per_day: 5,
			max_students_per_year: null,
			max_students_per_block: null,
			max_blocks_per_year: null
		};

		const result = siteCapacityRuleSchema.safeParse(validInput);
		expect(result.success).toBe(true);
	});

	it('rejects invalid site_id format', () => {
		const invalidInput = {
			site_id: 'not-a-uuid',
			max_students_per_day: 5
		};

		const result = siteCapacityRuleSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});

	it('rejects invalid clerkship_id format', () => {
		const invalidInput = {
			site_id: 'clq1234567890123456789',
			clerkship_id: 'not-a-uuid',
			max_students_per_day: 5
		};

		const result = siteCapacityRuleSchema.safeParse(invalidInput);
		expect(result.success).toBe(false);
	});
});
