/**
 * Shared unsaved-changes registry (finding P1-e, spec R10.3).
 *
 * The navigation guard is wired once — `FormShell` in the app layout — and any
 * form that can hold unsaved edits registers a "still dirty?" predicate here.
 * The guard fires when *any* registered form reports itself dirty, so a single
 * mounted guard covers every form without each one owning its own
 * `beforeNavigate`.
 *
 * Predicates are plain functions the guard calls on demand (inside
 * `beforeNavigate`); the set needs no reactivity of its own.
 */

const checkers = new Set<() => boolean>();

/**
 * Register a dirty-check for the lifetime of a form. Call from a component
 * `$effect` and return the disposer so the check is removed on unmount:
 *
 * ```ts
 * $effect(() => registerUnsavedGuard(() => !saved && isDirty()));
 * ```
 */
export function registerUnsavedGuard(isDirty: () => boolean): () => void {
	checkers.add(isDirty);
	return () => {
		checkers.delete(isDirty);
	};
}

/** True when any registered form currently reports unsaved changes. */
export function hasUnsavedChanges(): boolean {
	for (const isDirty of checkers) {
		if (isDirty()) return true;
	}
	return false;
}
