/**
 * Named world specs used by the mega-journeys. Keeping them here (not inline in a
 * spec) makes the combinatorial setup reviewable in one place and reusable across
 * journeys. `day` offsets are relative to the world anchor (a future Monday), so a
 * spec is date-agnostic and safe to run any day.
 *
 * Week layout for the block/scatter worlds:
 *   day 0 = anchor Monday (block week)
 *   day 2 = Wednesday, same week as the block
 *   day 7 = next Monday (a free week)
 *   day 9 = Wednesday of the free week
 */

import type { WorldSpec } from './world-builder';

/**
 * Two health-system sites, an inpatient **block** clerkship and an outpatient
 * **scattered** clerkship, each taught by its own preceptor. The scatter preceptor
 * is available both inside the block week and in the free week, so a correct
 * schedule must keep the scattered day out of the block's week (L3). Multi-student.
 */
export function blockScatterWorld(students = 2): WorldSpec {
	return {
		name: 'Block vs scatter',
		healthSystems: ['Metro'],
		sites: [
			{ name: 'Inpatient Ward', healthSystem: 'Metro' },
			{ name: 'Outpatient Clinic', healthSystem: 'Metro' }
		],
		clerkships: [
			{
				name: 'Inpatient Medicine',
				type: 'inpatient',
				kind: 'block',
				requiredDays: 1,
				sites: ['Inpatient Ward']
			},
			{
				name: 'Family Medicine',
				type: 'outpatient',
				kind: 'scattered',
				requiredDays: 1,
				sites: ['Outpatient Clinic']
			}
		],
		preceptors: [
			{
				name: 'Dr. Block',
				sites: ['Inpatient Ward'],
				teaches: ['Inpatient Medicine'],
				availability: [{ day: 0, site: 'Inpatient Ward' }]
			},
			{
				name: 'Dr. Scatter',
				sites: ['Outpatient Clinic'],
				teaches: ['Family Medicine'],
				availability: [
					{ day: 2, site: 'Outpatient Clinic' }, // block week (must be avoided)
					{ day: 7, site: 'Outpatient Clinic' } // free week (the correct landing)
				]
			}
		],
		students: Array.from({ length: students }, (_, i) => ({
			name: `Student ${i + 1}`,
			onboardedAt: ['Metro']
		}))
	};
}

/**
 * One clerkship/preceptor, one student who is NOT onboarded at the health system.
 * Generation surfaces `not_onboarded` as a conflict; bypassing it relaxes the rule
 * and records an accepted override instead. Preceptor available on days 0 and 1.
 */
export function onboardingGapWorld(): WorldSpec {
	return {
		name: 'Onboarding gap',
		healthSystems: ['Metro'],
		sites: [{ name: 'Clinic', healthSystem: 'Metro' }],
		clerkships: [
			{ name: 'Family Medicine', type: 'outpatient', requiredDays: 1, sites: ['Clinic'] }
		],
		preceptors: [
			{
				name: 'Dr. FM',
				sites: ['Clinic'],
				teaches: ['Family Medicine'],
				availability: [
					{ day: 0, site: 'Clinic' },
					{ day: 1, site: 'Clinic' }
				]
			}
		],
		students: [{ name: 'Newbie', onboardedAt: [] }] // deliberately not onboarded
	};
}

/**
 * One onboarded student, one clerkship needing 2 days, a preceptor available on
 * several weekdays. Used for completion-mode: the journey hand-places one clinical
 * day, a locked clinical day and a free day, then runs completion to fill only the
 * remaining gap while preserving everything.
 */
export function completionWorld(): WorldSpec {
	return {
		name: 'Completion',
		healthSystems: ['Metro'],
		sites: [{ name: 'Clinic', healthSystem: 'Metro' }],
		clerkships: [
			{ name: 'Family Medicine', type: 'outpatient', requiredDays: 2, sites: ['Clinic'] }
		],
		preceptors: [
			{
				name: 'Dr. FM',
				sites: ['Clinic'],
				teaches: ['Family Medicine'],
				availability: [0, 1, 2, 3, 7, 8, 9].map((day) => ({ day, site: 'Clinic' }))
			}
		],
		students: [{ name: 'Alice', onboardedAt: ['Metro'] }]
	};
}

