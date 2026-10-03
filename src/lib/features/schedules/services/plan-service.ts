/**
 * Manual schedule planner — the draft "pin" layer (L4).
 *
 * A pin is a tentative assignment a coordinator stages while planning. Pins live in
 * `schedule_plan_pins`, scoped to (schedule_id, user_id), and never touch the real
 * schedule until they are committed. The point of the planner is to SEE the conflicts
 * a pin set would produce before committing, so the dry-run (`evaluatePlan`) runs the
 * pins through the EXACT same rules as the whole-schedule validator by appending them
 * to the committed assignments and calling the shared `evaluateAssignments` — giving
 * commit-parity for free.
 */

import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { DB, SchedulePlanPins } from '$lib/db/types';
import {
	loadValidationInputs,
	evaluateAssignments,
	type ValidationAssignment,
	type ScheduleViolation,
	type ScheduleValidationResult
} from '$lib/features/scheduling/services/schedule-validation';
import { HARD_CODES, type Violation } from '$lib/features/scheduling/services/assignment-validation';
import { createManualAssignment } from '$lib/features/schedules/services/assignment-service';

/** Synthetic assignment id a pin carries into the evaluator, so a violation can be
 * attributed back to the pin (committed rows keep their raw uuid). */
export const PIN_ID_PREFIX = 'pin:';
export const pinAssignmentId = (pinId: string): string => `${PIN_ID_PREFIX}${pinId}`;
export const isPinAssignmentId = (id: string | null | undefined): boolean =>
	typeof id === 'string' && id.startsWith(PIN_ID_PREFIX);

export type PlanPin = Selectable<SchedulePlanPins> & { id: string };

export type PlanKind = 'clinical' | 'free_day' | 'exam';
export type PlanSession = 'full' | 'am' | 'pm';

/** Fields a caller supplies to stage one or more pins (one per date). */
export interface PlanPinInput {
	student_id: string;
	preceptor_id?: string | null;
	clerkship_id?: string | null;
	site_id?: string | null;
	elective_id?: string | null;
	dates: string[];
	session?: PlanSession;
	kind?: PlanKind;
	credit_value?: number;
	override_codes?: string[];
	override_note?: string | null;
}

/** A patch to an existing pin. Only the provided fields change. */
export interface PlanPinPatch {
	preceptor_id?: string | null;
	clerkship_id?: string | null;
	site_id?: string | null;
	elective_id?: string | null;
	date?: string;
	session?: PlanSession;
	kind?: PlanKind;
	credit_value?: number;
	override_codes?: string[];
	override_note?: string | null;
}

const PIN_COLUMNS = [
	'id',
	'schedule_id',
	'user_id',
	'student_id',
	'preceptor_id',
	'clerkship_id',
	'site_id',
	'elective_id',
	'date',
	'session',
	'kind',
	'credit_value',
	'override_codes',
	'override_note',
	'created_at',
	'updated_at'
] as const;

function nowIso(): string {
	return new Date().toISOString();
}

function parseOverrideCodes(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
	} catch {
		return [];
	}
}

/** Every pin in a coordinator's draft for a schedule, oldest first. */
export async function listPins(
	db: Kysely<DB>,
	scheduleId: string,
	userId: string
): Promise<PlanPin[]> {
	const rows = await db
		.selectFrom('schedule_plan_pins')
		.select(PIN_COLUMNS)
		.where('schedule_id', '=', scheduleId)
		.where('user_id', '=', userId)
		.orderBy('created_at', 'asc')
		.orderBy('id', 'asc')
		.execute();
	return rows as PlanPin[];
}

/** Stage one pin per date. Returns the created pins. */
export async function addPins(
	db: Kysely<DB>,
	scheduleId: string,
	userId: string,
	input: PlanPinInput
): Promise<PlanPin[]> {
	const ts = nowIso();
	const kind = input.kind ?? 'clinical';
	// A non-clinical pin carries no preceptor / clerkship / site.
	const clinical = kind === 'clinical';
	const rows = input.dates.map((date) => ({
		id: randomUUID(),
		schedule_id: scheduleId,
		user_id: userId,
		student_id: input.student_id,
		preceptor_id: clinical ? (input.preceptor_id ?? null) : null,
		clerkship_id: clinical ? (input.clerkship_id ?? null) : null,
		site_id: clinical ? (input.site_id ?? null) : null,
		elective_id: clinical ? (input.elective_id ?? null) : null,
		date,
		session: input.session ?? 'full',
		kind,
		credit_value: input.credit_value ?? 1,
		override_codes: JSON.stringify(input.override_codes ?? []),
		override_note: input.override_note ?? null,
		created_at: ts,
		updated_at: ts
	}));
	if (rows.length === 0) return [];
	await db.insertInto('schedule_plan_pins').values(rows).execute();
	const ids = rows.map((r) => r.id);
	const created = await db
		.selectFrom('schedule_plan_pins')
		.select(PIN_COLUMNS)
		.where('id', 'in', ids)
		.execute();
	return created as PlanPin[];
}

