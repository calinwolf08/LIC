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
			specialty: overrides.specialty || 'Family Medicine',
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
		specialty: overrides.specialty || 'Family Medicine',
		clerkship_type: overrides.clerkship_type || 'inpatient',
		required_days: overrides.required_days || 28,
		description: overrides.description,
		...overrides
	}),

	healthSystem: (overrides: Partial<HealthSystemData> = {}): HealthSystemData => ({
		name: `Health System ${uniqueId()}`,
		abbreviation: `HS-${uniqueId().slice(0, 5).toUpperCase()}`,
		...overrides
	}),

	site: (overrides: Partial<SiteData> = {}): SiteData => ({
		name: `Site-${uniqueId()}`,
		health_system_id: overrides.health_system_id!,
		...overrides
	}),

	requirement: (clerkshipId: number, overrides: Partial<RequirementData> = {}): RequirementData => ({
		clerkship_id: clerkshipId,
		requirement_type: overrides.requirement_type || 'inpatient',
		days_required: overrides.days_required || 10,
		assignment_strategy: overrides.assignment_strategy || 'prioritize_continuity',
		health_system_id: overrides.health_system_id,
		site_id: overrides.site_id,
		team_id: overrides.team_id,
		allow_cross_system: overrides.allow_cross_system ?? false,
		...overrides
	}),

	team: (clerkshipId: number, overrides: Partial<TeamData> = {}): TeamData => ({
		clerkship_id: clerkshipId,
		name: `Team-${uniqueId()}`,
		priority_order: overrides.priority_order || 1,
		min_days: overrides.min_days,
		max_days: overrides.max_days,
		preceptor_ids: overrides.preceptor_ids || [],
		...overrides
	}),

	capacityRule: (preceptorId: number, overrides: Partial<CapacityRuleData> = {}): CapacityRuleData => ({
		preceptor_id: preceptorId,
		clerkship_id: overrides.clerkship_id,
		capacity_type: overrides.capacity_type || 'per_day',
		max_students: overrides.max_students || 2,
		start_date: overrides.start_date,
		end_date: overrides.end_date,
		...overrides
	}),

	fallback: (primaryPreceptorId: number, overrides: Partial<FallbackData> = {}): FallbackData => ({
		primary_preceptor_id: primaryPreceptorId,
		clerkship_id: overrides.clerkship_id,
		fallback_order: overrides.fallback_order || [],
		...overrides
	}),

	elective: (clerkshipId: number, overrides: Partial<ElectiveData> = {}): ElectiveData => ({
		clerkship_id: clerkshipId,
		specialty: overrides.specialty || 'Surgery',
		days_required: overrides.days_required || 5,
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
	specialty: string;
	health_system_id: string;
	max_students?: number;
	site_id?: string;
}

export interface ClerkshipData {
	name: string;
	specialty: string;
	clerkship_type: string;
	required_days: number;
	description?: string;
}

export interface HealthSystemData {
	name: string;
	abbreviation: string;
}

export interface SiteData {
	name: string;
	health_system_id: string;
	address?: string;
}

export interface RequirementData {
	clerkship_id: number;
	requirement_type: string;
	days_required: number;
	assignment_strategy: string;
	health_system_id?: number;
	site_id?: number;
	team_id?: number;
	allow_cross_system?: boolean;
}

export interface TeamData {
	clerkship_id: number;
	name: string;
	priority_order: number;
	min_days?: number;
	max_days?: number;
	preceptor_ids: number[];
}

export interface CapacityRuleData {
	preceptor_id: number;
	clerkship_id?: number;
	capacity_type: string;
	max_students: number;
	start_date?: string;
	end_date?: string;
}

export interface FallbackData {
	primary_preceptor_id: number;
	clerkship_id?: number;
	fallback_order: number[];
}

export interface ElectiveData {
	clerkship_id: number;
	specialty: string;
	days_required: number;
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
