/**
 * Timezone-aware date/time formatting and calculation utilities.
 *
 * All functions accept an IANA timezone string (e.g. "America/New_York")
 * and use `Intl.DateTimeFormat` internally for correct DST handling.
 *
 * Timestamps are always UTC ms — the timezone is only used for display
 * and local-time interpretation.
 */

// ── Constants ──────────────────────────────────────────────────────

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

// ── Low-level: extract parts in a given timezone ───────────────────

interface DateParts {
	year: number;
	month: number; // 1-12
	day: number; // 1-31
	hour: number; // 0-23
	minute: number; // 0-59
	weekday: number; // 0=Sun … 6=Sat
}

/**
 * Extract date/time parts for a UTC ms timestamp in a given timezone.
 *
 * Uses `Intl.DateTimeFormat` for correct DST handling.
 */
function getPartsInTz(ms: number, tz: string): DateParts {
	const fmt = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		weekday: 'short',
		hour12: false
	});

	const parts = fmt.formatToParts(new Date(ms));
	const map: Record<string, string> = {};
	for (const p of parts) {
		map[p.type] = p.value;
	}

	const weekdayStr = map['weekday'] ?? 'Sun';
	const weekday = SHORT_DAYS.indexOf(weekdayStr);

	return {
		year: parseInt(map['year'] ?? '2026', 10),
		month: parseInt(map['month'] ?? '1', 10),
		day: parseInt(map['day'] ?? '1', 10),
		hour: parseInt(map['hour'] ?? '0', 10) % 24, // Intl may return 24 for midnight
		minute: parseInt(map['minute'] ?? '0', 10),
		weekday: weekday >= 0 ? weekday : 0
	};
}

// ── Formatting functions ───────────────────────────────────────────

/**
 * Format a UTC ms timestamp as `HH:MM` in the given timezone.
 *
 * Example: `formatTime(ms, 'America/New_York')` → `"14:30"`
 */
