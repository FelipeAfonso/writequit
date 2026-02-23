/**
 * Data provider abstraction for writequit.
 *
 * Both the web app (Convex) and desktop app (plain-text files)
 * implement this interface. Components consume data through it,
 * never touching the underlying storage directly.
 *
 * Reactive reads return `ReactiveValue<T>` — a simple object with
 * a `.current` getter that returns the latest value. This maps
 * naturally to both Convex's useQuery() and Svelte 5's $state().
 */

import type {
	Task,
	TaskStatus,
	Session,
	Tag,
	TagType,
	Invoice,
	InvoiceLineItem,
	UserSettings,
	AutoLinkMode,
	InvoiceTheme,
	StatusFilter,
	TagFilter
} from './index.js';

// ── Reactive primitive ──────────────────────────────────────────────

/**
 * A reactive value that can be read synchronously.
 * - In Convex: wraps useQuery() result
 * - In desktop: wraps $state()
 */
export interface ReactiveValue<T> {
	readonly current: T | undefined;
	readonly isLoading: boolean;
	readonly error: Error | undefined;
}

// ── Repository interfaces ───────────────────────────────────────────

export interface TaskRepository {
	list(opts?: {
		status?: TaskStatus;
		tagIds?: string[];
	}): ReactiveValue<Task[]>;
	get(id: string): ReactiveValue<Task | null>;
	search(query: string): ReactiveValue<Task[]>;
	create(rawContent: string): Promise<string>;
	update(id: string, rawContent: string): Promise<void>;
	updateStatus(id: string, status: TaskStatus): Promise<void>;
	remove(id: string): Promise<void>;
}

export interface SessionRepository {
	list(opts?: {
		startAfter?: number;
		endBefore?: number;
		tagIds?: string[];
	}): ReactiveValue<Session[]>;
	listWithTasks(opts?: {
		startAfter?: number;
		endBefore?: number;
		tagIds?: string[];
	}): ReactiveValue<Session[]>;
	get(id: string): ReactiveValue<Session | null>;
	active(): ReactiveValue<Session | null>;
	log(args: {
		startTime: number;
		endTime: number;
		description?: string;
		tags: string[];
	}): Promise<string>;
	start(args: {
		description?: string;
		tags: string[];
		startTime?: number;
	}): Promise<string>;
	stop(): Promise<void>;
	update(
		id: string,
		args: {
			startTime?: number;
			endTime?: number;
			description?: string;
			tags?: string[];
		}
	): Promise<void>;
	linkTask(sessionId: string, taskId: string): Promise<void>;
	unlinkTask(sessionId: string, taskId: string): Promise<void>;
	remove(id: string): Promise<void>;
}

export interface TagRepository {
	list(): ReactiveValue<Tag[]>;
	get(id: string): ReactiveValue<Tag | null>;
	create(name: string, type?: TagType, color?: string): Promise<string>;
	update(
		id: string,
		args: { name?: string; type?: TagType; color?: string }
	): Promise<void>;
	remove(id: string): Promise<void>;
}

export interface InvoiceRepository {
	list(): ReactiveValue<Invoice[]>;
	get(id: string): ReactiveValue<Invoice | null>;
	getNextNumber(): ReactiveValue<string>;
	create(args: {
		invoiceNumber: string;
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
	}): Promise<string>;
	updateStatus(id: string, status: 'draft' | 'sent' | 'paid'): Promise<void>;
	remove(id: string): Promise<void>;
}

export interface SettingsRepository {
	get(): ReactiveValue<UserSettings | null>;
	update(settings: Partial<UserSettings>): Promise<void>;
}

// ── Aggregate provider ──────────────────────────────────────────────

export interface DataProvider {
	tasks: TaskRepository;
	sessions: SessionRepository;
	tags: TagRepository;
	invoices: InvoiceRepository;
	settings: SettingsRepository;
}

// Re-export for convenience
export type {
	Task,
	TaskStatus,
	Session,
	Tag,
	TagType,
	Invoice,
	InvoiceLineItem,
	UserSettings,
	AutoLinkMode,
	InvoiceTheme,
	StatusFilter,
	TagFilter
};
