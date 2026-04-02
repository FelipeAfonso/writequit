/**
 * Parse the `:log` command argument string.
 *
 * Syntax:
 *   :log [date] HH:MM-HH:MM [+tags...] ["description"]
 *
 * Supports both 24-hour and 12-hour (am/pm) time formats:
 *   14:00-18:00      24-hour
 *   2:00pm-6:00pm    12-hour with minutes
 *   2pm-6pm          12-hour without minutes (defaults to :00)
 *   12am-1am         midnight to 1am
 *   12pm-1pm         noon to 1pm
 *
 * Examples:
 *   :log 14:00-18:00 +projx "Killed the beast"
 *   :log yesterday 09:00-17:00 +backend
 *   :log 2026-02-03 14:00-18:00 +projx "Worked on API"
 *   :log 10:00-12:30
 *   :log 2pm-6pm +frontend "built the UI"
 *   :log yesterday 9:30am-5:00pm +backend
 *
 * Reuses the existing date parsers from dueDate.ts and the tag
 * extractor from tags.ts.
 */

import { isDigit } from './scanner.js';
import { parseISODate, parseRelativeDate, parseDate } from './dueDate.js';
import { getLocalMidnight } from '../utils/datetime.js';
import { extractTags } from './tags.js';

export interface ParsedTimeLog {
	/** UTC ms timestamp for the start of the session. */
	startTime: number;
	/** UTC ms timestamp for the end of the session. */
	endTime: number;
	/** Tags extracted from `+tag` tokens (without the `+`). */
	tags: string[];
	/** Optional description from a quoted string. */
	description: string | undefined;
}

/**
 * Parse a `:log` command argument string into structured data.
 *
 * Returns `null` if the input can't be parsed (no valid time range).
 *
 * @param input The argument string after `:log `, e.g. `"14:00-18:00 +projx \"Killed it\""`
 * @param tz    IANA timezone string. Times are interpreted in this timezone.
 * @param now   Optional current time in ms for deterministic testing.
 */
export function parseTimeLog(
	input: string,
	tz: string,
	now?: number
): ParsedTimeLog | null {
	const currentTime = now ?? Date.now();
	const trimmed = input.trim();
	if (trimmed.length === 0) return null;

	// Extract the quoted description first (removes it from further parsing)
	const { text: remaining, description } = extractDescription(trimmed);

	// Tokenize the rest by whitespace
	const tokens = remaining.split(/\s+/).filter((t) => t.length > 0);

	// Find the time range token (HH:MM-HH:MM pattern)
	let timeRangeIdx = -1;
	for (let i = 0; i < tokens.length; i++) {
		if (isTimeRange(tokens[i])) {
			timeRangeIdx = i;
			break;
		}
	}

	if (timeRangeIdx === -1) return null;

	const timeRange = parseTimeRange(tokens[timeRangeIdx]);
	if (timeRange === null) return null;

	// Everything before the time range is a potential date token
	let dateMidnight: number | null = null;
	for (let i = 0; i < timeRangeIdx; i++) {
		const token = tokens[i].toLowerCase();
		// Skip tags that might appear before the time range
		if (token.startsWith('+')) continue;

		dateMidnight =
			parseISODate(token, tz) ?? parseRelativeDate(token, currentTime, tz);
		if (dateMidnight !== null) break;
	}

	// Default to today if no date found
	const midnight = dateMidnight ?? getLocalMidnight(currentTime, tz);

	// Combine date (local midnight) + time-of-day offsets
	const startTime = midnight + timeRange.startMinutes * 60_000;
	let endTime = midnight + timeRange.endMinutes * 60_000;

	// If end is before or equal to start, assume it wraps to the next day
	if (endTime <= startTime) {
		endTime += 24 * 60 * 60_000;
	}

	// Extract tags from the full remaining text (without description)
	const tags = extractTags(remaining);

	return {
		startTime,
		endTime,
		tags,
		description
	};
}

// ── Internal helpers ───────────────────────────────────────────────

