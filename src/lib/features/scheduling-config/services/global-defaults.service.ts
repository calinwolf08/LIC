/**
 * Global Defaults Service
 *
 * Service for managing global default configurations for outpatient, inpatient, and elective requirements.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { Result, type ServiceResult } from './service-result';
import { ServiceErrors } from './service-errors';
import type {
	GlobalOutpatientDefaultsInput,
	GlobalInpatientDefaultsInput,
	GlobalElectiveDefaultsInput,
} from '../schemas/global-defaults.schemas';
import type {
	GlobalOutpatientDefaults,
	GlobalInpatientDefaults,
	GlobalElectiveDefaults,
} from '../types/global-defaults';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:scheduling-config:global-defaults');

/**
 * Global Defaults Service
 *
 * Manages CRUD operations for global default configurations.
 * These defaults are inherited by clerkship requirements unless overridden.
 */
export class GlobalDefaultsService {
	constructor(private db: Kysely<DB>) {}

	// ===== OUTPATIENT DEFAULTS =====

	/**
	 * Get global outpatient defaults for a school
	 * @param schoolId - School ID (defaults to 'default')
	 */
	async getOutpatientDefaults(schoolId: string = 'default'): Promise<ServiceResult<GlobalOutpatientDefaults | null>> {
		log.debug('Fetching outpatient defaults', { schoolId });

		try {
			const record = await this.db
				.selectFrom('global_outpatient_defaults')
				.selectAll()
				.where('school_id', '=', schoolId)
				.executeTakeFirst();

			if (!record) {
				log.debug('Outpatient defaults not found', { schoolId });
				return Result.success(null);
			}

			log.info('Outpatient defaults fetched', { schoolId });
			return Result.success(this.mapOutpatientFromDb(record));
		} catch (error) {
			log.error('Failed to fetch outpatient defaults', { schoolId, error });
			return Result.failure(
				ServiceErrors.databaseError('Failed to fetch outpatient defaults', error)
			);
		}
	}

	/**
	 * Update global outpatient defaults
	 */
	async updateOutpatientDefaults(
		schoolId: string = 'default',
		input: GlobalOutpatientDefaultsInput
	): Promise<ServiceResult<GlobalOutpatientDefaults>> {
		log.debug('Updating outpatient defaults', { schoolId });

		try {
			const updated = await this.db
				.updateTable('global_outpatient_defaults')
				.set({
					assignment_strategy: input.assignmentStrategy,
					health_system_rule: input.healthSystemRule,
					default_max_students_per_day: input.defaultMaxStudentsPerDay,
					default_max_students_per_year: input.defaultMaxStudentsPerYear,
					allow_teams: input.allowTeams ? 1 : 0,
					allow_fallbacks: input.allowFallbacks ? 1 : 0,
					fallback_requires_approval: input.fallbackRequiresApproval ? 1 : 0,
					fallback_allow_cross_system: input.fallbackAllowCrossSystem ? 1 : 0,
					team_size_min: input.teamSizeMin ?? null,
					team_size_max: input.teamSizeMax ?? null,
					team_require_same_health_system: input.teamRequireSameHealthSystem ? 1 : 0,
					team_require_same_specialty: input.teamRequireSameSpecialty ? 1 : 0,
					updated_at: new Date().toISOString(),
				})
				.where('school_id', '=', schoolId)
				.returningAll()
				.executeTakeFirst();

			if (!updated) {
				log.warn('Outpatient defaults not found for update', { schoolId });
				return Result.failure(ServiceErrors.notFound('Outpatient defaults', schoolId));
			}

			log.info('Outpatient defaults updated', {
				schoolId,
				assignmentStrategy: updated.assignment_strategy,
				healthSystemRule: updated.health_system_rule
			});

			return Result.success(this.mapOutpatientFromDb(updated));
		} catch (error) {
			log.error('Failed to update outpatient defaults', { schoolId, error });
			return Result.failure(
				ServiceErrors.databaseError('Failed to update outpatient defaults', error)
			);
		}
	}

	// ===== INPATIENT DEFAULTS =====

	/**
	 * Get global inpatient defaults for a school
	 */
	async getInpatientDefaults(schoolId: string = 'default'): Promise<ServiceResult<GlobalInpatientDefaults | null>> {
		log.debug('Fetching inpatient defaults', { schoolId });

		try {
			const record = await this.db
				.selectFrom('global_inpatient_defaults')
				.selectAll()
				.where('school_id', '=', schoolId)
				.executeTakeFirst();

			if (!record) {
				log.debug('Inpatient defaults not found', { schoolId });
				return Result.success(null);
			}

			log.info('Inpatient defaults fetched', { schoolId });
			return Result.success(this.mapInpatientFromDb(record));
		} catch (error) {
			log.error('Failed to fetch inpatient defaults', { schoolId, error });
			return Result.failure(
				ServiceErrors.databaseError('Failed to fetch inpatient defaults', error)
			);
		}
	}

