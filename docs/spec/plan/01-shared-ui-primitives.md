# Step 01 — Shared UI Primitives & UX Conventions

## Objective
Create the shared component layer that every later step builds on, and eliminate hand-rolled modals, browser `alert()/confirm()`, and inconsistent page scaffolding.

## Context
The app currently mixes hand-rolled `fixed inset-0` overlay divs, shadcn dialogs, browser confirms, and inline yes/no buttons (DESIGN_REVIEW A5/A6). There is no toast system, no unsaved-changes guard (C6), and page headers/tabs/breadcrumbs are copy-pasted per page.

## Prerequisites
None. Read `PRODUCT_SPEC.md` §6 and `GUIDELINES.md`.

## Scope
**In:** new shared components + a migration of *existing* usages to them where mechanical (dialog/confirm/toast swaps). **Out:** page redesigns (later steps), navigation changes (step 04).

## Implementation

Create in `src/lib/components/` (shadcn-svelte based, Svelte 5 runes, exported via an `index.ts`):

1. **`PageHeader`** — props: `title`, `description?`, `breadcrumbs?: {label, href?}[]`, snippet slot for actions (buttons). Renders breadcrumb trail, h1, description, right-aligned actions.
2. **`EntityTabs`** — accessible tab bar (role=tablist, arrow-key navigation) replacing the copy-pasted tab markup in students/[id], clerkships/[id]/config, clerkships, preceptors pages. Props: `tabs: {id, label, badge?}[]`, `bind:active`. Support optional URL sync (`?tab=` param).
3. **`ConfirmDialog`** — single destructive-confirmation dialog: `title`, `description`, `confirmLabel` (default "Delete"), `destructive` flag, optional `details` snippet (for dependency lists), async `onConfirm` with pending state and inline error display. Built on the shadcn dialog (focus trap, Esc, backdrop).
4. **`EmptyState`** — icon/emoji, heading, explanation text, optional action button. Used for all empty tables/lists.
5. **Toast system** — `src/lib/components/toast/`: a `toast.success/error/info(message)` store-based API + `<Toaster/>` mounted once in `(app)/+layout.svelte`. Use for transient success/error feedback (replaces the ad-hoc `settingsStatus`/`basicInfoStatus` banners over time; this step only ships the system and uses it in the migrated spots below).
6. **`FormShell` + unsaved-changes guard** — a wrapper (or a `useUnsavedGuard(isDirty: () => boolean)` action/utility using SvelteKit `beforeNavigate` + `beforeunload`) that warns before leaving a dirty form via `ConfirmDialog` ("Discard unsaved changes?"). Must be adoptable by any form in later steps with ≤ 3 lines.

Mechanical migrations in this step:
- `(app)/health-systems/+page.svelte`: replace `alert()`/`confirm()` delete flow with `ConfirmDialog` (keep the existing dependency-check fetch; show dependencies in the dialog `details`).
- `(app)/schedules/+page.svelte`: replace inline "Delete? Yes/No" with `ConfirmDialog`.
- `(app)/calendar/+page.svelte`: replace `alert('Failed to export schedule')` with `toast.error`.
- `(app)/clerkships/+page.svelte` and `(app)/preceptors/+page.svelte`: wrap the existing hand-rolled form overlays in the shadcn dialog component (content unchanged — full redesign comes in steps 07/08).
- Keep the existing `delete-*-dialog.svelte` components working by reimplementing them as thin wrappers over `ConfirmDialog` (or replacing call sites directly if simpler).

## Testing
- Unit (vitest + testing-library or svelte component tests as configured): `ConfirmDialog` (confirm calls handler, pending disables buttons, error shown, Esc/cancel), `EntityTabs` (selection, keyboard), toast store (queue/dismiss), unsaved-guard utility (blocks when dirty, passes when clean).
- E2E: health-system delete now uses in-app dialog (assert no native dialog handler needed; dependency message visible when blocked); schedule delete confirmation flow.
- Update any existing e2e tests that relied on `page.on('dialog')` for health systems.

## Acceptance criteria
- [ ] All six primitives exist, exported from `src/lib/components/index.ts`, used in the migrated spots.
- [ ] `grep -rn "window.confirm\|window.alert\|alert(\|confirm(" src/routes src/lib --include=*.svelte` shows no browser-dialog usage (string false-positives excluded).
- [ ] No `fixed inset-0` hand-rolled overlay remains in `src/routes` (grep) — all overlays go through the dialog component.
- [ ] Definition of done per GUIDELINES.md.
