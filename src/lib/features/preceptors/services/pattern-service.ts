/**
 * Preceptor Availability Pattern Service Layer
 *
 * Business logic and database operations for availability patterns
 */

import type { Kysely, Selectable } from 'kysely';
import type { DB, PreceptorAvailabilityPatterns } from '$lib/db/types';
import type {
	CreatePattern,
	UpdatePattern,
	PatternGenerationResult,
	SavePatternDates
} from '../pattern-schemas';
import { NotFoundError, ConflictError } from '$lib/api/errors';
import { preceptorExists } from './preceptor-service';
import { applyPatternsBySpecificity, generateDatesFromPattern } from './pattern-generators';
import { setAvailability } from './availability-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:preceptors:pattern');

// ========================================
// CRUD Operations
// ========================================

/**
 * Get all patterns for a preceptor
 */
export async function getPatterns(
	db: Kysely<DB>,
	preceptorId: string
): Promise<Selectable<PreceptorAvailabilityPatterns>[]> {
	return await db
		.selectFrom('preceptor_availability_patterns')
		.selectAll()
		.where('preceptor_id', '=', preceptorId)
		.orderBy('specificity', 'asc')
		.orderBy('created_at', 'asc')
		.execute();
}

/**
 * Get a single pattern by ID
 */
export async function getPatternById(
	db: Kysely<DB>,
	id: string
): Promise<Selectable<PreceptorAvailabilityPatterns> | null> {
	const pattern = await db
		.selectFrom('preceptor_availability_patterns')
		.selectAll()
		.where('id', '=', id)
		.executeTakeFirst();

	return pattern || null;
}

/**
 * Get enabled patterns for a preceptor (used for date generation)
 */
export async function getEnabledPatterns(
	db: Kysely<DB>,
	preceptorId: string
): Promise<Selectable<PreceptorAvailabilityPatterns>[]> {
	return await db
		.selectFrom('preceptor_availability_patterns')
		.selectAll()
		.where('preceptor_id', '=', preceptorId)
		.where('enabled', '=', 1)
		.orderBy('specificity', 'asc')
		.orderBy('created_at', 'asc')
		.execute();
}

/**
 * Create a new pattern
 */
export async function createPattern(
	db: Kysely<DB>,
	data: CreatePattern
): Promise<Selectable<PreceptorAvailabilityPatterns>> {
	log.debug('Creating availability pattern', {
		preceptorId: data.preceptor_id,
		siteId: data.site_id,
		patternType: data.pattern_type,
		specificity: data.specificity
	});

	// Verify preceptor exists
	const exists = await preceptorExists(db, data.preceptor_id);
	if (!exists) {
		log.warn('Preceptor not found for pattern creation', { preceptorId: data.preceptor_id });
		throw new NotFoundError('Preceptor');
	}

	const timestamp = new Date().toISOString();
	const id = crypto.randomUUID();

	const newPattern = {
		id,
		preceptor_id: data.preceptor_id,
		site_id: data.site_id,
		pattern_type: data.pattern_type,
		is_available: data.is_available ? 1 : 0,
		specificity: data.specificity,
		date_range_start: data.date_range_start,
		date_range_end: data.date_range_end,
		config: data.config ? JSON.stringify(data.config) : null,
		reason: data.reason || null,
		enabled: data.enabled ? 1 : 0,
		created_at: timestamp,
		updated_at: timestamp
	};

	const inserted = await db
		.insertInto('preceptor_availability_patterns')
		.values(newPattern)
		.returningAll()
		.executeTakeFirstOrThrow();

	log.info('Availability pattern created', {
		id: inserted.id,
		preceptorId: inserted.preceptor_id,
		patternType: inserted.pattern_type,
		enabled: Boolean(inserted.enabled)
	});

	return inserted;
}

/**
 * Update an existing pattern
 */
export async function updatePattern(
	db: Kysely<DB>,
	id: string,
	data: UpdatePattern
): Promise<Selectable<PreceptorAvailabilityPatterns>> {
	// Check if pattern exists
	const existing = await getPatternById(db, id);
	if (!existing) {
		throw new NotFoundError('Pattern');
	}

	const timestamp = new Date().toISOString();

	const updateData: any = {
		updated_at: timestamp
	};

	if (data.is_available !== undefined) {
		updateData.is_available = data.is_available ? 1 : 0;
	}

	if (data.date_range_start !== undefined) {
		updateData.date_range_start = data.date_range_start;
	}

	if (data.date_range_end !== undefined) {
		updateData.date_range_end = data.date_range_end;
	}

	if (data.config !== undefined) {
		updateData.config = data.config ? JSON.stringify(data.config) : null;
	}

	if (data.reason !== undefined) {
		updateData.reason = data.reason || null;
	}

	if (data.enabled !== undefined) {
		updateData.enabled = data.enabled ? 1 : 0;
	}

	const updated = await db
		.updateTable('preceptor_availability_patterns')
		.set(updateData)
		.where('id', '=', id)
		.returningAll()
		.executeTakeFirstOrThrow();

	return updated;
}

/**
 * Delete a pattern
 */
export async function deletePattern(db: Kysely<DB>, id: string): Promise<void> {
	// Check if pattern exists
	const pattern = await getPatternById(db, id);
	if (!pattern) {
		throw new NotFoundError('Pattern');
	}

	await db
		.deleteFrom('preceptor_availability_patterns')
		.where('id', '=', id)
		.execute();
}