/**
 * Oversubscribed world: a clerkship needing 3 days, a single preceptor available
 * on only 2 days with per-day capacity 1, and 2 onboarded students competing.
 * No full schedule is possible → the validator must report unmet requirements with
 * the right remaining counts and never a false over-capacity.
 */
export function shortfallWorld(): WorldSpec {
	return {
		name: 'Shortfall',
		healthSystems: ['Metro'],
		sites: [{ name: 'Clinic', healthSystem: 'Metro' }],
		clerkships: [
			{ name: 'Family Medicine', type: 'outpatient', requiredDays: 3, sites: ['Clinic'] }
		],
		preceptors: [
			{
				name: 'Dr. Scarce',
				sites: ['Clinic'],
				maxStudents: 1,
				teaches: ['Family Medicine'],
				availability: [
					{ day: 0, site: 'Clinic' },
					{ day: 1, site: 'Clinic' }
				]
			}
		],
		students: [
			{ name: 'Student 1', onboardedAt: ['Metro'] },
			{ name: 'Student 2', onboardedAt: ['Metro'] }
		]
	};
}

/**
 * One clerkship needing 2 days, taught by TWO preceptors who are BOTH available on
 * the same two days, one onboarded student. The clerkship's strategy is forced so
 * the two strategies produce distinguishable shapes:
 *   - continuous_single → both days land on the SAME preceptor,
 *   - daily_rotation    → the two days spread across DIFFERENT preceptors.
 */
export function strategyWorld(strategy: 'continuous_single' | 'daily_rotation'): WorldSpec {
	return {
		name: `Strategy ${strategy}`,
		healthSystems: ['Metro'],
		sites: [{ name: 'Clinic', healthSystem: 'Metro' }],
		clerkships: [
			{ name: 'Family Medicine', type: 'outpatient', requiredDays: 2, sites: ['Clinic'], strategy }
		],
		preceptors: [
			{
				name: 'Dr. One',
				sites: ['Clinic'],
				teaches: ['Family Medicine'],
				availability: [
					{ day: 0, site: 'Clinic' },
					{ day: 1, site: 'Clinic' }
				]
			},
			{
				name: 'Dr. Two',
				sites: ['Clinic'],
				teaches: ['Family Medicine'],
				availability: [
					{ day: 0, site: 'Clinic' },
					{ day: 1, site: 'Clinic' }
				]
			}
		],
		students: [{ name: 'Alice', onboardedAt: ['Metro'] }]
	};
}

/**
 * A schedule that spans from the past into the future, for smart (minimal-change)
 * regeneration. One clerkship needing 3 days, one preceptor available on a past day
 * and several future days. The journey sets `start` to a past Monday, hand-places a
 * PAST day and a LOCKED future day, then regenerates from today — both must survive.
 */
export function smartWorld(): WorldSpec {
	return {
		name: 'Smart regen',
		healthSystems: ['Metro'],
		sites: [{ name: 'Clinic', healthSystem: 'Metro' }],
		clerkships: [
			{ name: 'Family Medicine', type: 'outpatient', requiredDays: 3, sites: ['Clinic'] }
		],
		preceptors: [
			{
				name: 'Dr. FM',
				sites: ['Clinic'],
				teaches: ['Family Medicine'],
				// day 0 = past Monday (anchor is set to a past Monday by the journey);
				// 21/22/23/28/29 are future weekdays for the locked day + regeneration.
				availability: [0, 21, 22, 23, 28, 29].map((day) => ({ day, site: 'Clinic' }))
			}
		],
		students: [{ name: 'Alice', onboardedAt: ['Metro'] }]
	};
}
