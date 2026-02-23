import type {
	CompletionContext,
	CompletionSource
} from '@codemirror/autocomplete';
import { isTagChar, isWhitespace } from '$lib/parser/scanner';

export interface TagOption {
	name: string;
	type?: string;
	color?: string;
}

/**
 * Map tag type to a short label for the autocomplete detail column.
 */
function typeLabel(type?: string): string | undefined {
	switch (type) {
		case 'priority':
			return 'priority';
		case 'project':
			return 'project';
		case 'category':
			return 'category';
		case 'context':
			return 'context';
		default:
			return undefined;
	}
}

/**
 * Create a CodeMirror `CompletionSource` that completes `+tag` tokens.
 *
 * Activates when the cursor is inside a `+…` token whose `+` sits at a
 * word boundary (start of line or preceded by whitespace) — the same
 * rules used by `extractTags()` in `$lib/parser/tags.ts`.
 *
 * @param getTags – called on every completion request; return the
 *   current set of the user's tags.
 */
export function tagCompletionSource(
	getTags: () => TagOption[]
): CompletionSource {
	return (context: CompletionContext) => {
		const { state, pos } = context;
		const line = state.doc.lineAt(pos);
		const textBefore = line.text.slice(0, pos - line.from);

		// Walk backwards from cursor to find the `+` that starts this tag
		let i = textBefore.length - 1;

		// First skip over any tag-name characters (the partial the user typed)
		while (i >= 0 && isTagChar(textBefore[i])) {
			i--;
		}

		// We should now be sitting on a `+`
		if (i < 0 || textBefore[i] !== '+') return null;

		// The `+` must be at a word boundary (start of line or after whitespace)
		if (i > 0 && !isWhitespace(textBefore[i - 1])) return null;

		const from = line.from + i; // absolute position of the `+`

		const tags = getTags();
		if (tags.length === 0) return null;

		const options = tags.map((tag) => ({
			label: `+${tag.name}`,
			detail: typeLabel(tag.type),
			boost: tag.type === 'project' ? 1 : 0
		}));

		return {
			from,
			options,
			filter: true
		};
	};
}
