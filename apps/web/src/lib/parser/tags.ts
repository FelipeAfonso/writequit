import { isWhitespace, isTagChar, toLower } from './scanner.js';

/**
 * Extract `+tag` tokens from a markdown string.
 *
 * A valid tag starts with `+` that is either:
 *   - at the very beginning of the string, or
 *   - preceded by whitespace
 *
 * The tag name is a contiguous run of tag-safe characters
 * (`[a-zA-Z0-9_-]`). Names are lowercased and de-duplicated.
 *
 * Returns an array of unique tag names (without the `+` prefix).
 *
 * Examples:
 *   "+urgent Fix the build +backend"  =>  ["urgent", "backend"]
 *   "no tags here"                    =>  []
 *   "+a +a +A"                        =>  ["a"]
 */
export function extractTags(markdown: string): string[] {
	const seen = new Set<string>();
	const tags: string[] = [];
	let i = 0;

	while (i < markdown.length) {
		if (markdown[i] === '+') {
			// The `+` must be at the start or preceded by whitespace
			const atBoundary = i === 0 || isWhitespace(markdown[i - 1]);

			if (atBoundary) {
				// Read the tag name
				const nameStart = i + 1;
				let nameEnd = nameStart;
				while (nameEnd < markdown.length && isTagChar(markdown[nameEnd])) {
					nameEnd++;
				}

				if (nameEnd > nameStart) {
					const name = toLower(markdown.slice(nameStart, nameEnd));
					if (!seen.has(name)) {
						seen.add(name);
						tags.push(name);
					}
					i = nameEnd;
					continue;
				}
			}
		}

		i++;
	}

	return tags;
}
