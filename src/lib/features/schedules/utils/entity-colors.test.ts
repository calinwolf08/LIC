import { describe, it, expect } from 'vitest';
import { getStudentColor, getClerkshipColor } from './entity-colors';

describe('getStudentColor', () => {
	it('is deterministic per id', () => {
		expect(getStudentColor('student-1')).toBe(getStudentColor('student-1'));
	});

	it('always returns a valid hex colour', () => {
		for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', '', 'alice-123']) {
			expect(getStudentColor(id)).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it('is keyed by id, not name — same id keeps its colour', () => {
		// The colour depends only on the argument (the id), so a rename never
		// changes it.
		const id = 'stable-student-id';
		expect(getStudentColor(id)).toBe(getStudentColor(id));
	});

	it('distributes across the whole palette', () => {
		const colors = new Set<string>();
		for (let i = 0; i < 200; i++) colors.add(getStudentColor(`id-${i}`));
		// 8-colour palette — a good hash should reach most of it.
		expect(colors.size).toBeGreaterThanOrEqual(6);
	});
});

describe('getClerkshipColor', () => {
	it('is deterministic per id', () => {
		expect(getClerkshipColor('clerk-1')).toBe(getClerkshipColor('clerk-1'));
	});
});
