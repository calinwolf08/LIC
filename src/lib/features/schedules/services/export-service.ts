/**
 * Excel Export Service Layer
 *
 * Functions for generating Excel workbooks with schedule data
 * Note: Requires exceljs package (see COMMANDS_TO_RUN.md)
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type { EnrichedAssignment, CalendarFilters } from '../types';
import { getEnrichedAssignments } from './calendar-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:schedules:export');

// ExcelJS types - will be available after npm install
type Workbook = any;
type Worksheet = any;

/**
 * Generate complete Excel workbook with schedule data
 * @returns Buffer containing Excel file
 */
export async function generateScheduleExcel(
	db: Kysely<DB>,
	filters: CalendarFilters
): Promise<Buffer> {
	log.debug('Generating Excel export', {
		startDate: filters.start_date,
		endDate: filters.end_date,
		studentId: filters.student_id,
		preceptorId: filters.preceptor_id,
		clerkshipId: filters.clerkship_id
	});

	// Dynamically import ExcelJS (will fail gracefully if not installed)
	let ExcelJS: any;
	try {
		ExcelJS = await import('exceljs');
	} catch (error) {
		log.error('ExcelJS not installed', { error });
		throw new Error(
			'ExcelJS is not installed. Please run: npm install exceljs @types/exceljs'
		);
	}

	// Fetch enriched assignments
	const assignments = await getEnrichedAssignments(db, filters);

	// Create workbook
	const workbook = new (ExcelJS.default || ExcelJS).Workbook();
	workbook.creator = 'LIC Scheduling System';
	workbook.created = new Date();

	// Generate worksheets
	await generateStudentScheduleWorksheet(workbook, assignments);
	await generatePreceptorScheduleWorksheet(workbook, assignments);
	await generateMasterScheduleWorksheet(workbook, assignments);
	await generateSummaryWorksheet(workbook, assignments, filters.start_date, filters.end_date);

	// Write to buffer
	const buffer = await workbook.xlsx.writeBuffer();

	log.info('Excel export generated', {
		assignmentCount: assignments.length,
		bufferSize: buffer.byteLength,
		worksheets: 4
	});

	return Buffer.from(buffer);
}

/**
 * Generate student-centric worksheet
 */
async function generateStudentScheduleWorksheet(
	workbook: Workbook,
	assignments: EnrichedAssignment[]
): Promise<void> {
	const worksheet = workbook.addWorksheet('Student Schedules');

	// Set column headers
	worksheet.columns = [
		{ header: 'Student Name', key: 'student_name', width: 20 },
		{ header: 'Email', key: 'student_email', width: 25 },
		{ header: 'Clerkship', key: 'clerkship_name', width: 25 },
		{ header: 'Preceptor', key: 'preceptor_name', width: 20 },
		{ header: 'Date', key: 'date', width: 12 },
		{ header: 'Status', key: 'status', width: 12 }
	];

	// Style header row
	const headerRow = worksheet.getRow(1);
	headerRow.font = { bold: true };
	headerRow.fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FF4B5563' }
	};
	headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

	// Group assignments by student
	const byStudent = new Map<string, EnrichedAssignment[]>();
	for (const assignment of assignments) {
		const key = assignment.student_id;
		if (!byStudent.has(key)) {
			byStudent.set(key, []);
		}
		byStudent.get(key)!.push(assignment);
	}

	// Add rows for each student
	for (const [_, studentAssignments] of byStudent) {
		const sorted = studentAssignments.sort((a, b) => a.date.localeCompare(b.date));
		for (const assignment of sorted) {
			worksheet.addRow({
				student_name: assignment.student_name,
				student_email: assignment.student_email,
				clerkship_name: assignment.clerkship_name,
				preceptor_name: assignment.preceptor_name,
				date: assignment.date,
				status: assignment.status
			});
		}
	}

	// Apply borders
	worksheet.eachRow((row: any, rowNumber: number) => {
		row.eachCell((cell: any) => {
			cell.border = {
				top: { style: 'thin' },
				left: { style: 'thin' },
				bottom: { style: 'thin' },
				right: { style: 'thin' }
			};
		});
	});
}

/**
 * Generate preceptor-centric worksheet
 */
async function generatePreceptorScheduleWorksheet(
	workbook: Workbook,
	assignments: EnrichedAssignment[]
): Promise<void> {
	const worksheet = workbook.addWorksheet('Preceptor Schedules');

	// Set column headers
	worksheet.columns = [
		{ header: 'Preceptor Name', key: 'preceptor_name', width: 20 },
		{ header: 'Email', key: 'preceptor_email', width: 25 },
		{ header: 'Student', key: 'student_name', width: 20 },
		{ header: 'Clerkship', key: 'clerkship_name', width: 25 },
		{ header: 'Date', key: 'date', width: 12 },
		{ header: 'Status', key: 'status', width: 12 }
	];

	// Style header row
	const headerRow = worksheet.getRow(1);
	headerRow.font = { bold: true };
	headerRow.fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FF4B5563' }
	};
	headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

	// Group assignments by preceptor
	const byPreceptor = new Map<string, EnrichedAssignment[]>();
	for (const assignment of assignments) {
		const key = assignment.preceptor_id;
		if (!byPreceptor.has(key)) {
			byPreceptor.set(key, []);
		}
		byPreceptor.get(key)!.push(assignment);
	}

	// Add rows for each preceptor
	for (const [_, preceptorAssignments] of byPreceptor) {
		const sorted = preceptorAssignments.sort((a, b) => a.date.localeCompare(b.date));
		for (const assignment of sorted) {
			worksheet.addRow({
				preceptor_name: assignment.preceptor_name,
				preceptor_email: assignment.preceptor_email,
				student_name: assignment.student_name,
				clerkship_name: assignment.clerkship_name,
				date: assignment.date,
				status: assignment.status
			});
		}
	}

	// Apply borders
	worksheet.eachRow((row: any) => {
		row.eachCell((cell: any) => {
			cell.border = {
				top: { style: 'thin' },
				left: { style: 'thin' },
				bottom: { style: 'thin' },
				right: { style: 'thin' }
			};
		});
	});
}

