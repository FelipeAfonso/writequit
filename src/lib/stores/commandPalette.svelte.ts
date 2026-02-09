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

function createCommandPalette() {
	let isOpen = $state(false);
	let error = $state('');
	let initialInput = $state('');

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
		},

		/** Open the palette with pre-filled input (e.g. 's ' for search). */
		openWithInput(input: string) {
			initialInput = input;
			isOpen = true;
			error = '';
		},

		close() {
			isOpen = false;
			error = '';
			initialInput = '';
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
