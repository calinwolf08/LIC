/**
 * Schedule Views Types
 *
 * Types for student schedule views, preceptor schedule views,
 * and schedule generation results display.
 */

/**
 * Progress towards a clerkship requirement
 */
export interface ClerkshipProgress {
	clerkshipId: string;
	clerkshipName: string;
	specialty: string;
	requiredDays: number;
	assignedDays: number;
	remainingDays: number;
	percentComplete: number;
	isComplete: boolean;
	/** Preceptors assigned for this clerkship */
	preceptors: Array<{
		id: string;
		name: string;
		daysAssigned: number;
		role?: string;
	}>;
	/** Sites where assignments occur */
	sites: Array<{
		id: string;
		name: string;
	}>;
	/** Team info if assigned as a team */
	team?: {
		id: string;
		name?: string;
	};
}

/**
 * A single day in the calendar grid
 */
export interface CalendarDay {
	date: string; // YYYY-MM-DD
	dayOfMonth: number;
	dayOfWeek: number; // 0-6 (Sun-Sat)
	isCurrentMonth: boolean;
	isToday: boolean;
	isWeekend: boolean;
	/** Assignment info if assigned */
	assignment?: {
		id: string;
		clerkshipId: string;
		clerkshipName: string;
		clerkshipAbbrev?: string;
		preceptorId: string;
		preceptorName: string;
		color: string;
	};
	/** For preceptor view: availability status */
	availability?: 'available' | 'unavailable' | 'unset';
	/** For preceptor view: student assigned */
	assignedStudent?: {
		id: string;
		name: string;
		initials: string;
	};
}

/**
 * A week in the calendar grid
 */
export interface CalendarWeek {
	weekNumber: number;
	days: CalendarDay[];
}

/**
 * A month in the calendar grid
 */
export interface CalendarMonth {
	year: number;
	month: number; // 1-12
	monthName: string;
	weeks: CalendarWeek[];
}

/**
 * Full student schedule data
 */
export interface StudentSchedule {
	student: {
		id: string;
		name: string;
		email: string;
	};
	period: {
		id: string;
		name: string;
		startDate: string;
		endDate: string;
	} | null;
	/** Progress by clerkship */
	clerkshipProgress: ClerkshipProgress[];
	/** Overall stats */
	summary: {
		totalAssignedDays: number;
		totalRequiredDays: number;
		overallPercentComplete: number;
		clerkshipsComplete: number;
		clerkshipsTotal: number;
		clerkshipsWithNoAssignments: number;
	};
	/** Calendar data for the period */
	calendar: CalendarMonth[];
	/** All assignments for easy listing */
	assignments: StudentAssignment[];
}

/**
 * Single assignment in student schedule list
 */
export interface StudentAssignment {
	id: string;
	date: string;
	clerkshipId: string;
	clerkshipName: string;
	clerkshipColor: string;
	preceptorId: string;
	preceptorName: string;
	siteName?: string;
	status: string;
}

/**
 * Preceptor capacity summary for a time period
 */
export interface PreceptorCapacitySummary {
	periodName: string;
	startDate: string;
	endDate: string;
	availableDays: number;
	assignedDays: number;
	openSlots: number;
	utilizationPercent: number;
}

/**
 * Full preceptor schedule data
 */
export interface PreceptorSchedule {
	preceptor: {
		id: string;
		name: string;
		email: string;
		healthSystemName?: string;
	};
	period: {
		id: string;
		name: string;
		startDate: string;
		endDate: string;
	} | null;
	/** Capacity by month */
	monthlyCapacity: PreceptorCapacitySummary[];
	/** Overall capacity for the period */
	overallCapacity: {
		availableDays: number;
		assignedDays: number;
		openSlots: number;
		utilizationPercent: number;
	};
	/** Calendar data for the period */
	calendar: CalendarMonth[];
	/** Students assigned to this preceptor */
	assignedStudents: Array<{
		studentId: string;
		studentName: string;
		clerkshipId: string;
		clerkshipName: string;
		daysAssigned: number;
		dateRange: {
			start: string;
			end: string;
		};
	}>;
	/** All assignments for easy listing */
	assignments: PreceptorAssignment[];
}

/**
 * Single assignment in preceptor schedule list
 */
export interface PreceptorAssignment {
	id: string;
	date: string;
	studentId: string;
	studentName: string;
	studentInitials: string;
	clerkshipId: string;
	clerkshipName: string;
	clerkshipColor: string;
	status: string;
}

/**
 * Student with unmet requirements
 */
export interface StudentWithUnmetRequirements {
	studentId: string;
	studentName: string;
	unmetClerkships: Array<{
		clerkshipId: string;
		clerkshipName: string;
		requiredDays: number;
		assignedDays: number;
		gap: number;
	}>;
	totalGap: number;
}

/**
 * Schedule generation results summary
 */
export interface ScheduleResultsSummary {
	period: {
		id: string;
		name: string;
		startDate: string;
		endDate: string;
	} | null;
	/** Overall statistics */
	stats: {
		totalAssignments: number;
		totalStudents: number;
		totalPreceptors: number;
		studentsFullyScheduled: number;
		studentsPartiallyScheduled: number;
		studentsWithNoAssignments: number;
	};
	/** Students missing requirements */
	studentsWithUnmetRequirements: StudentWithUnmetRequirements[];
	/** Breakdown by clerkship */
	clerkshipBreakdown: Array<{
		clerkshipId: string;
		clerkshipName: string;
		totalAssignments: number;
		studentsAssigned: number;
		averageDaysPerStudent: number;
	}>;
	/** Was the schedule fully successful? */
	isComplete: boolean;
}

/**
 * API response types
 */
export interface StudentScheduleResponse {
	success: boolean;
	data: StudentSchedule;
}

export interface PreceptorScheduleResponse {
	success: boolean;
	data: PreceptorSchedule;
}

export interface ScheduleSummaryResponse {
	success: boolean;
	data: ScheduleResultsSummary;
}
