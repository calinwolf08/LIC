/**
 * The demo account's schedules: one per family of interesting behaviour, each
 * with its own entities, all dated in the future and with NO assignments — so
 * you can generate or hand-build schedules against them and clear them again.
 *
 * Dates are relative to an anchor Monday (see `demoAnchor`), so the data never
 * goes stale. `weekdays` use 1 = Monday … 5 = Friday.
 *
 * Imports are relative: this runs under plain tsx (also inside the Docker image).
 */

export type Weekday = 1 | 2 | 3 | 4 | 5;

export interface AvailabilitySpec {
	/** Weekdays this slot repeats on across the whole schedule. */
	weekdays: Weekday[];
	/** Site name (defaults to the preceptor's first site). */
	site?: string;
	session?: 'full' | 'am' | 'pm';
	/** Credit a day in this slot earns (0.5 for a half day). */
	credit?: number;
	preference?: 'preferred' | 'in_a_pinch';
	/** Only these weeks of the schedule, 0-based and inclusive (default: every week). */
	weeks?: [number, number];
}

export interface ClerkshipSpec {
	name: string;
	type: 'inpatient' | 'outpatient';
	kind: 'block' | 'scattered';
	requiredDays: number;
	/** Allowable-miss floor (E2). */
	minRequiredDays?: number;
	/** Force the engine's assignment strategy for this clerkship. */
	strategy?: 'continuous_single' | 'daily_rotation' | 'block_based' | 'team_continuity';
	/** Restrict to these sites (omit = any site). */
	sites?: string[];
	electives?: Array<{
		name: string;
		minimumDays: number;
		required: boolean;
		/** Preceptor pool for the elective. */
		preceptors: string[];
		sites: string[];
	}>;
	/**
	 * Named preceptor teams for the clerkship. Omitted: one team of everyone who
	 * teaches it.
	 */
	teams?: Array<{ name: string; members: string[] }>;
}

export interface PreceptorSpec {
	name: string;
	healthSystem: string;
	sites: string[];
	maxStudents: number;
	/** Clerkships taught — each becomes a team for that clerkship (eligibility). */
	teaches: string[];
	availability: AvailabilitySpec[];
}

export interface StudentSpec {
	name: string;
	/** Health systems the student has completed onboarding at. */
	onboardedAt: string[];
	corePreceptors?: string[];
}

export interface ScheduleScenario {
	/** Short tag appended to globally-unique names (clerkships, emails). */
	tag: string;
	name: string;
	/** What this schedule is for — shown in the docs and the seed output. */
	purpose: string;
	weeks: number;
	healthSystems: string[];
	sites: Array<{ name: string; healthSystem: string }>;
	clerkships: ClerkshipSpec[];
	preceptors: PreceptorSpec[];
	students: StudentSpec[];
	mutualExclusions?: Array<[string, string]>;
	/** Day offsets from the schedule start (weekdays). */
	blackouts?: Array<{ day: number; reason: string }>;
	quarters?: Array<{ name: string; startDay: number; endDay: number }>;
}

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

const students = (names: string[], onboardedAt: string[]): StudentSpec[] =>
	names.map((name) => ({ name, onboardedAt }));

