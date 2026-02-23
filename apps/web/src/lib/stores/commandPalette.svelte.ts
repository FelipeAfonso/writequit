/**
 * Command palette state and context.
 *
 * Manages the open/close state of the command palette and the
 * context object that commands use to interact with the app.
 *
 * Pages can register page-specific actions (like focusEditor)
 * by calling `commandPalette.registerActions()` and
 * cleaning up with `commandPalette.unregisterActions()`.
 */

import type { CommandContext } from '$lib/utils/commands';

const HISTORY_KEY = 'wq:cmd-history';
const MAX_HISTORY = 50;

/** Load command history from localStorage. */
function loadHistory(): string[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = localStorage.getItem(HISTORY_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) return parsed.slice(0, MAX_HISTORY);
	} catch {
		// Ignore corrupt data
	}
	return [];
}

/** Persist command history to localStorage. */
function saveHistory(history: string[]) {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(
			HISTORY_KEY,
			JSON.stringify(history.slice(0, MAX_HISTORY))
		);
	} catch {
		// Ignore quota errors
	}
}

function createCommandPalette() {
	let isOpen = $state(false);
	let error = $state('');
	let initialInput = $state('');

	// ── Command history ────────────────────────────────────────────
	let history = $state<string[]>(loadHistory());
	let historyIndex = $state(-1);
	let savedInput = $state('');

	// Base context — always available (set by layout)
	let baseCtx: Pick<
		CommandContext,
		| 'signOut'
		| 'toggleHelp'
		| 'getTimezone'
		| 'logSession'
		| 'startTimer'
		| 'stopTimer'
		| 'linkTaskToSession'
		| 'showTutorial'
	> | null = null;

	// Page-specific extensions — set by individual pages
	let pageActions: Partial<CommandContext> = {};

	return {
		get isOpen() {
			return isOpen;
		},

		get error() {
			return error;
		},
		set error(value: string) {
			error = value;
		},

		get initialInput() {
			return initialInput;
		},

		open() {
			initialInput = '';
			isOpen = true;
			error = '';
			historyIndex = -1;
			savedInput = '';
		},

		/** Open the palette with pre-filled input (e.g. 's ' for search). */
		openWithInput(input: string) {
			initialInput = input;
			isOpen = true;
			error = '';
			historyIndex = -1;
			savedInput = '';
		},

		close() {
			isOpen = false;
			error = '';
			initialInput = '';
			historyIndex = -1;
			savedInput = '';
		},

		// ── History ────────────────────────────────────────────────

		/**
		 * Push a command to history. Skips if it duplicates the most
		 * recent entry. Persists to localStorage.
		 */
		pushHistory(cmd: string) {
			const trimmed = cmd.trim();
			if (!trimmed) return;
			// Avoid consecutive duplicates
			if (history[0] === trimmed) return;
			history = [trimmed, ...history].slice(0, MAX_HISTORY);
			saveHistory(history);
		},

		/**
		 * Navigate history upward (older commands).
		 * Returns the command string to fill into the input,
		 * or undefined if already at the end of history.
		 *
		 * @param currentInput The current input value (saved on first Up press)
		 */
		historyUp(currentInput: string): string | undefined {
			if (history.length === 0) return undefined;
			if (historyIndex === -1) {
				// Save current input so Down can restore it
				savedInput = currentInput;
			}
			const next = historyIndex + 1;
			if (next >= history.length) return undefined;
			historyIndex = next;
			return history[historyIndex];
		},

		/**
		 * Navigate history downward (newer commands).
		 * Returns the command string to fill, or the saved input
		 * if we've gone past the newest entry.
		 */
		historyDown(): string | undefined {
			if (historyIndex <= -1) return undefined;
			const next = historyIndex - 1;
			if (next < 0) {
				historyIndex = -1;
				return savedInput;
			}
			historyIndex = next;
			return history[historyIndex];
		},

		/** Reset history browsing index (call when user types). */
		resetHistoryIndex() {
			historyIndex = -1;
			savedInput = '';
		},

		get historyIndex() {
			return historyIndex;
		},

		/** Set the base context (called once from the app layout). */
		setBaseContext(
			ctx: Pick<
				CommandContext,
				| 'signOut'
				| 'toggleHelp'
				| 'getTimezone'
				| 'logSession'
				| 'startTimer'
				| 'stopTimer'
				| 'linkTaskToSession'
				| 'showTutorial'
			>
		) {
			baseCtx = ctx;
		},

		/**
		 * Register page-specific actions. Call from `$effect` in pages
		 * that provide extra command capabilities.
		 */
		registerActions(actions: Partial<CommandContext>) {
			pageActions = { ...pageActions, ...actions };
		},

		/** Remove page-specific actions (call on page teardown). */
		unregisterActions(keys: (keyof CommandContext)[]) {
			for (const key of keys) {
				delete pageActions[key];
			}
		},

		/** Build the full CommandContext for command execution. */
		get context(): CommandContext {
			return {
				signOut: baseCtx?.signOut ?? (() => {}),
				toggleHelp: baseCtx?.toggleHelp ?? (() => {}),
				getTimezone: baseCtx?.getTimezone ?? (() => 'UTC'),
				logSession: baseCtx?.logSession,
				startTimer: baseCtx?.startTimer,
				stopTimer: baseCtx?.stopTimer,
				linkTaskToSession: baseCtx?.linkTaskToSession,
				showTutorial: baseCtx?.showTutorial,
				...pageActions
			};
		}
	};
}

export const commandPalette = createCommandPalette();
