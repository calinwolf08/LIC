/**
 * Authoritative conflict reader: the whole-schedule validator behind the three
 * UI surfaces (`GET /api/schedules/validation`). Journeys assert expected
 * conflict codes against this, and separately assert that the UI surfaces (student
 * panel, calendar health panel, dashboard card) agree — so a divergence between
 * what the engine knows and what a user sees is caught.
 */

import { apiOf, type Page } from '../fixtures';

export interface ScheduleViolation {
	code: string;
	date: string;
	assignmentIds?: string[];
	[k: string]: unknown;
}
export interface ValidationResult {
	violations: ScheduleViolation[];
	byDate: Record<string, ScheduleViolation[]>;
	byStudent: Record<string, ScheduleViolation[]>;
	byPreceptor: Record<string, ScheduleViolation[]>;
	counts: Record<string, number>;
}

export async function readValidation(page: Page): Promise<ValidationResult> {
	const res = await apiOf(page).get<ValidationResult>('/api/schedules/validation');
	if (!res.ok || !res.data) throw new Error(`validation fetch failed (${res.status})`);
	return res.data;
}

/** Distinct conflict codes the validator reports for a student. */
export function codesForStudent(v: ValidationResult, studentId: string): Set<string> {
	return new Set((v.byStudent[studentId] ?? []).map((x) => x.code));
}

/** Does the validator report `code` for `studentId` (optionally on `date`)? */
export function hasStudentCode(
	v: ValidationResult,
	studentId: string,
	code: string,
	date?: string
): boolean {
	return (v.byStudent[studentId] ?? []).some(
		(x) => x.code === code && (date === undefined || x.date === date)
	);
}

export function countOf(v: ValidationResult, code: string): number {
	return v.counts[code] ?? 0;
}

export function totalViolations(v: ValidationResult): number {
	return Object.values(v.counts).reduce((a, b) => a + b, 0);
}
