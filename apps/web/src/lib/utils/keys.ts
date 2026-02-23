/**
 * Keyboard shortcut utilities for vim-style navigation.
 *
 * Supports single keys and two-key sequences (e.g. "g i").
 * Automatically ignores events when focus is inside editable elements.
 */

/** Check whether the active element is an input, textarea, or contenteditable. */
export function isEditableTarget(e: KeyboardEvent): boolean {
	const el = e.target;
	if (!(el instanceof HTMLElement)) return false;
	const tag = el.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
	if (el.isContentEditable) return true;
	// CodeMirror uses a div with role="textbox"
	if (el.getAttribute('role') === 'textbox') return true;
	// Also check if we're inside a .cm-editor
	if (el.closest('.cm-editor')) return true;
	return false;
}