export const DEMO_SCENARIOS: ScheduleScenario[] = [
	{
		tag: 'A',
		name: 'Demo A · Core rotation (happy path)',
		purpose:
			'Everything fits: block and scattered clerkships, ample availability, every student onboarded. Generation should satisfy every requirement — a baseline for comparing the others.',
		weeks: 12,
		healthSystems: ['Riverside Health'],
		sites: [
			{ name: 'Riverside Hospital', healthSystem: 'Riverside Health' },
			{ name: 'Riverside Family Clinic', healthSystem: 'Riverside Health' }
		],
		clerkships: [
			{
				name: 'Internal Medicine',
				type: 'inpatient',
				kind: 'block',
				requiredDays: 10,
				sites: ['Riverside Hospital']
			},
			{
				name: 'Family Medicine',
				type: 'outpatient',
				kind: 'scattered',
				requiredDays: 10,
				minRequiredDays: 8,
				sites: ['Riverside Family Clinic']
			},
			{ name: 'Pediatrics', type: 'outpatient', kind: 'scattered', requiredDays: 8 }
		],
		preceptors: [
			{
				name: 'Dr. Ana Ortiz',
				healthSystem: 'Riverside Health',
				sites: ['Riverside Hospital'],
				maxStudents: 2,
				teaches: ['Internal Medicine'],
				availability: [{ weekdays: WEEKDAYS }]
			},
			{
				name: 'Dr. Ben Carter',
				healthSystem: 'Riverside Health',
				sites: ['Riverside Hospital'],
				maxStudents: 2,
				teaches: ['Internal Medicine'],
				availability: [{ weekdays: WEEKDAYS }]
			},
			{
				name: 'Dr. Chloe Nguyen',
				healthSystem: 'Riverside Health',
				sites: ['Riverside Family Clinic'],
				maxStudents: 2,
				teaches: ['Family Medicine', 'Pediatrics'],
				availability: [{ weekdays: WEEKDAYS }]
			},
			{
				name: 'Dr. Dev Patel',
				healthSystem: 'Riverside Health',
				sites: ['Riverside Family Clinic'],
				maxStudents: 2,
				teaches: ['Family Medicine', 'Pediatrics'],
				availability: [{ weekdays: WEEKDAYS }]
			}
		],
		students: students(
			['Avery Brooks', 'Blake Rivera', 'Casey Morgan', 'Dana Lee', 'Elliot Shaw', 'Finley Hart'],
			['Riverside Health']
		)
	},
	{
		tag: 'B',
		name: 'Demo B · Electives & teams',
		purpose:
			'Electives (one required, one optional) with their own preceptor pools and sites, a team-continuity clerkship, and students with core preceptors.',
		weeks: 12,
		healthSystems: ['Lakeside Medical'],
		sites: [
			{ name: 'Lakeside Hospital', healthSystem: 'Lakeside Medical' },
			{ name: 'Lakeside Heart Center', healthSystem: 'Lakeside Medical' },
			{ name: 'Lakeside Skin Clinic', healthSystem: 'Lakeside Medical' }
		],
		clerkships: [
			{
				name: 'Internal Medicine',
				type: 'inpatient',
				kind: 'scattered',
				requiredDays: 12,
				electives: [
					{
						name: 'Cardiology',
						minimumDays: 4,
						required: true,
						preceptors: ['Dr. Grace Kim'],
						sites: ['Lakeside Heart Center']
					},
					{
						name: 'Dermatology',
						minimumDays: 2,
						required: false,
						preceptors: ['Dr. Hugo Silva'],
						sites: ['Lakeside Skin Clinic']
					}
				]
			},
			{
				name: 'Surgery',
				type: 'inpatient',
				kind: 'block',
				requiredDays: 10,
				strategy: 'team_continuity',
				sites: ['Lakeside Hospital']
			}
		],
		preceptors: [
			{
				name: 'Dr. Grace Kim',
				healthSystem: 'Lakeside Medical',
				sites: ['Lakeside Heart Center', 'Lakeside Hospital'],
				maxStudents: 2,
				teaches: ['Internal Medicine'],
				availability: [
					{ weekdays: [1, 2, 3], site: 'Lakeside Heart Center' },
					{ weekdays: [4, 5], site: 'Lakeside Hospital' }
				]
			},
			{
				name: 'Dr. Hugo Silva',
				healthSystem: 'Lakeside Medical',
				sites: ['Lakeside Skin Clinic', 'Lakeside Hospital'],
				maxStudents: 2,
				teaches: ['Internal Medicine'],
				availability: [
					{ weekdays: [2, 4], site: 'Lakeside Skin Clinic' },
					{ weekdays: [1, 3, 5], site: 'Lakeside Hospital' }
				]
			},
			{
				name: 'Dr. Iris Moreau',
				healthSystem: 'Lakeside Medical',
				sites: ['Lakeside Hospital'],
				maxStudents: 2,
				teaches: ['Surgery'],
				availability: [{ weekdays: WEEKDAYS }]
			},
			{
				name: 'Dr. Jonah Price',
				healthSystem: 'Lakeside Medical',
				sites: ['Lakeside Hospital'],
				maxStudents: 2,
				teaches: ['Surgery'],
				availability: [{ weekdays: WEEKDAYS }]
			},
			{
				name: 'Dr. Kara Wells',
				healthSystem: 'Lakeside Medical',
				sites: ['Lakeside Hospital'],
				maxStudents: 2,
				teaches: ['Surgery'],
				availability: [{ weekdays: [1, 2, 3, 4] }]
			}
		],
		students: [
			{ name: 'Gabe Ellis', onboardedAt: ['Lakeside Medical'], corePreceptors: ['Dr. Grace Kim'] },
			{ name: 'Hana Ito', onboardedAt: ['Lakeside Medical'], corePreceptors: ['Dr. Iris Moreau'] },
			...students(['Ivan Cruz', 'Jade Foster', 'Kai Bennett', 'Luca Romano'], ['Lakeside Medical'])
		]
	},
	{
		tag: 'C',
		name: 'Demo C · Tight capacity & partial availability',
		purpose:
			'More students than slots: preceptors who take one student, part-week and half-day (AM/PM, half credit) availability, an "in a pinch" preference, and two preceptors who must not overlap. Expect unmet requirements and capacity conflicts.',
		weeks: 8,
		healthSystems: ['Summit Health'],
		sites: [
			{ name: 'Summit Hospital', healthSystem: 'Summit Health' },
			{ name: 'Summit Clinic', healthSystem: 'Summit Health' }
		],
		clerkships: [
			{
				name: 'Psychiatry',
				type: 'outpatient',
				kind: 'scattered',
				requiredDays: 10,
				minRequiredDays: 7
			},
			{
				name: 'Neurology',
				type: 'inpatient',
				kind: 'block',
				requiredDays: 10,
				sites: ['Summit Hospital']
			}
		],
		preceptors: [
			{
				name: 'Dr. Leo Hart',
				healthSystem: 'Summit Health',
				sites: ['Summit Clinic'],
				maxStudents: 1,
				teaches: ['Psychiatry'],
				// Mondays and Wednesdays only.
				availability: [{ weekdays: [1, 3] }]
			},
			{
				name: 'Dr. Mia Chen',
				healthSystem: 'Summit Health',
				sites: ['Summit Clinic'],
				maxStudents: 1,
				teaches: ['Psychiatry'],
				// Half days: mornings Tue/Thu, afternoons Fri, half credit each.
				availability: [
					{ weekdays: [2, 4], session: 'am', credit: 0.5 },
					{ weekdays: [5], session: 'pm', credit: 0.5 }
				]
			},
			{
				name: 'Dr. Noah Grant',
				healthSystem: 'Summit Health',
				sites: ['Summit Hospital'],
				maxStudents: 1,
				teaches: ['Neurology'],
				availability: [{ weekdays: WEEKDAYS }]
			},
			{
				name: 'Dr. Olivia Ross',
				healthSystem: 'Summit Health',
				sites: ['Summit Hospital'],
				maxStudents: 1,
				teaches: ['Neurology'],
				// Willing, but only as a last resort.
				availability: [{ weekdays: [2, 4], preference: 'in_a_pinch' }]
			}
		],
		students: students(
			[
				'Mason Reid',
				'Nora Blake',
				'Owen Diaz',
				'Piper Lane',
				'Quinn Hayes',
				'Rosa Vega',
				'Sam Kerr'
			],
			['Summit Health']
		),
		mutualExclusions: [['Dr. Noah Grant', 'Dr. Olivia Ross']]
	},
	{
		tag: 'D',
		name: 'Demo D · Onboarding, blackouts & quarters',
		purpose:
			"Two health systems: some students are not onboarded at the second one (not_onboarded conflicts), a clerkship restricted to that system's site, two holiday blackouts, and four quarters.",
		weeks: 16,
		healthSystems: ['Northgate Health', 'Valley Care'],
		sites: [
			{ name: 'Northgate Hospital', healthSystem: 'Northgate Health' },
			{ name: 'Valley Clinic', healthSystem: 'Valley Care' }
		],
		clerkships: [
			{
				name: 'Obstetrics & Gynecology',
				type: 'inpatient',
				kind: 'block',
				requiredDays: 10,
				sites: ['Northgate Hospital']
			},
			{
				name: 'Rural Primary Care',
				type: 'outpatient',
				kind: 'scattered',
				requiredDays: 8,
				sites: ['Valley Clinic']
			}
		],
		preceptors: [
			{
				name: 'Dr. Paula Diaz',
				healthSystem: 'Northgate Health',
				sites: ['Northgate Hospital'],
				maxStudents: 2,
				teaches: ['Obstetrics & Gynecology'],
				availability: [{ weekdays: WEEKDAYS }]
			},
			{
				name: 'Dr. Quentin Hale',
				healthSystem: 'Valley Care',
				sites: ['Valley Clinic'],
				maxStudents: 2,
				teaches: ['Rural Primary Care'],
				availability: [{ weekdays: [1, 2, 3, 4] }]
			}
		],
		students: [
			...students(['Tara Quinn', 'Uma Patel', 'Victor Hale'], ['Northgate Health', 'Valley Care']),
			// Not onboarded at Valley Care: assigning them to Rural Primary Care
			// raises a not_onboarded conflict.
			...students(['Willa Stone', 'Xavier Bell'], ['Northgate Health'])
		],
		blackouts: [
			{ day: 15, reason: 'Program holiday' },
			{ day: 45, reason: 'Exam prep day' }
		],
		quarters: [
			{ name: 'Q1', startDay: 0, endDay: 27 },
			{ name: 'Q2', startDay: 28, endDay: 55 },
			{ name: 'Q3', startDay: 56, endDay: 83 },
			{ name: 'Q4', startDay: 84, endDay: 111 }
		]
	},
	fullSemester('E'),
	fullSemester('F')
];