	/**
	 * Update global inpatient defaults
	 */
	async updateInpatientDefaults(
		schoolId: string = 'default',
		input: GlobalInpatientDefaultsInput
	): Promise<ServiceResult<GlobalInpatientDefaults>> {
		log.debug('Updating inpatient defaults', { schoolId });

		try {
			const updated = await this.db
				.updateTable('global_inpatient_defaults')
				.set({
					assignment_strategy: input.assignmentStrategy,
					health_system_rule: input.healthSystemRule,
					default_max_students_per_day: input.defaultMaxStudentsPerDay,
					default_max_students_per_year: input.defaultMaxStudentsPerYear,
					allow_teams: input.allowTeams ? 1 : 0,
					allow_fallbacks: input.allowFallbacks ? 1 : 0,
					fallback_requires_approval: input.fallbackRequiresApproval ? 1 : 0,
					fallback_allow_cross_system: input.fallbackAllowCrossSystem ? 1 : 0,
					block_size_days: input.blockSizeDays ?? null,
					allow_partial_blocks: input.allowPartialBlocks ? 1 : 0,
					prefer_continuous_blocks: input.preferContinuousBlocks ? 1 : 0,
					default_max_students_per_block: input.defaultMaxStudentsPerBlock ?? null,
					default_max_blocks_per_year: input.defaultMaxBlocksPerYear ?? null,
					team_size_min: input.teamSizeMin ?? null,
					team_size_max: input.teamSizeMax ?? null,
					team_require_same_health_system: input.teamRequireSameHealthSystem ? 1 : 0,
					team_require_same_specialty: input.teamRequireSameSpecialty ? 1 : 0,
					updated_at: new Date().toISOString(),
				})
				.where('school_id', '=', schoolId)
				.returningAll()
				.executeTakeFirst();

			if (!updated) {
				log.warn('Inpatient defaults not found for update', { schoolId });
				return Result.failure(ServiceErrors.notFound('Inpatient defaults', schoolId));
			}

			log.info('Inpatient defaults updated', {
				schoolId,
				assignmentStrategy: updated.assignment_strategy,
				healthSystemRule: updated.health_system_rule,
				blockSizeDays: updated.block_size_days
			});

			return Result.success(this.mapInpatientFromDb(updated));
		} catch (error) {
			log.error('Failed to update inpatient defaults', { schoolId, error });
			return Result.failure(
				ServiceErrors.databaseError('Failed to update inpatient defaults', error)
			);
		}
	}

	// ===== ELECTIVE DEFAULTS =====

	/**
	 * Get global elective defaults for a school
	 */
	async getElectiveDefaults(schoolId: string = 'default'): Promise<ServiceResult<GlobalElectiveDefaults | null>> {
		log.debug('Fetching elective defaults', { schoolId });

		try {
			const record = await this.db
				.selectFrom('global_elective_defaults')
				.selectAll()
				.where('school_id', '=', schoolId)
				.executeTakeFirst();

			if (!record) {
				log.debug('Elective defaults not found', { schoolId });
				return Result.success(null);
			}

			log.info('Elective defaults fetched', { schoolId });
			return Result.success(this.mapElectiveFromDb(record));
		} catch (error) {
			log.error('Failed to fetch elective defaults', { schoolId, error });
			return Result.failure(
				ServiceErrors.databaseError('Failed to fetch elective defaults', error)
			);
		}
	}

