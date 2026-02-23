// ── Types ────────────────────────────────────────────────────────────
export type {
	Tag,
	TagType,
	Task,
	TaskStatus,
	Session,
	Invoice,
	InvoiceStatus,
	InvoiceLineItem,
	UserSettings,
	StatusFilter,
	TagFilter,
	AutoLinkMode,
	InvoiceTheme,
	PaginationStatus
} from './types/index.js';

export type {
	DataProvider,
	ReactiveValue,
	TaskRepository,
	SessionRepository,
	TagRepository,
	InvoiceRepository,
	SettingsRepository
} from './types/provider.js';

// ── Context ──────────────────────────────────────────────────────────
export { setDataProvider, getDataProvider } from './types/context.js';

// ── Parser ───────────────────────────────────────────────────────────
export { parseTask } from './parser/index.js';
export type { ParsedTask } from './parser/types.js';
export { stripMetadata } from './parser/strip.js';
export { parseTimeLog, extractOffset } from './parser/timeRange.js';

// ── Stores ───────────────────────────────────────────────────────────
export { commandPalette } from './stores/commandPalette.svelte.js';
export { settings } from './stores/settings.svelte.js';

// ── Utils ────────────────────────────────────────────────────────────
export { commands, matchCommands, executeCommand } from './utils/commands.js';
export {
	formatTime,
	formatDate,
	formatShortDate,
	formatDateTime,
	formatDateHeader,
	formatDuration,
	getLocalMidnight,
	getMidnightForDate,
	parseHHMM,
	buildTimestamp,
	detectTimezone,
	isValidTimezone,
	getTimezoneList,
	getDateRangeBounds,
	TIMEZONE_CTX
} from './utils/datetime.js';
export type { TimezoneGetter } from './utils/datetime.js';
export { isEditableTarget } from './utils/keys.js';
export { sortTags } from './utils/tags.js';
export { downloadInvoicePdf } from './utils/invoicePdf.js';
export type {
	InvoiceData,
	InvoiceTheme as InvoicePdfTheme
} from './utils/invoicePdf.js';
export { downloadReportPdf } from './utils/reportPdf.js';
export type {
	ReportData,
	ReportDayGroup,
	ReportSession
} from './utils/reportPdf.js';
