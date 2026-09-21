/**
 * Back-compat surface for the pre-plan specs in this directory.
 *
 * Everything now lives in `e2e/fixtures` (one source of truth for credentials,
 * form-driven login/register and the date helpers). New journeys should import
 * `test`/`expect` from `../../fixtures` directly and use the `asAdmin` /
 * `asBasic` / `asFreshUser` fixtures instead of calling `login()` themselves.
 */

export {
	ADMIN,
	BASIC,
	login,
	registerNewUser,
	SEED_SCHEDULE,
	fromToday,
	today,
	monthStart,
	monthEnd
} from '../fixtures';
