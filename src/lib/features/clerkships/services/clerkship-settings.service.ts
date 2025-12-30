/**
 * Clerkship Settings Service
 *
 * Manages clerkship-specific scheduling settings that can override global defaults.
 * Each clerkship can either inherit global defaults or have custom settings.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:clerkships:settings');

export interface ClerkshipSettings {
	overrideMode: 'inherit' | 'override';
	assignmentStrategy: string;
	healthSystemRule: string;
	maxStudentsPerDay: number;
	maxStudentsPerYear: number;
	// Inpatient-specific
	blockSizeDays?: number;
	maxStudentsPerBlock?: number;
	maxBlocksPerYear?: number;
	allowPartialBlocks?: boolean;
	preferContinuousBlocks?: boolean;
	// Team settings
	allowTeams: boolean;
	teamSizeMin?: number;
	teamSizeMax?: number;
	// Fallback settings
	allowFallbacks: boolean;
	fallbackRequiresApproval: boolean;
	fallbackAllowCrossSystem: boolean;
}

type GlobalDefaults = Omit<ClerkshipSettings, 'overrideMode'>;

export class ClerkshipSettingsService {
	constructor(private db: Kysely<DB>) {}

	/**
	 * Get settings for a clerkship, merging global defaults with any overrides
	 */
	async getClerkshipSettings(clerkshipId: string): Promise<ClerkshipSettings> {
		log.debug('Fetching clerkship settings', { clerkshipId });

		// Get clerkship to determine type
		const clerkship = await this.db
			.selectFrom('clerkships')
			.select(['clerkship_type'])
			.where('id', '=', clerkshipId)
			.executeTakeFirst();

		if (!clerkship) {
			log.error('Clerkship not found for settings fetch', { clerkshipId });
			throw new Error('Clerkship not found');
		}

		// Get global defaults based on type
		const globalDefaults = await this.getGlobalDefaults(clerkship.clerkship_type);

		// Get clerkship configuration overrides
		const config = await this.db
			.selectFrom('clerkship_configurations')
			.selectAll()
			.where('clerkship_id', '=', clerkshipId)
			.executeTakeFirst();

		// If no config or inherit mode, return global defaults
		if (!config || config.override_mode === 'inherit') {
			log.info('Clerkship settings fetched (inherit mode)', {
				clerkshipId,
				clerkshipType: clerkship.clerkship_type,
				overrideMode: 'inherit'
			});
			return {
				overrideMode: 'inherit',
				...globalDefaults
			};
		}

		// Merge overrides with defaults
		const settings: ClerkshipSettings = {
			overrideMode: 'override' as const,
			assignmentStrategy: config.override_assignment_strategy || globalDefaults.assignmentStrategy,
			healthSystemRule: config.override_health_system_rule || globalDefaults.healthSystemRule,
			maxStudentsPerDay: config.override_max_students_per_day ?? globalDefaults.maxStudentsPerDay,
			maxStudentsPerYear:
				config.override_max_students_per_year ?? globalDefaults.maxStudentsPerYear,
			blockSizeDays: config.override_block_size_days ?? globalDefaults.blockSizeDays,
			maxStudentsPerBlock:
				config.override_max_students_per_block ?? globalDefaults.maxStudentsPerBlock,
			maxBlocksPerYear: config.override_max_blocks_per_year ?? globalDefaults.maxBlocksPerYear,
			allowPartialBlocks:
				config.override_allow_partial_blocks !== null
					? Boolean(config.override_allow_partial_blocks)
					: globalDefaults.allowPartialBlocks,
			preferContinuousBlocks:
				config.override_prefer_continuous_blocks !== null
					? Boolean(config.override_prefer_continuous_blocks)
					: globalDefaults.preferContinuousBlocks,
			allowTeams:
				config.override_allow_teams !== null
					? Boolean(config.override_allow_teams)
					: globalDefaults.allowTeams,
			teamSizeMin: config.override_team_size_min ?? globalDefaults.teamSizeMin,
			teamSizeMax: config.override_team_size_max ?? globalDefaults.teamSizeMax,
			allowFallbacks:
				config.override_allow_fallbacks !== null
					? Boolean(config.override_allow_fallbacks)
					: globalDefaults.allowFallbacks,
			fallbackRequiresApproval:
				config.override_fallback_requires_approval !== null
					? Boolean(config.override_fallback_requires_approval)
					: globalDefaults.fallbackRequiresApproval,
			fallbackAllowCrossSystem:
				config.override_fallback_allow_cross_system !== null
					? Boolean(config.override_fallback_allow_cross_system)
					: globalDefaults.fallbackAllowCrossSystem
		};

		log.info('Clerkship settings fetched (override mode)', {
			clerkshipId,
			clerkshipType: clerkship.clerkship_type,
			overrideMode: 'override',
			assignmentStrategy: settings.assignmentStrategy,
			healthSystemRule: settings.healthSystemRule
		});

		return settings;
	}

	/**
	 * Update clerkship settings (creates override)
	 */
	async updateClerkshipSettings(
		clerkshipId: string,
		settings: Partial<ClerkshipSettings>
	): Promise<void> {
		log.debug('Updating clerkship settings', {
			clerkshipId,
			settingKeys: Object.keys(settings)
		});

		// Ensure config record exists
		const existing = await this.db
			.selectFrom('clerkship_configurations')
			.select('id')
			.where('clerkship_id', '=', clerkshipId)
			.executeTakeFirst();

		const updateData = {
			override_mode: 'override' as const,
			override_assignment_strategy: settings.assignmentStrategy ?? null,
			override_health_system_rule: settings.healthSystemRule ?? null,
			override_max_students_per_day: settings.maxStudentsPerDay ?? null,
			override_max_students_per_year: settings.maxStudentsPerYear ?? null,
			override_block_size_days: settings.blockSizeDays ?? null,
			override_max_students_per_block: settings.maxStudentsPerBlock ?? null,
			override_max_blocks_per_year: settings.maxBlocksPerYear ?? null,
			override_allow_partial_blocks:
				settings.allowPartialBlocks !== undefined ? (settings.allowPartialBlocks ? 1 : 0) : null,
			override_prefer_continuous_blocks:
				settings.preferContinuousBlocks !== undefined
					? settings.preferContinuousBlocks
						? 1
						: 0
					: null,
			override_allow_teams:
				settings.allowTeams !== undefined ? (settings.allowTeams ? 1 : 0) : null,
			override_team_size_min: settings.teamSizeMin ?? null,
			override_team_size_max: settings.teamSizeMax ?? null,
			override_allow_fallbacks:
				settings.allowFallbacks !== undefined ? (settings.allowFallbacks ? 1 : 0) : null,
			override_fallback_requires_approval:
				settings.fallbackRequiresApproval !== undefined
					? settings.fallbackRequiresApproval
						? 1
						: 0
					: null,
			override_fallback_allow_cross_system:
				settings.fallbackAllowCrossSystem !== undefined
					? settings.fallbackAllowCrossSystem
						? 1
						: 0
					: null,
			updated_at: new Date().toISOString()
		};

		if (existing) {
			await this.db
				.updateTable('clerkship_configurations')
				.set(updateData)
				.where('clerkship_id', '=', clerkshipId)
				.execute();

			log.info('Clerkship settings updated', {
				clerkshipId,
				mode: 'update',
				settingKeys: Object.keys(settings)
			});
		} else {
			await this.db
				.insertInto('clerkship_configurations')
				.values({
					id: crypto.randomUUID(),
					clerkship_id: clerkshipId,
					created_at: new Date().toISOString(),
					...updateData
				})
				.execute();

			log.info('Clerkship settings created', {
				clerkshipId,
				mode: 'create',
				settingKeys: Object.keys(settings)
			});
		}
	}

	/**
	 * Reset clerkship settings to use global defaults
	 */
	async resetToDefaults(clerkshipId: string): Promise<void> {
		log.debug('Resetting clerkship settings to defaults', { clerkshipId });

		await this.db
			.updateTable('clerkship_configurations')
			.set({
				override_mode: 'inherit',
				override_assignment_strategy: null,
				override_health_system_rule: null,
				override_max_students_per_day: null,
				override_max_students_per_year: null,
				override_block_size_days: null,
				override_max_students_per_block: null,
				override_max_blocks_per_year: null,
				override_allow_partial_blocks: null,
				override_prefer_continuous_blocks: null,
				override_allow_teams: null,
				override_team_size_min: null,
				override_team_size_max: null,
				override_allow_fallbacks: null,
				override_fallback_requires_approval: null,
				override_fallback_allow_cross_system: null,
				updated_at: new Date().toISOString()
			})
			.where('clerkship_id', '=', clerkshipId)
			.execute();

		log.info('Clerkship settings reset to defaults', { clerkshipId });
	}

	/**
	 * Get global defaults based on clerkship type
	 */
	private async getGlobalDefaults(clerkshipType: string): Promise<GlobalDefaults> {
		if (clerkshipType === 'inpatient') {
			return this.getInpatientDefaults();
		}
		return this.getOutpatientDefaults();
	}

	private async getOutpatientDefaults(): Promise<GlobalDefaults> {
		const defaults = await this.db
			.selectFrom('global_outpatient_defaults')
			.selectAll()
			.where('school_id', '=', 'default')
			.executeTakeFirst();

		if (!defaults) {
			return this.getHardcodedDefaults();
		}

		return {
			assignmentStrategy: defaults.assignment_strategy,
			healthSystemRule: defaults.health_system_rule,
			maxStudentsPerDay: defaults.default_max_students_per_day,
			maxStudentsPerYear: defaults.default_max_students_per_year,
			allowTeams: Boolean(defaults.allow_teams),
			teamSizeMin: defaults.team_size_min ?? undefined,
			teamSizeMax: defaults.team_size_max ?? undefined,
			allowFallbacks: Boolean(defaults.allow_fallbacks),
			fallbackRequiresApproval: Boolean(defaults.fallback_requires_approval),
			fallbackAllowCrossSystem: Boolean(defaults.fallback_allow_cross_system)
		};
	}

	private async getInpatientDefaults(): Promise<GlobalDefaults> {
		const defaults = await this.db
			.selectFrom('global_inpatient_defaults')
			.selectAll()
			.where('school_id', '=', 'default')
			.executeTakeFirst();

		if (!defaults) {
			return this.getHardcodedDefaults();
		}

		return {
			assignmentStrategy: defaults.assignment_strategy,
			healthSystemRule: defaults.health_system_rule,
			maxStudentsPerDay: defaults.default_max_students_per_day,
			maxStudentsPerYear: defaults.default_max_students_per_year,
			blockSizeDays: defaults.block_size_days ?? undefined,
			maxStudentsPerBlock: defaults.default_max_students_per_block ?? undefined,
			maxBlocksPerYear: defaults.default_max_blocks_per_year ?? undefined,
			allowPartialBlocks: defaults.allow_partial_blocks !== null ? Boolean(defaults.allow_partial_blocks) : undefined,
			preferContinuousBlocks: defaults.prefer_continuous_blocks !== null ? Boolean(defaults.prefer_continuous_blocks) : undefined,
			allowTeams: Boolean(defaults.allow_teams),
			teamSizeMin: defaults.team_size_min ?? undefined,
			teamSizeMax: defaults.team_size_max ?? undefined,
			allowFallbacks: Boolean(defaults.allow_fallbacks),
			fallbackRequiresApproval: Boolean(defaults.fallback_requires_approval),
			fallbackAllowCrossSystem: Boolean(defaults.fallback_allow_cross_system)
		};
	}

	private getHardcodedDefaults(): GlobalDefaults {
		return {
			assignmentStrategy: 'continuous_single',
			healthSystemRule: 'no_preference',
			maxStudentsPerDay: 1,
			maxStudentsPerYear: 3,
			allowTeams: false,
			allowFallbacks: true,
			fallbackRequiresApproval: false,
			fallbackAllowCrossSystem: false
		};
	}
}
