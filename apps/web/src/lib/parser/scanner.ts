/**
 * Shared low-level character classification helpers.
 *
 * These are intentionally simple — no regex, just code-point checks.
 * Every function takes a single character (string of length 1) and
 * returns a boolean.
 */

/** ASCII whitespace: space, tab, newline, carriage-return. */
export function isWhitespace(ch: string): boolean {
	const c = ch.charCodeAt(0);
	return c === 32 || c === 9 || c === 10 || c === 13;
}

/** Characters allowed inside a tag name: [a-zA-Z0-9_-] */
export function isTagChar(ch: string): boolean {
	const c = ch.charCodeAt(0);
	return (
		(c >= 97 && c <= 122) || // a-z
		(c >= 65 && c <= 90) || // A-Z
		(c >= 48 && c <= 57) || // 0-9
		c === 45 || // -
		c === 95 // _
	);
}

/** ASCII digit: 0-9 */
export function isDigit(ch: string): boolean {
	const c = ch.charCodeAt(0);
	return c >= 48 && c <= 57;
}

/** ASCII letter: a-zA-Z */
export function isLetter(ch: string): boolean {
	const c = ch.charCodeAt(0);
	return (c >= 97 && c <= 122) || (c >= 65 && c <= 90);
}

/** Newline: \n or \r */
export function isNewline(ch: string): boolean {
	const c = ch.charCodeAt(0);
	return c === 10 || c === 13;
}

/**
 * Read a contiguous run of characters satisfying `predicate` starting
 * at `start`. Returns the substring and the index after the last
 * matched character.
 */
export function readWhile(
	text: string,
	start: number,
	predicate: (ch: string) => boolean
): { value: string; end: number } {
	let i = start;
	while (i < text.length && predicate(text[i])) {
		i++;
	}
	return { value: text.slice(start, i), end: i };
}

/**
 * Advance past a contiguous run of whitespace (excluding newlines)
 * and return the new index.
 */
export function skipInlineWhitespace(text: string, start: number): number {
	let i = start;
	while (i < text.length) {
		const c = text.charCodeAt(i);
		if (c === 32 || c === 9) {
			i++;
		} else {
			break;
		}
	}
	return i;
}

/**
 * Convert a string to lowercase without using String.prototype methods
 * that rely on locale. Simple ASCII-only lowercasing.
 */
export function toLower(s: string): string {
	let out = '';
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c >= 65 && c <= 90) {
			out += String.fromCharCode(c + 32);
		} else {
			out += s[i];
		}
	}
	return out;
}
