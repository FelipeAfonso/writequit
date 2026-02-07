/**
 * Tokyo Night theme for CodeMirror 6.
 *
 * Matches the color tokens defined in layout.css so the editor
 * feels native to the rest of the app.
 */
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/** Base editor theme (chrome / gutters / selections). */
export const tokyoNightTheme = EditorView.theme(
	{
		'&': {
			color: '#c0caf5',
			backgroundColor: '#1a1b26',
			fontFamily: "'Iosevka', ui-monospace, monospace",
			fontSize: '14px',
			lineHeight: '1.6'
		},
		'.cm-content': {
			caretColor: '#c0caf5',
			padding: '12px 0'
		},
		'.cm-cursor, .cm-dropCursor': {
			borderLeftColor: '#c0caf5',
			borderLeftWidth: '2px'
		},
		'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
			{
				backgroundColor: '#283457'
			},
		// Vim fat cursor (block cursor in normal/visual mode)
		'& .cm-fat-cursor': {
			backgroundColor: '#c0caf5 !important'
		},
		'&:not(.cm-focused) .cm-fat-cursor': {
			background: 'none',
			outline: '1px solid #c0caf5 !important'
		},
		'.cm-activeLine': {
			backgroundColor: '#1f2335'
		},
		'.cm-gutters': {
			backgroundColor: '#16161e',
			color: '#3b4261',
			border: 'none',
			borderRight: '1px solid #292e42'
		},
		'.cm-activeLineGutter': {
			backgroundColor: '#1f2335',
			color: '#565f89'
		},
		'.cm-foldPlaceholder': {
			backgroundColor: '#292e42',
			color: '#565f89',
			border: 'none'
		},
		'.cm-tooltip': {
			backgroundColor: '#16161e',
			color: '#c0caf5',
			border: '1px solid #292e42'
		},
		'.cm-tooltip .cm-tooltip-arrow:before': {
			borderTopColor: '#292e42',
			borderBottomColor: '#292e42'
		},
		'.cm-tooltip .cm-tooltip-arrow:after': {
			borderTopColor: '#16161e',
			borderBottomColor: '#16161e'
		},
		'.cm-tooltip-autocomplete': {
			fontFamily: "'Iosevka', ui-monospace, monospace",
			fontSize: '13px',
			border: '1px solid #292e42',
			backgroundColor: '#16161e',
			'& > ul': {
				fontFamily: "'Iosevka', ui-monospace, monospace",
				maxHeight: '16em'
			},
			'& > ul > li': {
				padding: '2px 8px',
				color: '#c0caf5'
			},
			'& > ul > li[aria-selected]': {
				backgroundColor: '#283457',
				color: '#c0caf5'
			}
		},
		'.cm-completionLabel': {
			color: '#73daca'
		},
		'.cm-completionMatchedText': {
			color: '#7aa2f7',
			textDecoration: 'none',
			fontWeight: 'bold'
		},
		'.cm-completionDetail': {
			color: '#565f89',
			fontStyle: 'italic',
			marginLeft: '8px'
		},
		'.cm-searchMatch': {
			backgroundColor: '#3d59a1',
			outline: '1px solid #7aa2f7'
		},
		'.cm-searchMatch.cm-searchMatch-selected': {
			backgroundColor: '#283457'
		},
		'.cm-line': {
			padding: '0 12px'
		},
		'.cm-scroller': {
			overflow: 'auto'
		},
		// Placeholder styling
		'.cm-placeholder': {
			color: '#565f89',
			fontStyle: 'italic'
		},
		// Vim panel (search dialog, ex bar, notifications)
		'.cm-vim-panel': {
			padding: '0px 8px',
			fontFamily: "'Iosevka', ui-monospace, monospace",
			fontSize: '13px',
			lineHeight: '1.4',
			minHeight: 'auto',
			backgroundColor: '#1a1b26',
			borderTop: '1px solid #292e42',
			color: '#c0caf5'
		},
		'.cm-vim-panel input, .cm-vim-panel input:focus': {
			fontFamily: "'Iosevka', ui-monospace, monospace",
			fontSize: '13px',
			lineHeight: '1.4',
			padding: '2px 2px',
			margin: '0',
			color: '#c0caf5',
			backgroundColor: 'transparent',
			border: 'none',
			outline: 'none',
			boxShadow: 'none',
			caretColor: '#7aa2f7',
			flex: '1'
		},
		'.cm-vim-message': {
			color: '#f7768e',
			fontFamily: "'Iosevka', ui-monospace, monospace",
			fontSize: '13px'
		}
	},
	{ dark: true }
);

