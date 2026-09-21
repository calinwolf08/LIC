/**
 * Phase 5 (auto-generation) helpers.
 *
 * Generation needs a schedule that is genuinely *workable*: a clerkship with
 * required days, a preceptor with **materialised** availability at a site the
 * clerkship allows, and onboarded students. Rather than drive the whole build
 * through the wizard (that arc is J7.1), this stands one up on a throwaway
 * sandbox through the API plus the handful of rows that are normally
 * materialised (availability, onboarding, clerkship↔site) — deterministic and
 * fast, so the generation assertions are the point of the test.
 */

import { apiOf, type Page } from '../../fixtures';
import { createSandboxSchedule, type Sandbox } from '../../fixtures/sandbox';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

export interface GenerationSandbox {
	sandbox: Sandbox;
	scheduleId: string;
	hsId: string;
	siteId: string;
	clerkshipId: string;
	requiredDays: number;
	preceptorId: string;
	studentIds: string[];
}

/** Every weekday (Mon–Fri) in [start, end] inclusive, as YYYY-MM-DD. */
export function weekdaysBetween(start: string, end: string): string[] {
	const out: string[] = [];
	const cur = new Date(`${start}T00:00:00Z`);
	const last = new Date(`${end}T00:00:00Z`);
	while (cur <= last) {
		const dow = cur.getUTCDay();
		if (dow !== 0 && dow !== 6) out.push(cur.toISOString().slice(0, 10));
		cur.setUTCDate(cur.getUTCDate() + 1);
	}
	return out;
}

export interface GenerationSandboxOptions {
	name?: string;
	requiredDays?: number;
	students?: number;
	/** Preceptor daily capacity (max_students). */
	maxStudents?: number;
	/** Onboard the students at the health system (default true). */
	onboard?: boolean;
	/**
	 * Cap the preceptor's materialised availability to the first N weekdays in
	 * range (default: every weekday). Use a small N to force scarcity.
	 */
	availabilityDays?: number;
}

/**
 * Create an active, generation-ready sandbox and return its ids.
 * Caller registers `sandbox` with the test's `sandbox` fixture for teardown.
 */
export async function generationSandbox(
	page: Page,
	db: Kysely<DB>,
	opts: GenerationSandboxOptions = {}
): Promise<GenerationSandbox> {
	const api = apiOf(page);
	const stamp = Date.now();
	const requiredDays = opts.requiredDays ?? 2;
	const studentCount = opts.students ?? 2;
	const maxStudents = opts.maxStudents ?? 5;

	const sandbox = await createSandboxSchedule(page, {
		name: opts.name ?? `Gen ${stamp}`
	});

	const hsId = (await api.post<{ id: string }>('/api/health-systems', { name: `HS ${stamp}` }))
		.data!.id;
	const siteId = (
		await api.post<{ id: string }>('/api/sites', {
			name: `Site ${stamp}`,
			health_system_id: hsId
		})
	).data!.id;
	const clerkshipId = (
		await api.post<{ id: string }>('/api/clerkships', {
			name: `Clerkship ${stamp}`,
			required_days: requiredDays,
			clerkship_type: 'outpatient'
		})
	).data!.id;
	const preceptorId = (
		await api.post<{ id: string }>('/api/preceptors', {
			name: `Dr. Gen ${stamp}`,
			email: `gen_${stamp}@example.com`,
			max_students: maxStudents,
			// Onboarding is checked against the preceptor's health system, so bind the
			// preceptor to it — otherwise not_onboarded can never fire.
			health_system_id: hsId,
			site_ids: [siteId]
		})
	).data!.id;

	const studentIds: string[] = [];
	for (let i = 0; i < studentCount; i++) {
		const id = (
			await api.post<{ id: string }>('/api/students', {
				name: `Gen Student ${i + 1} ${stamp}`,
				email: `gen_stu_${i}_${stamp}@example.com`
			})
		).data!.id;
		studentIds.push(id);
	}

	const ts = new Date().toISOString();

	// The clerkship allows the site (engine eligibility).
	await db
		.insertInto('clerkship_sites')
		.values({ clerkship_id: clerkshipId, site_id: siteId, created_at: ts })
		.execute();

	// Materialise the preceptor's availability across the range's weekdays,
	// optionally capped to force scarcity. When capping, keep only future weekdays
	// (>= today) — a Full run schedules from today forward, so past availability
	// would place nothing.
	let availDates = weekdaysBetween(sandbox.start, sandbox.end);
	if (opts.availabilityDays !== undefined) {
		const today = new Date().toISOString().slice(0, 10);
		availDates = availDates.filter((d) => d >= today).slice(0, opts.availabilityDays);
	}
	const availRows = availDates.map((date) => ({
		id: crypto.randomUUID(),
		preceptor_id: preceptorId,
		site_id: siteId,
		date,
		is_available: 1,
		created_at: ts,
		updated_at: ts
	}));
	if (availRows.length > 0) {
		await db.insertInto('preceptor_availability').values(availRows).execute();
	}

	// Onboard every student at the health system.
	if (opts.onboard !== false) {
		await db
			.insertInto('student_health_system_onboarding')
			.values(
				studentIds.map((student_id) => ({
					id: crypto.randomUUID(),
					student_id,
					health_system_id: hsId,
					is_completed: 1,
					created_at: ts,
					updated_at: ts
				}))
			)
			.execute();
	}

	return {
		sandbox,
		scheduleId: sandbox.id,
		hsId,
		siteId,
		clerkshipId,
		requiredDays,
		preceptorId,
		studentIds
	};
}
