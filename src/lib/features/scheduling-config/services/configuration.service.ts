/**
 * Configuration Service
 *
 * Orchestrates all configuration services for complete clerkship configuration management.
 *
 * NOTE: clerkship_requirements table has been removed. Clerkships now define their type
 * (inpatient/outpatient) directly, and electives link directly to clerkships.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { CompleteClerkshipConfiguration } from '../types/aggregates';
import { Result, type ServiceResult } from './service-result';
import { ServiceErrors } from './service-errors';
import { ElectiveService } from './electives.service';
import { TeamService } from './teams.service';
import { GlobalDefaultsService } from './global-defaults.service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:scheduling-config:configuration');

/**
 * Configuration Service
 *
 * High-level service that orchestrates operations across multiple
 * configuration services to provide complete configuration management.
 */
export class ConfigurationService {
	private electiveService: ElectiveService;
	private teamService: TeamService;
	private globalDefaultsService: GlobalDefaultsService;

	constructor(private db: Kysely<DB>) {
		this.electiveService = new ElectiveService(db);
		this.teamService = new TeamService(db);
		this.globalDefaultsService = new GlobalDefaultsService(db);
	}

	/**
	 * Get complete configuration for a clerkship
	 *
	 * Fetches clerkship with all related entities (electives, teams)
	 */
	async getCompleteConfiguration(
		clerkshipId: string
	): Promise<ServiceResult<CompleteClerkshipConfiguration | null>> {
		log.debug('Fetching complete configuration', { clerkshipId });

		try {
			// Get clerkship
			const clerkship = await this.db
				.selectFrom('clerkships')
				.selectAll()
				.where('id', '=', clerkshipId)
				.executeTakeFirst();

			if (!clerkship || !clerkship.id) {
				log.debug('Clerkship not found for complete configuration', { clerkshipId });
				return Result.success(null);
			}

			// Get electives for this clerkship
			const electivesResult = await this.electiveService.getElectivesByClerkship(clerkshipId);
			const electives = electivesResult.success ? electivesResult.data : [];

			// Calculate elective days
			const electiveDays = electives.reduce((sum, e) => sum + e.minimumDays, 0);
			const nonElectiveDays = Math.max(0, clerkship.required_days - electiveDays);

			// Get teams
			const teamsResult = await this.teamService.getTeamsByClerkship(clerkshipId);
			const teams = teamsResult.success ? teamsResult.data : undefined;

			// Resolve configuration based on clerkship type
			const resolvedConfig = await this.resolveClerkshipConfiguration(clerkship);

			log.info('Complete configuration fetched', {
				clerkshipId: clerkship.id,
				clerkshipName: clerkship.name,
				clerkshipType: clerkship.clerkship_type,
				electiveCount: electives.length,
				teamCount: teams?.length || 0,
				totalRequiredDays: clerkship.required_days
			});

			return Result.success({
				clerkshipId: clerkship.id,
				clerkshipName: clerkship.name,
				clerkshipType: (clerkship.clerkship_type || 'outpatient') as 'inpatient' | 'outpatient',
				totalRequiredDays: clerkship.required_days,
				resolvedConfig,
				electives,
				electiveDays,
				nonElectiveDays,
				teams
			});
		} catch (error) {
			log.error('Failed to fetch complete configuration', { clerkshipId, error });
			return Result.failure(
				ServiceErrors.databaseError('Failed to fetch complete configuration', error)
			);
		}
	}

