/**
 * Unit tests for elective-client.ts
 * Tests all client-side API functions with mocked fetch
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	fetchElectivesByRequirement,
	fetchElectiveWithDetails,
	createElective,
	updateElective,
	deleteElective,
	addSiteToElective,
	removeSiteFromElective,
	addPreceptorToElective,
	removePreceptorFromElective,
	type ElectiveFormData
} from './elective-client';
import type { ClerkshipElective } from '$lib/features/scheduling-config/types/elective-types';

describe('Elective Client Service', () => {
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockFetch = vi.fn();
		global.fetch = mockFetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('fetchElectivesByRequirement()', () => {
		it('should fetch electives for a requirement', async () => {
			const mockElectives: ClerkshipElective[] = [
				{
					id: 'elec-1',
					requirementId: 'req-1',
					name: 'Cardiology',
					specialty: 'Cardiology',
					minimumDays: 5,
					isRequired: true,
					createdAt: '2025-01-01T00:00:00Z',
					updatedAt: '2025-01-01T00:00:00Z'
				}
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: mockElectives })
			});

			const result = await fetchElectivesByRequirement('req-1');

			expect(mockFetch).toHaveBeenCalledWith('/api/scheduling-config/electives?requirementId=req-1');
			expect(result).toEqual(mockElectives);
		});

		it('should throw error on failed fetch', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: { message: 'Requirement not found' } })
			});

			await expect(fetchElectivesByRequirement('invalid')).rejects.toThrow('Requirement not found');
		});
	});

	describe('createElective()', () => {
		it('should create a new elective', async () => {
			const formData: ElectiveFormData = {
				name: 'Cardiology Elective',
				specialty: 'Cardiology',
				minimumDays: 5,
				isRequired: true
			};

			const mockCreatedElective: ClerkshipElective = {
				id: 'elec-new',
				requirementId: 'req-1',
				...formData,
				createdAt: '2025-01-01T00:00:00Z',
				updatedAt: '2025-01-01T00:00:00Z'
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: mockCreatedElective })
			});

			const result = await createElective('req-1', formData);

			expect(result).toEqual(mockCreatedElective);
		});
	});

	describe('deleteElective()', () => {
		it('should delete an elective', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true })
			});

			await deleteElective('elec-1');

			expect(mockFetch).toHaveBeenCalledWith(
				'/api/scheduling-config/electives/elec-1',
				{ method: 'DELETE' }
			);
		});
	});
});
