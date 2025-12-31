/**
 * ElectiveService Tests
 *
 * Comprehensive tests for elective CRUD and association operations.
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
	let testRequirementId: string;
	let testSiteId: string;
	let testPreceptorId: string;
	let testHealthSystemId: string;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		service = new ElectiveService(db);

		// Create test data
		testHealthSystemId = nanoid();
		testClerkshipId = nanoid();
		testRequirementId = nanoid();
		testSiteId = nanoid();
		testPreceptorId = nanoid();

		// Insert health system
		await db
			.insertInto('health_systems')
			.values({
				id: testHealthSystemId,
				name: 'Test Health System',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.execute();

		// Insert site
		await db
			.insertInto('sites')
			.values({
				id: testSiteId,
				health_system_id: testHealthSystemId,
				name: 'Test Site',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.execute();

		// Insert preceptor
		await db
			.insertInto('preceptors')
			.values({
				id: testPreceptorId,
				name: 'Dr. Test',
				email: 'test@example.com',
				max_students: 2,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.execute();

		// Insert clerkship
		await db
			.insertInto('clerkships')
			.values({
				id: testClerkshipId,
				name: 'Test Clerkship',
				description: 'Test Description',
				clerkship_type: 'outpatient',
				required_days: 40,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.execute();

		// Insert elective requirement
		await db
			.insertInto('clerkship_requirements')
			.values({
				id: testRequirementId,
				clerkship_id: testClerkshipId,
				requirement_type: 'elective',
				required_days: 20,
				override_mode: 'inherit',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.execute();
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	// ========================================
	// CRUD Operations Tests
	// ========================================

	describe('createElective', () => {
		it('should create an elective with basic fields', async () => {
			const result = await service.createElective(testRequirementId, {
				name: 'Cardiology Elective',
				minimumDays: 10,
			});

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data).toBeDefined();
			expect(result.data.name).toBe('Cardiology Elective');
			expect(result.data.minimumDays).toBe(10);
			expect(result.data.isRequired).toBe(true); // default
			expect(result.data.requirementId).toBe(testRequirementId);
		});

		it('should create an elective with isRequired=false', async () => {
			const result = await service.createElective(testRequirementId, {
				name: 'Optional Elective',
				minimumDays: 5,
				isRequired: false,
			});

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data.isRequired).toBe(false);
		});

		it('should create an elective with specialty', async () => {
			const result = await service.createElective(testRequirementId, {
				name: 'Specialty Elective',
				minimumDays: 10,
				specialty: 'Cardiology',
			});

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data.specialty).toBe('Cardiology');
		});

		it('should create an elective with sites and preceptors', async () => {
			const result = await service.createElective(testRequirementId, {
				name: 'Full Elective',
				minimumDays: 10,
				siteIds: [testSiteId],
				preceptorIds: [testPreceptorId],
			});

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');

			// Verify sites were added
			const sitesResult = await service.getSitesForElective(result.data.id);
			expect(sitesResult.success).toBe(true);
			if (!sitesResult.success) throw new Error('Expected success');
			expect(sitesResult.data).toHaveLength(1);
			expect(sitesResult.data[0].id).toBe(testSiteId);

			// Verify preceptors were added
			const preceptorsResult = await service.getPreceptorsForElective(result.data.id);
			expect(preceptorsResult.success).toBe(true);
			if (!preceptorsResult.success) throw new Error('Expected success');
			expect(preceptorsResult.data).toHaveLength(1);
			expect(preceptorsResult.data[0].id).toBe(testPreceptorId);
		});

		it('should reject elective if requirement not found', async () => {
			const result = await service.createElective('non-existent', {
				name: 'Test Elective',
				minimumDays: 10,
			});

			expect(result.success).toBe(false);
			if (result.success) throw new Error('Expected failure');
			expect(result.error.code).toBe('NOT_FOUND');
		});

		it('should reject elective if requirement is not elective type', async () => {
			// Create an outpatient requirement
			const outpatientReqId = nanoid();
			await db
				.insertInto('clerkship_requirements')
				.values({
					id: outpatientReqId,
					clerkship_id: testClerkshipId,
					requirement_type: 'outpatient',
					required_days: 20,
					override_mode: 'inherit',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.execute();

			const result = await service.createElective(outpatientReqId, {
				name: 'Test Elective',
				minimumDays: 10,
			});

			expect(result.success).toBe(false);
			if (result.success) throw new Error('Expected failure');
			expect(result.error.message).toContain('elective requirements');
		});

		it('should reject elective if minimumDays exceeds requirement total', async () => {
			const result = await service.createElective(testRequirementId, {
				name: 'Test Elective',
				minimumDays: 25, // exceeds 20 days in requirement
			});

			expect(result.success).toBe(false);
			if (result.success) throw new Error('Expected failure');
			expect(result.error.message).toContain('cannot exceed');
		});

		it('should reject invalid input data', async () => {
			const result = await service.createElective(testRequirementId, {
				name: '', // empty name
				minimumDays: 10,
			});

			expect(result.success).toBe(false);
			if (result.success) throw new Error('Expected failure');
			expect(result.error.code).toBe('VALIDATION_ERROR');
		});
	});

	describe('getElective', () => {
		it('should return elective by ID', async () => {
			const createResult = await service.createElective(testRequirementId, {
				name: 'Test Elective',
				minimumDays: 10,
			});
			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');

			const result = await service.getElective(createResult.data.id);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data).toBeDefined();
			if (!result.data) throw new Error('Expected data');
			expect(result.data.name).toBe('Test Elective');
		});

		it('should return null for non-existent elective', async () => {
			const result = await service.getElective('non-existent');

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data).toBeNull();
		});
	});

	describe('getElectiveWithDetails', () => {
		it('should return elective with sites and preceptors', async () => {
			const createResult = await service.createElective(testRequirementId, {
				name: 'Test Elective',
				minimumDays: 10,
				siteIds: [testSiteId],
				preceptorIds: [testPreceptorId],
			});
			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');

			const result = await service.getElectiveWithDetails(createResult.data.id);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data).toBeDefined();
			if (!result.data) throw new Error('Expected data');
			expect(result.data.sites).toHaveLength(1);
			expect(result.data.sites[0].name).toBe('Test Site');
			expect(result.data.preceptors).toHaveLength(1);
			expect(result.data.preceptors[0].name).toBe('Dr. Test');
		});

		it('should return null for non-existent elective', async () => {
			const result = await service.getElectiveWithDetails('non-existent');

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data).toBeNull();
		});
	});

	describe('getElectivesByRequirement', () => {
		it('should return all electives for a requirement', async () => {
			await service.createElective(testRequirementId, {
				name: 'Elective 1',
				minimumDays: 5,
			});
			await service.createElective(testRequirementId, {
				name: 'Elective 2',
				minimumDays: 10,
			});

			const result = await service.getElectivesByRequirement(testRequirementId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data).toHaveLength(2);
		});

		it('should return empty array if no electives', async () => {
			const result = await service.getElectivesByRequirement(testRequirementId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data).toHaveLength(0);
		});
	});

	describe('getRequiredElectives', () => {
		it('should return only required electives', async () => {
			await service.createElective(testRequirementId, {
				name: 'Required Elective',
				minimumDays: 5,
				isRequired: true,
			});
			await service.createElective(testRequirementId, {
				name: 'Optional Elective',
				minimumDays: 10,
				isRequired: false,
			});

			const result = await service.getRequiredElectives(testRequirementId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data).toHaveLength(1);
			expect(result.data[0].name).toBe('Required Elective');
		});
	});

	describe('getOptionalElectives', () => {
		it('should return only optional electives', async () => {
			await service.createElective(testRequirementId, {
				name: 'Required Elective',
				minimumDays: 5,
				isRequired: true,
			});
			await service.createElective(testRequirementId, {
				name: 'Optional Elective',
				minimumDays: 10,
				isRequired: false,
			});

			const result = await service.getOptionalElectives(testRequirementId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data).toHaveLength(1);
			expect(result.data[0].name).toBe('Optional Elective');
		});
	});

	describe('getElectivesByClerkship', () => {
		it('should return all electives for a clerkship', async () => {
			// Create a second requirement for the same clerkship
			const secondReqId = nanoid();
			await db
				.insertInto('clerkship_requirements')
				.values({
					id: secondReqId,
					clerkship_id: testClerkshipId,
					requirement_type: 'elective',
					required_days: 15,
					override_mode: 'inherit',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.execute();

			await service.createElective(testRequirementId, {
				name: 'Elective 1',
				minimumDays: 5,
			});
			await service.createElective(secondReqId, {
				name: 'Elective 2',
				minimumDays: 10,
			});

			const result = await service.getElectivesByClerkship(testClerkshipId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data).toHaveLength(2);
		});
	});

	describe('updateElective', () => {
		it('should update elective name', async () => {
			const createResult = await service.createElective(testRequirementId, {
				name: 'Original Name',
				minimumDays: 10,
			});
			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');

			const result = await service.updateElective(createResult.data.id, {
				name: 'Updated Name',
			});

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data.name).toBe('Updated Name');
		});

		it('should update isRequired flag', async () => {
			const createResult = await service.createElective(testRequirementId, {
				name: 'Test Elective',
				minimumDays: 10,
				isRequired: true,
			});
			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');

			const result = await service.updateElective(createResult.data.id, {
				isRequired: false,
			});

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data.isRequired).toBe(false);
		});

		it('should update sites and preceptors', async () => {
			const createResult = await service.createElective(testRequirementId, {
				name: 'Test Elective',
				minimumDays: 10,
			});
			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');

			const result = await service.updateElective(createResult.data.id, {
				siteIds: [testSiteId],
				preceptorIds: [testPreceptorId],
			});

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');

			const sitesResult = await service.getSitesForElective(createResult.data.id);
			expect(sitesResult.success).toBe(true);
			if (!sitesResult.success) throw new Error('Expected success');
			expect(sitesResult.data).toHaveLength(1);

			const preceptorsResult = await service.getPreceptorsForElective(createResult.data.id);
			expect(preceptorsResult.success).toBe(true);
			if (!preceptorsResult.success) throw new Error('Expected success');
			expect(preceptorsResult.data).toHaveLength(1);
		});

		it('should reject update if elective not found', async () => {
			const result = await service.updateElective('non-existent', {
				name: 'Updated Name',
			});

			expect(result.success).toBe(false);
			if (result.success) throw new Error('Expected failure');
			expect(result.error.code).toBe('NOT_FOUND');
		});

		it('should reject update if minimumDays exceeds requirement total', async () => {
			const createResult = await service.createElective(testRequirementId, {
				name: 'Test Elective',
				minimumDays: 10,
			});
			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');

			const result = await service.updateElective(createResult.data.id, {
				minimumDays: 25, // exceeds 20 days
			});

			expect(result.success).toBe(false);
			if (result.success) throw new Error('Expected failure');
			expect(result.error.message).toContain('cannot exceed');
		});
	});

	describe('deleteElective', () => {
		it('should delete an elective', async () => {
			const createResult = await service.createElective(testRequirementId, {
				name: 'Test Elective',
				minimumDays: 10,
			});
			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');

			const result = await service.deleteElective(createResult.data.id);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');

			// Verify it's deleted
			const getResult = await service.getElective(createResult.data.id);
			expect(getResult.success).toBe(true);
			if (!getResult.success) throw new Error('Expected success');
			expect(getResult.data).toBeNull();
		});

		it('should reject delete if elective not found', async () => {
			const result = await service.deleteElective('non-existent');

			expect(result.success).toBe(false);
			if (result.success) throw new Error('Expected failure');
			expect(result.error.code).toBe('NOT_FOUND');
		});

		it('should cascade delete site and preceptor associations', async () => {
			const createResult = await service.createElective(testRequirementId, {
				name: 'Test Elective',
				minimumDays: 10,
				siteIds: [testSiteId],
				preceptorIds: [testPreceptorId],
			});
			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');

			await service.deleteElective(createResult.data.id);

			// Verify associations are gone
			const electiveSites = await db
				.selectFrom('elective_sites')
				.selectAll()
				.where('elective_id', '=', createResult.data.id)
				.execute();
			expect(electiveSites).toHaveLength(0);

			const electivePreceptors = await db
				.selectFrom('elective_preceptors')
				.selectAll()
				.where('elective_id', '=', createResult.data.id)
				.execute();
			expect(electivePreceptors).toHaveLength(0);
		});
	});

	// ========================================
	// Site Association Tests
	// ========================================

	describe('site associations', () => {
		let electiveId: string;

		beforeEach(async () => {
			const result = await service.createElective(testRequirementId, {
				name: 'Test Elective',
				minimumDays: 10,
			});
			if (!result.success) throw new Error('Expected success');
			electiveId = result.data.id;
		});

		it('should add a site to an elective', async () => {
			const result = await service.addSiteToElective(electiveId, testSiteId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');

			const sitesResult = await service.getSitesForElective(electiveId);
			expect(sitesResult.success).toBe(true);
			if (!sitesResult.success) throw new Error('Expected success');
			expect(sitesResult.data).toHaveLength(1);
			expect(sitesResult.data[0].id).toBe(testSiteId);
		});

		it('should not fail when adding the same site twice', async () => {
			await service.addSiteToElective(electiveId, testSiteId);
			const result = await service.addSiteToElective(electiveId, testSiteId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');

			const sitesResult = await service.getSitesForElective(electiveId);
			expect(sitesResult.success).toBe(true);
			if (!sitesResult.success) throw new Error('Expected success');
			expect(sitesResult.data).toHaveLength(1);
		});

		it('should remove a site from an elective', async () => {
			await service.addSiteToElective(electiveId, testSiteId);
			const result = await service.removeSiteFromElective(electiveId, testSiteId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');

			const sitesResult = await service.getSitesForElective(electiveId);
			expect(sitesResult.success).toBe(true);
			if (!sitesResult.success) throw new Error('Expected success');
			expect(sitesResult.data).toHaveLength(0);
		});

		it('should set all sites for an elective', async () => {
			// Create another site
			const secondSiteId = nanoid();
			await db
				.insertInto('sites')
				.values({
					id: secondSiteId,
					health_system_id: testHealthSystemId,
					name: 'Second Site',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.execute();

			// Add first site
			await service.addSiteToElective(electiveId, testSiteId);

			// Replace with second site
			const result = await service.setSitesForElective(electiveId, [secondSiteId]);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');

			const sitesResult = await service.getSitesForElective(electiveId);
			expect(sitesResult.success).toBe(true);
			if (!sitesResult.success) throw new Error('Expected success');
			expect(sitesResult.data).toHaveLength(1);
			expect(sitesResult.data[0].id).toBe(secondSiteId);
		});

		it('should reject adding site to non-existent elective', async () => {
			const result = await service.addSiteToElective('non-existent', testSiteId);

			expect(result.success).toBe(false);
			if (result.success) throw new Error('Expected failure');
			expect(result.error.code).toBe('NOT_FOUND');
		});

		it('should reject adding non-existent site', async () => {
			const result = await service.addSiteToElective(electiveId, 'non-existent');

			expect(result.success).toBe(false);
			if (result.success) throw new Error('Expected failure');
			expect(result.error.code).toBe('NOT_FOUND');
		});
	});

	// ========================================
	// Preceptor Association Tests
	// ========================================

	describe('preceptor associations', () => {
		let electiveId: string;

		beforeEach(async () => {
			const result = await service.createElective(testRequirementId, {
				name: 'Test Elective',
				minimumDays: 10,
			});
			if (!result.success) throw new Error('Expected success');
			electiveId = result.data.id;
		});

		it('should add a preceptor to an elective', async () => {
			const result = await service.addPreceptorToElective(electiveId, testPreceptorId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');

			const preceptorsResult = await service.getPreceptorsForElective(electiveId);
			expect(preceptorsResult.success).toBe(true);
			if (!preceptorsResult.success) throw new Error('Expected success');
			expect(preceptorsResult.data).toHaveLength(1);
			expect(preceptorsResult.data[0].id).toBe(testPreceptorId);
		});

		it('should not fail when adding the same preceptor twice', async () => {
			await service.addPreceptorToElective(electiveId, testPreceptorId);
			const result = await service.addPreceptorToElective(electiveId, testPreceptorId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');

			const preceptorsResult = await service.getPreceptorsForElective(electiveId);
			expect(preceptorsResult.success).toBe(true);
			if (!preceptorsResult.success) throw new Error('Expected success');
			expect(preceptorsResult.data).toHaveLength(1);
		});

		it('should remove a preceptor from an elective', async () => {
			await service.addPreceptorToElective(electiveId, testPreceptorId);
			const result = await service.removePreceptorFromElective(electiveId, testPreceptorId);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');

			const preceptorsResult = await service.getPreceptorsForElective(electiveId);
			expect(preceptorsResult.success).toBe(true);
			if (!preceptorsResult.success) throw new Error('Expected success');
			expect(preceptorsResult.data).toHaveLength(0);
		});

		it('should set all preceptors for an elective', async () => {
			// Create another preceptor
			const secondPreceptorId = nanoid();
			await db
				.insertInto('preceptors')
				.values({
					id: secondPreceptorId,
					name: 'Dr. Second',
					email: 'second@example.com',
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.execute();

			// Add first preceptor
			await service.addPreceptorToElective(electiveId, testPreceptorId);

			// Replace with second preceptor
			const result = await service.setPreceptorsForElective(electiveId, [secondPreceptorId]);

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');

			const preceptorsResult = await service.getPreceptorsForElective(electiveId);
			expect(preceptorsResult.success).toBe(true);
			if (!preceptorsResult.success) throw new Error('Expected success');
			expect(preceptorsResult.data).toHaveLength(1);
			expect(preceptorsResult.data[0].id).toBe(secondPreceptorId);
		});

		it('should reject adding preceptor to non-existent elective', async () => {
			const result = await service.addPreceptorToElective('non-existent', testPreceptorId);

			expect(result.success).toBe(false);
			if (result.success) throw new Error('Expected failure');
			expect(result.error.code).toBe('NOT_FOUND');
		});

		it('should reject adding non-existent preceptor', async () => {
			const result = await service.addPreceptorToElective(electiveId, 'non-existent');

			expect(result.success).toBe(false);
			if (result.success) throw new Error('Expected failure');
			expect(result.error.code).toBe('NOT_FOUND');
		});
	});

	// ========================================
	// Edge Cases
	// ========================================

	describe('edge cases', () => {
		it('should handle elective with many sites and preceptors', async () => {
			// Create multiple sites and preceptors
			const siteIds: string[] = [];
			const preceptorIds: string[] = [];

			for (let i = 0; i < 5; i++) {
				const siteId = nanoid();
				await db
					.insertInto('sites')
					.values({
						id: siteId,
						health_system_id: testHealthSystemId,
						name: `Site ${i}`,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
					})
					.execute();
				siteIds.push(siteId);

				const preceptorId = nanoid();
				await db
					.insertInto('preceptors')
					.values({
						id: preceptorId,
						name: `Dr. ${i}`,
						email: `dr${i}@example.com`,
						max_students: 2,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
					})
					.execute();
				preceptorIds.push(preceptorId);
			}

			const result = await service.createElective(testRequirementId, {
				name: 'Large Elective',
				minimumDays: 10,
				siteIds,
				preceptorIds,
			});

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');

			const sitesResult = await service.getSitesForElective(result.data.id);
			expect(sitesResult.success).toBe(true);
			if (!sitesResult.success) throw new Error('Expected success');
			expect(sitesResult.data).toHaveLength(5);

			const preceptorsResult = await service.getPreceptorsForElective(result.data.id);
			expect(preceptorsResult.success).toBe(true);
			if (!preceptorsResult.success) throw new Error('Expected success');
			expect(preceptorsResult.data).toHaveLength(5);
		});

		it('should handle clearing all sites', async () => {
			const createResult = await service.createElective(testRequirementId, {
				name: 'Test Elective',
				minimumDays: 10,
				siteIds: [testSiteId],
			});
			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');

			await service.setSitesForElective(createResult.data.id, []);

			const sitesResult = await service.getSitesForElective(createResult.data.id);
			expect(sitesResult.success).toBe(true);
			if (!sitesResult.success) throw new Error('Expected success');
			expect(sitesResult.data).toHaveLength(0);
		});

		it('should handle clearing all preceptors', async () => {
			const createResult = await service.createElective(testRequirementId, {
				name: 'Test Elective',
				minimumDays: 10,
				preceptorIds: [testPreceptorId],
			});
			expect(createResult.success).toBe(true);
			if (!createResult.success) throw new Error('Expected success');

			await service.setPreceptorsForElective(createResult.data.id, []);

			const preceptorsResult = await service.getPreceptorsForElective(createResult.data.id);
			expect(preceptorsResult.success).toBe(true);
			if (!preceptorsResult.success) throw new Error('Expected success');
			expect(preceptorsResult.data).toHaveLength(0);
		});

		it('should handle elective at minimum days boundary', async () => {
			const result = await service.createElective(testRequirementId, {
				name: 'Boundary Elective',
				minimumDays: 20, // exactly at requirement limit
			});

			expect(result.success).toBe(true);
			if (!result.success) throw new Error('Expected success');
			expect(result.data.minimumDays).toBe(20);
		});
	});
});