	/**
	 * Resolve configuration for a clerkship
	 *
	 * Uses global defaults based on clerkship type
	 */
	private async resolveClerkshipConfiguration(clerkship: any): Promise<any> {
		const clerkshipType = clerkship.clerkship_type || 'outpatient';

		// Fetch appropriate global defaults based on clerkship type
		let globalDefaults: any = null;

		if (clerkshipType === 'outpatient') {
			const result = await this.globalDefaultsService.getOutpatientDefaults();
			if (result.success && result.data) {
				globalDefaults = result.data;
			}
		} else if (clerkshipType === 'inpatient') {
			const result = await this.globalDefaultsService.getInpatientDefaults();
			if (result.success && result.data) {
				globalDefaults = result.data;
			}
		}

		// If no global defaults found, return sensible defaults
		if (!globalDefaults) {
			return {
				clerkshipId: clerkship.id,
				requirementType: clerkshipType,
				requiredDays: clerkship.required_days,
				assignmentStrategy: 'continuous_single',
				healthSystemRule: 'no_preference',
				maxStudentsPerDay: 1,
				maxStudentsPerYear: 3,
				allowTeams: false,
				allowFallbacks: true,
				source: 'global_defaults'
			};
		}

		// Build resolved configuration from global defaults
		const resolved: any = {
			clerkshipId: clerkship.id,
			requirementType: clerkshipType,
			requiredDays: clerkship.required_days,
			assignmentStrategy: globalDefaults.assignmentStrategy,
			healthSystemRule: globalDefaults.healthSystemRule,
			maxStudentsPerDay: globalDefaults.defaultMaxStudentsPerDay,
			maxStudentsPerYear: globalDefaults.defaultMaxStudentsPerYear,
			allowTeams: globalDefaults.allowTeams,
			allowFallbacks: globalDefaults.allowFallbacks,
			fallbackRequiresApproval: globalDefaults.fallbackRequiresApproval,
			fallbackAllowCrossSystem: globalDefaults.fallbackAllowCrossSystem,
			source: 'global_defaults'
		};

		// Add inpatient-specific fields if applicable
		if (clerkshipType === 'inpatient' && globalDefaults.blockSizeDays) {
			resolved.blockSizeDays = globalDefaults.blockSizeDays;
			resolved.allowPartialBlocks = globalDefaults.allowPartialBlocks;
			resolved.preferContinuousBlocks = globalDefaults.preferContinuousBlocks;
			resolved.maxStudentsPerBlock = globalDefaults.defaultMaxStudentsPerBlock;
			resolved.maxBlocksPerYear = globalDefaults.defaultMaxBlocksPerYear;
		}

		return resolved;
	}

	/**
	 * Validate complete configuration
	 *
	 * Checks if configuration is complete and valid for scheduling
	 */
	async validateConfiguration(
		clerkshipId: string
	): Promise<ServiceResult<{ valid: boolean; errors: string[] }>> {
		log.debug('Validating configuration', { clerkshipId });

		const errors: string[] = [];

		try {
			// Check clerkship exists
			const clerkship = await this.db
				.selectFrom('clerkships')
				.select(['id', 'required_days', 'clerkship_type'])
				.where('id', '=', clerkshipId)
				.executeTakeFirst();

			if (!clerkship) {
				log.warn('Clerkship not found for validation', { clerkshipId });
				return Result.failure(ServiceErrors.notFound('Clerkship', clerkshipId));
			}

			// Validate elective days don't exceed clerkship days
			const electivesResult = await this.electiveService.getElectivesByClerkship(clerkshipId);
			if (electivesResult.success) {
				const electiveDays = electivesResult.data.reduce((sum, e) => sum + e.minimumDays, 0);
				if (electiveDays > clerkship.required_days) {
					errors.push(
						`Elective days (${electiveDays}) exceed clerkship total (${clerkship.required_days})`
					);
				}
			}

			// Check each required elective has preceptors
			if (electivesResult.success) {
				for (const elective of electivesResult.data) {
					if (elective.isRequired) {
						// Check if elective has preceptors assigned
						const preceptors = await this.db
							.selectFrom('elective_preceptors')
							.select('preceptor_id')
							.where('elective_id', '=', elective.id)
							.execute();

						if (preceptors.length === 0) {
							errors.push(`Required elective "${elective.name}" has no preceptors assigned`);
						}
					}
				}
			}

			log.info('Configuration validated', {
				clerkshipId,
				valid: errors.length === 0,
				errorCount: errors.length
			});

			return Result.success({
				valid: errors.length === 0,
				errors
			});
		} catch (error) {
			log.error('Failed to validate configuration', { clerkshipId, error });
			return Result.failure(
				ServiceErrors.databaseError('Failed to validate configuration', error)
			);
		}
	}

