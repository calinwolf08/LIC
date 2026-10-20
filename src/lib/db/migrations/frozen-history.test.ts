/**
 * The engine-specific migration history is frozen.
 *
 * Kysely records a migration as done by its file name, and never runs it
 * again. So editing a file in `sqlite/` or `postgres/` after it has run
 * changes nothing in existing databases: only fresh ones get the new schema.
 * That is exactly how production Postgres ended up missing columns such as
 * `clerkships.min_required_days` and `preceptors.phone_type`, which were added
 * by editing `postgres/001_baseline.ts` after it had already run there.
 *
 * Every schema change belongs in a NEW migration under `shared/` (see
 * shared/README.md). If this test fails, revert the edit to the frozen file
 * and write that migration instead. Only update the fingerprints below for a
 * change that cannot affect the schema (comments, formatting).
 */

import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));

function fingerprints(folder: string): Record<string, string> {
	const dir = path.join(here, folder);
	return Object.fromEntries(
		readdirSync(dir)
			.filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
			.sort()
			.map((f) => [
				f,
				createHash('sha256')
					.update(readFileSync(path.join(dir, f)))
					.digest('hex')
					.slice(0, 16)
			])
	);
}

const FROZEN: Record<string, Record<string, string>> = {
	sqlite: {
		'001_initial_schema.ts': '06d2ebb94a0bf014',
		'002_scheduling_configuration_schema.ts': '932849757dc0c70a',
		'003_pattern_based_availability.ts': '0d8f9274af31ad9d',
		'004_clerkship_inpatient_outpatient_days.ts': 'cc9ed3455c57f50c',
		'005_restructure_clerkships.ts': '064b6870f192a134',
		'006_require_preceptor_health_system.ts': '8a3d4145c490b401',
		'007_preceptor_associations_teams.ts': '5f2bc0eb758f4145',
		'008_student_health_system_onboarding.ts': '88c1b657ce84de5c',
		'009_add_allow_cross_system_to_requirements.ts': 'e63d92cf29fc588f',
		'010_site_based_architecture.ts': '7cf67ba3330d863c',
		'011_add_site_and_team_requirements.ts': 'bb8e3628c0213cd1',
		'012_add_elective_available_preceptors.ts': '147ff9ab25df8284',
		'013_add_contact_fields.ts': '71b832d022684875',
		'014_make_preceptor_health_system_optional.ts': 'bf0d463003b067fb',
		'015_remove_preceptor_specialty.ts': 'aad943b019fe9d7a',
		'016_clerkship_settings_overrides.ts': 'b08488c9256129d0',
		'017_preceptor_multi_site.ts': 'a4beef1d6d354ee2',
		'018_drop_preceptor_site_clerkships.ts': 'f64737f0558555a8',
		'019_site_based_availability.ts': '7f1f1e220e87b0d1',
		'020_add_fallback_only_flag.ts': '78734e334a2f74fa',
		'021_elective_enhancements.ts': '10285d59ac8e4b35',
		'022_schedule_scoping.ts': '31c0a7b132cbe2e7',
		'023_schedule_user_ownership.ts': '5b96f7a375d7c216',
		'024_add_active_schedule_to_user.ts': '11d8788c7fa25603',
		'025_electives_direct_clerkship_link.ts': 'ef80aaa344792f2f',
		'026_entitlements_and_assignment_flags.ts': '285e34fe80595b3f',
		'027_assignment_overrides.ts': 'dd8ad158c0a01a5e',
		'028_add_preceptor_phone_type.ts': 'e65694f4b276856a',
		'029_student_core_preceptors.ts': '86bb1111a9b184dc',
		'030_availability_preference.ts': 'dc7faeba352116f1',
		'031_availability_notes.ts': '8e6f1c58ea340605',
		'032_assignment_credit_value.ts': '9fd457021c98c51b',
		'033_clerkship_min_required_days.ts': 'cfcfe5807dd8e27a',
		'103_standalone_electives.ts': '82661741f4385074',
		'104_allow_same_day_assignments.ts': '8d832ad6cbd0b745',
		'105_session_slots.ts': '0269aeb6ec516286',
		'106_pattern_session.ts': 'a3d4ced75f7c1495',
		'107_preceptor_mutual_exclusions.ts': '4fb8181bf142196d',
		'108_clerkship_scheduling_kind.ts': '63988058efa32f57',
		'109_nonclinical_assignments.ts': 'abb1b4ae916470b6',
		'110_schedule_distributions.ts': '714dac399bd15911'
	},
	postgres: {
		'001_baseline.ts': 'c50eae4213cebcc8'
	}
};

describe('frozen migration history', () => {
	for (const folder of Object.keys(FROZEN)) {
		it(`${folder}/ is unchanged — schema changes go in a new shared/ migration`, () => {
			expect(fingerprints(folder)).toEqual(FROZEN[folder]);
		});
	}
});
