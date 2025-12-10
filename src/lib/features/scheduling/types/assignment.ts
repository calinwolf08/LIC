/**
 * Represents a proposed or confirmed student-preceptor assignment
 */
export interface Assignment {
	/**
	 * Student being assigned
	 */
	studentId: string;

	/**
	 * Preceptor supervising the student
	 */
	preceptorId: string;

	/**
	 * Clerkship/rotation type
	 */
	clerkshipId: string;

	/**
	 * Date of assignment (ISO format YYYY-MM-DD)
	 */
	date: string;

	/**
	 * Optional elective ID if this assignment is for an elective
	 */
	electiveId?: string;
}