/** Syntax highlighting colors for markdown + embedded code. */
const tokyoNightHighlightStyle = HighlightStyle.define([
	// ── Markdown ────────────────────────────────────────────────
	{ tag: t.heading1, color: '#7aa2f7', fontWeight: 'bold', fontSize: '1.4em' },
	{ tag: t.heading2, color: '#7dcfff', fontWeight: 'bold', fontSize: '1.2em' },
	{ tag: t.heading3, color: '#bb9af7', fontWeight: 'bold', fontSize: '1.1em' },
	{
		tag: [t.heading4, t.heading5, t.heading6],
		color: '#9d7cd8',
		fontWeight: 'bold'
	},
	{ tag: t.emphasis, color: '#c0caf5', fontStyle: 'italic' },
	{ tag: t.strong, color: '#c0caf5', fontWeight: 'bold' },
	{ tag: t.strikethrough, color: '#565f89', textDecoration: 'line-through' },
	{ tag: t.link, color: '#7aa2f7', textDecoration: 'underline' },
	{ tag: t.url, color: '#73daca' },
	{ tag: t.monospace, color: '#9ece6a' },
	{ tag: t.quote, color: '#565f89', fontStyle: 'italic' },
	{ tag: t.list, color: '#ff9e64' },
	{ tag: t.separator, color: '#3b4261' },
	{ tag: t.contentSeparator, color: '#3b4261' },
	{ tag: t.processingInstruction, color: '#e0af68' },

	// ── Code: keywords & control flow ──────────────────────────
	{ tag: t.keyword, color: '#bb9af7' },
	{ tag: t.controlKeyword, color: '#bb9af7' },
	{ tag: t.operatorKeyword, color: '#89ddff' },
	{ tag: t.definitionKeyword, color: '#bb9af7' },
	{ tag: t.moduleKeyword, color: '#bb9af7' },

	// ── Code: identifiers & definitions ────────────────────────
	{ tag: t.variableName, color: '#c0caf5' },
	{ tag: t.definition(t.variableName), color: '#c0caf5' },
	{ tag: t.function(t.variableName), color: '#7aa2f7' },
	{ tag: t.definition(t.function(t.variableName)), color: '#7aa2f7' },
	{ tag: t.propertyName, color: '#73daca' },
	{ tag: t.function(t.propertyName), color: '#7aa2f7' },
	{ tag: t.definition(t.propertyName), color: '#73daca' },
	{ tag: t.special(t.variableName), color: '#7dcfff' },

	// ── Code: types & classes ──────────────────────────────────
	{ tag: t.typeName, color: '#2ac3de' },
	{ tag: t.className, color: '#2ac3de' },
	{ tag: t.namespace, color: '#2ac3de' },
	{ tag: t.macroName, color: '#7aa2f7' },
	{ tag: t.labelName, color: '#73daca' },

	// ── Code: literals ─────────────────────────────────────────
	{ tag: t.string, color: '#9ece6a' },
	{ tag: t.special(t.string), color: '#9ece6a' },
	{ tag: t.regexp, color: '#b4f9f8' },
	{ tag: t.number, color: '#ff9e64' },
	{ tag: t.bool, color: '#ff9e64' },
	{ tag: t.null, color: '#ff9e64' },
	{ tag: t.atom, color: '#ff9e64' },

	// ── Code: operators & punctuation ──────────────────────────
	{ tag: t.operator, color: '#89ddff' },
	{ tag: t.punctuation, color: '#89ddff' },
	{ tag: t.paren, color: '#c0caf5' },
	{ tag: t.squareBracket, color: '#c0caf5' },
	{ tag: t.brace, color: '#c0caf5' },
	{ tag: t.derefOperator, color: '#c0caf5' },
	{ tag: t.separator, color: '#89ddff' },

	// ── Code: comments & meta ──────────────────────────────────
	{ tag: t.comment, color: '#565f89', fontStyle: 'italic' },
	{ tag: t.lineComment, color: '#565f89', fontStyle: 'italic' },
	{ tag: t.blockComment, color: '#565f89', fontStyle: 'italic' },
	{ tag: t.docComment, color: '#565f89', fontStyle: 'italic' },
	{ tag: t.meta, color: '#565f89' },
	{ tag: t.annotation, color: '#e0af68' },
	{ tag: t.attributeName, color: '#bb9af7' },
	{ tag: t.attributeValue, color: '#9ece6a' },

	// ── Code: tags (HTML/JSX) ──────────────────────────────────
	{ tag: t.tagName, color: '#f7768e' },
	{ tag: t.angleBracket, color: '#89ddff' },
	{ tag: t.self, color: '#f7768e' },

	// ── Code: misc ─────────────────────────────────────────────
	{ tag: t.escape, color: '#89ddff' },
	{ tag: t.inserted, color: '#9ece6a' },
	{ tag: t.deleted, color: '#f7768e' },
	{ tag: t.changed, color: '#e0af68' },
	{ tag: t.invalid, color: '#f7768e', textDecoration: 'underline' }
]);

/** Combined extension: theme + syntax highlighting. */
export const tokyoNight = [
	tokyoNightTheme,
	syntaxHighlighting(tokyoNightHighlightStyle)
];
