/**
 * Test data fixtures for E2E API tests
 * Provides factory functions for creating consistent test data
 */

let counter = 0;
function uniqueId(): string {
	return `test-${Date.now()}-${counter++}`;
}

export const fixtures = {
	student: (overrides: Partial<StudentData> = {}): StudentData => ({
		name: `Test Student ${uniqueId()}`,
		email: `student-${uniqueId()}@test.com`,
		...overrides
	}),

	preceptor: (overrides: Partial<PreceptorData> = {}): PreceptorData => {
		const base: any = {
			name: `Dr. Preceptor ${uniqueId()}`,
			email: `preceptor-${uniqueId()}@test.com`,
			health_system_id: overrides.health_system_id || 'temp-hs-id',
			...overrides
		};
		// Only add max_students if explicitly provided
		if (overrides.max_students !== undefined) {
			base.max_students = overrides.max_students;
		}
		return base;
	},

	clerkship: (overrides: Partial<ClerkshipData> = {}): ClerkshipData => ({
		name: `Clerkship-${uniqueId()}`,
		clerkship_type: overrides.clerkship_type || 'inpatient',
		required_days: overrides.required_days || 28,
		description: overrides.description,
		...overrides
	}),

	healthSystem: (overrides: Partial<HealthSystemData> = {}): HealthSystemData => ({
		name: `Health System ${uniqueId()}`,
		location: overrides.location,
		description: overrides.description,
		...overrides
	}),

	site: (overrides: Partial<SiteData> = {}): SiteData => ({
		name: `Site-${uniqueId()}`,
		health_system_id: overrides.health_system_id!,
		...overrides
	}),

	requirement: (clerkshipId: string, overrides: Partial<RequirementData> = {}): RequirementData => ({
		clerkshipId: clerkshipId,
		requirementType: overrides.requirementType || 'inpatient',
		requiredDays: overrides.requiredDays || 10,
		overrideMode: overrides.overrideMode || 'inherit',
		overrideAssignmentStrategy: overrides.overrideAssignmentStrategy,
		overrideHealthSystemRule: overrides.overrideHealthSystemRule,
		overrideMaxStudentsPerDay: overrides.overrideMaxStudentsPerDay,
		overrideMaxStudentsPerYear: overrides.overrideMaxStudentsPerYear,
		overrideMaxStudentsPerBlock: overrides.overrideMaxStudentsPerBlock,
		overrideMaxBlocksPerYear: overrides.overrideMaxBlocksPerYear,
		overrideBlockSizeDays: overrides.overrideBlockSizeDays,
		overrideAllowPartialBlocks: overrides.overrideAllowPartialBlocks,
		overridePreferContinuousBlocks: overrides.overridePreferContinuousBlocks,
		overrideAllowTeams: overrides.overrideAllowTeams,
		overrideAllowFallbacks: overrides.overrideAllowFallbacks,
		overrideFallbackRequiresApproval: overrides.overrideFallbackRequiresApproval,
		overrideFallbackAllowCrossSystem: overrides.overrideFallbackAllowCrossSystem,
		...overrides
	}),

	team: (overrides: Partial<TeamData> = {}): TeamData => ({
		name: `Team-${uniqueId()}`,
		requireSameHealthSystem: overrides.requireSameHealthSystem ?? false,
		requireSameSite: overrides.requireSameSite ?? false,
		requireSameSpecialty: overrides.requireSameSpecialty ?? false,
		requiresAdminApproval: overrides.requiresAdminApproval ?? false,
		members: overrides.members || [
			{ preceptorId: 'temp-prec-1', priority: 1 },
			{ preceptorId: 'temp-prec-2', priority: 2 }
		],
		...overrides
	}),

	capacityRule: (preceptorId: string, overrides: Partial<CapacityRuleData> = {}): CapacityRuleData => ({
		preceptorId: preceptorId,
		clerkshipId: overrides.clerkshipId,
		requirementType: overrides.requirementType,
		maxStudentsPerDay: overrides.maxStudentsPerDay || 2,
		maxStudentsPerYear: overrides.maxStudentsPerYear || 10,
		maxStudentsPerBlock: overrides.maxStudentsPerBlock,
		maxBlocksPerYear: overrides.maxBlocksPerYear,
		...overrides
	}),

	fallback: (primaryPreceptorId: string, fallbackPreceptorId: string, overrides: Partial<FallbackData> = {}): FallbackData => ({
		primaryPreceptorId: primaryPreceptorId,
		fallbackPreceptorId: fallbackPreceptorId,
		clerkshipId: overrides.clerkshipId,
		priority: overrides.priority || 1,
		requiresApproval: overrides.requiresApproval ?? false,
		allowDifferentHealthSystem: overrides.allowDifferentHealthSystem ?? false,
		...overrides
	}),

	elective: (overrides: Partial<ElectiveData> = {}): ElectiveData => ({
		name: overrides.name || `Elective-${uniqueId()}`,
		minimumDays: overrides.minimumDays || 5,
		specialty: overrides.specialty || 'Surgery',
		availablePreceptorIds: overrides.availablePreceptorIds || ['temp-prec-1'],
		...overrides
	}),

	availability: (preceptorId: number, date: string, overrides: Partial<AvailabilityData> = {}): AvailabilityData => ({
		preceptor_id: preceptorId,
		date: date,
		is_available: overrides.is_available ?? true,
		...overrides
	}),

	pattern: (preceptorId: string, overrides: Partial<PatternData> = {}): PatternData => {
		const patternType = overrides.pattern_type || 'weekly';
		const basePattern: any = {
			preceptor_id: preceptorId,
			pattern_type: patternType,
			is_available: overrides.is_available ?? true,
			date_range_start: overrides.date_range_start || '2025-01-06',
			date_range_end: overrides.date_range_end || '2025-12-31',
			enabled: overrides.enabled ?? true,
			reason: overrides.reason
		};

		// Add config based on pattern type
		if (patternType === 'weekly') {
			basePattern.config = overrides.config || {
				days_of_week: [0, 1, 2, 3, 4] // Monday-Friday (0=Monday, 6=Sunday)
			};
		} else if (patternType === 'monthly') {
			basePattern.config = overrides.config || {
				monthly_type: 'specific_days',
				specific_days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
			};
		} else if (patternType === 'block') {
			basePattern.config = overrides.config || {
				exclude_weekends: false
			};
		} else if (patternType === 'individual') {
			basePattern.config = null;
		}

		return { ...basePattern, ...overrides };
	},

	schedulingPeriod: (overrides: Partial<SchedulingPeriodData> = {}): SchedulingPeriodData => ({
		name: `Period-${uniqueId()}`,
		start_date: overrides.start_date || '2025-01-06',
		end_date: overrides.end_date || '2025-12-31',
		is_active: overrides.is_active ?? false,
		...overrides
	}),

	assignment: (studentId: number, preceptorId: number, clerkshipId: number, date: string, overrides: Partial<AssignmentData> = {}): AssignmentData => ({
		student_id: studentId,
		preceptor_id: preceptorId,
		clerkship_id: clerkshipId,
		date: date,
		assignment_type: overrides.assignment_type || 'inpatient',
		site_id: overrides.site_id,
		team_id: overrides.team_id,
		...overrides
	})
};