/**
 * Extract a quoted description string from the input.
 *
 * Supports both `"double quotes"` and `'single quotes'`.
 * Returns the input with the quoted string removed and the
 * extracted description.
 */
function extractDescription(input: string): {
	text: string;
	description: string | undefined;
} {
	// Find a quoted string — simple approach: first quote to last matching quote
	for (const quote of ['"', "'"]) {
		const start = input.indexOf(quote);
		if (start === -1) continue;

		const end = input.indexOf(quote, start + 1);
		if (end === -1) continue;

		const description = input.slice(start + 1, end);
		const text = input.slice(0, start) + input.slice(end + 1);
		return { text: text.trim(), description: description || undefined };
	}

	return { text: input, description: undefined };
}

/**
 * Check if a token looks like a time range: HH:MM-HH:MM or with am/pm.
 *
 * Quick structural check — doesn't validate the actual values.
 * Supports: 14:00-18:00, 2:00pm-6:00pm, 2pm-6pm, 12am-1am
 */
function isTimeRange(token: string): boolean {
	// Minimum: Ham-Ham (7 chars), maximum: HH:MMam-HH:MMam (15 chars)
	if (token.length < 7 || token.length > 15) return false;

	// Find the dash separating start-end. Skip leading digits/colon/am/pm
	// to avoid matching the minus sign inside a negative number.
	// The dash must sit between two time-like segments.
	const dash = findTimeRangeDash(token);
	if (dash === -1) return false;

	const left = token.slice(0, dash);
	const right = token.slice(dash + 1);

	return looksLikeTime(left) && looksLikeTime(right);
}

/**
 * Find the dash that separates two times in a range token.
 *
 * Skips past the first time segment (digits, colon, am/pm) to
 * find the separating `-`.
 */
function findTimeRangeDash(token: string): number {
	const lower = token.toLowerCase();
	let i = 0;

	// Skip digits (hours)
	while (i < lower.length && isDigit(lower[i])) i++;

	// Optionally skip :MM
	if (i < lower.length && lower[i] === ':') {
		i++; // skip ':'
		while (i < lower.length && isDigit(lower[i])) i++;
	}

	// Optionally skip am/pm suffix
	if (
		i + 1 < lower.length &&
		(lower[i] === 'a' || lower[i] === 'p') &&
		lower[i + 1] === 'm'
	) {
		i += 2;
	}

	// Now we should be at the dash
	if (i < lower.length && lower[i] === '-') return i;

	return -1;
}

/**
 * Check if a string looks like a time value.
 *
 * Supported formats (case-insensitive):
 *   H:MM, HH:MM          24-hour (4-5 chars)
 *   Ham, Hpm, HHam, HHpm 12-hour no minutes (3-4 chars)
 *   H:MMam, HH:MMam      12-hour with minutes (6-7 chars)
 */
function looksLikeTime(s: string): boolean {
	if (s.length < 3 || s.length > 7) return false;
	const lower = s.toLowerCase();

	// Check for am/pm suffix
	const hasMeridiem = lower.endsWith('am') || lower.endsWith('pm');
	const core = hasMeridiem ? lower.slice(0, -2) : lower;

	// Core must be: H, HH, H:MM, or HH:MM
	if (core.length < 1 || core.length > 5) return false;

	const colon = core.indexOf(':');
	if (colon === -1) {
		// No colon: must be just digits (H or HH), and must have am/pm
		if (!hasMeridiem) return false;
		for (let i = 0; i < core.length; i++) {
			if (!isDigit(core[i])) return false;
		}
		return core.length >= 1 && core.length <= 2;
	}

	// Has colon: H:MM or HH:MM
	if (colon < 1 || colon > 2) return false;
	if (core.length - colon - 1 !== 2) return false;

	for (let i = 0; i < core.length; i++) {
		if (i === colon) continue;
		if (!isDigit(core[i])) return false;
	}
	return true;
}

/**
 * Parse a time range token like "14:00-18:00" or "2pm-6pm" into
 * start/end minutes since midnight.
 *
 * Returns null if the times are invalid.
 */
