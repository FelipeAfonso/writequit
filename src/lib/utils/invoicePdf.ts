/**
 * Invoice PDF generation using jsPDF.
 *
 * Produces a clean, professional-looking invoice with a terminal-inspired
 * dark aesthetic. Line items are grouped by project tag.
 */

import { jsPDF } from 'jspdf';

// ── Types ──────────────────────────────────────────────────────────

export interface InvoiceLineItem {
	label: string;
	hours: number;
	amount: number;
}

export type InvoiceTheme = 'dark' | 'light';

export interface InvoiceData {
	invoiceNumber: string;
	createdAt: string; // formatted date string
	// Period
	startDate: string; // YYYY-MM-DD
	endDate: string; // YYYY-MM-DD
	// From
	fromName: string;
	fromEmail: string;
	fromAddress?: string;
	// Client
	clientName: string;
	clientAddress?: string;
	// Billing
	hourlyRate: number;
	currency: string;
	lineItems: InvoiceLineItem[];
	subtotal: number;
	total: number;
	// Payment
	paymentTerms?: string;
	dueDate?: string; // formatted date string
	notes?: string;
	// Theme
	theme?: InvoiceTheme;
}

// ── Constants ──────────────────────────────────────────────────────

const MARGIN = 20;
const PAGE_WIDTH = 210; // A4 mm
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LINE_HEIGHT = 5;

// Color palettes
type RGB = readonly [number, number, number];

interface ThemeColors {
	fg: RGB;
	muted: RGB;
	green: RGB;
	primary: RGB;
	bg: RGB;
	surface: RGB;
	altRow: RGB;
}

const DARK_COLORS: ThemeColors = {
	fg: [200, 200, 214],
	muted: [120, 120, 140],
	green: [115, 218, 202],
	primary: [122, 162, 247],
	bg: [26, 27, 38],
	surface: [36, 40, 59],
	altRow: [30, 33, 48]
};

const LIGHT_COLORS: ThemeColors = {
	fg: [30, 30, 40],
	muted: [100, 100, 120],
	green: [22, 163, 74],
	primary: [59, 130, 246],
	bg: [255, 255, 255],
	surface: [243, 244, 246],
	altRow: [249, 250, 251]
};

function getColors(theme: InvoiceTheme): ThemeColors {
	return theme === 'light' ? LIGHT_COLORS : DARK_COLORS;
}

// ── Helpers ────────────────────────────────────────────────────────

function addPageBg(doc: jsPDF, colors: ThemeColors) {
	const pageH = doc.internal.pageSize.getHeight();
	doc.setFillColor(...colors.bg);
	doc.rect(0, 0, PAGE_WIDTH, pageH, 'F');
}

function rightAlignText(doc: jsPDF, text: string, y: number) {
	const w = doc.getTextWidth(text);
	doc.text(text, MARGIN + CONTENT_WIDTH - w, y);
}

function formatCurrency(amount: number, currency: string): string {
	const symbols: Record<string, string> = {
		USD: '$',
		EUR: '\u20AC',
		GBP: '\u00A3',
		BRL: 'R$',
		CAD: 'CA$',
		AUD: 'A$',
		JPY: '\u00A5'
	};
	const symbol = symbols[currency] ?? `${currency} `;
	return `${symbol}${amount.toFixed(2)}`;
}

// ── Main export ────────────────────────────────────────────────────