// Type definitions for fixtures
export interface StudentData {
	name: string;
	email: string;
}

export interface PreceptorData {
	name: string;
	email: string;
	health_system_id?: string;
	max_students?: number;
	site_id?: string;
}

export interface ClerkshipData {
	name: string;
	clerkship_type: string;
	required_days: number;
	description?: string;
}

export interface HealthSystemData {
	name: string;
	location?: string;
	description?: string;
}

export interface SiteData {
	name: string;
	health_system_id: string;
	address?: string;
}

export interface RequirementData {
	clerkshipId: string;
	requirementType: 'outpatient' | 'inpatient' | 'elective';
	requiredDays: number;
	overrideMode: 'inherit' | 'override_fields' | 'override_section';
	overrideAssignmentStrategy?: 'continuous_single' | 'continuous_team' | 'block_based' | 'daily_rotation';
	overrideHealthSystemRule?: 'enforce_same_system' | 'prefer_same_system' | 'no_preference';
	overrideMaxStudentsPerDay?: number;
	overrideMaxStudentsPerYear?: number;
	overrideMaxStudentsPerBlock?: number;
	overrideMaxBlocksPerYear?: number;
	overrideBlockSizeDays?: number;
	overrideAllowPartialBlocks?: boolean;
	overridePreferContinuousBlocks?: boolean;
	overrideAllowTeams?: boolean;
	overrideAllowFallbacks?: boolean;
	overrideFallbackRequiresApproval?: boolean;
	overrideFallbackAllowCrossSystem?: boolean;
}

export interface TeamMemberData {
	preceptorId: string;
	role?: string;
	priority: number;
}

export interface TeamData {
	name?: string;
	requireSameHealthSystem?: boolean;
	requireSameSite?: boolean;
	requireSameSpecialty?: boolean;
	requiresAdminApproval?: boolean;
	members: TeamMemberData[];
}

export interface CapacityRuleData {
	preceptorId: string;
	clerkshipId?: string;
	requirementType?: 'outpatient' | 'inpatient' | 'elective';
	maxStudentsPerDay: number;
	maxStudentsPerYear: number;
	maxStudentsPerBlock?: number;
	maxBlocksPerYear?: number;
}

export interface FallbackData {
	primaryPreceptorId: string;
	fallbackPreceptorId: string;
	clerkshipId?: string;
	priority: number;
	requiresApproval?: boolean;
	allowDifferentHealthSystem?: boolean;
}

export interface ElectiveData {
	name: string;
	minimumDays: number;
	specialty?: string;
	availablePreceptorIds: string[];
}

export interface AvailabilityData {
	preceptor_id: number;
	date: string;
	is_available: boolean;
}

export interface PatternData {
	preceptor_id: string;
	pattern_type: 'weekly' | 'monthly' | 'block' | 'individual';
	is_available: boolean;
	date_range_start: string;
	date_range_end: string;
	config: any; // WeeklyConfig | MonthlyConfig | BlockConfig | null
	enabled?: boolean;
	reason?: string;
}

export interface SchedulingPeriodData {
	name: string;
	start_date: string;
	end_date: string;
	is_active: boolean;
}

export interface AssignmentData {
	student_id: number;
	preceptor_id: number;
	clerkship_id: number;
	date: string;
	assignment_type: string;
	site_id?: number;
	team_id?: number;
}