/**
 * Enable a pattern
 */
export async function enablePattern(
	db: Kysely<DB>,
	id: string
): Promise<Selectable<PreceptorAvailabilityPatterns>> {
	return await updatePattern(db, id, { enabled: true });
}

/**
 * Disable a pattern
 */
export async function disablePattern(
	db: Kysely<DB>,
	id: string
): Promise<Selectable<PreceptorAvailabilityPatterns>> {
	return await updatePattern(db, id, { enabled: false });
}

// ========================================
// Date Generation Operations
// ========================================

/**
 * Convert database pattern to CreatePattern type for generation
 */
function dbPatternToCreatePattern(
	dbPattern: Selectable<PreceptorAvailabilityPatterns>
): CreatePattern {
	const config = dbPattern.config ? JSON.parse(dbPattern.config) : null;

	return {
		preceptor_id: dbPattern.preceptor_id,
		site_id: dbPattern.site_id,
		pattern_type: dbPattern.pattern_type as any,
		is_available: dbPattern.is_available === 1,
		specificity: dbPattern.specificity as 1 | 2 | 3,
		date_range_start: dbPattern.date_range_start,
		date_range_end: dbPattern.date_range_end,
		config,
		reason: dbPattern.reason || undefined,
		enabled: dbPattern.enabled === 1
	};
}

/**
 * Generate availability dates from all enabled patterns for a preceptor
 *
 * @param db - Database instance
 * @param preceptorId - Preceptor ID
 * @returns Generation result with statistics and preview
 */
export async function generateDatesFromPatterns(
	db: Kysely<DB>,
	preceptorId: string
): Promise<PatternGenerationResult> {
	log.debug('Generating dates from patterns', { preceptorId });

	// Verify preceptor exists
	const exists = await preceptorExists(db, preceptorId);
	if (!exists) {
		log.warn('Preceptor not found for date generation', { preceptorId });
		throw new NotFoundError('Preceptor');
	}

	// Get all enabled patterns
	const dbPatterns = await getEnabledPatterns(db, preceptorId);

	// Convert to CreatePattern format
	const patterns = dbPatterns.map(dbPatternToCreatePattern);

	// Apply patterns by specificity
	const generatedDates = applyPatternsBySpecificity(patterns);

	// Calculate statistics
	const availableDates = generatedDates.filter(d => d.is_available).length;
	const unavailableDates = generatedDates.filter(d => !d.is_available).length;

	log.info('Dates generated from patterns', {
		preceptorId,
		patternsUsed: patterns.length,
		totalDates: generatedDates.length,
		availableDates,
		unavailableDates
	});

	return {
		generated_dates: generatedDates.length,
		available_dates: availableDates,
		unavailable_dates: unavailableDates,
		preview: generatedDates
	};
}

/**
 * Generate dates from a single pattern (for preview before saving)
 *
 * @param pattern - Pattern to generate from
 * @returns Array of date strings
 */
export function generateDatesPreview(pattern: CreatePattern): string[] {
	return generateDatesFromPattern(pattern);
}

/**
 * Save generated availability dates to the database
 *
 * @param db - Database instance
 * @param data - Save configuration
 * @returns Number of dates saved
 */
export async function saveGeneratedDates(
	db: Kysely<DB>,
	data: SavePatternDates
): Promise<number> {
	log.debug('Saving generated dates', {
		preceptorId: data.preceptor_id,
		clearExisting: data.clear_existing
	});

	// Verify preceptor exists
	const exists = await preceptorExists(db, data.preceptor_id);
	if (!exists) {
		log.warn('Preceptor not found for saving generated dates', { preceptorId: data.preceptor_id });
		throw new NotFoundError('Preceptor');
	}

	// Generate dates from patterns
	const result = await generateDatesFromPatterns(db, data.preceptor_id);

	// Clear existing availability if requested
	if (data.clear_existing) {
		await db
			.deleteFrom('preceptor_availability')
			.where('preceptor_id', '=', data.preceptor_id)
			.execute();
	}

	// Save all generated dates using site_id from each generated date
	for (const generatedDate of result.preview) {
		await setAvailability(
			db,
			data.preceptor_id,
			generatedDate.site_id,
			generatedDate.date,
			generatedDate.is_available
		);
	}

	log.info('Generated dates saved', {
		preceptorId: data.preceptor_id,
		datesSaved: result.generated_dates,
		clearedExisting: data.clear_existing
	});

	return result.generated_dates;
}

/**
 * Delete all patterns for a preceptor
 *
 * @param db - Database instance
 * @param preceptorId - Preceptor ID
 */
export async function deleteAllPatterns(db: Kysely<DB>, preceptorId: string): Promise<void> {
	await db
		.deleteFrom('preceptor_availability_patterns')
		.where('preceptor_id', '=', preceptorId)
		.execute();
}

/**
 * Get pattern count by type for a preceptor
 */
export async function getPatternStats(
	db: Kysely<DB>,
	preceptorId: string
): Promise<{
	total: number;
	enabled: number;
	by_type: Record<string, number>;
}> {
	const patterns = await getPatterns(db, preceptorId);

	const stats = {
		total: patterns.length,
		enabled: patterns.filter(p => p.enabled === 1).length,
		by_type: {} as Record<string, number>
	};

	for (const pattern of patterns) {
		stats.by_type[pattern.pattern_type] = (stats.by_type[pattern.pattern_type] || 0) + 1;
	}

	return stats;
}