function parseTimeRange(
	token: string
): { startMinutes: number; endMinutes: number } | null {
	const dash = findTimeRangeDash(token);
	if (dash === -1) return null;
	const startStr = token.slice(0, dash);
	const endStr = token.slice(dash + 1);

	const startMins = parseTimeToMinutes(startStr);
	const endMins = parseTimeToMinutes(endStr);

	if (startMins === null || endMins === null) return null;

	return { startMinutes: startMins, endMinutes: endMins };
}

/**
 * Parse a time string into minutes since midnight.
 *
 * Supports:
 *   "HH:MM", "H:MM"           24-hour format
 *   "Ham", "Hpm", "HHam"      12-hour without minutes (defaults to :00)
 *   "H:MMam", "HH:MMpm"       12-hour with minutes
 *
 * Returns null if the time is invalid.
 */
function parseTimeToMinutes(time: string): number | null {
	const lower = time.toLowerCase();

	// Detect am/pm
	const isPM = lower.endsWith('pm');
	const isAM = lower.endsWith('am');
	const hasMeridiem = isPM || isAM;
	const core = hasMeridiem ? lower.slice(0, -2) : lower;

	const colon = core.indexOf(':');
	let hours: number;
	let minutes: number;

	if (colon === -1) {
		// No colon: bare hour like "2pm" or "12am"
		if (!hasMeridiem) return null;
		hours = parseInt(core, 10);
		minutes = 0;
	} else {
		hours = parseInt(core.slice(0, colon), 10);
		minutes = parseInt(core.slice(colon + 1), 10);
	}

	if (isNaN(hours) || isNaN(minutes)) return null;
	if (minutes < 0 || minutes > 59) return null;

	if (hasMeridiem) {
		// 12-hour: hours must be 1-12
		if (hours < 1 || hours > 12) return null;
		if (isPM && hours !== 12) hours += 12;
		if (isAM && hours === 12) hours = 0;
	} else {
		// 24-hour: hours must be 0-23
		if (hours < 0 || hours > 23) return null;
	}

	return hours * 60 + minutes;
}

// ── Offset parser ─────────────────────────────────────────────────

/**
 * Parse a duration offset string into milliseconds.
 *
 * Supports:
 *   -30m       → 30 minutes in ms
 *   -1h        → 1 hour in ms
 *   -2h30m     → 2 hours 30 minutes in ms
 *   -45m       → 45 minutes in ms
 *
 * The leading `-` is optional (both `-30m` and `30m` work).
 * Returns null if the format is invalid.
 */
export function parseOffset(value: string): number | null {
	let s = value.trim().toLowerCase();
	// Strip optional leading minus
	if (s.startsWith('-')) s = s.slice(1);
	if (s.length === 0) return null;

	let totalMs = 0;
	let matched = false;

	// Match hours
	const hMatch = s.match(/^(\d+)h/);
	if (hMatch) {
		totalMs += parseInt(hMatch[1], 10) * 60 * 60_000;
		s = s.slice(hMatch[0].length);
		matched = true;
	}

	// Match minutes
	const mMatch = s.match(/^(\d+)m/);
	if (mMatch) {
		totalMs += parseInt(mMatch[1], 10) * 60_000;
		s = s.slice(mMatch[0].length);
		matched = true;
	}

	// Must have matched something and consumed everything
	if (!matched || s.length > 0) return null;

	return totalMs;
}

/**
 * Extract `-o` or `--offset` flag and its value from an args string.
 *
 * Returns the offset in ms and the remaining args string (with the
 * flag and value removed).
 *
 * Returns `{ offsetMs: 0, remaining: args }` if no offset flag found.
 * Returns `null` if the flag is present but the value is missing/invalid.
 */
