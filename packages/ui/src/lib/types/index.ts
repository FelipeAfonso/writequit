/**
 * Shared data types for writequit.
 *
 * These are platform-agnostic — used by both the web app (Convex) and
 * the desktop app (plain-text files). Each platform maps its native
 * storage format to these interfaces.
 */

// ── Tag ─────────────────────────────────────────────────────────────

export type TagType = 'priority' | 'project' | 'category' | 'context';

export interface Tag {
	id: string;
	name: string;
	type?: TagType;
	color?: string;
	createdAt: number;
}

// ── Task ────────────────────────────────────────────────────────────

export type TaskStatus = 'inbox' | 'active' | 'done';

export interface Task {
	id: string;
	rawContent: string;
	title: string;
	status: TaskStatus;
	statusPriority?: number;
	dueDate?: number;
	tagIds: string[];
	/** Resolved tag objects (populated by the data provider). */
	tags?: Tag[];
	createdAt: number;
	updatedAt: number;
	completedAt?: number;
}

// ── Session ─────────────────────────────────────────────────────────

export interface Session {
	id: string;
	startTime: number;
	/** Undefined = timer is still running. */
	endTime?: number;
	description?: string;
	tagIds: string[];
	taskIds: string[];
	/** Resolved tag objects. */
	tags?: Tag[];
	/** Resolved task objects (for reports). */
	tasks?: Task[];
	createdAt: number;
	updatedAt: number;
}

// ── Invoice ─────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export interface InvoiceLineItem {
	label: string;
	hours?: number;
	quantity?: number;
	unitPrice?: number;
	amount: number;
}

export interface Invoice {
	id: string;
	invoiceNumber: string;
	status: InvoiceStatus;
	startDate: number;
	endDate: number;
	fromName: string;
	fromEmail: string;
	fromAddress?: string;
	clientName: string;
	clientAddress?: string;
	hourlyRate: number;
	currency: string;
	lineItems: InvoiceLineItem[];
	subtotal: number;
	total: number;
	paymentTerms?: string;
	dueDate?: number;
	notes?: string;
	createdAt: number;
}

// ── Pagination ──────────────────────────────────────────────────────

/**
 * Status of a paginated query.
 * Shared so that components like TaskList can reference it
 * without depending on a specific backend (Convex, etc.).
 */
export type PaginationStatus =
	| 'LoadingFirstPage'
	| 'CanLoadMore'
	| 'LoadingMore'
	| 'Exhausted';

// ── User Settings ───────────────────────────────────────────────────

export type StatusFilter = 'lastUsed' | 'all' | 'inbox' | 'active' | 'done';
export type TagFilter = 'lastUsed' | 'all';
export type AutoLinkMode = 'all' | 'scoped' | 'startOnly' | 'off';
export type InvoiceTheme = 'dark' | 'light';

export interface UserSettings {
	viMode: boolean;
	defaultStatusFilter: StatusFilter;
	defaultTagFilter: TagFilter;
	timezone?: string;
	invoiceFromAddress?: string;
	defaultHourlyRate?: number;
	defaultCurrency?: string;
	defaultPaymentTerms?: string;
	defaultInvoiceTheme?: InvoiceTheme;
	tutorialCompleted?: boolean;
	autoLinkMode?: AutoLinkMode;
}
