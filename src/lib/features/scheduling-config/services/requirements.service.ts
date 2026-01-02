/**
 * Requirement Service (DEPRECATED)
 *
 * NOTE: This service is deprecated. The clerkship_requirements table has been removed.
 * Clerkships now define their type (inpatient/outpatient) directly, and electives
 * link directly to clerkships via clerkship_id.
 *
 * For elective management, use ElectiveService instead.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { Result, type ServiceResult } from './service-result';
import { ServiceErrors } from './service-errors';

/**
 * @deprecated Requirements are no longer used. Use ElectiveService for elective management.
 */
export class RequirementService {
	constructor(private db: Kysely<DB>) {}

	/**
	 * @deprecated Requirements are no longer used.
	 */
	async createRequirement(_input: unknown): Promise<ServiceResult<never>> {
		return Result.failure(
			ServiceErrors.validationError(
				'Requirements are deprecated. Clerkships now define their type directly. Use ElectiveService for elective management.'
			)
		);
	}

	/**
	 * @deprecated Requirements are no longer used.
	 */
	async getRequirement(_id: string): Promise<ServiceResult<null>> {
		return Result.success(null);
	}

	/**
	 * @deprecated Requirements are no longer used.
	 */
	async getRequirementsByClerkship(_clerkshipId: string): Promise<ServiceResult<never[]>> {
		return Result.success([]);
	}

	/**
	 * @deprecated Requirements are no longer used.
	 */
	async updateRequirement(_id: string, _input: unknown): Promise<ServiceResult<never>> {
		return Result.failure(
			ServiceErrors.validationError(
				'Requirements are deprecated. Clerkships now define their type directly.'
			)
		);
	}

	/**
	 * @deprecated Requirements are no longer used.
	 */
	async deleteRequirement(_id: string): Promise<ServiceResult<boolean>> {
		return Result.failure(ServiceErrors.notFound('Requirement', _id));
	}

	/**
	 * @deprecated Requirements are no longer used.
	 */
	async validateRequirementSplit(
		_clerkshipId: string
	): Promise<
		ServiceResult<{ valid: boolean; totalRequiredDays: number; clerkshipTotalDays: number }>
	> {
		return Result.success({
			valid: true,
			totalRequiredDays: 0,
			clerkshipTotalDays: 0
		});
	}
}
