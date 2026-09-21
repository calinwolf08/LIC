/**
 * Audit Service for Schedule Regeneration
 *
 * Tracks regeneration events for accountability and debugging
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { RegenerationStrategy } from './regeneration-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:scheduling:audit');

/**
 * Audit log entry for schedule regeneration
 */
export interface RegenerationAuditLog {
	id: string;
	timestamp: string;
	strategy: RegenerationStrategy;
	regenerateFromDate: string;
	endDate: string;

	// Impact metrics
	pastAssignmentsCount: number;
	futureAssignmentsDeleted: number;
	futureAssignmentsPreserved: number;
	affectedAssignments: number;
	newAssignmentsGenerated: number;

	// Metadata
	userId?: string; // Optional: track who triggered the regeneration
	reason?: string; // Optional: reason for regeneration
	notes?: string; // Optional: additional notes

	// Result
	success: boolean;
	errorMessage?: string;
}

/**
 * Log a schedule regeneration event
 *
 * This creates an audit trail for schedule changes, useful for:
 * - Accountability (who changed what and when)
 * - Debugging (understanding when/why schedules changed)
 * - Analysis (track regeneration patterns and impacts)
 *
 * @param db - Database connection
 * @param log - Audit log entry
 */
export async function logRegenerationEvent(
	db: Kysely<DB>,
	auditData: Omit<RegenerationAuditLog, 'id' | 'timestamp'>
): Promise<RegenerationAuditLog> {
	const auditLog: RegenerationAuditLog = {
		id: crypto.randomUUID(),
		timestamp: new Date().toISOString(),
		...auditData
	};

	log.info('Schedule regeneration event logged', {
		id: auditLog.id,
		timestamp: auditLog.timestamp,
		strategy: auditLog.strategy,
		regenerateFromDate: auditLog.regenerateFromDate,
		endDate: auditLog.endDate,
		impact: {
			pastAssignments: auditLog.pastAssignmentsCount,
			deleted: auditLog.futureAssignmentsDeleted,
			preserved: auditLog.futureAssignmentsPreserved,
			affected: auditLog.affectedAssignments,
			generated: auditLog.newAssignmentsGenerated
		},
		success: auditLog.success,
		userId: auditLog.userId || 'system',
		reason: auditLog.reason || 'manual_regeneration',
		errorMessage: auditLog.errorMessage
	});

	// TODO: Store in database table when audit_logs table is created
	// await db
	//   .insertInto('schedule_regeneration_audit')
	//   .values({
	//     id: auditLog.id,
	//     timestamp: auditLog.timestamp,
	//     strategy: auditLog.strategy,
	//     regenerate_from_date: auditLog.regenerateFromDate,
	//     end_date: auditLog.endDate,
	//     past_assignments_count: auditLog.pastAssignmentsCount,
	//     future_assignments_deleted: auditLog.futureAssignmentsDeleted,
	//     future_assignments_preserved: auditLog.futureAssignmentsPreserved,
	//     affected_assignments: auditLog.affectedAssignments,
	//     new_assignments_generated: auditLog.newAssignmentsGenerated,
	//     user_id: auditLog.userId,
	//     reason: auditLog.reason,
	//     notes: auditLog.notes,
	//     success: auditLog.success ? 1 : 0,
	//     error_message: auditLog.errorMessage
	//   })
	//   .execute();

	return auditLog;
}

/**
 * A persisted generation run (review findings F-24 audit, F-25 diagnostics).
 * `options`, `plan` and `result` are stored as JSON so the Results page can
 * render the last run's violations / unmet requirements / statistics without
 * recomputing them.
 */
export interface GenerationRunInput {
	scheduleId: string;
	userId?: string | null;
	mode: RegenerationStrategy;
	preview: boolean;
	success: boolean;
	durationMs: number;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	options: Record<string, any>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	plan: Record<string, any>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	result: Record<string, any>;
}

/** Persist one generation run and return its id (F-24). */
export async function recordGenerationRun(
	db: Kysely<DB>,
	run: GenerationRunInput
): Promise<string> {
	const id = crypto.randomUUID();
	await db
		.insertInto('generation_runs')
		.values({
			id,
			schedule_id: run.scheduleId,
			user_id: run.userId ?? null,
			created_at: new Date().toISOString(),
			mode: run.mode,
			preview: run.preview ? 1 : 0,
			options_json: JSON.stringify(run.options),
			plan_json: JSON.stringify(run.plan),
			result_json: JSON.stringify(run.result),
			success: run.success ? 1 : 0,
			duration_ms: Math.max(0, Math.round(run.durationMs))
		})
		.execute();
	return id;
}

/**
 * The latest non-preview generation run for a schedule, with its JSON columns
 * parsed. Powers the Results page (F-25). Returns null when none exists.
 */
export async function getLatestGenerationRun(
	db: Kysely<DB>,
	scheduleId: string
): Promise<{
	id: string;
	createdAt: string;
	mode: string;
	success: boolean;
	durationMs: number;
	userId: string | null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	options: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	plan: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	result: any;
} | null> {
	const row = await db
		.selectFrom('generation_runs')
		.selectAll()
		.where('schedule_id', '=', scheduleId)
		.where('preview', '=', 0)
		.orderBy('created_at', 'desc')
		.executeTakeFirst();
	if (!row) return null;
	const safeParse = (s: string) => {
		try {
			return JSON.parse(s);
		} catch {
			return null;
		}
	};
	return {
		id: row.id,
		createdAt: row.created_at,
		mode: row.mode,
		success: row.success === 1,
		durationMs: row.duration_ms,
		userId: row.user_id,
		options: safeParse(row.options_json),
		plan: safeParse(row.plan_json),
		result: safeParse(row.result_json)
	};
}

/**
 * Helper to create audit log from regeneration results
 */
export function createRegenerationAuditLog(
	strategy: RegenerationStrategy,
	regenerateFromDate: string,
	endDate: string,
	pastAssignmentsCount: number,
	futureAssignmentsDeleted: number,
	futureAssignmentsPreserved: number,
	affectedAssignments: number,
	newAssignmentsGenerated: number,
	success: boolean,
	options?: {
		userId?: string;
		reason?: string;
		notes?: string;
		errorMessage?: string;
	}
): Omit<RegenerationAuditLog, 'id' | 'timestamp'> {
	return {
		strategy,
		regenerateFromDate,
		endDate,
		pastAssignmentsCount,
		futureAssignmentsDeleted,
		futureAssignmentsPreserved,
		affectedAssignments,
		newAssignmentsGenerated,
		success,
		userId: options?.userId,
		reason: options?.reason,
		notes: options?.notes,
		errorMessage: options?.errorMessage
	};
}
