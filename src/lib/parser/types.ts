/**
 * The result of parsing a raw markdown task string.
 *
 * Every field except `rawContent` is derived from the markdown.
 * The parser is pure — no side effects, no DB access — so it can
 * run identically on the client (live preview) and the server
 * (Convex mutation).
 */
export interface ParsedTask {
	/** The original, unmodified markdown string. */
	rawContent: string;

	/** Extracted title (first heading or first meaningful line). */
	title: string;

	/**
	 * Unix-millisecond timestamp for the due date, or `null` if none
	 * was found. Parsed from `due:YYYY-MM-DD` or `due:<relative>`.
	 */
	dueDate: number | null;

	/**
	 * De-duplicated, lowercased tag names extracted from `+tag` tokens.
	 * Does not include the `+` prefix.
	 */
	tags: string[];

	/**
	 * The markdown body with metadata tokens (`due:…`, `+tag`) stripped
	 * out, suitable for rendering.
	 */
	cleanContent: string;
}
