/**
 * @module parser
 *
 * Markdown task parser — the core intelligence of writequit.
 *
 * This module is **pure** (no side effects, no DB, no DOM) so it can
 * be imported identically from:
 *   - Convex mutations (server-side parsing on task create/update)
 *   - SvelteKit components (client-side live preview in the editor)
 *
 * ## Syntax reference
 *
 * | Token          | Meaning                           | Example               |
 * |----------------|-----------------------------------|-----------------------|
 * | `# Heading`    | Task title (first heading wins)   | `# Fix login bug`     |
 * | `+tagname`     | Tag reference                     | `+urgent +backend`    |
 * | `due:VALUE`    | Due date                          | `due:2026-02-10`      |
 * | `due:KEYWORD`  | Relative due date                 | `due:tomorrow`        |
 *
 * Supported relative due-date keywords:
 * `today`, `tomorrow`, `next-week`, `monday`…`sunday`, `mon`…`sun`
 */

export type { ParsedTask } from './types.js';
export { extractTitle } from './title.js';
export { extractTags } from './tags.js';
export {
	extractDueDate,
	parseISODate,
	parseRelativeDate,
	utcMidnight
} from './dueDate.js';
export { stripMetadata } from './strip.js';
export { parseTimeLog } from './timeRange.js';
export type { ParsedTimeLog } from './timeRange.js';

import type { ParsedTask } from './types.js';
import { extractTitle } from './title.js';
import { extractTags } from './tags.js';
import { extractDueDate } from './dueDate.js';
import { stripMetadata } from './strip.js';

/**
 * Parse a raw markdown string into structured task data.
 *
 * This is the main entry point — call this from mutations and from
 * the editor's live preview.
 *
 * @param rawContent  The markdown string typed by the user.
 * @param now         Optional: current time in ms (for deterministic testing).
 * @returns           A `ParsedTask` with all extracted fields.
 */
export function parseTask(rawContent: string, now?: number): ParsedTask {
	return {
		rawContent,
		title: extractTitle(rawContent),
		dueDate: extractDueDate(rawContent, now),
		tags: extractTags(rawContent),
		cleanContent: stripMetadata(rawContent)
	};
}
