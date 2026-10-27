/**
 * Manual planner — which choices are valid? (planner feedback)
 *
 * The planner's pickers (student, clerkship, preceptor, site, dates) filter each
 * other in any order: every option is checked against whatever else is already
 * picked, and against what's already booked (committed assignments AND the other
 * pins in the draft). An option that can't work comes back `eligible: false` with
 * the reasons, so the UI can hide it by default and still offer it as an override.
 *
 * Only hard conflicts filter (see PLAN_FILTER_CODES). Softer findings — onboarding,
 * core preceptor, mutual exclusion, block weeks — don't hide anything; they still
 * show on the staged pin for the coordinator to accept or fix.
 *
 * `loadPlanOptionsInputs` does every DB read once; `computePlanOptions` is pure, so
 * the same rules are cheap to run per keystroke and easy to unit test.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import {
	loadPreceptorFitData,
	preceptorFitViolations,
	type PreceptorFitData
} from '$lib/features/scheduling/services/preceptor-fit';
import {
	normalizeSession,
	sessionsOverlap,
	type SessionSlot
} from '$lib/features/scheduling/services/session-slots';
import type { DayBooking, DayState } from '$lib/features/scheduling/services/assignment-day-state';
import {
	normalizeSchedulingKind,
	weekKey,
	type SchedulingKind
} from '$lib/features/scheduling/services/scheduling-kind';
import { listPins, type PlanKind } from './plan-service';

/** The conflicts that hide an option unless the coordinator chooses to override. */
export const PLAN_FILTER_CODES = [
	'session_clash',
	'preceptor_unavailable',
	'preceptor_wrong_site',
	'preceptor_not_teaching',
	'preceptor_capacity',
	'blackout_date',
	'site_not_allowed',
	'outside_schedule',
	'past_date',
	'block_week_conflict'
] as const;

export type PlanFilterCode = (typeof PLAN_FILTER_CODES)[number];

/**
 * Not overridable, they only explain a hidden option: `no_preceptor` — nobody could
 * take the student with these choices; `no_open_days` — the preceptor has no day
 * left in the schedule that works with these choices (full, unavailable, …).
 */
export type PlanIssueCode = PlanFilterCode | 'no_preceptor' | 'no_open_days';

/** Short reasons for option labels ("Dr. Lee — Not available"). */
export const PLAN_REASON: Record<PlanIssueCode, string> = {
	session_clash: 'Student already booked',
	preceptor_unavailable: 'Not available',
	preceptor_wrong_site: 'At a different site',
	preceptor_not_teaching: 'Doesn’t teach this clerkship',
	preceptor_capacity: 'At capacity',
	blackout_date: 'Blackout date',
	site_not_allowed: 'Not approved for this clerkship',
	outside_schedule: 'Outside the schedule',
	past_date: 'In the past',
	block_week_conflict: 'Clashes with an inpatient block week',
	no_preceptor: 'No preceptor available',
	no_open_days: 'No open days left'
};

interface Named {
	id: string;
	name: string;
}

export interface PlanSelection {
	studentId?: string | null;
	kind?: PlanKind;
	clerkshipId?: string | null;
	preceptorId?: string | null;
	siteId?: string | null;
	/** The days being staged (one for a single date, the expanded days for a range). */
	dates?: string[];
	/** A session, or 'any' to use whichever session works on each day. */
	session?: string | null;
}

/** The planner's session filter: one session, or 'any' (per day, whichever fits). */
export type PlanSessionChoice = SessionSlot | 'any';

export interface PlanIssue {
	code: PlanIssueCode;
	message: string;
}

export interface PlanOption {
	id: string;
	name: string;
	/** True when the option works on at least one of the selected days. */
	eligible: boolean;
	/** Why it doesn't (fully) work, e.g. "Not available on 2 of 5 days". */
	reasons: string[];
	codes: PlanIssueCode[];
	/** With dates selected: on how many of them the option works. */
	validDays?: number;
	totalDays?: number;
	/** Preceptors, no dates selected: days left in the schedule that work with the picks. */
	openDays?: number;
}