/**
 * Demos E and F: one realistic 16-week semester, built twice. E has enough room
 * for every requirement, so generation should meet them all. F is the same
 * program with three planted shortfalls, each of which generation should report
 * clearly so the coordinator knows what to fix:
 *
 *   1. Psychiatry: not enough preceptor days (Dr. Lambert works Mondays only and
 *      Dr. Mensah's Tuesday mornings are half days).
 *   2. Family Medicine's required Sports Medicine elective: its pool is one
 *      preceptor on Wednesdays, too few days for every student.
 *   3. Obstetrics & Gynecology (an inpatient block): one preceptor taking one
 *      student, and only for the first 12 weeks — fewer whole weeks than the
 *      students' blocks need.
 *
 * Everything else is identical, so a requirement F misses and E meets points at
 * one of those three gaps.
 */
function fullSemester(tag: 'E' | 'F'): ScheduleScenario {
	const short = tag === 'F';
	const systems = ['Crestview Health', 'Harbor Health', 'Pinecrest Health'];
	return {
		tag,
		name: short
			? 'Demo F · Full semester — falls short'
			: 'Demo E · Full semester — everything fits',
		purpose: short
			? 'Demo E with three planted gaps: too few Psychiatry preceptor days, a Sports Medicine elective pool too small for every student, and too few Obstetrics & Gynecology block weeks. Generation should meet everything else and report each gap.'
			: 'A realistic 16-week semester: 8 students, 6 clerkships (3 inpatient blocks, 3 outpatient), 3 health systems, 6 sites, 14 preceptors in teams, a required and an optional elective, half-day and "in a pinch" availability, core preceptors, a mutual exclusion, 2 blackouts and 2 quarters. There is room for every requirement.',
		weeks: 16,
		healthSystems: systems,
		sites: [
			{ name: 'Crestview University Hospital', healthSystem: 'Crestview Health' },
			{ name: 'Crestview Family Clinic', healthSystem: 'Crestview Health' },
			{ name: "Harbor Children's Hospital", healthSystem: 'Harbor Health' },
			{ name: "Harbor Women's Center", healthSystem: 'Harbor Health' },
			{ name: 'Pinecrest Behavioral Health', healthSystem: 'Pinecrest Health' },
			{ name: 'Pinecrest Rural Clinic', healthSystem: 'Pinecrest Health' }
		],
		clerkships: [
			{
				name: 'Internal Medicine',
				type: 'inpatient',
				kind: 'block',
				requiredDays: 10,
				sites: ['Crestview University Hospital']
			},
			{
				name: 'Surgery',
				type: 'inpatient',
				kind: 'block',
				requiredDays: 10,
				strategy: 'team_continuity',
				sites: ['Crestview University Hospital'],
				teams: [
					{ name: 'Surgery · Red team', members: ['Dr. Sam Fischer', 'Dr. Nadia Volkov'] },
					{ name: 'Surgery · Blue team', members: ['Dr. Owen Burke', 'Dr. Hana Sato'] }
				]
			},
			{
				name: 'Obstetrics & Gynecology',
				type: 'inpatient',
				kind: 'block',
				requiredDays: 10,
				sites: ["Harbor Women's Center"]
			},
			{
				name: 'Pediatrics',
				type: 'outpatient',
				kind: 'scattered',
				requiredDays: 10,
				minRequiredDays: 8,
				sites: ["Harbor Children's Hospital"]
			},
			{
				name: 'Psychiatry',
				type: 'outpatient',
				kind: 'scattered',
				requiredDays: 8,
				sites: ['Pinecrest Behavioral Health']
			},
			{
				name: 'Family Medicine',
				type: 'outpatient',
				kind: 'scattered',
				requiredDays: 12,
				sites: ['Crestview Family Clinic', 'Pinecrest Rural Clinic'],
				electives: [
					{
						name: 'Sports Medicine',
						minimumDays: 3,
						required: true,
						preceptors: ['Dr. Tom Becker'],
						sites: ['Crestview Family Clinic']
					},
					{
						name: 'Dermatology',
						minimumDays: 2,
						required: false,
						preceptors: ['Dr. Lila Okafor'],
						sites: ['Crestview Family Clinic']
					}
				]
			}
		],
		preceptors: [
			// Internal Medicine.
			{
				name: 'Dr. Elena Ruiz',
				healthSystem: 'Crestview Health',
				sites: ['Crestview University Hospital'],
				maxStudents: 2,
				teaches: ['Internal Medicine'],
				availability: [{ weekdays: WEEKDAYS }]
			},
			{
				name: 'Dr. Marcus Webb',
				healthSystem: 'Crestview Health',
				sites: ['Crestview University Hospital'],
				maxStudents: 2,
				teaches: ['Internal Medicine'],
				availability: [{ weekdays: WEEKDAYS }]
			},
			// Surgery: two teams of two.
			...['Dr. Sam Fischer', 'Dr. Nadia Volkov', 'Dr. Owen Burke', 'Dr. Hana Sato'].map(
				(name): PreceptorSpec => ({
					name,
					healthSystem: 'Crestview Health',
					sites: ['Crestview University Hospital'],
					maxStudents: 1,
					teaches: ['Surgery'],
					availability: [{ weekdays: WEEKDAYS }]
				})
			),
			// Obstetrics & Gynecology.
			{
				name: 'Dr. Grace Liu',
				healthSystem: 'Harbor Health',
				sites: ["Harbor Women's Center"],
				maxStudents: short ? 1 : 2,
				teaches: ['Obstetrics & Gynecology'],
				availability: [{ weekdays: WEEKDAYS, ...(short ? { weeks: [0, 11] } : {}) }]
			},
			...(short
				? []
				: [
						{
							name: 'Dr. Rafael Costa',
							healthSystem: 'Harbor Health',
							sites: ["Harbor Women's Center"],
							maxStudents: 2,
							teaches: ['Obstetrics & Gynecology'],
							// Willing, but only as a last resort.
							availability: [{ weekdays: WEEKDAYS, preference: 'in_a_pinch' }]
						} satisfies PreceptorSpec
					]),
			// Pediatrics: part-week preceptors.
			{
				name: 'Dr. Amir Haddad',
				healthSystem: 'Harbor Health',
				sites: ["Harbor Children's Hospital"],
				maxStudents: 2,
				teaches: ['Pediatrics'],
				availability: [{ weekdays: [1, 3, 5] }]
			},
			{
				name: 'Dr. Julia Brandt',
				healthSystem: 'Harbor Health',
				sites: ["Harbor Children's Hospital"],
				maxStudents: 2,
				teaches: ['Pediatrics'],
				availability: [{ weekdays: [2, 4] }]
			},
			// Psychiatry: a full-time preceptor and a half-day one.
			{
				name: 'Dr. Ivy Lambert',
				healthSystem: 'Pinecrest Health',
				sites: ['Pinecrest Behavioral Health'],
				maxStudents: short ? 1 : 2,
				teaches: ['Psychiatry'],
				availability: [{ weekdays: short ? [1] : WEEKDAYS }]
			},
			{
				name: 'Dr. Kofi Mensah',
				healthSystem: 'Pinecrest Health',
				sites: ['Pinecrest Behavioral Health'],
				maxStudents: 1,
				teaches: ['Psychiatry'],
				availability: [{ weekdays: short ? [2] : [2, 4], session: 'am', credit: 0.5 }]
			},
			// Family Medicine (two clinics) and its elective pools.
			{
				name: 'Dr. Tom Becker',
				healthSystem: 'Crestview Health',
				sites: ['Crestview Family Clinic'],
				maxStudents: short ? 1 : 2,
				teaches: ['Family Medicine'],
				availability: [{ weekdays: short ? [3] : WEEKDAYS }]
			},
			{
				name: 'Dr. Lila Okafor',
				healthSystem: 'Crestview Health',
				sites: ['Crestview Family Clinic'],
				maxStudents: 2,
				teaches: ['Family Medicine'],
				availability: [{ weekdays: [1, 3] }]
			},
			{
				name: 'Dr. Ben Yates',
				healthSystem: 'Pinecrest Health',
				sites: ['Pinecrest Rural Clinic'],
				maxStudents: 2,
				teaches: ['Family Medicine'],
				availability: [{ weekdays: WEEKDAYS }]
			}
		],
		students: [
			{ name: 'Aiden Cole', onboardedAt: systems, corePreceptors: ['Dr. Ben Yates'] },
			{ name: 'Bella Moss', onboardedAt: systems, corePreceptors: ['Dr. Lila Okafor'] },
			...students(
				['Caleb Price', 'Delia Fox', 'Ethan Ward', 'Freya Nash', 'Gavin Holt', 'Hazel Pike'],
				systems
			)
		],
		mutualExclusions: [['Dr. Sam Fischer', 'Dr. Owen Burke']],
		blackouts: [
			{ day: 39, reason: 'Fall break' },
			{ day: 80, reason: 'Program holiday' }
		],
		quarters: [
			{ name: 'Q1', startDay: 0, endDay: 55 },
			{ name: 'Q2', startDay: 56, endDay: 111 }
		]
	};
}