export function formatTime(ms: number, tz: string): string {
	const { hour, minute } = getPartsInTz(ms, tz);
	return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Format a UTC ms timestamp as `YYYY-MM-DD` in the given timezone.
 *
 * Example: `formatDate(ms, 'America/New_York')` → `"2026-02-04"`
 */
export function formatDate(ms: number, tz: string): string {
	const { year, month, day } = getPartsInTz(ms, tz);
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Format a UTC ms timestamp as `MM/DD` in the given timezone.
 *
 * Used for compact date display (task cards, due dates).
 */
export function formatShortDate(ms: number, tz: string): string {
	const { month, day } = getPartsInTz(ms, tz);
	return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

/**
 * Format a UTC ms timestamp as `YYYY-MM-DD HH:MM` in the given timezone.
 */
export function formatDateTime(ms: number, tz: string): string {
	return `${formatDate(ms, tz)} ${formatTime(ms, tz)}`;
}

/**
 * Format a UTC ms timestamp into a date header for session grouping.
 *
 * Returns `{ date: 'YYYY-MM-DD', label: 'Tue, Feb 4' }`.
 */
export function formatDateHeader(
	ms: number,
	tz: string
): { date: string; label: string } {
	const p = getPartsInTz(ms, tz);
	const date = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
	const dayName = SHORT_DAYS[p.weekday];
	const monthName = SHORT_MONTHS[p.month - 1];
	const label = `${dayName}, ${monthName} ${p.day}`;
	return { date, label };
}

/**
 * Format a duration in ms as a human-readable string.
 *
 * This is timezone-agnostic (pure duration math).
 */
export function formatDuration(ms: number): string {
	const totalMinutes = Math.floor(ms / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours === 0) return `${minutes}m`;
	return `${hours}h ${minutes}m`;
}

// ── Midnight / date boundary calculations ──────────────────────────

/**
 * Get the UTC ms timestamp for midnight (start of day) in the given
 * timezone for a given UTC ms timestamp.
 *
 * This accounts for DST — the returned timestamp represents the exact
 * moment when the calendar day starts in that timezone.
 *
 * Example: For `America/New_York` (UTC-5), midnight of Feb 4 is
 * `2026-02-04T05:00:00Z`.
 */
export function getLocalMidnight(ms: number, tz: string): number {
	const { year, month, day } = getPartsInTz(ms, tz);

	// Start with a rough estimate: UTC midnight of that date.
	// Then compute the offset to find the exact local midnight.
	const utcEstimate = Date.UTC(year, month - 1, day);

	// Check what local time that UTC estimate maps to
	const estParts = getPartsInTz(utcEstimate, tz);

	// The offset in ms = local_representation - utc_time
	// If utcEstimate shows as hour H in local time, then midnight local
	// is at utcEstimate - H*60min - M*min (in ms)
	const offsetMs =
		(estParts.hour * 60 + estParts.minute) * 60_000 +
		(estParts.day !== day
			? estParts.day > day
				? -86_400_000
				: 86_400_000
			: 0);

	const candidate = utcEstimate - offsetMs;

	// Verify the candidate — it should map to 00:00 of the target day
	const verify = getPartsInTz(candidate, tz);
	if (verify.day === day && verify.hour === 0 && verify.minute === 0) {
		return candidate;
	}

	// DST edge case: try ±1 hour
	for (const delta of [3_600_000, -3_600_000, 7_200_000, -7_200_000]) {
		const attempt = candidate + delta;
		const v = getPartsInTz(attempt, tz);
		if (v.day === day && v.hour === 0 && v.minute === 0) {
			return attempt;
		}
	}

	// Fallback (should never reach here)
	return candidate;
}

/**
 * Get the start-of-week (Monday) and start-of-month boundaries
 * in the user's timezone, returned as UTC ms timestamps.
 */
export function getDateRangeBounds(
	range: 'week' | 'month',
	tz: string
): { startAfter: number } {
	const now = Date.now();
	const parts = getPartsInTz(now, tz);

	if (range === 'week') {
		// Find Monday of this week
		const dayOfWeek = parts.weekday; // 0=Sun … 6=Sat
		const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Days since Monday
		const mondayMs = now - diff * 86_400_000;
		const mondayMidnight = getLocalMidnight(mondayMs, tz);
		return { startAfter: mondayMidnight };
	}

	// month: first of this month
	const firstDayMs = Date.UTC(parts.year, parts.month - 1, 1);
	// Get midnight of the 1st in user's timezone
	const firstMidnight = getLocalMidnight(firstDayMs, tz);
	return { startAfter: firstMidnight };
}

// ── Timezone helpers ───────────────────────────────────────────────

/**
 * Detect the browser's timezone via the `Intl` API.
 *
 * Falls back to `'UTC'` if detection fails.
 */
export function detectTimezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return 'UTC';
	}
}

/**
 * Check if an IANA timezone string is valid.
 */
export function isValidTimezone(tz: string): boolean {
	try {
		Intl.DateTimeFormat(undefined, { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/**
 * Get all available IANA timezone names.
 *
 * Uses `Intl.supportedValuesOf('timeZone')` where available,
 * with a fallback to a common subset.
 */
/**
 * Svelte context key for the timezone getter.
 *
 * The layout sets this to `() => string`. Components call it
 * to get the current timezone. Uses a getter function to
 * maintain reactivity across component boundaries.
 */
export const TIMEZONE_CTX = 'timezone';

/** Type of the timezone context value (a getter function). */
export type TimezoneGetter = () => string;

/**
 * Get all available IANA timezone names.
 *
 * Uses `Intl.supportedValuesOf('timeZone')` where available,
 * with a fallback to a common subset.
 */
export function getTimezoneList(): string[] {
	try {
		// Available in modern browsers and Node 18+
		return Intl.supportedValuesOf('timeZone');
	} catch {
		// Fallback: return a minimal set
		return [
			'UTC',
			'America/New_York',
			'America/Chicago',
			'America/Denver',
			'America/Los_Angeles',
			'America/Sao_Paulo',
			'Europe/London',
			'Europe/Paris',
			'Europe/Berlin',
			'Asia/Tokyo',
			'Asia/Shanghai',
			'Asia/Kolkata',
			'Australia/Sydney',
			'Pacific/Auckland'
		];
	}
}
