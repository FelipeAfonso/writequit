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
			'& > ul > li[aria-selected]': {
				backgroundColor: '#283457'
			}
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
		}
	},
	{ dark: true }
);

/** Syntax highlighting colors for markdown content. */
const tokyoNightHighlightStyle = HighlightStyle.define([
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
	{ tag: t.comment, color: '#565f89' },
	{ tag: t.meta, color: '#565f89' },
	{ tag: t.processingInstruction, color: '#e0af68' },
	{ tag: t.contentSeparator, color: '#3b4261' }
]);

/** Combined extension: theme + syntax highlighting. */
export const tokyoNight = [
	tokyoNightTheme,
	syntaxHighlighting(tokyoNightHighlightStyle)
];
