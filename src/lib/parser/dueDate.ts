import { isWhitespace, isDigit, toLower, readWhile } from './scanner.js';
import { getLocalMidnight } from '../utils/datetime.js';

/**
 * Extract a due date from a markdown string.
 *
 * Scans for the token `due:` (case-insensitive) followed by either:
 *   - An ISO date: `due:2026-02-10`
 *   - A relative keyword: `due:today`, `due:tomorrow`, `due:monday` … `due:sunday`, `due:next-week`
 *
 * Only the **first** `due:` token found is used.
 *
 * Returns a Unix-millisecond timestamp (midnight in the user's timezone
 * of that day) or `null` if no valid due date was found.
 *
 * @param markdown The input text to scan.
 * @param tz       IANA timezone string (e.g. "America/New_York").
 * @param now      Optional current time in ms for deterministic testing.
 */
export function extractDueDate(
	markdown: string,
	tz: string,
	now?: number
): number | null {
	const currentTime = now ?? Date.now();
	const token = findDueToken(markdown);
	if (token === null) return null;

	const value = toLower(token);

	// Try ISO date first: YYYY-MM-DD
	const isoResult = parseISODate(value, tz);
	if (isoResult !== null) return isoResult;

	// Try relative keywords
	return parseRelativeDate(value, currentTime, tz);
}

// ── Token finder ───────────────────────────────────────────────────

/**
 * Scan the text for `due:` preceded by whitespace (or at position 0)
 * and return the value after the colon (up to the next whitespace).
 */
function findDueToken(text: string): string | null {
	let i = 0;

	while (i < text.length) {
		// Check if we're at a word boundary
		const atBoundary = i === 0 || isWhitespace(text[i - 1]);

		if (atBoundary && matchesPrefix(text, i, 'due:')) {
			const valueStart = i + 4; // length of "due:"
			const { value } = readWhile(text, valueStart, (ch) => !isWhitespace(ch));
			if (value.length > 0) return value;
		}

		i++;
	}

	return null;
}

/**
 * Check if `text` at position `i` starts with `prefix`
 * (case-insensitive).
 */
function matchesPrefix(text: string, i: number, prefix: string): boolean {
	if (i + prefix.length > text.length) return false;
	for (let j = 0; j < prefix.length; j++) {
		const a = text.charCodeAt(i + j);
		const b = prefix.charCodeAt(j);
		// Lowercase both before comparing
		const al = a >= 65 && a <= 90 ? a + 32 : a;
		const bl = b >= 65 && b <= 90 ? b + 32 : b;
		if (al !== bl) return false;
	}
	return true;
}

// ── ISO date parser ────────────────────────────────────────────────

/**
 * Parse a `YYYY-MM-DD` string into a midnight timestamp in the given timezone.
 * Returns `null` if the format is invalid or the date doesn't exist.
 *
 * Validates character-by-character — no regex.
 *
 * Exported for reuse by the time-range parser.
 *
 * @param value The date string to parse (YYYY-MM-DD).
 * @param tz    IANA timezone string. Midnight is computed in this timezone.
 */
export function parseISODate(value: string, tz: string): number | null {
	// Must be exactly 10 characters: YYYY-MM-DD
	if (value.length !== 10) return null;

	// Check structure: digits and dashes in the right positions
	for (let i = 0; i < 10; i++) {
		if (i === 4 || i === 7) {
			if (value[i] !== '-') return null;
		} else {
			if (!isDigit(value[i])) return null;
		}
	}

	const year = parseIntManual(value, 0, 4);
	const month = parseIntManual(value, 5, 7);
	const day = parseIntManual(value, 8, 10);

	if (!isValidDate(year, month, day)) return null;

	// Construct midnight timestamp in the user's timezone.
	// Use a rough UTC estimate then resolve to exact local midnight.
	const utcEstimate = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
	return getLocalMidnight(utcEstimate, tz);
}

/**
 * Parse an integer from a substring without parseInt.
 * Reads digits from `start` (inclusive) to `end` (exclusive).
 */
