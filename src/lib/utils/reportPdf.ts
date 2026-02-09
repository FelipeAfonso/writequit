/**
 * Work report PDF generation using jsPDF.
 *
 * Produces a clean, mono-font report grouped by day showing sessions,
 * their time ranges, tags, descriptions, and linked tasks.
 */

import { jsPDF } from 'jspdf';
import { formatTime, formatDuration } from './datetime';
import type { InvoiceTheme } from './invoicePdf';

// ── Types ──────────────────────────────────────────────────────────

export interface ReportSession {
	startTime: number;
	endTime?: number;
	description?: string;
	tags: { name: string; color?: string; type?: string }[];
	tasks: { title: string; status: string }[];
}

export interface ReportDayGroup {
	date: string;
	label: string;
	totalMs: number;
	sessions: ReportSession[];
}

export interface ReportData {
	userName: string;
	startDate: string; // YYYY-MM-DD
	endDate: string; // YYYY-MM-DD
	timezone: string;
	groups: ReportDayGroup[];
	totalMs: number;
	totalSessions: number;
	theme?: InvoiceTheme;
}

// ── Constants ──────────────────────────────────────────────────────

const MARGIN = 20;
const PAGE_WIDTH = 210; // A4 mm
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LINE_HEIGHT = 5;
const SECTION_GAP = 3;

// Color palettes
type RGB = readonly [number, number, number];

interface ThemeColors {
	fg: RGB;
	muted: RGB;
	green: RGB;
	primary: RGB;
	bg: RGB;
	separator: RGB;
}

const DARK_COLORS: ThemeColors = {
	fg: [200, 200, 214],
	muted: [120, 120, 140],
	green: [115, 218, 202],
	primary: [122, 162, 247],
	bg: [26, 27, 38],
	separator: [60, 60, 80]
};

const LIGHT_COLORS: ThemeColors = {
	fg: [30, 30, 40],
	muted: [100, 100, 120],
	green: [22, 163, 74],
	primary: [59, 130, 246],
	bg: [255, 255, 255],
	separator: [200, 200, 210]
};

function getColors(theme: InvoiceTheme): ThemeColors {
	return theme === 'light' ? LIGHT_COLORS : DARK_COLORS;
}

// ── Helper ─────────────────────────────────────────────────────────

function addPageBg(doc: jsPDF, colors: ThemeColors) {
	const pageH = doc.internal.pageSize.getHeight();
	doc.setFillColor(...colors.bg);
	doc.rect(0, 0, PAGE_WIDTH, pageH, 'F');
}

function checkPageBreak(
	doc: jsPDF,
	y: number,
	needed: number,
	colors: ThemeColors
): number {
	const pageH = doc.internal.pageSize.getHeight();
	if (y + needed > pageH - MARGIN) {
		doc.addPage();
		addPageBg(doc, colors);
		return MARGIN;
	}
	return y;
}

// ── Main export ────────────────────────────────────────────────────

