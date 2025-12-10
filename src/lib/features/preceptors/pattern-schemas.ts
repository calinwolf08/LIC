/**
 * Preceptor Availability Pattern Validation Schemas
 *
 * Zod schemas for validating pattern-based availability data
 */

import { z } from 'zod';
import { dateStringSchema, cuid2Schema } from '$lib/validation/common-schemas';

// ========================================
// Pattern Configuration Schemas
// ========================================

/**
 * Schema for weekly pattern configuration
 */
export const weeklyConfigSchema = z.object({
	days_of_week: z
		.array(z.number().int().min(0).max(6))
		.min(1, 'At least one day of week must be selected')
		.refine((days) => new Set(days).size === days.length, {
			message: 'Duplicate days of week are not allowed'
		})
});

/**
 * Schema for monthly pattern configuration
 */
export const monthlyConfigSchema = z.object({
	monthly_type: z.enum([
		'first_week',
		'last_week',
		'first_business_week',
		'last_business_week',
		'specific_days'
	]),
	week_definition: z.enum(['seven_days', 'calendar', 'business']).optional(),
	specific_days: z
		.array(z.number().int().min(1).max(31))
		.optional()
		.refine(
			(days) => {
				if (!days) return true;
				return new Set(days).size === days.length;
			},
			{
				message: 'Duplicate specific days are not allowed'
			}
		)
}).refine(
	(data) => {
		// If monthly_type is specific_days, specific_days must be provided
		if (data.monthly_type === 'specific_days') {
			return data.specific_days && data.specific_days.length > 0;
		}
		return true;
	},
	{
		message: 'specific_days is required when monthly_type is "specific_days"',
		path: ['specific_days']
	}
).refine(
	(data) => {
		// If monthly_type is a week type, week_definition must be provided
		if (['first_week', 'last_week'].includes(data.monthly_type)) {
			return data.week_definition !== undefined;
		}
		return true;
	},
	{
		message: 'week_definition is required for week-based monthly patterns',
		path: ['week_definition']
	}
);

/**
 * Schema for block pattern configuration
 */
export const blockConfigSchema = z.object({
	exclude_weekends: z.boolean().default(false)
});

/**
 * Union of all pattern configurations
 */
export const patternConfigSchema = z.union([
	weeklyConfigSchema,
	monthlyConfigSchema,
	blockConfigSchema,
	z.null() // For individual patterns
]);

// ========================================
// Pattern Type Enum
// ========================================

export const patternTypeSchema = z.enum(['weekly', 'monthly', 'block', 'individual']);

// ========================================
// Pattern Schemas
// ========================================

/**
 * Base pattern fields (used for composition, not refined)
 */
const basePatternFields = {
	preceptor_id: cuid2Schema,
	site_id: cuid2Schema,
	is_available: z.boolean(),
	date_range_start: dateStringSchema,
	date_range_end: dateStringSchema,
	reason: z.string().max(500).optional(),
	enabled: z.boolean().default(true)
};

/**
 * Schema for creating a weekly pattern
 */
export const createWeeklyPatternSchema = z.object({
	...basePatternFields,
	pattern_type: z.literal('weekly'),
	specificity: z.literal(1).default(1),
	config: weeklyConfigSchema
});

/**
 * Schema for creating a monthly pattern
 */
export const createMonthlyPatternSchema = z.object({
	...basePatternFields,
	pattern_type: z.literal('monthly'),
	specificity: z.literal(1).default(1),
	config: monthlyConfigSchema
});

/**
 * Schema for creating a block pattern
 */
export const createBlockPatternSchema = z.object({
	...basePatternFields,
	pattern_type: z.literal('block'),
	specificity: z.literal(2).default(2),
	config: blockConfigSchema
});

/**
 * Schema for creating an individual override pattern
 */
export const createIndividualPatternSchema = z.object({
	...basePatternFields,
	pattern_type: z.literal('individual'),
	specificity: z.literal(3).default(3),
	config: z.null().default(null)
});

/**
 * Union schema for creating any pattern type
 */
export const createPatternSchema = z
	.discriminatedUnion('pattern_type', [
		createWeeklyPatternSchema,
		createMonthlyPatternSchema,
		createBlockPatternSchema,
		createIndividualPatternSchema
	])
	.refine(
		(data) => {
			// Individual patterns must have same start and end date
			if (data.pattern_type === 'individual') {
				return data.date_range_start === data.date_range_end;
			}
			// All other patterns: start must be <= end
			return data.date_range_start <= data.date_range_end;
		},
		{
			message: 'Invalid date range for pattern type',
			path: ['date_range_end']
		}
	);

/**
 * Schema for updating a pattern (all fields optional except what cannot be changed)
 */
export const updatePatternSchema = z.object({
	is_available: z.boolean().optional(),
	date_range_start: dateStringSchema.optional(),
	date_range_end: dateStringSchema.optional(),
	config: patternConfigSchema.optional(),
	reason: z.string().max(500).optional(),
	enabled: z.boolean().optional()
}).refine(
	(data) => {
		// If both dates are provided, validate the range
		if (data.date_range_start && data.date_range_end) {
			return data.date_range_start <= data.date_range_end;
		}
		return true;
	},
	{
		message: 'date_range_start must be before or equal to date_range_end',
		path: ['date_range_end']
	}
);

/**
 * Schema for pattern with ID (database record)
 */
export const patternSchema = createPatternSchema.and(
	z.object({
		id: cuid2Schema,
		created_at: z.string(),
		updated_at: z.string()
	})
);

// ========================================
// Pattern Generation Schemas
// ========================================

