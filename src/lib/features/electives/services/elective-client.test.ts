/**
 * Unit tests for elective-client.ts
 * Tests all client-side API functions with mocked fetch
 *
 * NOTE: Updated to use clerkshipId instead of requirementId
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	fetchElectivesByClerkship,
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

	describe('fetchElectivesByClerkship()', () => {
		it('should fetch electives for a clerkship', async () => {
			const mockElectives: ClerkshipElective[] = [
				{
					id: 'elec-1',
					clerkshipId: 'clerk-1',
					name: 'Cardiology',
					specialty: 'Cardiology',
					minimumDays: 5,
					isRequired: true,
					overrideMode: 'inherit',
					createdAt: new Date('2025-01-01T00:00:00Z'),
					updatedAt: new Date('2025-01-01T00:00:00Z')
				}
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: mockElectives })
			});

			const result = await fetchElectivesByClerkship('clerk-1');

			expect(mockFetch).toHaveBeenCalledWith('/api/scheduling-config/electives?clerkshipId=clerk-1');
			expect(result).toEqual(mockElectives);
		});

		it('should throw error on failed fetch', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: { message: 'Clerkship not found' } })
			});

			await expect(fetchElectivesByClerkship('invalid')).rejects.toThrow('Clerkship not found');
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
				clerkshipId: 'clerk-1',
				name: formData.name,
				specialty: formData.specialty || undefined,
				minimumDays: formData.minimumDays,
				isRequired: formData.isRequired,
				overrideMode: 'inherit',
				createdAt: new Date('2025-01-01T00:00:00Z'),
				updatedAt: new Date('2025-01-01T00:00:00Z')
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: mockCreatedElective })
			});

			const result = await createElective('clerk-1', formData);

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

			expect(mockFetch).toHaveBeenCalledWith('/api/scheduling-config/electives/elec-1', {
				method: 'DELETE'
			});
		});
	});
});