export function extractOffset(args: string): {
	offsetMs: number;
	remaining: string;
} | null {
	const tokens = args.split(/\s+/);
	const flagIdx = tokens.findIndex((t) => t === '-o' || t === '--offset');

	if (flagIdx === -1) return { offsetMs: 0, remaining: args };

	const valueToken = tokens[flagIdx + 1];
	if (!valueToken) return null;

	const ms = parseOffset(valueToken);
	if (ms === null) return null;

	// Remove the flag and its value from tokens
	const remaining = [...tokens.slice(0, flagIdx), ...tokens.slice(flagIdx + 2)]
		.join(' ')
		.trim();

	return { offsetMs: ms, remaining };
}

// ── Date flag parser ─────────────────────────────────────────────

/**
 * Extract `-d` or `--date` flag and its value from an args string.
 *
 * Returns the midnight timestamp for the parsed date and the remaining
 * args string (with the flag and value removed).
 *
 * Returns `{ midnight: 0, remaining: args }` if no date flag found.
 * Returns `null` if the flag is present but the value is missing/invalid.
 *
 * @param args The argument string to parse.
 * @param tz   IANA timezone string for interpreting the date.
 * @param now  Optional current time in ms for deterministic testing.
 */
export function extractDate(
	args: string,
	tz: string,
	now?: number
): { midnight: number; remaining: string } | null {
	const tokens = args.split(/\s+/);
	const flagIdx = tokens.findIndex((t) => t === '-d' || t === '--date');

	if (flagIdx === -1) return { midnight: 0, remaining: args };

	const valueToken = tokens[flagIdx + 1];
	if (!valueToken) return null;

	const midnight = parseDate(valueToken.toLowerCase(), tz, now);
	if (midnight === null) return null;

	// Remove the flag and its value from tokens
	const remaining = [...tokens.slice(0, flagIdx), ...tokens.slice(flagIdx + 2)]
		.join(' ')
		.trim();

	return { midnight, remaining };
}

// ── Track parser ─────────────────────────────────────────────────

/**
 * Parse a `:track` command argument string into structured data.
 *
 * Syntax:
 *   :track <start-date> <start-time> <end-date> <end-time> [+tags...] ["description"]
 *
 * Dates support ISO (`2026-03-28`) and relative keywords (`yesterday`, `today`, etc.).
 * Times support 24-hour (`14:00`) and 12-hour (`2pm`, `2:00pm`) formats.
 *
 * Examples:
 *   :track yesterday 09:00 yesterday 17:00 +work "feature dev"
 *   :track 2026-03-28 22:00 2026-03-29 02:00 +project "overnight"
 *   :track today 8am today 12pm +meeting
 *
 * Returns `null` if the input can't be parsed.
 *
 * @param input The argument string after `:track `.
 * @param tz    IANA timezone string.
 * @param now   Optional current time in ms for deterministic testing.
 */
export function parseTrack(
	input: string,
	tz: string,
	now?: number
): ParsedTimeLog | null {
	const trimmed = input.trim();
	if (trimmed.length === 0) return null;

	// Extract description first (removes it from further parsing)
	const { text: remaining, description } = extractDescription(trimmed);

	// Extract tags
	const tags = extractTags(remaining);

	// Get non-tag tokens: should be exactly 4 (startDate startTime endDate endTime)
	const tokens = remaining
		.split(/\s+/)
		.filter((t) => t.length > 0 && !t.startsWith('+'));

	if (tokens.length !== 4) return null;

	const [startDateStr, startTimeStr, endDateStr, endTimeStr] = tokens;

	const startMidnight = parseDate(startDateStr.toLowerCase(), tz, now);
	if (startMidnight === null) return null;

	const startMins = parseTimeToMinutes(startTimeStr);
	if (startMins === null) return null;

	const endMidnight = parseDate(endDateStr.toLowerCase(), tz, now);
	if (endMidnight === null) return null;

	const endMins = parseTimeToMinutes(endTimeStr);
	if (endMins === null) return null;

	const startTime = startMidnight + startMins * 60_000;
	const endTime = endMidnight + endMins * 60_000;

	if (endTime <= startTime) return null;

	return { startTime, endTime, tags, description };
}