function parseIntManual(s: string, start: number, end: number): number {
	let result = 0;
	for (let i = start; i < end; i++) {
		result = result * 10 + (s.charCodeAt(i) - 48);
	}
	return result;
}

/**
 * Validate that a year/month/day triple represents a real date.
 */
function isValidDate(year: number, month: number, day: number): boolean {
	if (year < 1970 || year > 2100) return false;
	if (month < 1 || month > 12) return false;
	if (day < 1) return false;

	const daysInMonth = getDaysInMonth(year, month);
	return day <= daysInMonth;
}

/**
 * Return the number of days in a given month, accounting for leap
 * years in February.
 */
function getDaysInMonth(year: number, month: number): number {
	// Days per month (1-indexed; index 0 unused)
	const table = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	if (month === 2 && isLeapYear(year)) return 29;
	return table[month];
}

function isLeapYear(year: number): boolean {
	if (year % 4 !== 0) return false;
	if (year % 100 !== 0) return true;
	return year % 400 === 0;
}

// ── Relative date parser ───────────────────────────────────────────

/** Map of day-of-week names to JS day numbers (0 = Sunday). */
const DAY_NAMES: Record<string, number> = {
	sunday: 0,
	sun: 0,
	monday: 1,
	mon: 1,
	tuesday: 2,
	tue: 2,
	wednesday: 3,
	wed: 3,
	thursday: 4,
	thu: 4,
	friday: 5,
	fri: 5,
	saturday: 6,
	sat: 6
};

/**
 * Parse a relative date keyword into a midnight timestamp in the given timezone.
 *
 * Supported keywords:
 *   - `today`
 *   - `yesterday`
 *   - `tomorrow`
 *   - `next-week` (next Monday)
 *   - Day names: `monday` … `sunday` (next occurrence)
 *   - Short day names: `mon` … `sun` (next occurrence)
 *
 * Exported for reuse by the time-range parser.
 *
 * @param value The relative date keyword.
 * @param now   Current time in ms.
 * @param tz    IANA timezone string. Midnight is computed in this timezone.
 */
export function parseRelativeDate(
	value: string,
	now: number,
	tz: string
): number | null {
	const today = getLocalMidnight(now, tz);

	if (value === 'today') return today;
	if (value === 'yesterday') return getLocalMidnight(now - 86_400_000, tz);
	if (value === 'tomorrow') return getLocalMidnight(now + 86_400_000, tz);
	if (value === 'next-week') return nextDayOfWeek(today, 1, tz);

	const targetDay = DAY_NAMES[value];
	if (targetDay !== undefined) return nextDayOfWeek(today, targetDay, tz);

	return null;
}

/**
 * Given a local midnight timestamp, return midnight of the **next**
 * occurrence of `targetDay` (0=Sun … 6=Sat) in the given timezone.
 * If today is that day, returns next week's occurrence.
 */
function nextDayOfWeek(
	todayMidnight: number,
	targetDay: number,
	tz: string
): number {
	const currentDay = new Date(todayMidnight).getUTCDay();
	// todayMidnight is local midnight expressed as UTC ms — we need the
	// local day-of-week, not the UTC one. Use getPartsInTz logic instead.
	const fmt = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		weekday: 'short'
	});
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const localDay = dayNames.indexOf(fmt.format(new Date(todayMidnight)));
	const day = localDay >= 0 ? localDay : currentDay;

	let daysAhead = targetDay - day;
	if (daysAhead <= 0) daysAhead += 7;

	return getLocalMidnight(todayMidnight + daysAhead * 86_400_000, tz);
}

/**
 * Get midnight in the user's timezone for a given timestamp.
 *
 * This is a re-export for convenience — the actual implementation
 * lives in `$lib/utils/datetime.ts`.
 *
 * @deprecated Use `getLocalMidnight` from `$lib/utils/datetime` directly.
 */
export function localMidnight(timestamp: number, tz: string): number {
	return getLocalMidnight(timestamp, tz);
}