	/**
	 * Clone configuration from one clerkship to another
	 *
	 * Copies all electives and teams
	 */
	async cloneConfiguration(
		sourceClerkshipId: string,
		targetClerkshipId: string
	): Promise<ServiceResult<boolean>> {
		log.debug('Cloning configuration', { sourceClerkshipId, targetClerkshipId });

		try {
			// Verify both clerkships exist
			const sourceClerkship = await this.db
				.selectFrom('clerkships')
				.select('id')
				.where('id', '=', sourceClerkshipId)
				.executeTakeFirst();

			if (!sourceClerkship) {
				log.warn('Source clerkship not found for cloning', { sourceClerkshipId });
				return Result.failure(ServiceErrors.notFound('Source clerkship', sourceClerkshipId));
			}

			const targetClerkship = await this.db
				.selectFrom('clerkships')
				.select('id')
				.where('id', '=', targetClerkshipId)
				.executeTakeFirst();

			if (!targetClerkship) {
				log.warn('Target clerkship not found for cloning', { targetClerkshipId });
				return Result.failure(ServiceErrors.notFound('Target clerkship', targetClerkshipId));
			}

			// Get complete source configuration
			const configResult = await this.getCompleteConfiguration(sourceClerkshipId);
			if (!configResult.success) {
				return Result.failure(configResult.error);
			}

			if (!configResult.data) {
				return Result.failure(ServiceErrors.notFound('Source configuration', sourceClerkshipId));
			}

			// Clone in transaction
			await this.db.transaction().execute(async (trx) => {
				const electiveService = new ElectiveService(trx);

				// Clone electives
				for (const elective of configResult.data!.electives) {
					await electiveService.createElective(targetClerkshipId, {
						name: elective.name,
						minimumDays: elective.minimumDays,
						specialty: elective.specialty,
						isRequired: elective.isRequired
					});
				}

				// Clone teams
				if (configResult.data!.teams) {
					const teamService = new TeamService(trx);
					for (const team of configResult.data!.teams) {
						await teamService.createTeam(targetClerkshipId, {
							name: team.name,
							requireSameHealthSystem: team.requireSameHealthSystem,
							requireSameSite: team.requireSameSite,
							requireSameSpecialty: team.requireSameSpecialty,
							requiresAdminApproval: team.requiresAdminApproval,
							members: team.members.map((m) => ({
								preceptorId: m.preceptorId,
								role: m.role,
								priority: m.priority,
								isFallbackOnly: m.isFallbackOnly ?? false
							}))
						});
					}
				}
			});

			log.info('Configuration cloned', {
				sourceClerkshipId,
				targetClerkshipId,
				electiveCount: configResult.data!.electives.length,
				teamCount: configResult.data!.teams?.length || 0
			});

			return Result.success(true);
		} catch (error) {
			log.error('Failed to clone configuration', { sourceClerkshipId, targetClerkshipId, error });
			return Result.failure(ServiceErrors.databaseError('Failed to clone configuration', error));
		}
	}

	/**
	 * Delete entire configuration for a clerkship
	 */
	async deleteConfiguration(clerkshipId: string): Promise<ServiceResult<boolean>> {
		log.debug('Deleting configuration', { clerkshipId });

		try {
			await this.db.transaction().execute(async (trx) => {
				// Delete elective associations first
				const electives = await trx
					.selectFrom('clerkship_electives')
					.select('id')
					.where('clerkship_id', '=', clerkshipId)
					.execute();

				for (const elective of electives) {
					await trx.deleteFrom('elective_sites').where('elective_id', '=', elective.id).execute();
					await trx
						.deleteFrom('elective_preceptors')
						.where('elective_id', '=', elective.id)
						.execute();
				}

				// Delete electives
				await trx.deleteFrom('clerkship_electives').where('clerkship_id', '=', clerkshipId).execute();

				// Delete team members
				const teams = await trx
					.selectFrom('preceptor_teams')
					.select('id')
					.where('clerkship_id', '=', clerkshipId)
					.execute();

				for (const team of teams) {
					await trx.deleteFrom('preceptor_team_members').where('team_id', '=', team.id).execute();
				}

				// Delete teams
				await trx.deleteFrom('preceptor_teams').where('clerkship_id', '=', clerkshipId).execute();
			});

			log.info('Configuration deleted', { clerkshipId });
			return Result.success(true);
		} catch (error) {
			log.error('Failed to delete configuration', { clerkshipId, error });
			return Result.failure(ServiceErrors.databaseError('Failed to delete configuration', error));
		}
	}
}