/** How much room a preceptor has left (independent of the current picks). */
export interface PreceptorCapacity {
	preceptorId: string;
	name: string;
	/** Days from today they're available, under their daily limit, and not blacked out. */
	openDays: number;
	/** Student places left across those days (limit minus who's booked, per day). */
	openSlots: number;
}

export interface PlanDateCheck {
	date: string;
	valid: boolean;
	issues: PlanIssue[];
	/** The session the day would be added as (with 'any', whichever fits that day). */
	session: SessionSlot;
}

export interface PlanOptions {
	students: PlanOption[];
	clerkships: PlanOption[];
	preceptors: PlanOption[];
	sites: PlanOption[];
	/** Each selected day, checked against the full selection. */
	dates: PlanDateCheck[];
	/** Every day in the schedule (from today) that works for the current selection. */
	openDates: string[];
	/** The session each open day would be added as. */
	openSessions: Record<string, SessionSlot>;
	/**
	 * Every day of the schedule, coloured for the date picker the way the assignment
	 * dialog's day states are: the picked preceptor's availability (session and site
	 * aware), who they already have (committed and draft), and whether the picked
	 * student is already booked. With no preceptor picked, a day is "available"
	 * when someone could take the selection.
	 */
	days: DayState[];
	/** Each preceptor's open days and places left, for the capacity panel. */
	capacity: PreceptorCapacity[];
}