/**
 * Schema for a generated availability date
 */
export const generatedDateSchema = z.object({
	date: dateStringSchema,
	site_id: cuid2Schema,
	is_available: z.boolean(),
	source_pattern_id: cuid2Schema.optional(),
	source_pattern_type: patternTypeSchema.optional()
});

/**
 * Schema for pattern generation result
 */
export const patternGenerationResultSchema = z.object({
	generated_dates: z.number().int().min(0),
	available_dates: z.number().int().min(0),
	unavailable_dates: z.number().int().min(0),
	preview: z.array(generatedDateSchema)
});

/**
 * Schema for saving generated patterns
 */
export const savePatternDatesSchema = z.object({
	preceptor_id: cuid2Schema,
	clear_existing: z.boolean().default(true)
});

// ========================================
// Scheduling Period Schemas
// ========================================

/**
 * Schema for creating a scheduling period
 */
export const createSchedulingPeriodSchema = z.object({
	name: z.string().min(1).max(200),
	start_date: dateStringSchema,
	end_date: dateStringSchema,
	is_active: z.boolean().default(false)
}).refine(
	(data) => data.start_date <= data.end_date,
	{
		message: 'start_date must be before or equal to end_date',
		path: ['end_date']
	}
);

/**
 * Schema for updating a scheduling period
 */
export const updateSchedulingPeriodSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	start_date: dateStringSchema.optional(),
	end_date: dateStringSchema.optional(),
	is_active: z.boolean().optional()
}).refine(
	(data) => {
		// If both dates are provided, validate the range
		if (data.start_date && data.end_date) {
			return data.start_date <= data.end_date;
		}
		return true;
	},
	{
		message: 'start_date must be before or equal to end_date',
		path: ['end_date']
	}
);

/**
 * Schema for scheduling period with ID (database record)
 */
export const schedulingPeriodSchema = createSchedulingPeriodSchema.and(
	z.object({
		id: cuid2Schema,
		created_at: z.string(),
		updated_at: z.string()
	})
);

// ========================================
// Export Types
// ========================================

export type WeeklyConfig = z.infer<typeof weeklyConfigSchema>;
export type MonthlyConfig = z.infer<typeof monthlyConfigSchema>;
export type BlockConfig = z.infer<typeof blockConfigSchema>;
export type PatternConfig = z.infer<typeof patternConfigSchema>;

export type PatternType = z.infer<typeof patternTypeSchema>;

export type CreateWeeklyPattern = z.infer<typeof createWeeklyPatternSchema>;
export type CreateMonthlyPattern = z.infer<typeof createMonthlyPatternSchema>;
export type CreateBlockPattern = z.infer<typeof createBlockPatternSchema>;
export type CreateIndividualPattern = z.infer<typeof createIndividualPatternSchema>;
export type CreatePattern = z.infer<typeof createPatternSchema>;

export type UpdatePattern = z.infer<typeof updatePatternSchema>;
export type Pattern = z.infer<typeof patternSchema>;

export type GeneratedDate = z.infer<typeof generatedDateSchema>;
export type PatternGenerationResult = z.infer<typeof patternGenerationResultSchema>;
export type SavePatternDates = z.infer<typeof savePatternDatesSchema>;

export type CreateSchedulingPeriod = z.infer<typeof createSchedulingPeriodSchema>;
export type UpdateSchedulingPeriod = z.infer<typeof updateSchedulingPeriodSchema>;
export type SchedulingPeriod = z.infer<typeof schedulingPeriodSchema>;

// ========================================
// Schedule Duplication Schemas
// ========================================

/**
 * Entity type enum for schedule associations
 */
export const scheduleEntityTypeSchema = z.enum([
	'students',
	'preceptors',
	'sites',
	'health_systems',
	'clerkships',
	'teams',
	'configurations'
]);

/**
 * Schema for schedule duplication options
 */
export const duplicationOptionsSchema = z.object({
	students: z.union([z.array(cuid2Schema), z.literal('all')]).optional(),
	preceptors: z.union([z.array(cuid2Schema), z.literal('all')]).optional(),
	sites: z.union([z.array(cuid2Schema), z.literal('all')]).optional(),
	healthSystems: z.union([z.array(cuid2Schema), z.literal('all')]).optional(),
	clerkships: z.union([z.array(cuid2Schema), z.literal('all')]).optional(),
	teams: z.union([z.array(cuid2Schema), z.literal('all')]).optional(),
	configurations: z.union([z.array(cuid2Schema), z.literal('all')]).optional()
});

/**
 * Schema for duplicating a schedule
 */
export const duplicateScheduleSchema = z.object({
	name: z.string().min(1).max(200),
	startDate: dateStringSchema,
	endDate: dateStringSchema,
	year: z.number().int().min(2000).max(2100),
	options: duplicationOptionsSchema.default({})
}).refine(
	(data) => data.startDate <= data.endDate,
	{
		message: 'startDate must be before or equal to endDate',
		path: ['endDate']
	}
);

/**
 * Schema for adding/removing entities from a schedule
 */
export const scheduleEntitiesSchema = z.object({
	entityType: scheduleEntityTypeSchema,
	entityIds: z.array(cuid2Schema).min(1)
});

export type ScheduleEntityType = z.infer<typeof scheduleEntityTypeSchema>;
export type DuplicationOptions = z.infer<typeof duplicationOptionsSchema>;
export type DuplicateSchedule = z.infer<typeof duplicateScheduleSchema>;
export type ScheduleEntities = z.infer<typeof scheduleEntitiesSchema>;
