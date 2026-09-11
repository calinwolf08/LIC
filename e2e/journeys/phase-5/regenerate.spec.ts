/**
 * J5.2 — Regenerate modes against human edits (e2e plan Phase 5).
 *
 * The edit-safety guarantees that make regeneration trustworthy:
 *   - Full regeneration preserves LOCKED rows by id and replaces the unlocked
 *     ones (a locked day survives with the same id; unlocked days are new rows).
 *   - Completion keeps EVERY existing row by id and only fills the gap — adding a
 *     new student and running Completion places rows for that student alone,
 *     touching none of the existing ids.
 *
 * Asserted at the DB layer (row ids are the truth for "preserved vs replaced")
 * with the generation driven over the same session's API.
 */

import { test, expect, apiOf, assignmentsForSchedule, type Page } from '../../fixtures';
import { generationSandbox } from './helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

function generate(page: Page, start: string, end: string, strategy: string) {
	return apiOf(page).post('/api/schedules/generate', { startDate: start, endDate: end, strategy });
}

/** Map of `${student_id}|${date}` → assignment id. */
async function idsBySlot(db: Kysely<DB>, scheduleId: string): Promise<Map<string, string>> {
	const rows = await assignmentsForSchedule(db, scheduleId);
	return new Map(rows.map((r) => [`${r.student_id}|${r.date}`, r.id!]));
}

test.describe('J5.2 regenerate modes vs human edits', { tag: ['@stage2'] }, () => {
	test('Full preserves locked rows by id and replaces the unlocked ones', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const gen = await generationSandbox(asAdmin, kysely, { requiredDays: 2, students: 2 });
		sandbox.register(gen.sandbox);

		// First Full run → 4 generated rows.
		expect(
			(await generate(asAdmin, gen.sandbox.start, gen.sandbox.end, 'full-reoptimize')).ok
		).toBe(true);
		const before = await assignmentsForSchedule(kysely, gen.scheduleId);
		expect(before).toHaveLength(4);

		// Lock one row through the API (entitled path).
		const locked = before[0];
		const lockRes = await apiOf(asAdmin).patch(`/api/schedules/assignments/${locked.id}`, {
			locked: true
		});
		expect(lockRes.ok).toBe(true);
		const unlockedIdsBefore = before.filter((r) => r.id !== locked.id).map((r) => r.id!);

		// Second Full run.
		expect(
			(await generate(asAdmin, gen.sandbox.start, gen.sandbox.end, 'full-reoptimize')).ok
		).toBe(true);
		const after = await assignmentsForSchedule(kysely, gen.scheduleId);
		expect(after).toHaveLength(4);
		const afterIds = new Set(after.map((r) => r.id!));

		// The locked row survives with the same id and is still locked...
		expect(afterIds.has(locked.id!)).toBe(true);
		expect(after.find((r) => r.id === locked.id)!.locked).toBe(1);
		// ...and every previously-unlocked row was replaced (new ids).
		for (const id of unlockedIdsBefore) {
			expect(afterIds.has(id)).toBe(false);
		}
		// Still all generated except the one we locked (which was generated too).
		expect(after.every((r) => r.source === 'generated')).toBe(true);
	});

	test('Completion preserves existing ids and fills only the new student', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const gen = await generationSandbox(asAdmin, kysely, { requiredDays: 2, students: 2 });
		sandbox.register(gen.sandbox);

		// First Full run → 4 rows for the two students.
		expect(
			(await generate(asAdmin, gen.sandbox.start, gen.sandbox.end, 'full-reoptimize')).ok
		).toBe(true);
		const existing = await idsBySlot(kysely, gen.scheduleId);
		expect(existing.size).toBe(4);

		// Add a third student (auto-associated to the active schedule) and onboard.
		const stamp = Date.now();
		const student3 = (
			await apiOf(asAdmin).post<{ id: string }>('/api/students', {
				name: `Gen Student 3 ${stamp}`,
				email: `gen_stu3_${stamp}@example.com`
			})
		).data!.id;
		await kysely
			.insertInto('student_health_system_onboarding')
			.values({
				id: crypto.randomUUID(),
				student_id: student3,
				health_system_id: gen.hsId,
				is_completed: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.execute();

		// Completion → keep all existing, fill only the gap (student 3).
		expect((await generate(asAdmin, gen.sandbox.start, gen.sandbox.end, 'completion')).ok).toBe(
			true
		);
		const after = await assignmentsForSchedule(kysely, gen.scheduleId);
		expect(after).toHaveLength(6);

		// Every original row kept its id (completion never rewrites what exists).
		const afterIds = new Set(after.map((r) => r.id!));
		for (const id of existing.values()) {
			expect(afterIds.has(id)).toBe(true);
		}
		// The two new rows belong to student 3.
		const newRows = after.filter((r) => !new Set(existing.values()).has(r.id!));
		expect(newRows).toHaveLength(2);
		expect(newRows.every((r) => r.student_id === student3)).toBe(true);
	});
});