export function generateInvoicePdf(data: InvoiceData): jsPDF {
	const theme = data.theme ?? 'dark';
	const c = getColors(theme);

	const doc = new jsPDF({ unit: 'mm', format: 'a4' });
	addPageBg(doc, c);
	doc.setFont('courier', 'normal');

	let y = MARGIN;

	// ── Header: INVOICE title + number ──
	doc.setFontSize(20);
	doc.setTextColor(...c.fg);
	doc.text('INVOICE', MARGIN, y);

	doc.setFontSize(10);
	doc.setTextColor(...c.primary);
	rightAlignText(doc, data.invoiceNumber, y);
	y += LINE_HEIGHT * 2;

	// ── Date + period ──
	doc.setFontSize(8);
	doc.setTextColor(...c.muted);
	doc.text(`Date: ${data.createdAt}`, MARGIN, y);
	rightAlignText(doc, `Period: ${data.startDate} -- ${data.endDate}`, y);
	y += LINE_HEIGHT;

	if (data.dueDate) {
		doc.text(`Due: ${data.dueDate}`, MARGIN, y);
		y += LINE_HEIGHT;
	}
	if (data.paymentTerms) {
		doc.text(`Terms: ${data.paymentTerms}`, MARGIN, y);
		y += LINE_HEIGHT;
	}

	y += LINE_HEIGHT;

	// ── From / To columns ──
	const colMid = MARGIN + CONTENT_WIDTH / 2;

	doc.setFontSize(7);
	doc.setTextColor(...c.muted);
	doc.text('FROM', MARGIN, y);
	doc.text('BILL TO', colMid, y);
	y += LINE_HEIGHT;

	doc.setFontSize(9);
	doc.setTextColor(...c.fg);
	doc.text(data.fromName, MARGIN, y);
	doc.text(data.clientName, colMid, y);
	y += LINE_HEIGHT;

	doc.setFontSize(8);
	doc.setTextColor(...c.muted);
	doc.text(data.fromEmail, MARGIN, y);
	y += LINE_HEIGHT;

	if (data.fromAddress || data.clientAddress) {
		const fromLines = data.fromAddress
			? doc.splitTextToSize(data.fromAddress, CONTENT_WIDTH / 2 - 4)
			: [];
		const clientLines = data.clientAddress
			? doc.splitTextToSize(data.clientAddress, CONTENT_WIDTH / 2 - 4)
			: [];

		const maxLines = Math.max(fromLines.length, clientLines.length);
		for (let i = 0; i < maxLines; i++) {
			if (fromLines[i]) doc.text(fromLines[i], MARGIN, y);
			if (clientLines[i]) doc.text(clientLines[i], colMid, y);
			y += LINE_HEIGHT;
		}
	}

	y += LINE_HEIGHT;

	// ── Line items table ──
	// Table header
	doc.setFillColor(...c.surface);
	doc.rect(MARGIN, y - 3.5, CONTENT_WIDTH, LINE_HEIGHT + 2, 'F');

	doc.setFontSize(7);
	doc.setTextColor(...c.muted);
	doc.text('DESCRIPTION', MARGIN + 2, y);

	const colHours = MARGIN + CONTENT_WIDTH - 70;
	const colRate = MARGIN + CONTENT_WIDTH - 45;

	doc.text('HOURS', colHours, y);
	doc.text('RATE', colRate, y);
	rightAlignText(doc, 'AMOUNT', y);
	y += LINE_HEIGHT + 2;

	// Table rows
	doc.setFontSize(8);
	for (let i = 0; i < data.lineItems.length; i++) {
		const item = data.lineItems[i];

		// Alternating row bg
		if (i % 2 === 0) {
			doc.setFillColor(...c.altRow);
			doc.rect(MARGIN, y - 3.5, CONTENT_WIDTH, LINE_HEIGHT + 1, 'F');
		}

		doc.setTextColor(...c.fg);
		// Truncate long labels
		const maxLabelW = colHours - MARGIN - 6;
		let label = item.label;
		while (doc.getTextWidth(label) > maxLabelW && label.length > 3) {
			label = label.slice(0, -4) + '...';
		}
		doc.text(label, MARGIN + 2, y);

		doc.setTextColor(...c.muted);
		doc.text(item.hours.toFixed(1), colHours, y);
		doc.text(formatCurrency(data.hourlyRate, data.currency), colRate, y);

		doc.setTextColor(...c.green);
		rightAlignText(doc, formatCurrency(item.amount, data.currency), y);

		y += LINE_HEIGHT + 1;
	}

	y += LINE_HEIGHT;

	// ── Totals ──
	doc.setDrawColor(...c.muted);
	doc.setLineWidth(0.2);
	doc.line(colRate - 5, y, MARGIN + CONTENT_WIDTH, y);
	y += LINE_HEIGHT;

	doc.setFontSize(8);
	doc.setTextColor(...c.muted);
	doc.text('Subtotal', colRate - 5, y);
	doc.setTextColor(...c.fg);
	rightAlignText(doc, formatCurrency(data.subtotal, data.currency), y);
	y += LINE_HEIGHT + 1;

	// Total (bold line)
	doc.setDrawColor(...c.green);
	doc.setLineWidth(0.3);
	doc.line(colRate - 5, y - 1, MARGIN + CONTENT_WIDTH, y - 1);

	doc.setFontSize(10);
	doc.setTextColor(...c.green);
	doc.text('TOTAL', colRate - 5, y + LINE_HEIGHT - 1);
	rightAlignText(
		doc,
		formatCurrency(data.total, data.currency),
		y + LINE_HEIGHT - 1
	);
	y += LINE_HEIGHT * 2 + 2;

	// ── Notes ──
	if (data.notes) {
		doc.setFontSize(7);
		doc.setTextColor(...c.muted);
		doc.text('NOTES', MARGIN, y);
		y += LINE_HEIGHT;

		doc.setFontSize(8);
		doc.setTextColor(...c.fg);
		const noteLines = doc.splitTextToSize(data.notes, CONTENT_WIDTH);
		for (const line of noteLines) {
			doc.text(line, MARGIN, y);
			y += LINE_HEIGHT;
		}
	}

	// ── Footer ──
	const totalPages = doc.getNumberOfPages();
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i);
		const pageH = doc.internal.pageSize.getHeight();
		doc.setFontSize(7);
		doc.setTextColor(...c.muted);
		doc.text(':wq', MARGIN, pageH - 10);
		const pageText = `page ${i}/${totalPages}`;
		const pw = doc.getTextWidth(pageText);
		doc.text(pageText, MARGIN + CONTENT_WIDTH - pw, pageH - 10);
	}

	return doc;
}

/**
 * Generate and trigger download of an invoice PDF.
 */
export function downloadInvoicePdf(data: InvoiceData): void {
	const doc = generateInvoicePdf(data);
	const filename = `${data.invoiceNumber.toLowerCase().replace(/\s+/g, '_')}_${data.clientName.toLowerCase().replace(/\s+/g, '_')}.pdf`;
	doc.save(filename);
}