/** Update one pin in the caller's draft. Returns the updated pin, or null if absent. */
export async function updatePin(
	db: Kysely<DB>,
	scheduleId: string,
	userId: string,
	pinId: string,
	patch: PlanPinPatch
): Promise<PlanPin | null> {
	const values: Record<string, unknown> = { updated_at: nowIso() };
	if (patch.preceptor_id !== undefined) values.preceptor_id = patch.preceptor_id;
	if (patch.clerkship_id !== undefined) values.clerkship_id = patch.clerkship_id;
	if (patch.site_id !== undefined) values.site_id = patch.site_id;
	if (patch.elective_id !== undefined) values.elective_id = patch.elective_id;
	if (patch.date !== undefined) values.date = patch.date;
	if (patch.session !== undefined) values.session = patch.session;
	if (patch.kind !== undefined) values.kind = patch.kind;
	if (patch.credit_value !== undefined) values.credit_value = patch.credit_value;
	if (patch.override_codes !== undefined) values.override_codes = JSON.stringify(patch.override_codes);
	if (patch.override_note !== undefined) values.override_note = patch.override_note;

	const res = await db
		.updateTable('schedule_plan_pins')
		.set(values)
		.where('id', '=', pinId)
		.where('schedule_id', '=', scheduleId)
		.where('user_id', '=', userId)
		.executeTakeFirst();
	if (!res.numUpdatedRows || res.numUpdatedRows === 0n) return null;

	const row = await db
		.selectFrom('schedule_plan_pins')
		.select(PIN_COLUMNS)
		.where('id', '=', pinId)
		.executeTakeFirst();
	return (row as PlanPin) ?? null;
}

/** Delete one pin. Returns true if a row was removed. */
export async function deletePin(
	db: Kysely<DB>,
	scheduleId: string,
	userId: string,
	pinId: string
): Promise<boolean> {
	const res = await db
		.deleteFrom('schedule_plan_pins')
		.where('id', '=', pinId)
		.where('schedule_id', '=', scheduleId)
		.where('user_id', '=', userId)
		.executeTakeFirst();
	return (res.numDeletedRows ?? 0n) > 0n;
}

/** Discard the whole draft. Returns how many pins were removed. */
export async function clearPins(
	db: Kysely<DB>,
	scheduleId: string,
	userId: string
): Promise<number> {
	const res = await db
		.deleteFrom('schedule_plan_pins')
		.where('schedule_id', '=', scheduleId)
		.where('user_id', '=', userId)
		.executeTakeFirst();
	return Number(res.numDeletedRows ?? 0n);
}

/** Map a pin to the assignment shape the evaluator consumes (synthetic `pin:` id). */
export function pinToValidationAssignment(pin: PlanPin): ValidationAssignment {
	return {
		id: pinAssignmentId(pin.id),
		student_id: pin.student_id,
		preceptor_id: pin.preceptor_id,
		clerkship_id: pin.clerkship_id,
		site_id: pin.site_id,
		date: pin.date,
		credit_value: pin.credit_value,
		session: pin.session,
		kind: pin.kind
	};
}

/** Per-pin conflict summary for the planner UI. */
export interface PinStatus {
	/** Raw hard-code violations touching this pin (block commit; cannot be overridden). */
	hard: ScheduleViolation[];
	/** Raw soft-code violations touching this pin. */
	soft: ScheduleViolation[];
	/** Soft codes not yet accepted on the pin (would block commit until overridden). */
	unresolved: string[];
	/** True when this pin would commit as-is: no hard codes, every soft code accepted. */
	committable: boolean;
}

