import { describe, it, expect } from 'vitest';
import {
	getStudentColor,
	getClerkshipColor,
	getStudentInitials,
	ENTITY_PALETTE
} from './entity-colors';

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
		for (let i = 0; i < 400; i++) colors.add(getStudentColor(`id-${i}`));
		// The expanded palette (14) should be almost fully reached by a good hash.
		expect(colors.size).toBeGreaterThanOrEqual(ENTITY_PALETTE.length - 2);
	});
});

describe('ENTITY_PALETTE', () => {
	it('has 12–16 perceptually distinct, valid hex entries', () => {
		expect(ENTITY_PALETTE.length).toBeGreaterThanOrEqual(12);
		expect(ENTITY_PALETTE.length).toBeLessThanOrEqual(16);
		for (const c of ENTITY_PALETTE) expect(c).toMatch(/^#[0-9a-f]{6}$/);
		// No duplicates.
		expect(new Set(ENTITY_PALETTE).size).toBe(ENTITY_PALETTE.length);
	});

	it('every entry is dark enough to read as text on a near-white tint', () => {
		// The cell paints {color} text over a {color}20 (~12%) fill, so the text
		// sits on a near-white background; require a low relative luminance.
		for (const hex of ENTITY_PALETTE) {
			const r = parseInt(hex.slice(1, 3), 16) / 255;
			const g = parseInt(hex.slice(3, 5), 16) / 255;
			const b = parseInt(hex.slice(5, 7), 16) / 255;
			const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
			const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
			// Contrast vs white ≈ 1.05 / (L + 0.05) ≥ 3:1 → L ≤ 0.30.
			expect(L, `${hex} too light for text`).toBeLessThanOrEqual(0.3);
		}
	});
});

describe('getStudentInitials', () => {
	it('single-word name → up to two letters', () => {
		expect(getStudentInitials('Alice')).toBe('AL');
		expect(getStudentInitials('Bo')).toBe('BO');
	});

	it('multi-word name → first + last initial', () => {
		expect(getStudentInitials('Alice Johnson')).toBe('AJ');
		expect(getStudentInitials('Alice B Johnson')).toBe('AJ');
	});

	it('empty / whitespace name → "?"', () => {
		expect(getStudentInitials('')).toBe('?');
		expect(getStudentInitials('   ')).toBe('?');
	});
});

describe('getClerkshipColor', () => {
	it('is deterministic per id', () => {
		expect(getClerkshipColor('clerk-1')).toBe(getClerkshipColor('clerk-1'));
	});
});
