import { isWhitespace, isDigit, toLower, readWhile } from './scanner.js';

/**
 * Extract a due date from a markdown string.
 *
 * Scans for the token `due:` (case-insensitive) followed by either:
 *   - An ISO date: `due:2026-02-10`
 *   - A relative keyword: `due:today`, `due:tomorrow`, `due:monday` … `due:sunday`, `due:next-week`
 *
 * Only the **first** `due:` token found is used.
 *
 * Returns a Unix-millisecond timestamp (midnight UTC of that day) or
 * `null` if no valid due date was found.
 *
 * The optional `now` parameter allows injecting the current time for
 * deterministic testing.
 */
export function extractDueDate(markdown: string, now?: number): number | null {
	const currentTime = now ?? Date.now();
	const token = findDueToken(markdown);
	if (token === null) return null;

	const value = toLower(token);

	// Try ISO date first: YYYY-MM-DD
	const isoResult = parseISODate(value);
	if (isoResult !== null) return isoResult;

	// Try relative keywords
	return parseRelativeDate(value, currentTime);
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
 * Parse a `YYYY-MM-DD` string into a UTC midnight timestamp.
 * Returns `null` if the format is invalid or the date doesn't exist.
 *
 * Validates character-by-character — no regex.
 */
function parseISODate(value: string): number | null {
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

	// Construct UTC midnight timestamp
	const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
	return date.getTime();
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
 * Parse a relative date keyword into a UTC midnight timestamp.
 *
 * Supported keywords:
 *   - `today`
 *   - `tomorrow`
 *   - `next-week` (next Monday)
 *   - Day names: `monday` … `sunday` (next occurrence)
 *   - Short day names: `mon` … `sun` (next occurrence)
 */
function parseRelativeDate(value: string, now: number): number | null {
	const today = utcMidnight(now);

	if (value === 'today') return today;
	if (value === 'tomorrow') return today + 86_400_000;
	if (value === 'next-week') return nextDayOfWeek(today, 1); // Next Monday

	const targetDay = DAY_NAMES[value];
	if (targetDay !== undefined) return nextDayOfWeek(today, targetDay);

	return null;
}

/**
 * Given a UTC midnight timestamp, return midnight of the **next**
 * occurrence of `targetDay` (0=Sun … 6=Sat). If today is that day,
 * returns next week's occurrence.
 */
function nextDayOfWeek(todayMidnight: number, targetDay: number): number {
	const currentDay = new Date(todayMidnight).getUTCDay();
	let daysAhead = targetDay - currentDay;
	if (daysAhead <= 0) daysAhead += 7;
	return todayMidnight + daysAhead * 86_400_000;
}

/** Truncate a timestamp to UTC midnight. */
function utcMidnight(timestamp: number): number {
	const d = new Date(timestamp);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
