/**
 * Schedule distribution (client feedback K1) — per-recipient, minimum-necessary
 * views of a schedule, plus the send audit log.
 *
 * Implements the FERPA scoping decision in docs/plans/ferpa-scoping.md: each
 * recipient sees ONLY the rows scoped to them and ONLY the fields the
 * minimum-necessary matrix (§2/§3) allows. No view ever carries an override note,
 * requirement/progress data, or another student's identity. Redaction happens
 * here, before any payload leaves the service, so whatever the transport it can
 * only carry the minimum-necessary view.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { nanoid } from 'nanoid';

export type RecipientType = 'preceptor' | 'student' | 'site';

export interface Recipient {
	type: RecipientType;
	id: string;
}

/** One day entry in a recipient's view. Fields present per the matrix (§3). */
export interface RecipientDay {
	date: string;
	session: string;
	/** Present for preceptor and site views (they must know who they supervise), and
	 * implicitly the student's own days. Never another student's name in those views. */
	studentName?: string;
	clerkshipName?: string | null;
	preceptorName?: string | null;
	siteName?: string | null;
	/** Only on a student's own view — they see their whole day incl. non-clinical. */
	kind?: string;
}

export interface RecipientView {
	recipient: Recipient;
	/** The recipient's own display name (the preceptor/student/site). */
	recipientName: string;
	/** Only on a student's own view — it's their record, so they get their contact line. */
	recipientEmail?: string;
	days: RecipientDay[];
}

/** Resolve a recipient's display name (and email, for a student). Null if the id
 * is not a real entity of that type. */
async function resolveRecipient(
	db: Kysely<DB>,
	recipient: Recipient
): Promise<{ name: string; email?: string } | null> {
	if (recipient.type === 'preceptor') {
		const p = await db
			.selectFrom('preceptors')
			.select('name')
			.where('id', '=', recipient.id)
			.executeTakeFirst();
		return p ? { name: p.name } : null;
	}
	if (recipient.type === 'site') {
		const s = await db
			.selectFrom('sites')
			.select('name')
			.where('id', '=', recipient.id)
			.executeTakeFirst();
		return s ? { name: s.name } : null;
	}
	const stu = await db
		.selectFrom('students')
		.select(['name', 'email'])
		.where('id', '=', recipient.id)
		.executeTakeFirst();
	return stu ? { name: stu.name, email: stu.email } : null;
}

/**
 * Build the scoped, redacted day list for one recipient of one schedule.
 *
 * The assignment query is filtered by BOTH `schedule_id` (tenant scope, §5) AND
 * the recipient's own id, so a preceptor never sees another preceptor's rows, a
 * site never another site's, and a student never another student's — the FERPA
 * assertion. Only the matrix-allowed fields are selected; `override_note` /
 * `override_codes` / progress are never queried here.
 */
export async function buildRecipientView(
	db: Kysely<DB>,
	scheduleId: string,
	recipient: Recipient
): Promise<RecipientView | null> {
	const who = await resolveRecipient(db, recipient);
	if (!who) return null;

	let query = db
		.selectFrom('schedule_assignments as sa')
		.leftJoin('students as stu', 'stu.id', 'sa.student_id')
		.leftJoin('preceptors as p', 'p.id', 'sa.preceptor_id')
		.leftJoin('clerkships as c', 'c.id', 'sa.clerkship_id')
		.leftJoin('sites as site', 'site.id', 'sa.site_id')
		.where('sa.schedule_id', '=', scheduleId)
		.select([
			'sa.date as date',
			'sa.session as session',
			'sa.kind as kind',
			'stu.name as studentName',
			'p.name as preceptorName',
			'c.name as clerkshipName',
			'site.name as siteName'
		])
		.orderBy('sa.date', 'asc');

	if (recipient.type === 'preceptor') query = query.where('sa.preceptor_id', '=', recipient.id);
	else if (recipient.type === 'site') query = query.where('sa.site_id', '=', recipient.id);
	else query = query.where('sa.student_id', '=', recipient.id);

	const rows = await query.execute();

	const days: RecipientDay[] = rows.map((r) => {
		if (recipient.type === 'preceptor') {
			// §3: date, session, studentName, clerkshipName, siteName.
			return {
				date: r.date,
				session: r.session,
				studentName: r.studentName ?? undefined,
				clerkshipName: r.clerkshipName,
				siteName: r.siteName
			};
		}
		if (recipient.type === 'site') {
			// §3: date, session, studentName, clerkshipName, preceptorName.
			return {
				date: r.date,
				session: r.session,
				studentName: r.studentName ?? undefined,
				clerkshipName: r.clerkshipName,
				preceptorName: r.preceptorName
			};
		}
		// Student's own view: their whole day incl. non-clinical; no other student's data.
		return {
			date: r.date,
			session: r.session,
			kind: r.kind,
			clerkshipName: r.clerkshipName,
			preceptorName: r.preceptorName,
			siteName: r.siteName
		};
	});

	return {
		recipient,
		recipientName: who.name,
		// The student's own contact line only — never included in preceptor/site views.
		...(recipient.type === 'student' && who.email ? { recipientEmail: who.email } : {}),
		days
	};
}

/** Build the views for many recipients at once (preview). Unknown recipients are
 * skipped (null views dropped) — the caller validates membership first. */
export async function buildRecipientViews(
	db: Kysely<DB>,
	scheduleId: string,
	recipients: Recipient[]
): Promise<RecipientView[]> {
	const views = await Promise.all(recipients.map((r) => buildRecipientView(db, scheduleId, r)));
	return views.filter((v): v is RecipientView => v !== null);
}

export interface DistributionRecord {
	recipientType: RecipientType;
	recipientId: string;
	recipientName: string;
	dayCount: number;
}

/**
 * Record one audit row per recipient for a confirmed send. Stores ids + counts
 * only — never the student data (§4). Returns the per-recipient summary.
 */
export async function recordDistribution(
	db: Kysely<DB>,
	scheduleId: string,
	senderUserId: string,
	views: RecipientView[]
): Promise<DistributionRecord[]> {
	if (views.length === 0) return [];
	const ts = new Date().toISOString();
	await db
		.insertInto('schedule_distributions')
		.values(
			views.map((v) => ({
				id: nanoid(),
				schedule_id: scheduleId,
				sender_user_id: senderUserId,
				recipient_type: v.recipient.type,
				recipient_id: v.recipient.id,
				day_count: v.days.length,
				created_at: ts
			}))
		)
		.execute();
	return views.map((v) => ({
		recipientType: v.recipient.type,
		recipientId: v.recipient.id,
		recipientName: v.recipientName,
		dayCount: v.days.length
	}));
}