	/**
	 * Update global elective defaults
	 */
	async updateElectiveDefaults(
		schoolId: string = 'default',
		input: GlobalElectiveDefaultsInput
	): Promise<ServiceResult<GlobalElectiveDefaults>> {
		log.debug('Updating elective defaults', { schoolId });

		try {
			const updated = await this.db
				.updateTable('global_elective_defaults')
				.set({
					assignment_strategy: input.assignmentStrategy,
					health_system_rule: input.healthSystemRule,
					default_max_students_per_day: input.defaultMaxStudentsPerDay,
					default_max_students_per_year: input.defaultMaxStudentsPerYear,
					allow_teams: input.allowTeams ? 1 : 0,
					allow_fallbacks: input.allowFallbacks ? 1 : 0,
					fallback_requires_approval: input.fallbackRequiresApproval ? 1 : 0,
					fallback_allow_cross_system: input.fallbackAllowCrossSystem ? 1 : 0,
					updated_at: new Date().toISOString(),
				})
				.where('school_id', '=', schoolId)
				.returningAll()
				.executeTakeFirst();

			if (!updated) {
				log.warn('Elective defaults not found for update', { schoolId });
				return Result.failure(ServiceErrors.notFound('Elective defaults', schoolId));
			}

			log.info('Elective defaults updated', {
				schoolId,
				assignmentStrategy: updated.assignment_strategy,
				healthSystemRule: updated.health_system_rule
			});

			return Result.success(this.mapElectiveFromDb(updated));
		} catch (error) {
			log.error('Failed to update elective defaults', { schoolId, error });
			return Result.failure(
				ServiceErrors.databaseError('Failed to update elective defaults', error)
			);
		}
	}

	// ===== PRIVATE MAPPING METHODS =====

	private mapOutpatientFromDb(record: any): GlobalOutpatientDefaults {
		return {
			id: record.id,
			schoolId: record.school_id,
			assignmentStrategy: record.assignment_strategy,
			healthSystemRule: record.health_system_rule,
			defaultMaxStudentsPerDay: record.default_max_students_per_day,
			defaultMaxStudentsPerYear: record.default_max_students_per_year,
			allowTeams: Boolean(record.allow_teams),
			allowFallbacks: Boolean(record.allow_fallbacks),
			fallbackRequiresApproval: Boolean(record.fallback_requires_approval),
			fallbackAllowCrossSystem: Boolean(record.fallback_allow_cross_system),
			teamSizeMin: record.team_size_min ?? undefined,
			teamSizeMax: record.team_size_max ?? undefined,
			teamRequireSameHealthSystem: record.team_require_same_health_system ? Boolean(record.team_require_same_health_system) : undefined,
			teamRequireSameSpecialty: record.team_require_same_specialty ? Boolean(record.team_require_same_specialty) : undefined,
			createdAt: new Date(record.created_at),
			updatedAt: new Date(record.updated_at),
		};
	}

	private mapInpatientFromDb(record: any): GlobalInpatientDefaults {
		return {
			id: record.id,
			schoolId: record.school_id,
			assignmentStrategy: record.assignment_strategy,
			healthSystemRule: record.health_system_rule,
			defaultMaxStudentsPerDay: record.default_max_students_per_day,
			defaultMaxStudentsPerYear: record.default_max_students_per_year,
			allowTeams: Boolean(record.allow_teams),
			allowFallbacks: Boolean(record.allow_fallbacks),
			fallbackRequiresApproval: Boolean(record.fallback_requires_approval),
			fallbackAllowCrossSystem: Boolean(record.fallback_allow_cross_system),
			blockSizeDays: record.block_size_days ?? undefined,
			allowPartialBlocks: record.allow_partial_blocks ? Boolean(record.allow_partial_blocks) : undefined,
			preferContinuousBlocks: record.prefer_continuous_blocks ? Boolean(record.prefer_continuous_blocks) : undefined,
			defaultMaxStudentsPerBlock: record.default_max_students_per_block ?? undefined,
			defaultMaxBlocksPerYear: record.default_max_blocks_per_year ?? undefined,
			teamSizeMin: record.team_size_min ?? undefined,
			teamSizeMax: record.team_size_max ?? undefined,
			teamRequireSameHealthSystem: record.team_require_same_health_system ? Boolean(record.team_require_same_health_system) : undefined,
			teamRequireSameSpecialty: record.team_require_same_specialty ? Boolean(record.team_require_same_specialty) : undefined,
			createdAt: new Date(record.created_at),
			updatedAt: new Date(record.updated_at),
		};
	}

	private mapElectiveFromDb(record: any): GlobalElectiveDefaults {
		return {
			id: record.id,
			schoolId: record.school_id,
			assignmentStrategy: record.assignment_strategy,
			healthSystemRule: record.health_system_rule,
			defaultMaxStudentsPerDay: record.default_max_students_per_day,
			defaultMaxStudentsPerYear: record.default_max_students_per_year,
			allowTeams: Boolean(record.allow_teams),
			allowFallbacks: Boolean(record.allow_fallbacks),
			fallbackRequiresApproval: Boolean(record.fallback_requires_approval),
			fallbackAllowCrossSystem: Boolean(record.fallback_allow_cross_system),
			createdAt: new Date(record.created_at),
			updatedAt: new Date(record.updated_at),
		};
	}
}
