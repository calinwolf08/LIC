/**
 * Preceptor mutual-exclusion helpers (client feedback L2).
 *
 * A pairwise rule that two preceptors should not both supervise the same student
 * on the same day. The pair is stored and compared canonically (the smaller id
 * first) so the rule is symmetric and a lookup never depends on argument order.
 */

/** Canonical [a, b] with a <= b, for storage. */
export function canonicalPair(x: string, y: string): [string, string] {
	return x <= y ? [x, y] : [y, x];
}

/** Canonical "a:b" key with a <= b, for set membership. */
export function mutualExclusionKey(x: string, y: string): string {
	const [a, b] = canonicalPair(x, y);
	return `${a}:${b}`;
}
