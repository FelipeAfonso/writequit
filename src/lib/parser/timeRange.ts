/**
 * Parse the `:log` command argument string.
 *
 * Syntax:
 *   :log [date] HH:MM-HH:MM [+tags...] ["description"]
 *
 * Examples:
 *   :log 14:00-18:00 +projx "Killed the beast"
 *   :log yesterday 09:00-17:00 +backend
 *   :log 2026-02-03 14:00-18:00 +projx "Worked on API"
 *   :log 10:00-12:30
 *
 * Reuses the existing date parsers from dueDate.ts and the tag
 * extractor from tags.ts.
 */

import { isDigit } from './scanner.js';
import { parseISODate, parseRelativeDate } from './dueDate.js';
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
 * Check if a token looks like a time range: HH:MM-HH:MM.
 *
 * Quick structural check — doesn't validate the actual values.
 */
function isTimeRange(token: string): boolean {
	// Minimum: H:MM-H:MM (9 chars), maximum: HH:MM-HH:MM (11 chars)
	if (token.length < 9 || token.length > 11) return false;

	const dash = token.indexOf('-');
	if (dash === -1) return false;

	const left = token.slice(0, dash);
	const right = token.slice(dash + 1);

	return looksLikeTime(left) && looksLikeTime(right);
}

/**
 * Check if a string looks like a time: H:MM or HH:MM.
 */
function looksLikeTime(s: string): boolean {
	if (s.length < 4 || s.length > 5) return false;
	const colon = s.indexOf(':');
	if (colon < 1 || colon > 2) return false;

	for (let i = 0; i < s.length; i++) {
		if (i === colon) continue;
		if (!isDigit(s[i])) return false;
	}
	return true;
}

/**
 * Parse a time range token like "14:00-18:00" into start/end
 * minutes since midnight.
 *
 * Returns null if the times are invalid (hours > 23, minutes > 59).
 */
function parseTimeRange(
	token: string
): { startMinutes: number; endMinutes: number } | null {
	const dash = token.indexOf('-');
	const startStr = token.slice(0, dash);
	const endStr = token.slice(dash + 1);

	const startMins = parseTimeToMinutes(startStr);
	const endMins = parseTimeToMinutes(endStr);

	if (startMins === null || endMins === null) return null;

	return { startMinutes: startMins, endMinutes: endMins };
}

/**
 * Parse "HH:MM" or "H:MM" into minutes since midnight.
 *
 * Returns null if hours > 23 or minutes > 59.
 */
function parseTimeToMinutes(time: string): number | null {
	const colon = time.indexOf(':');
	const hours = parseInt(time.slice(0, colon), 10);
	const minutes = parseInt(time.slice(colon + 1), 10);

	if (hours < 0 || hours > 23) return null;
	if (minutes < 0 || minutes > 59) return null;

	return hours * 60 + minutes;
}
