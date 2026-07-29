/**
 * Stable entity → colour mapping for the calendar.
 *
 * A given id always hashes to the same palette entry, so a student (or
 * clerkship) keeps one colour across renders and sessions. Hash the **id**, not
 * the name, so renaming an entity never recolours it.
 */

const PALETTE = [
	'#3b82f6', // blue
	'#10b981', // green
	'#f59e0b', // amber
	'#ef4444', // red
	'#8b5cf6', // purple
	'#ec4899', // pink
	'#06b6d4', // cyan
	'#84cc16' // lime
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
