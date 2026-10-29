/**
 * Proposal validator (design recommendation 03 §2.3, review findings
 * F-05/F-11/F-20).
 *
 * The scheduling engine used to build `this.constraints` via `ConstraintFactory`
 * and then never run them — the validation loop body was a comment, so
 * generation happily produced days that Stage 1's health panel immediately
 * flagged (`not_onboarded`, `site_not_allowed`, …) and reported zero violations.
 *
 * This validator closes that gap by running every proposed generated day through
 * the SAME validator the manual paths use — `validateAssignmentCandidate` — so
 * the engine and Stage 1 agree on what is a violation and use the same codes.
 *
 * Policy:
 *  - HARD violations (student double-booked, missing entity) block the day.
 *  - SOFT violations never silently pass. A soft code named in `bypassed`
 *    (the run's `bypassedConstraints`, using Stage 1 vocabulary) is accepted and
 *    persisted on the row as an `override_codes` entry — exactly like a manual
 *    override — so the health panel shows it. A soft code that is NOT bypassed is
 *    surfaced as a violation on the run result (the day is still placed, matching
 *    the prior "produce a schedule" behaviour, but the issue is no longer
 *    invisible).
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { validateAssignmentCandidate, type Violation } from '../services/assignment-validation';
import { normalizeSession } from '../services/session-slots';

export interface ProposalInput {
	studentId: string;
	preceptorId: string;
	/** Null for a standalone-elective day (no parent clerkship, E3). */
	clerkshipId: string | null;
	date: string;
	/** Optional pre-resolved site; otherwise resolved from availability. */
	siteId?: string | null;
	/** Optional session; otherwise the preceptor's slot that day (a half day stays a half day). */
	session?: string | null;
}

export interface ProposalDecision {
	/** True when no hard violation blocks the day. */
	accepted: boolean;
	hard: Violation[];
	soft: Violation[];
	/** Soft codes accepted via `bypassed` — persisted as override_codes. */
	overrideCodes: string[];
	/** Soft codes NOT bypassed — surfaced as violations on the run. */
	surfaced: Violation[];
}

export class ProposalValidator {
	constructor(
		private db: Kysely<DB>,
		private scheduleId: string | null,
		private bypassed: Set<string> = new Set()
	) {}

	/** The site and session of a preceptor's slot on a date (for site and session checks). */
	private async resolveSlot(
		preceptorId: string,
		date: string
	): Promise<{ siteId: string | null; session: string | null }> {
		const row = await this.db
			.selectFrom('preceptor_availability')
			.select(['site_id', 'session'])
			.where('preceptor_id', '=', preceptorId)
			.where('date', '=', date)
			.where('is_available', '=', 1)
			.executeTakeFirst();
		return { siteId: row?.site_id ?? null, session: row?.session ?? null };
	}

	async validate(proposal: ProposalInput): Promise<ProposalDecision> {
		const slot =
			proposal.siteId !== undefined && proposal.session !== undefined
				? null
				: await this.resolveSlot(proposal.preceptorId, proposal.date);
		const site = proposal.siteId !== undefined ? proposal.siteId : (slot?.siteId ?? null);
		const session = proposal.session !== undefined ? proposal.session : (slot?.session ?? null);

		const result = await validateAssignmentCandidate(
			this.db,
			this.scheduleId ?? '',
			{
				student_id: proposal.studentId,
				preceptor_id: proposal.preceptorId,
				clerkship_id: proposal.clerkshipId,
				site_id: site,
				date: proposal.date,
				...(session ? { session: normalizeSession(session) } : {})
			},
			// Generation-time codes (`past_date`, `over_required_days`) are handled by
			// the engine's credit accounting, not here.
			{ checkCreateTimeCodes: false }
		);

		const overrideCodes: string[] = [];
		const surfaced: Violation[] = [];
		for (const v of result.soft) {
			if (this.bypassed.has(v.code)) overrideCodes.push(v.code);
			else surfaced.push(v);
		}

		return {
			accepted: result.hard.length === 0,
			hard: result.hard,
			soft: result.soft,
			overrideCodes,
			surfaced
		};
	}
}
