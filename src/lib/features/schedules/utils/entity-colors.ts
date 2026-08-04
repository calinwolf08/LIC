/**
 * Stable entity → colour mapping for the calendar.
 *
 * A given id always hashes to the same palette entry, so a student (or
 * clerkship) keeps one colour across renders and sessions. Hash the **id**, not
 * the name, so renaming an entity never recolours it.
 *
 * Colour is never the only identifier: cells render the entity's name, and the
 * schedule-wide calendar shows a colour→student legend plus an initials chip, so
 * a palette repeat past this many distinct entities is disambiguated by text.
 */

const PALETTE = [
	'#2563eb', // blue
	'#059669', // emerald
	'#d97706', // amber
	'#dc2626', // red
	'#7c3aed', // violet
	'#db2777', // pink
	'#0891b2', // cyan
	'#65a30d', // lime
	'#ea580c', // orange
	'#4f46e5', // indigo
	'#0d9488', // teal
	'#c026d3', // fuchsia
	'#a16207', // gold
	'#475569' // slate
];

function hashToColor(value: string): string {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = value.charCodeAt(i) + ((hash << 5) - hash);
	}
	return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** Deterministic colour for a student, keyed by id. */
export function getStudentColor(studentId: string): string {
	return hashToColor(studentId || 'default');
}

/** Deterministic colour for a clerkship, keyed by id. */
export function getClerkshipColor(clerkshipId: string): string {
	return hashToColor(clerkshipId || 'default');
}

/**
 * A short text anchor for a student, so identity never depends on hue alone
 * (a second dimension when the palette repeats). One letter for a single-word
 * name, first + last initial otherwise, "?" when there is no name.
 */
export function getStudentInitials(name: string): string {
	const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The palette, exposed for tests and the legend. */
export const ENTITY_PALETTE = PALETTE;
