/**
 * ElectiveService Tests
 *
 * Comprehensive tests for elective CRUD and association operations.
 *
 * NOTE: Updated for the new model where electives link directly to clerkships
 * via clerkship_id instead of requirement_id.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { ElectiveService } from './electives.service';
import { nanoid } from 'nanoid';

describe('ElectiveService', () => {
	let db: Kysely<DB>;
	let service: ElectiveService;
	let testClerkshipId: string;
	let testSiteId: string;
	let testPreceptorId: string;
	let testHealthSystemId: string;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		service = new ElectiveService(db);

		// Create test data
		testHealthSystemId = nanoid();
		testClerkshipId = nanoid();
		testSiteId = nanoid();
		testPreceptorId = nanoid();

		// Insert health system
		await db
			.insertInto('health_systems')
			.values({
				id: testHealthSystemId,
				name: 'Test Health System'
			})
			.execute();

		// Insert site
		await db
			.insertInto('sites')
			.values({
				id: testSiteId,
				health_system_id: testHealthSystemId,
				name: 'Test Site'
			})
			.execute();

		// Insert preceptor and associate with site
		await db
			.insertInto('preceptors')
			.values({
				id: testPreceptorId,
				name: 'Dr. Test',
				email: 'test@example.com',
				max_students: 2
			})
			.execute();

		await db
			.insertInto('preceptor_sites')
			.values({
				preceptor_id: testPreceptorId,
				site_id: testSiteId
			})
			.execute();

		// Insert clerkship with 40 required days
		await db
			.insertInto('clerkships')
			.values({
				id: testClerkshipId,
				name: 'Test Clerkship',
				description: 'Test Description',
				clerkship_type: 'outpatient',
				required_days: 40
			})
			.execute();
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	describe('createElective', () => {
		it('should create a new elective linked to clerkship', async () => {
			const result = await service.createElective(testClerkshipId, {
				name: 'Cardiology Elective',
				specialty: 'Cardiology',
				minimumDays: 10,
				isRequired: true
			});

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.data.name).toBe('Cardiology Elective');
			expect(result.data.specialty).toBe('Cardiology');
			expect(result.data.minimumDays).toBe(10);
			expect(result.data.isRequired).toBe(true);
			expect(result.data.clerkshipId).toBe(testClerkshipId);
		});

		it('should reject elective if days exceed remaining', async () => {
			// Create first elective with 35 days
			const result1 = await service.createElective(testClerkshipId, {
				name: 'First Elective',
				minimumDays: 35,
				isRequired: true
			});
			expect(result1.success).toBe(true);

			// Try to create second elective that would exceed 40 days
			const result2 = await service.createElective(testClerkshipId, {
				name: 'Second Elective',
				minimumDays: 10, // Would make total 45 days
				isRequired: true
			});

			expect(result2.success).toBe(false);
			if (!result2.success) {
				expect(result2.error.message).toContain('exceed');
			}
		});
	});

	describe('getElectivesByClerkship', () => {
		it('should return all electives for a clerkship', async () => {
			// Create two electives
			await service.createElective(testClerkshipId, {
				name: 'Elective A',
				minimumDays: 10,
				isRequired: true
			});
			await service.createElective(testClerkshipId, {
				name: 'Elective B',
				minimumDays: 15,
				isRequired: false
			});

			const result = await service.getElectivesByClerkship(testClerkshipId);

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.data.length).toBe(2);
			expect(result.data.some((e) => e.name === 'Elective A')).toBe(true);
			expect(result.data.some((e) => e.name === 'Elective B')).toBe(true);
		});

		it('should return empty array for clerkship with no electives', async () => {
			const result = await service.getElectivesByClerkship(testClerkshipId);

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.data).toEqual([]);
		});
	});

	describe('getElectiveDaysSummary', () => {
		it('should return correct days summary', async () => {
			// Create electives totaling 25 days
			await service.createElective(testClerkshipId, {
				name: 'Elective A',
				minimumDays: 10,
				isRequired: true
			});
			await service.createElective(testClerkshipId, {
				name: 'Elective B',
				minimumDays: 15,
				isRequired: true
			});

			const result = await service.getElectiveDaysSummary(testClerkshipId);

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.data.clerkshipRequiredDays).toBe(40);
			expect(result.data.totalElectiveDays).toBe(25);
			expect(result.data.nonElectiveDays).toBe(15);
			expect(result.data.remainingDays).toBe(15);
		});
	});

	describe('updateElective', () => {
		it('should update elective properties', async () => {
			const createResult = await service.createElective(testClerkshipId, {
				name: 'Original Name',
				minimumDays: 10,
				isRequired: false
			});
			expect(createResult.success).toBe(true);
			if (!createResult.success) return;

			const updateResult = await service.updateElective(createResult.data.id, {
				name: 'Updated Name',
				minimumDays: 15
			});

			expect(updateResult.success).toBe(true);
			if (!updateResult.success) return;

			expect(updateResult.data.name).toBe('Updated Name');
			expect(updateResult.data.minimumDays).toBe(15);
		});

		it('should reject update if new days would exceed limit', async () => {
			// Create electives totaling 35 days
			await service.createElective(testClerkshipId, {
				name: 'Other Elective',
				minimumDays: 25,
				isRequired: true
			});

			const electiveResult = await service.createElective(testClerkshipId, {
				name: 'Target Elective',
				minimumDays: 10,
				isRequired: true
			});
			expect(electiveResult.success).toBe(true);
			if (!electiveResult.success) return;

			// Try to update to 20 days which would exceed 40 total
			const updateResult = await service.updateElective(electiveResult.data.id, {
				minimumDays: 20
			});

			expect(updateResult.success).toBe(false);
		});
	});

	describe('deleteElective', () => {
		it('should delete elective and associations', async () => {
			// Create elective
			const createResult = await service.createElective(testClerkshipId, {
				name: 'To Delete',
				minimumDays: 10,
				isRequired: true
			});
			expect(createResult.success).toBe(true);
			if (!createResult.success) return;

			// Add site association
			await service.addSiteToElective(createResult.data.id, testSiteId);

			// Delete elective
			const deleteResult = await service.deleteElective(createResult.data.id);
			expect(deleteResult.success).toBe(true);

			// Verify elective is gone
			const getResult = await service.getElective(createResult.data.id);
			expect(getResult.success).toBe(true);
			if (getResult.success) {
				expect(getResult.data).toBeNull();
			}

			// Verify site association is gone
			const siteAssoc = await db
				.selectFrom('elective_sites')
				.selectAll()
				.where('elective_id', '=', createResult.data.id)
				.execute();
			expect(siteAssoc.length).toBe(0);
		});
	});

	describe('Site Associations', () => {
		it('should add site to elective', async () => {
			const electiveResult = await service.createElective(testClerkshipId, {
				name: 'Test Elective',
				minimumDays: 10,
				isRequired: true
			});
			expect(electiveResult.success).toBe(true);
			if (!electiveResult.success) return;

			const addResult = await service.addSiteToElective(electiveResult.data.id, testSiteId);
			expect(addResult.success).toBe(true);

			// Verify association exists
			const assoc = await db
				.selectFrom('elective_sites')
				.selectAll()
				.where('elective_id', '=', electiveResult.data.id)
				.where('site_id', '=', testSiteId)
				.execute();
			expect(assoc.length).toBe(1);
		});

		it('should remove site from elective', async () => {
			const electiveResult = await service.createElective(testClerkshipId, {
				name: 'Test Elective',
				minimumDays: 10,
				isRequired: true
			});
			expect(electiveResult.success).toBe(true);
			if (!electiveResult.success) return;

			// Add then remove
			await service.addSiteToElective(electiveResult.data.id, testSiteId);
			const removeResult = await service.removeSiteFromElective(electiveResult.data.id, testSiteId);
			expect(removeResult.success).toBe(true);

			// Verify association removed
			const assoc = await db
				.selectFrom('elective_sites')
				.selectAll()
				.where('elective_id', '=', electiveResult.data.id)
				.where('site_id', '=', testSiteId)
				.execute();
			expect(assoc.length).toBe(0);
		});
	});

	describe('Preceptor Associations', () => {
		it('should add preceptor to elective', async () => {
			const electiveResult = await service.createElective(testClerkshipId, {
				name: 'Test Elective',
				minimumDays: 10,
				isRequired: true
			});
			expect(electiveResult.success).toBe(true);
			if (!electiveResult.success) return;

			// First add site (preceptors must be at associated sites)
			await service.addSiteToElective(electiveResult.data.id, testSiteId);

			// Now add preceptor
			const addResult = await service.addPreceptorToElective(electiveResult.data.id, testPreceptorId);
			expect(addResult.success).toBe(true);

			// Verify association exists
			const assoc = await db
				.selectFrom('elective_preceptors')
				.selectAll()
				.where('elective_id', '=', electiveResult.data.id)
				.where('preceptor_id', '=', testPreceptorId)
				.execute();
			expect(assoc.length).toBe(1);
		});
	});

	describe('getAvailablePreceptorsForElective', () => {
		it('should return preceptors at elective sites only', async () => {
			// Create another site with another preceptor
			const otherSiteId = nanoid();
			const otherPreceptorId = nanoid();

			await db
				.insertInto('sites')
				.values({
					id: otherSiteId,
					health_system_id: testHealthSystemId,
					name: 'Other Site'
				})
				.execute();

			await db
				.insertInto('preceptors')
				.values({
					id: otherPreceptorId,
					name: 'Dr. Other',
					email: 'other@example.com',
					max_students: 2
				})
				.execute();

			await db
				.insertInto('preceptor_sites')
				.values({
					preceptor_id: otherPreceptorId,
					site_id: otherSiteId
				})
				.execute();

			// Create elective with only testSiteId
			const electiveResult = await service.createElective(testClerkshipId, {
				name: 'Test Elective',
				minimumDays: 10,
				isRequired: true
			});
			expect(electiveResult.success).toBe(true);
			if (!electiveResult.success) return;

			await service.addSiteToElective(electiveResult.data.id, testSiteId);

			// Get available preceptors - should only include testPreceptorId
			const result = await service.getAvailablePreceptorsForElective(electiveResult.data.id);
			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.data.length).toBe(1);
			expect(result.data[0].id).toBe(testPreceptorId);
		});
	});
});
