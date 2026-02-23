import { isNewline, skipInlineWhitespace } from './scanner.js';

/**
 * Maximum length of an auto-extracted title. Longer lines are
 * truncated with an ellipsis.
 */
const MAX_TITLE_LENGTH = 120;

/**
 * Extract a title from a markdown string.
 *
 * Strategy (in priority order):
 * 1. First markdown heading (`# …` or `## …` etc.) — returns the
 *    heading text without the `#` prefix.
 * 2. First non-empty line that is not solely metadata (not just tags
 *    or due-dates). Truncated to `MAX_TITLE_LENGTH` characters.
 * 3. Fallback: `"Untitled"`.
 *
 * The function scans character-by-character — no regex.
 */
export function extractTitle(markdown: string): string {
	const heading = findFirstHeading(markdown);
	if (heading !== null) return truncate(heading);

	const firstLine = findFirstMeaningfulLine(markdown);
	if (firstLine !== null) return truncate(firstLine);

	return 'Untitled';
}

// ── Internal helpers ───────────────────────────────────────────────

/**
 * Scan for the first line starting with one or more `#` followed by
 * a space. Returns the text after the `# ` prefix, trimmed.
 */
function findFirstHeading(text: string): string | null {
	let i = 0;

	while (i < text.length) {
		// Skip leading whitespace on the line (spaces/tabs only)
		const lineStart = skipInlineWhitespace(text, i);

		// Count consecutive '#' characters
		let hashes = 0;
		let j = lineStart;
		while (j < text.length && text[j] === '#') {
			hashes++;
			j++;
		}

		// Valid heading: 1-6 hashes followed by a space
		if (hashes >= 1 && hashes <= 6 && j < text.length && text[j] === ' ') {
			// Read the rest of the line as the heading text
			const contentStart = j + 1;
			let contentEnd = contentStart;
			while (contentEnd < text.length && !isNewline(text[contentEnd])) {
				contentEnd++;
			}
			const heading = text.slice(contentStart, contentEnd).trim();
			if (heading.length > 0) return heading;
		}

		// Advance to the next line
		i = advanceToNextLine(text, i);
	}

	return null;
}

/**
 * Return the first non-empty line that contains at least one
 * non-metadata word (i.e. not just `+tags` and `due:…` tokens).
 */
function findFirstMeaningfulLine(text: string): string | null {
	let i = 0;

	while (i < text.length) {
		// Read from current position to end of line
		let lineEnd = i;
		while (lineEnd < text.length && !isNewline(text[lineEnd])) {
			lineEnd++;
		}

		const line = text.slice(i, lineEnd).trim();

		if (line.length > 0 && !isOnlyMetadata(line)) {
			return line;
		}

		// Advance past newline
		i = lineEnd;
		if (i < text.length) {
			if (text[i] === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
				i += 2;
			} else {
				i++;
			}
		}
	}

	return null;
}

/**
 * Check whether a line consists solely of metadata tokens (`+tag`,
 * `due:…`). If every "word" on the line starts with `+` or `due:`,
 * the line is metadata-only and shouldn't be used as a title.
 */
function isOnlyMetadata(line: string): boolean {
	let i = 0;
	let foundNonMeta = false;

	while (i < line.length) {
		// Skip whitespace
		while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
			i++;
		}
		if (i >= line.length) break;

		// Read the next word (until whitespace)
		const wordStart = i;
		while (i < line.length && line[i] !== ' ' && line[i] !== '\t') {
			i++;
		}
		const word = line.slice(wordStart, i);

		// Check if it's a tag (+…) or due date (due:…)
		const isTag = word.length > 1 && word[0] === '+';
		const isDue = word.length > 4 && word.slice(0, 4) === 'due:';

		if (!isTag && !isDue) {
			foundNonMeta = true;
			break;
		}
	}

	return !foundNonMeta;
}

/** Advance index past the current line (including the newline). */
function advanceToNextLine(text: string, i: number): number {
	while (i < text.length && !isNewline(text[i])) {
		i++;
	}
	if (i < text.length) {
		if (text[i] === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
			i += 2;
		} else {
			i++;
		}
	}
	return i;
}

/** Truncate a string to `MAX_TITLE_LENGTH`, appending `…` if cut. */
function truncate(s: string): string {
	if (s.length <= MAX_TITLE_LENGTH) return s;
	return s.slice(0, MAX_TITLE_LENGTH) + '\u2026';
}