export interface PlanOptionsInputs {
	start: string;
	end: string;
	today: string;
	blackouts: Set<string>;
	students: Named[];
	clerkships: Named[];
	preceptors: Named[];
	sites: Named[];
	/** clerkshipId -> allowed sites (absent/empty = any site). */
	clerkshipSites: Map<string, Set<string>>;
	fit: PreceptorFitData;
	/** preceptorId -> clerkshipId ('' = any clerkship) -> students per day. */
	capacity: Map<string, Map<string, number>>;
	/** "studentId:date" -> sessions already booked (committed + draft). */
	studentSessions: Map<string, SessionSlot[]>;
	/** "preceptorId:date" -> students already booked (committed + draft). */
	preceptorLoad: Map<string, number>;
	/** "preceptorId:date" -> who they are (draft pins carry a `pin:` id). */
	preceptorBookings: Map<string, Omit<DayBooking, 'studentName'>[]>;
	/** clerkshipId -> block (inpatient, whole weeks) | scattered (outpatient days). */
	clerkshipKind: Map<string, SchedulingKind>;
	/**
	 * "studentId:weekMonday" -> what the student already has that week (committed +
	 * draft): the inpatient block clerkships, and whether any outpatient day.
	 */
	studentWeeks: Map<string, { blocks: Set<string>; outpatient: boolean }>;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

function named(rows: { id: string | null; name: string }[]): Named[] {
	return rows.filter((r): r is Named => !!r.id).sort((a, b) => a.name.localeCompare(b.name));
}

/** Read everything the option filter needs for a schedule and a coordinator's draft. */
export async function loadPlanOptionsInputs(
	db: Kysely<DB>,
	scheduleId: string,
	userId: string,
	today: string = new Date().toISOString().slice(0, 10)
): Promise<PlanOptionsInputs> {
	const period = await db
		.selectFrom('scheduling_periods')
		.select(['start_date', 'end_date'])
		.where('id', '=', scheduleId)
		.executeTakeFirstOrThrow();

	const [students, clerkships, preceptors, sites, blackouts, pins] = await Promise.all([
		db
			.selectFrom('students')
			.innerJoin('schedule_students', 'schedule_students.student_id', 'students.id')
			.select(['students.id as id', 'students.name as name'])
			.where('schedule_students.schedule_id', '=', scheduleId)
			.execute(),
		db
			.selectFrom('clerkships')
			.innerJoin('schedule_clerkships', 'schedule_clerkships.clerkship_id', 'clerkships.id')
			.select([
				'clerkships.id as id',
				'clerkships.name as name',
				'clerkships.scheduling_kind as scheduling_kind'
			])
			.where('schedule_clerkships.schedule_id', '=', scheduleId)
			.execute(),
		db
			.selectFrom('preceptors')
			.innerJoin('schedule_preceptors', 'schedule_preceptors.preceptor_id', 'preceptors.id')
			.select(['preceptors.id as id', 'preceptors.name as name', 'preceptors.max_students'])
			.where('schedule_preceptors.schedule_id', '=', scheduleId)
			.execute(),
		db
			.selectFrom('sites')
			.innerJoin('schedule_sites', 'schedule_sites.site_id', 'sites.id')
			.select(['sites.id as id', 'sites.name as name'])
			.where('schedule_sites.schedule_id', '=', scheduleId)
			.execute(),
		db.selectFrom('blackout_dates').select('date').where('schedule_id', '=', scheduleId).execute(),
		listPins(db, scheduleId, userId)
	]);

	const studentIds = named(students).map((s) => s.id);
	const clerkshipIds = named(clerkships).map((c) => c.id);
	const preceptorIds = named(preceptors).map((p) => p.id);

	// Bookings are global, not schedule-scoped: a student or preceptor is one person
	// per day across every schedule, exactly as the create-time validator counts.
	const [clerkshipSiteRows, fit, rules, studentRows, preceptorRows] = await Promise.all([
		clerkshipIds.length
			? db
					.selectFrom('clerkship_sites')
					.select(['clerkship_id', 'site_id'])
					.where('clerkship_id', 'in', clerkshipIds)
					.execute()
			: Promise.resolve([]),
		loadPreceptorFitData(db, { preceptorIds, clerkshipIds }),
		preceptorIds.length
			? db
					.selectFrom('preceptor_capacity_rules')
					.select(['preceptor_id', 'clerkship_id', 'max_students_per_day'])
					.where('preceptor_id', 'in', preceptorIds)
					.where('requirement_type', 'is', null)
					.execute()
			: Promise.resolve([]),
		studentIds.length
			? db
					.selectFrom('schedule_assignments')
					.select(['student_id', 'date', 'session', 'kind', 'clerkship_id'])
					.where('student_id', 'in', studentIds)
					.where('date', '>=', period.start_date)
					.where('date', '<=', period.end_date)
					.execute()
			: Promise.resolve([]),
		preceptorIds.length
			? db
					.selectFrom('schedule_assignments')
					.select(['id', 'preceptor_id', 'student_id', 'date'])
					.where('preceptor_id', 'in', preceptorIds)
					.where('date', '>=', period.start_date)
					.where('date', '<=', period.end_date)
					.execute()
			: Promise.resolve([])
	]);

	const clerkshipSites = new Map<string, Set<string>>();
	for (const r of clerkshipSiteRows) {
		const set = clerkshipSites.get(r.clerkship_id) ?? new Set<string>();
		set.add(r.site_id);
		clerkshipSites.set(r.clerkship_id, set);
	}

	// Same precedence as CapacityChecker.resolveCapacityRule: a clerkship-specific
	// rule, then a general rule, then preceptors.max_students.
	const capacity = new Map<string, Map<string, number>>();
	for (const p of preceptors) {
		if (p.id) capacity.set(p.id, new Map([['', p.max_students ?? 1]]));
	}
	for (const r of rules.filter((r) => r.clerkship_id === null)) {
		capacity.get(r.preceptor_id)?.set('', r.max_students_per_day);
	}
	for (const r of rules.filter((r) => r.clerkship_id !== null)) {
		capacity.get(r.preceptor_id)?.set(r.clerkship_id!, r.max_students_per_day);
	}

	const studentSessions = new Map<string, SessionSlot[]>();
	const preceptorLoad = new Map<string, number>();
	const preceptorBookings = new Map<string, Omit<DayBooking, 'studentName'>[]>();
	const book = (preceptorId: string, date: string, assignmentId: string, studentId: string) => {
		const key = `${preceptorId}:${date}`;
		preceptorLoad.set(key, (preceptorLoad.get(key) ?? 0) + 1);
		push(preceptorBookings, key, { assignmentId, studentId });
	};
	// Block weeks (L3): an inpatient block takes the student's whole week, so an
	// outpatient day can't share it (and a block can't land on a week with one).
	const clerkshipKind = new Map(
		clerkships
			.filter((c) => c.id)
			.map((c) => [c.id as string, normalizeSchedulingKind(c.scheduling_kind)])
	);
	const studentWeeks = new Map<string, { blocks: Set<string>; outpatient: boolean }>();
	const noteWeek = (studentId: string, date: string, kind: string, clerkshipId: string | null) => {
		if (kind !== 'clinical') return; // free days and exams don't use a week
		const key = `${studentId}:${weekKey(date)}`;
		const week = studentWeeks.get(key) ?? { blocks: new Set<string>(), outpatient: false };
		if (clerkshipId && clerkshipKind.get(clerkshipId) === 'block') week.blocks.add(clerkshipId);
		else week.outpatient = true;
		studentWeeks.set(key, week);
	};
	for (const r of studentRows) {
		push(studentSessions, `${r.student_id}:${r.date}`, normalizeSession(r.session));
		noteWeek(r.student_id, r.date, r.kind, r.clerkship_id);
	}
	for (const r of preceptorRows) {
		if (r.preceptor_id) book(r.preceptor_id, r.date, r.id ?? '', r.student_id);
	}
	for (const pin of pins) {
		push(studentSessions, `${pin.student_id}:${pin.date}`, normalizeSession(pin.session));
		noteWeek(pin.student_id, pin.date, pin.kind, pin.clerkship_id);
		if (pin.preceptor_id) book(pin.preceptor_id, pin.date, `pin:${pin.id}`, pin.student_id);
	}

	return {
		start: period.start_date,
		end: period.end_date,
		today,
		blackouts: new Set(blackouts.map((b) => b.date)),
		students: named(students),
		clerkships: named(clerkships),
		preceptors: named(preceptors),
		sites: named(sites),
		clerkshipSites,
		fit,
		capacity,
		studentSessions,
		preceptorLoad,
		preceptorBookings,
		clerkshipKind,
		studentWeeks
	};
}

interface Tuple {
	studentId?: string | null;
	clerkshipId?: string | null;
	preceptorId?: string | null;
	siteId?: string | null;
	date?: string;
	session: PlanSessionChoice;
	clinical: boolean;
}

/** A tuple pinned to one session (what the checks run against). */
type SessionTuple = Tuple & { session: SessionSlot };

/** With 'any', the sessions tried for a day, in order of preference. */
const ANY_SESSIONS: SessionSlot[] = ['full', 'am', 'pm'];

function capacityFor(inputs: PlanOptionsInputs, preceptorId: string, clerkshipId?: string | null) {
	const caps = inputs.capacity.get(preceptorId);
	return (clerkshipId ? caps?.get(clerkshipId) : undefined) ?? caps?.get('') ?? 1;
}

/** Every hard conflict this (possibly partial) choice has. Unpicked fields are skipped. */
export function tupleIssues(inputs: PlanOptionsInputs, t: SessionTuple): PlanIssue[] {
	const issues: PlanIssue[] = [];
	const add = (code: PlanFilterCode, message: string) => issues.push({ code, message });

	if (t.date) {
		if (t.date < inputs.start || t.date > inputs.end) {
			add('outside_schedule', `${t.date} is outside the schedule's date range`);
		} else if (t.date < inputs.today) {
			add('past_date', `${t.date} has already passed`);
		}
		if (inputs.blackouts.has(t.date)) add('blackout_date', `${t.date} is a blackout date`);
		if (t.studentId) {
			const booked = inputs.studentSessions.get(`${t.studentId}:${t.date}`) ?? [];
			if (booked.some((s) => sessionsOverlap(s, t.session))) {
				add('session_clash', `Student is already booked on ${t.date}`);
			}
		}
		const blockWeek = blockWeekClash(inputs, { ...t, date: t.date });
		if (blockWeek) add('block_week_conflict', blockWeek);
	}
	if (!t.clinical) return issues;

	if (t.clerkshipId && t.siteId) {
		const allowed = inputs.clerkshipSites.get(t.clerkshipId);
		if (allowed && allowed.size > 0 && !allowed.has(t.siteId)) {
			add('site_not_allowed', 'This site is not among the allowed sites for the clerkship');
		}
	}

	if (t.preceptorId) {
		for (const v of preceptorFitViolations(inputs.fit, {
			preceptorId: t.preceptorId,
			clerkshipId: t.clerkshipId,
			siteId: t.siteId,
			date: t.date,
			session: t.session
		})) {
			add(v.code as PlanFilterCode, v.message);
		}
		if (t.date) {
			const load = inputs.preceptorLoad.get(`${t.preceptorId}:${t.date}`) ?? 0;
			if (load >= capacityFor(inputs, t.preceptorId, t.clerkshipId)) {
				add('preceptor_capacity', `Preceptor is at capacity on ${t.date}`);
			}
		}
	}
	return issues;
}

/**
 * Issues for one day of a choice. With no preceptor picked yet (clinical), the day
 * only works if at least one preceptor could take it, so a clerkship, site or date
 * nobody can staff is filtered too.
 */
function sessionIssues(inputs: PlanOptionsInputs, t: SessionTuple): PlanIssue[] {
	const issues = tupleIssues(inputs, t);
	if (issues.length > 0 || !t.clinical || t.preceptorId) return issues;
	const someone = inputs.preceptors.some(
		(p) => tupleIssues(inputs, { ...t, preceptorId: p.id }).length === 0
	);
	return someone ? [] : [{ code: 'no_preceptor', message: PLAN_REASON.no_preceptor }];
}

/**
 * The session a day would be added as, and its issues. With 'any' the first session
 * that works wins (full, then morning, then afternoon); when none does, the closest
 * miss is reported — one the preceptor is at least available for, with the fewest issues.
 */
function resolveDay(
	inputs: PlanOptionsInputs,
	t: Tuple
): { session: SessionSlot; issues: PlanIssue[] } {
	if (t.session !== 'any' || !t.date) {
		const session = t.session === 'any' ? 'full' : t.session;
		return { session, issues: sessionIssues(inputs, { ...t, session }) };
	}
	const rank = (issues: PlanIssue[]) =>
		(issues.some((i) => i.code === 'preceptor_unavailable') ? 1000 : 0) + issues.length;
	let best: { session: SessionSlot; issues: PlanIssue[] } | null = null;
	for (const session of ANY_SESSIONS) {
		const issues = sessionIssues(inputs, { ...t, session });
		if (issues.length === 0) return { session, issues };
		if (!best || rank(issues) < rank(best.issues)) best = { session, issues };
	}
	return best!;
}

function dayIssues(inputs: PlanOptionsInputs, t: Tuple): PlanIssue[] {
	return resolveDay(inputs, t).issues;
}

function judge(inputs: PlanOptionsInputs, base: Tuple, dates: string[], option: Named): PlanOption {
	if (dates.length === 0) {
		const issues = dayIssues(inputs, base);
		const codes = [...new Set(issues.map((i) => i.code))];
		return {
			...option,
			eligible: issues.length === 0,
			codes,
			reasons: codes.map((c) => PLAN_REASON[c])
		};
	}

	const counts = new Map<PlanIssueCode, number>();
	let validDays = 0;
	for (const date of dates) {
		const issues = dayIssues(inputs, { ...base, date });
		if (issues.length === 0) validDays++;
		for (const code of new Set(issues.map((i) => i.code))) {
			counts.set(code, (counts.get(code) ?? 0) + 1);
		}
	}
	const total = dates.length;
	const reasons = [...counts].map(([code, n]) =>
		n === total || total === 1 ? PLAN_REASON[code] : `${PLAN_REASON[code]} on ${n} of ${total} days`
	);
	return {
		...option,
		eligible: validDays > 0,
		codes: [...counts.keys()],
		reasons,
		validDays,
		totalDays: total
	};
}

function eachDay(from: string, to: string): string[] {
	const out: string[] = [];
	const d = new Date(`${from}T00:00:00Z`);
	const end = new Date(`${to}T00:00:00Z`);
	while (d <= end) {
		out.push(d.toISOString().slice(0, 10));
		d.setUTCDate(d.getUTCDate() + 1);
	}
	return out;
}

/** Annotate every picker's options for the current selection. Pure. */
export function computePlanOptions(
	inputs: PlanOptionsInputs,
	selection: PlanSelection
): PlanOptions {
	const clinical = (selection.kind ?? 'clinical') === 'clinical';
	const base: Tuple = {
		studentId: selection.studentId || null,
		clerkshipId: clinical ? selection.clerkshipId || null : null,
		preceptorId: clinical ? selection.preceptorId || null : null,
		siteId: clinical ? selection.siteId || null : null,
		session: !clinical
			? 'full'
			: selection.session === 'any'
				? 'any'
				: normalizeSession(selection.session),
		clinical
	};
	const dates = [...new Set(selection.dates ?? [])].sort();

	const students = inputs.students.map((s) =>
		judge(inputs, { ...base, studentId: s.id }, dates, s)
	);
	const clerkships = clinical
		? inputs.clerkships.map((c) => judge(inputs, { ...base, clerkshipId: c.id }, dates, c))
		: [];
	const from = inputs.today > inputs.start ? inputs.today : inputs.start;
	const remaining = from <= inputs.end ? eachDay(from, inputs.end) : [];

	// A preceptor with no day left that works with the picks (full, unavailable,
	// blacked out…) isn't offered; the others show how many days they have left.
	const preceptors = clinical
		? inputs.preceptors.map((p) => {
				const option = judge(inputs, { ...base, preceptorId: p.id }, dates, p);
				if (dates.length > 0 || !option.eligible) return option;
				const openDays = remaining.filter(
					(date) => dayIssues(inputs, { ...base, preceptorId: p.id, date }).length === 0
				).length;
				return openDays > 0
					? { ...option, openDays }
					: {
							...option,
							eligible: false,
							openDays,
							codes: ['no_open_days' as const],
							reasons: [PLAN_REASON.no_open_days]
						};
			})
		: [];
	const sites = clinical
		? inputs.sites.map((s) => judge(inputs, { ...base, siteId: s.id }, dates, s))
		: [];

	const dateChecks = dates.map((date) => {
		const { session, issues } = resolveDay(inputs, { ...base, date });
		return { date, valid: issues.length === 0, issues, session };
	});

	const openSessions: Record<string, SessionSlot> = {};
	for (const date of remaining) {
		const day = resolveDay(inputs, { ...base, date });
		if (day.issues.length === 0) openSessions[date] = day.session;
	}
	const openDates = Object.keys(openSessions);

	const days = eachDay(inputs.start, inputs.end).map((date) =>
		dayState(inputs, { ...base, date }, openSessions[date] ?? null)
	);

	return {
		students,
		clerkships,
		preceptors,
		sites,
		dates: dateChecks,
		openDates,
		openSessions,
		days,
		capacity: preceptorCapacity(inputs, remaining)
	};
}

/** Each preceptor's room left from today, whatever is picked (the capacity panel). */
function preceptorCapacity(inputs: PlanOptionsInputs, remaining: string[]): PreceptorCapacity[] {
	return inputs.preceptors.map((p) => {
		let openDays = 0;
		let openSlots = 0;
		for (const date of remaining) {
			if (inputs.blackouts.has(date)) continue;
			// Any session counts: a half day is still room for a student.
			if (inputs.fit.unavailable.get(p.id)?.has(date)) continue;
			const anySlot = (inputs.fit.available.get(p.id)?.get(date)?.length ?? 0) > 0;
			if (inputs.fit.withAvailability.has(p.id) && !anySlot) continue;
			const free = capacityFor(inputs, p.id) - (inputs.preceptorLoad.get(`${p.id}:${date}`) ?? 0);
			if (free <= 0) continue;
			openDays++;
			openSlots += free;
		}
		return { preceptorId: p.id, name: p.name, openDays, openSlots };
	});
}

/**
 * Why this day can't go in its week (L3), or null: an inpatient block takes the
 * student's whole week, so an outpatient day can't share a week with one, and a
 * block can't go into a week that already has outpatient days.
 */
function blockWeekClash(inputs: PlanOptionsInputs, t: Tuple & { date: string }): string | null {
	if (!t.studentId || !t.clinical || !t.clerkshipId) return null;
	const monday = weekKey(t.date);
	const week = inputs.studentWeeks.get(`${t.studentId}:${monday}`);
	if (!week) return null;
	const kind = inputs.clerkshipKind.get(t.clerkshipId) ?? 'scattered';
	const student = inputs.students.find((s) => s.id === t.studentId)?.name ?? 'The student';
	const otherBlock = [...week.blocks].find((c) => c !== t.clerkshipId);
	if (kind === 'scattered' && otherBlock) {
		const block = inputs.clerkships.find((c) => c.id === otherBlock)?.name ?? 'a block';
		return `${student} is on ${block} (an inpatient block) the week of ${monday}. Inpatient blocks take the whole week, so outpatient days can't go that week.`;
	}
	if (kind === 'block' && week.outpatient) {
		return `${student} already has outpatient days the week of ${monday}. An inpatient block takes the whole week, so it can't go that week.`;
	}
	return null;
}

/** One day of the date picker for the current selection (see PlanOptions.days). */
function dayState(
	inputs: PlanOptionsInputs,
	t: Tuple & { date: string },
	openAs: SessionSlot | null
): DayState {
	const { date } = t;
	const open = openAs !== null;
	// With 'any', a day is off only when no session fits, and busy only when every
	// session clashes with what the student already has.
	const candidates = t.session === 'any' ? ANY_SESSIONS : [t.session];
	const names = new Map(inputs.students.map((s) => [s.id, s.name]));
	const studentSessions = t.studentId
		? (inputs.studentSessions.get(`${t.studentId}:${date}`) ?? [])
		: [];
	const bookings = t.preceptorId
		? (inputs.preceptorBookings.get(`${t.preceptorId}:${date}`) ?? []).map((b) => ({
				...b,
				studentName: names.get(b.studentId) ?? 'Another student'
			}))
		: [];
	const slots = t.preceptorId ? (inputs.fit.available.get(t.preceptorId)?.get(date) ?? []) : [];
	const sessions = slots.map((s) => s.session);

	let state: DayState['state'];
	if (inputs.blackouts.has(date)) {
		state = 'blackout';
	} else if (!t.clinical) {
		state = 'unset';
	} else if (!t.preceptorId) {
		state = open ? 'available' : 'unset';
	} else {
		const off = candidates.every((session) => {
			const fit = preceptorFitViolations(inputs.fit, {
				preceptorId: t.preceptorId!,
				siteId: t.siteId,
				date,
				session
			}).map((v) => v.code);
			return fit.includes('preceptor_unavailable') || fit.includes('preceptor_wrong_site');
		});
		state = off
			? 'unavailable'
			: inputs.fit.withAvailability.has(t.preceptorId) || slots.length > 0
				? 'available'
				: 'unset';
	}

	return {
		date,
		inRange: true,
		state,
		preceptorBookings: bookings,
		preceptorAtCapacity:
			!!t.preceptorId && bookings.length >= capacityFor(inputs, t.preceptorId, t.clerkshipId),
		studentBusy: candidates.every((session) =>
			studentSessions.some((s) => sessionsOverlap(s, session))
		),
		blockWeek: blockWeekClash(inputs, t) ?? undefined,
		studentBookedCredit: 0,
		studentSessions,
		availableSession: sessions[0] ?? null,
		availableSessions: sessions,
		availableCredit: null,
		isPast: date < inputs.today,
		planSession: openAs ?? undefined
	};
}
