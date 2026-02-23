import { isWhitespace, isTagChar, toLower, readWhile } from './scanner.js';

/**
 * Remove metadata tokens from a markdown string, producing "clean"
 * content suitable for rendering.
 *
 * Tokens removed:
 *   - `+tagname` — tag references
 *   - `due:VALUE` — due date declarations
 *
 * The function preserves all other content, including headings,
 * paragraphs, code blocks, etc. It collapses runs of multiple
 * spaces left behind by removed tokens into a single space, and
 * trims blank lines that become empty after stripping.
 */
export function stripMetadata(markdown: string): string {
	const result: string[] = [];
	let i = 0;

	while (i < markdown.length) {
		const atBoundary = i === 0 || isWhitespace(markdown[i - 1]);

		// Check for +tag token
		if (atBoundary && markdown[i] === '+') {
			const nameStart = i + 1;
			let nameEnd = nameStart;
			while (nameEnd < markdown.length && isTagChar(markdown[nameEnd])) {
				nameEnd++;
			}
			if (nameEnd > nameStart) {
				// Skip trailing space after the tag (if any)
				if (nameEnd < markdown.length && markdown[nameEnd] === ' ') {
					nameEnd++;
				}
				i = nameEnd;
				continue;
			}
		}

		// Check for due:VALUE token
		if (atBoundary && matchesDuePrefix(markdown, i)) {
			const valueStart = i + 4;
			const { end } = readWhile(
				markdown,
				valueStart,
				(ch) => !isWhitespace(ch)
			);
			let skip = end;
			// Skip trailing space after the due token (if any)
			if (skip < markdown.length && markdown[skip] === ' ') {
				skip++;
			}
			i = skip;
			continue;
		}

		result.push(markdown[i]);
		i++;
	}

	return cleanupWhitespace(result.join(''));
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Case-insensitive check for `due:` at position `i`.
 */
function matchesDuePrefix(text: string, i: number): boolean {
	if (i + 4 > text.length) return false;
	const slice = toLower(text.slice(i, i + 4));
	return slice === 'due:';
}

/**
 * Clean up whitespace artifacts from token removal:
 *   - Collapse multiple consecutive spaces into one
 *   - Remove lines that are now blank (only whitespace)
 *   - Trim trailing whitespace from each line
 */
function cleanupWhitespace(text: string): string {
	const lines: string[] = [];
	let lineStart = 0;

	for (let i = 0; i <= text.length; i++) {
		if (i === text.length || text[i] === '\n') {
			let line = text.slice(lineStart, i);

			// Collapse multiple spaces
			line = collapseSpaces(line);

			// Trim trailing whitespace
			line = trimEnd(line);

			lines.push(line);
			lineStart = i + 1;
		}
	}

	// Remove leading and trailing blank lines, but preserve internal structure
	let start = 0;
	while (start < lines.length && lines[start].length === 0) start++;

	let end = lines.length - 1;
	while (end >= start && lines[end].length === 0) end--;

	if (start > end) return '';

	return lines.slice(start, end + 1).join('\n');
}

/** Collapse runs of multiple spaces into a single space. */
function collapseSpaces(s: string): string {
	let out = '';
	let prevSpace = false;
	for (let i = 0; i < s.length; i++) {
		if (s[i] === ' ') {
			if (!prevSpace) {
				out += ' ';
				prevSpace = true;
			}
		} else {
			out += s[i];
			prevSpace = false;
		}
	}
	return out;
}

/** Trim trailing spaces and tabs from a string. */
function trimEnd(s: string): string {
	let end = s.length;
	while (end > 0 && (s[end - 1] === ' ' || s[end - 1] === '\t')) {
		end--;
	}
	return s.slice(0, end);
}