export function generateReportPdf(data: ReportData): jsPDF {
	const theme = data.theme ?? 'dark';
	const c = getColors(theme);
	const doc = new jsPDF({ unit: 'mm', format: 'a4' });
	addPageBg(doc, c);

	// Use courier (built-in mono font)
	doc.setFont('courier', 'normal');

	let y = MARGIN;

	// ── Header ──
	doc.setFontSize(16);
	doc.setTextColor(...c.fg);
	doc.text('WORK REPORT', MARGIN, y);
	y += LINE_HEIGHT * 2;

	doc.setFontSize(9);
	doc.setTextColor(...c.muted);
	doc.text(`${data.userName}`, MARGIN, y);
	y += LINE_HEIGHT;
	doc.text(`Period: ${data.startDate} -- ${data.endDate}`, MARGIN, y);
	y += LINE_HEIGHT;
	doc.text(`Timezone: ${data.timezone}`, MARGIN, y);
	y += LINE_HEIGHT;

	// Summary line
	doc.setTextColor(...c.green);
	doc.text(
		`${data.totalSessions} session${data.totalSessions !== 1 ? 's' : ''} | ${formatDuration(data.totalMs)} total`,
		MARGIN,
		y
	);
	y += LINE_HEIGHT * 2;

	// ── Separator ──
	doc.setDrawColor(...c.muted);
	doc.setLineWidth(0.2);
	doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
	y += SECTION_GAP * 2;

	// ── Day groups ──
	for (const group of data.groups) {
		// Check if we need enough space for at least the header + 1 session
		y = checkPageBreak(doc, y, LINE_HEIGHT * 4, c);

		// Day header
		doc.setFontSize(10);
		doc.setTextColor(...c.primary);
		doc.text(group.label, MARGIN, y);

		// Day total on the right
		doc.setTextColor(...c.green);
		const dayTotal = formatDuration(group.totalMs);
		const totalWidth = doc.getTextWidth(dayTotal);
		doc.text(dayTotal, MARGIN + CONTENT_WIDTH - totalWidth, y);
		y += LINE_HEIGHT + 1;

		// Sessions
		for (const session of group.sessions) {
			y = checkPageBreak(doc, y, LINE_HEIGHT * 3, c);

			const durationMs = session.endTime
				? session.endTime - session.startTime
				: 0;
			const startStr = formatTime(session.startTime, data.timezone);
			const endStr = session.endTime
				? formatTime(session.endTime, data.timezone)
				: 'running';

			// Time range + duration
			doc.setFontSize(8);
			doc.setTextColor(...c.fg);
			doc.text(
				`  ${startStr} - ${endStr}  (${formatDuration(durationMs)})`,
				MARGIN,
				y
			);
			y += LINE_HEIGHT;

			// Tags
			if (session.tags.length > 0) {
				doc.setTextColor(...c.muted);
				const tagStr = session.tags.map((t) => `+${t.name}`).join(' ');
				doc.text(`    ${tagStr}`, MARGIN, y);
				y += LINE_HEIGHT;
			}

			// Description
			if (session.description) {
				doc.setTextColor(...c.fg);
				// Wrap long descriptions
				const descLines = doc.splitTextToSize(
					`    "${session.description}"`,
					CONTENT_WIDTH - 8
				);
				for (const line of descLines) {
					y = checkPageBreak(doc, y, LINE_HEIGHT, c);
					doc.text(line, MARGIN, y);
					y += LINE_HEIGHT;
				}
			}

			// Linked tasks
			if (session.tasks.length > 0) {
				doc.setTextColor(...c.muted);
				doc.setFontSize(7);
				for (const task of session.tasks) {
					y = checkPageBreak(doc, y, LINE_HEIGHT, c);
					const statusIcon =
						task.status === 'done'
							? '[x]'
							: task.status === 'active'
								? '[*]'
								: '[>]';
					const taskLine = `      ${statusIcon} ${task.title}`;
					const taskLines = doc.splitTextToSize(taskLine, CONTENT_WIDTH - 12);
					for (const tl of taskLines) {
						doc.text(tl, MARGIN, y);
						y += LINE_HEIGHT;
					}
				}
			}

			y += 1; // small gap between sessions
		}

		// Separator between days
		y += SECTION_GAP;
		y = checkPageBreak(doc, y, LINE_HEIGHT, c);
		doc.setDrawColor(...c.separator);
		doc.setLineWidth(0.1);
		doc.line(MARGIN + 4, y, MARGIN + CONTENT_WIDTH - 4, y);
		y += SECTION_GAP * 2;
	}

	// ── Footer summary ──
	y = checkPageBreak(doc, y, LINE_HEIGHT * 3, c);
	doc.setDrawColor(...c.muted);
	doc.setLineWidth(0.2);
	doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
	y += LINE_HEIGHT;

	doc.setFontSize(10);
	doc.setTextColor(...c.green);
	doc.text(`TOTAL: ${formatDuration(data.totalMs)}`, MARGIN, y);

	// Page numbers
	const totalPages = doc.getNumberOfPages();
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i);
		const pageH = doc.internal.pageSize.getHeight();
		doc.setFontSize(7);
		doc.setTextColor(...c.muted);
		doc.text(
			`page ${i}/${totalPages}`,
			MARGIN + CONTENT_WIDTH - 20,
			pageH - 10
		);
		doc.text(':wq', MARGIN, pageH - 10);
	}

	return doc;
}

/**
 * Generate and trigger download of a work report PDF.
 */
export function downloadReportPdf(data: ReportData): void {
	const doc = generateReportPdf(data);
	const filename = `report_${data.startDate}_${data.endDate}.pdf`;
	doc.save(filename);
}
