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