export interface PlanEvaluation extends ScheduleValidationResult {
	/** The pins the evaluation ran over, in draft order. */
	pins: PlanPin[];
	/** Conflict summary per pin id. */
	pinStatus: Record<string, PinStatus>;
}

/**
 * The dry run: evaluate the caller's draft layered on the committed schedule using the
 * same rules as commit. Returns the whole-schedule result (committed ∪ pins) plus a
 * per-pin summary so the UI can mark which pins would, or would not, commit.
 */
export async function evaluatePlan(
	db: Kysely<DB>,
	scheduleId: string,
	userId: string
): Promise<PlanEvaluation> {
	const pins = await listPins(db, scheduleId, userId);

	const inputs = await loadValidationInputs(db, scheduleId, {
		preceptorIds: pins.map((p) => p.preceptor_id).filter((p): p is string => p !== null),
		clerkshipIds: pins.map((p) => p.clerkship_id).filter((c): c is string => c !== null),
		studentIds: pins.map((p) => p.student_id)
	});

	const pinAssignments = pins.map(pinToValidationAssignment);
	const result = evaluateAssignments({
		...inputs,
		assignments: [...inputs.assignments, ...pinAssignments]
	});

	const pinStatus: Record<string, PinStatus> = {};
	for (const pin of pins) {
		const synthetic = pinAssignmentId(pin.id);
		const touching = result.violations.filter((v) => v.assignment_ids.includes(synthetic));
		const hard = touching.filter((v) => HARD_CODES.has(v.code));
		const soft = touching.filter((v) => !HARD_CODES.has(v.code));
		const accepted = new Set(parseOverrideCodes(pin.override_codes));
		const unresolved = [...new Set(soft.map((v) => v.code))].filter((c) => !accepted.has(c));
		pinStatus[pin.id] = {
			hard,
			soft,
			unresolved,
			committable: hard.length === 0 && unresolved.length === 0
		};
	}

	return { ...result, pins, pinStatus };
}

/** Outcome of committing one pin. */
export interface PinCommitResult {
	pinId: string;
	created: boolean;
	/** Why it was skipped (absent when created). */
	reason?: 'hard' | 'soft';
	/** The blocking codes, for the UI to explain the skip. */
	codes: string[];
}

export interface CommitResult {
	committed: number;
	skipped: number;
	results: PinCommitResult[];
}

/**
 * Turn the draft into real assignments. Every pin runs through the SAME validator as
 * manual create (createManualAssignment), so a pin that read "committable" in the dry
 * run persists and one with an unresolved hard/soft conflict is skipped with a reason
 * — a partial success, never all-or-nothing. Created pins are removed from the draft;
 * skipped pins stay so the coordinator can fix them. All in one transaction: the
 * inserts and the matching pin deletions commit together, and each pin is validated
 * against the rows committed earlier in the same batch (true commit-parity).
 */
export async function commitPlan(
	db: Kysely<DB>,
	scheduleId: string,
	userId: string
): Promise<CommitResult> {
	const pins = await listPins(db, scheduleId, userId);
	if (pins.length === 0) return { committed: 0, skipped: 0, results: [] };

	return db.transaction().execute(async (trx) => {
		const results: PinCommitResult[] = [];
		let committed = 0;
		let skipped = 0;

		for (const pin of pins) {
			const res = await createManualAssignment(trx, scheduleId, {
				student_id: pin.student_id,
				preceptor_id: pin.preceptor_id,
				clerkship_id: pin.clerkship_id,
				site_id: pin.site_id,
				elective_id: pin.elective_id,
				date: pin.date,
				session: pin.session as 'full' | 'am' | 'pm',
				kind: pin.kind as PlanKind,
				credit_value: pin.credit_value,
				override_codes: parseOverrideCodes(pin.override_codes),
				override_note: pin.override_note
			});

			if (res.ok) {
				committed++;
				results.push({ pinId: pin.id, created: true, codes: [] });
				await trx.deleteFrom('schedule_plan_pins').where('id', '=', pin.id).execute();
			} else {
				skipped++;
				const reason: 'hard' | 'soft' = res.hard.length > 0 ? 'hard' : 'soft';
				const codes = [...res.hard, ...res.soft].map((v: Violation) => v.code);
				results.push({ pinId: pin.id, created: false, reason, codes });
			}
		}

		return { committed, skipped, results };
	});
}
