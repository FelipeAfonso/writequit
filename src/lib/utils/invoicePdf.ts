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
}

// ── Constants ──────────────────────────────────────────────────────

const MARGIN = 20;
const PAGE_WIDTH = 210; // A4 mm
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LINE_HEIGHT = 5;

// Colors
const COLOR_FG = [200, 200, 214] as const;
const COLOR_MUTED = [120, 120, 140] as const;
const COLOR_GREEN = [115, 218, 202] as const;
const COLOR_PRIMARY = [122, 162, 247] as const;
const COLOR_BG = [26, 27, 38] as const;
const COLOR_SURFACE = [36, 40, 59] as const;

// ── Helpers ────────────────────────────────────────────────────────

function addPageBg(doc: jsPDF) {
	const pageH = doc.internal.pageSize.getHeight();
	doc.setFillColor(...COLOR_BG);
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
	const doc = new jsPDF({ unit: 'mm', format: 'a4' });
	addPageBg(doc);
	doc.setFont('courier', 'normal');

	let y = MARGIN;

	// ── Header: INVOICE title + number ──
	doc.setFontSize(20);
	doc.setTextColor(...COLOR_FG);
	doc.text('INVOICE', MARGIN, y);

	doc.setFontSize(10);
	doc.setTextColor(...COLOR_PRIMARY);
	rightAlignText(doc, data.invoiceNumber, y);
	y += LINE_HEIGHT * 2;

	// ── Date + period ──
	doc.setFontSize(8);
	doc.setTextColor(...COLOR_MUTED);
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
	doc.setTextColor(...COLOR_MUTED);
	doc.text('FROM', MARGIN, y);
	doc.text('BILL TO', colMid, y);
	y += LINE_HEIGHT;

	doc.setFontSize(9);
	doc.setTextColor(...COLOR_FG);
	doc.text(data.fromName, MARGIN, y);
	doc.text(data.clientName, colMid, y);
	y += LINE_HEIGHT;

	doc.setFontSize(8);
	doc.setTextColor(...COLOR_MUTED);
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
	doc.setFillColor(...COLOR_SURFACE);
	doc.rect(MARGIN, y - 3.5, CONTENT_WIDTH, LINE_HEIGHT + 2, 'F');

	doc.setFontSize(7);
	doc.setTextColor(...COLOR_MUTED);
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
			doc.setFillColor(30, 33, 48);
			doc.rect(MARGIN, y - 3.5, CONTENT_WIDTH, LINE_HEIGHT + 1, 'F');
		}

		doc.setTextColor(...COLOR_FG);
		// Truncate long labels
		const maxLabelW = colHours - MARGIN - 6;
		let label = item.label;
		while (doc.getTextWidth(label) > maxLabelW && label.length > 3) {
			label = label.slice(0, -4) + '...';
		}
		doc.text(label, MARGIN + 2, y);

		doc.setTextColor(...COLOR_MUTED);
		doc.text(item.hours.toFixed(1), colHours, y);
		doc.text(formatCurrency(data.hourlyRate, data.currency), colRate, y);

		doc.setTextColor(...COLOR_GREEN);
		rightAlignText(doc, formatCurrency(item.amount, data.currency), y);

		y += LINE_HEIGHT + 1;
	}

	y += LINE_HEIGHT;

	// ── Totals ──
	doc.setDrawColor(...COLOR_MUTED);
	doc.setLineWidth(0.2);
	doc.line(colRate - 5, y, MARGIN + CONTENT_WIDTH, y);
	y += LINE_HEIGHT;

	doc.setFontSize(8);
	doc.setTextColor(...COLOR_MUTED);
	doc.text('Subtotal', colRate - 5, y);
	doc.setTextColor(...COLOR_FG);
	rightAlignText(doc, formatCurrency(data.subtotal, data.currency), y);
	y += LINE_HEIGHT + 1;

	// Total (bold line)
	doc.setDrawColor(...COLOR_GREEN);
	doc.setLineWidth(0.3);
	doc.line(colRate - 5, y - 1, MARGIN + CONTENT_WIDTH, y - 1);

	doc.setFontSize(10);
	doc.setTextColor(...COLOR_GREEN);
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
		doc.setTextColor(...COLOR_MUTED);
		doc.text('NOTES', MARGIN, y);
		y += LINE_HEIGHT;

		doc.setFontSize(8);
		doc.setTextColor(...COLOR_FG);
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
		doc.setTextColor(...COLOR_MUTED);
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