/**
 * Generate master schedule worksheet
 */
async function generateMasterScheduleWorksheet(
	workbook: Workbook,
	assignments: EnrichedAssignment[]
): Promise<void> {
	const worksheet = workbook.addWorksheet('Master Schedule');

	// Set column headers
	worksheet.columns = [
		{ header: 'Date', key: 'date', width: 12 },
		{ header: 'Student', key: 'student_name', width: 20 },
		{ header: 'Preceptor', key: 'preceptor_name', width: 20 },
		{ header: 'Clerkship', key: 'clerkship_name', width: 25 },
		{ header: 'Specialty', key: 'specialty', width: 20 },
		{ header: 'Status', key: 'status', width: 12 }
	];

	// Style header row
	const headerRow = worksheet.getRow(1);
	headerRow.font = { bold: true };
	headerRow.fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FF4B5563' }
	};
	headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

	// Sort assignments by date
	const sorted = [...assignments].sort((a, b) => a.date.localeCompare(b.date));

	// Add rows
	for (const assignment of sorted) {
		const row = worksheet.addRow({
			date: assignment.date,
			student_name: assignment.student_name,
			preceptor_name: assignment.preceptor_name,
			clerkship_name: assignment.clerkship_name,
			specialty: assignment.clerkship_specialty,
			status: assignment.status
		});

		// Color code by clerkship
		const color = getClerkshipColor(assignment.clerkship_specialty);
		row.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: color }
		};
	}

	// Apply borders
	worksheet.eachRow((row: any) => {
		row.eachCell((cell: any) => {
			cell.border = {
				top: { style: 'thin' },
				left: { style: 'thin' },
				bottom: { style: 'thin' },
				right: { style: 'thin' }
			};
		});
	});
}

/**
 * Generate summary statistics worksheet
 */
async function generateSummaryWorksheet(
	workbook: Workbook,
	assignments: EnrichedAssignment[],
	startDate: string,
	endDate: string
): Promise<void> {
	const worksheet = workbook.addWorksheet('Summary');

	// Calculate statistics
	const uniqueStudents = new Set(assignments.map((a) => a.student_id));
	const uniquePreceptors = new Set(assignments.map((a) => a.preceptor_id));
	const uniqueClerkships = new Set(assignments.map((a) => a.clerkship_id));

	// Assignments by clerkship
	const byClerkship = new Map<string, number>();
	for (const assignment of assignments) {
		const count = byClerkship.get(assignment.clerkship_name) || 0;
		byClerkship.set(assignment.clerkship_name, count + 1);
	}

	// Add title
	worksheet.mergeCells('A1:B1');
	const titleCell = worksheet.getCell('A1');
	titleCell.value = 'Schedule Summary';
	titleCell.font = { bold: true, size: 16 };
	titleCell.alignment = { horizontal: 'center' };

	// Add date range
	worksheet.addRow([]);
	worksheet.addRow(['Date Range:', `${startDate} to ${endDate}`]);
	worksheet.addRow([]);

	// Add statistics
	worksheet.addRow(['Total Assignments:', assignments.length]);
	worksheet.addRow(['Active Students:', uniqueStudents.size]);
	worksheet.addRow(['Active Preceptors:', uniquePreceptors.size]);
	worksheet.addRow(['Clerkship Types:', uniqueClerkships.size]);
	worksheet.addRow([]);

	// Add assignments by clerkship
	worksheet.addRow(['Assignments by Clerkship:']);
	for (const [clerkship, count] of byClerkship) {
		worksheet.addRow([`  ${clerkship}:`, count]);
	}

	// Style columns
	worksheet.getColumn(1).width = 30;
	worksheet.getColumn(2).width = 15;

	// Make labels bold
	worksheet.getColumn(1).font = { bold: true };
}

/**
 * Get Excel color code for clerkship
 */
function getClerkshipColor(specialty: string): string {
	const colors: Record<string, string> = {
		'Internal Medicine': 'FFD1FAE5',
		Surgery: 'FFFECACA',
		Pediatrics: 'FFDBEAFE',
		'Family Medicine': 'FFFEF3C7',
		Psychiatry: 'FFE0E7FF',
		'OB/GYN': 'FFFCE7F3'
	};

	return colors[specialty] || 'FFF3F4F6'; // Default gray
}
