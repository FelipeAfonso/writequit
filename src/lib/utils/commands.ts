/**
 * Command palette registry.
 *
 * Each command defines its name, aliases, description, whether it
 * takes arguments, and an execute function.  The palette UI calls
 * `matchCommands` as the user types and `executeCommand` on Enter.
 */

import { goto } from '$app/navigation';
import { parseTimeLog, extractOffset } from '$lib/parser/timeRange';
import { extractTags } from '$lib/parser/tags';

// ── Types ──────────────────────────────────────────────────────────

export interface CommandContext {
	/** Sign out the current user. */
	signOut: () => void;
	/** Toggle the keyboard shortcuts help overlay. */
	toggleHelp: () => void;
	/** Get the user's IANA timezone string. */
	getTimezone: () => string;
	/** Focus the task editor (only available on the tasks page). */
	focusEditor?: () => void;
	/** Submit the current editor content (save). */
	editorSubmit?: () => boolean;
	/** Blur the editor (quit). */
	editorBlur?: () => void;
	/** Log a completed time session. */
	logSession?: (args: {
		startTime: number;
		endTime: number;
		description?: string;
		tags: string[];
	}) => Promise<void>;
	/** Start a live timer. */
	startTimer?: (args: {
		description?: string;
		tags: string[];
		startTime?: number;
	}) => Promise<void>;
	/** Stop the running timer. */
	stopTimer?: () => Promise<void>;
	/** Link a task (by ID) to the active session. */
	linkTaskToSession?: (taskId: string) => Promise<void>;
	/** Show the onboarding tutorial overlay. */
	showTutorial?: () => void;
	/** Get the current task ID (from task detail or selected in list). */
	getCurrentTaskId?: () => string | undefined;
	/** Navigate back after save (e.g. task detail -> tasks list). */
	navigateBack?: () => void;
}

export interface Command {
	/** Primary name shown in suggestions. */
	name: string;
	/** All accepted aliases (first is the canonical form). */
	aliases: string[];
	/** Short description for the suggestion dropdown. */
	description: string;
	/** Whether the command accepts arguments. */
	args: 'none' | 'optional' | 'required';
	/** Argument placeholder shown in suggestions. */
	argsPlaceholder?: string;
	/** Execute the command. Return a string for error messages. */
	execute: (
		args: string,
		ctx: CommandContext
	) => void | string | Promise<void | string>;
}

// ── Command definitions ────────────────────────────────────────────

export const commands: Command[] = [
	{
		name: 'tasks',
		aliases: ['tasks', 't'],
		description: 'go to tasks',
		args: 'none',
		execute() {
			goto('/app');
		}
	},
	{
		name: 'tags',
		aliases: ['tags'],
		description: 'go to tags',
		args: 'none',
		execute() {
			goto('/app/tags');
		}
	},
	{
		name: 'user',
		aliases: ['user', 'u'],
		description: 'go to user settings',
		args: 'none',
		execute() {
			goto('/app/user');
		}
	},
	{
		name: 'w',
		aliases: ['w'],
		description: 'save editor content',
		args: 'none',
		execute(_args, ctx) {
			if (!ctx.editorSubmit) return 'no active editor';
			if (!ctx.editorSubmit()) return 'nothing to save';
			ctx.focusEditor?.();
		}
	},
	{
		name: 'wq',
		aliases: ['wq'],
		description: 'save and close editor',
		args: 'none',
		execute(_args, ctx) {
			if (!ctx.editorSubmit) return 'no active editor';
			ctx.editorSubmit();
			ctx.editorBlur?.();
			ctx.navigateBack?.();
		}
	},
	{
		name: 'q',
		aliases: ['q'],
		description: 'close editor',
		args: 'none',
		execute(_args, ctx) {
			if (!ctx.editorBlur) return 'no active editor';
			ctx.editorBlur();
		}
	},
	{
		name: 'q!',
		aliases: ['q!'],
		description: 'sign out',
		args: 'none',
		execute(_args, ctx) {
			ctx.signOut();
		}
	},
	{
		name: 'search',
		aliases: ['search', 's'],
		description: 'search tasks & tags',
		args: 'optional',
		argsPlaceholder: '<keyword>',
		async execute(args) {
			const query = args.trim();
			const path = window.location.pathname;

			// Determine the base path (stay on tags page if already there)
			const basePath =
				path === '/app/tags' || path === '/app/tags/' ? '/app/tags' : '/app';

			if (query) {
				await goto(`${basePath}?q=${encodeURIComponent(query)}`);
			} else {
				await goto(basePath);
			}
		}
	},
	{
		name: 'help',
		aliases: ['help', 'h'],
		description: 'show keyboard shortcuts',
		args: 'none',
		execute(_args, ctx) {
			ctx.toggleHelp();
		}
	},
	{
		name: 'tutorial',
		aliases: ['tutorial'],
		description: 'replay the onboarding tutorial',
		args: 'none',
		execute(_args, ctx) {
			if (!ctx.showTutorial) return 'tutorial not available';
			ctx.showTutorial();
		}
	},
	{
		name: 'inbox',
		aliases: ['inbox', 'i'],
		description: 'go to inbox',
		args: 'none',
		execute() {
			goto('/app/inbox');
		}
	},
	{
		name: 'sessions',
		aliases: ['sessions', 'ss'],
		description: 'go to sessions',
		args: 'none',
		execute() {
			goto('/app/sessions');
		}
	},
	{
		name: 'reports',
		aliases: ['reports', 'r'],
		description: 'go to reports & invoices',
		args: 'none',
		execute() {
			goto('/app/reports');
		}
	},
	{
		name: 'boards',
		aliases: ['boards', 'b'],
		description: 'go to boards',
		args: 'none',
		execute() {
			goto('/app/boards');
		}
	},
	{
		name: 'admin',
		aliases: ['admin'],
		description: 'go to admin panel',
		args: 'none',
		execute() {
			goto('/app/admin');
		}
	},
	{
		name: 'log',
		aliases: ['log', 'l'],
		description: 'log a time entry',
		args: 'required',
		argsPlaceholder: '[date] HH:MM-HH:MM [+tag] ["desc"]',
		async execute(args, ctx) {
			if (!ctx.logSession) return 'session logging not available';

			const parsed = parseTimeLog(args, ctx.getTimezone());
			if (parsed === null) {
				return 'invalid format — use: [date] HH:MM-HH:MM [+tag] ["desc"]';
			}

			try {
				await ctx.logSession({
					startTime: parsed.startTime,
					endTime: parsed.endTime,
					description: parsed.description,
					tags: parsed.tags
				});
			} catch (err) {
				return err instanceof Error ? err.message : 'failed to log session';
			}
		}
	},
	{
		name: 'start',
		aliases: ['start'],
		description: 'start a timer',
		args: 'optional',
		argsPlaceholder: '[-o <offset>] [+tag] ["desc"]',
		async execute(args, ctx) {
			if (!ctx.startTimer) return 'timer not available';

			// Parse optional offset flag: -o/--offset <duration>
			const offset = extractOffset(args);
			if (offset === null) {
				return 'invalid offset — use e.g. -o -30m, -o -1h, -o -2h30m';
			}
			const cleanArgs = offset.remaining;

			const tags = extractTags(cleanArgs);
			const description = extractQuotedString(cleanArgs);

			// Compute start time (offset goes back in time)
			const startTime =
				offset.offsetMs > 0 ? Date.now() - offset.offsetMs : undefined;

			try {
				await ctx.startTimer({ description, tags, startTime });
			} catch (err) {
				return err instanceof Error ? err.message : 'failed to start timer';
			}
		}
	},
	{
		name: 'stop',
		aliases: ['stop'],
		description: 'stop the running timer',
		args: 'none',
		async execute(_args, ctx) {
			if (!ctx.stopTimer) return 'timer not available';

			try {
				await ctx.stopTimer();
			} catch (err) {
				return err instanceof Error ? err.message : 'failed to stop timer';
			}
		}
	},
	{
		name: 'link',
		aliases: ['link'],
		description: 'link current task to active session',
		args: 'none',
		async execute(_args, ctx) {
			if (!ctx.linkTaskToSession) return 'linking not available';

			const taskId = ctx.getCurrentTaskId?.();
			if (!taskId) return 'no task selected';

			try {
				await ctx.linkTaskToSession(taskId);
			} catch (err) {
				return err instanceof Error ? err.message : 'failed to link task';
			}
		}
	}
];

// ── Helpers ────────────────────────────────────────────────────────

/** Extract a quoted string from input (double or single quotes). */
function extractQuotedString(input: string): string | undefined {
	for (const quote of ['"', "'"]) {
		const start = input.indexOf(quote);
		if (start === -1) continue;
		const end = input.indexOf(quote, start + 1);
		if (end === -1) continue;
		const value = input.slice(start + 1, end);
		return value || undefined;
	}
	return undefined;
}

// ── Matching / execution ───────────────────────────────────────────

/** Parse raw input into command name and argument string. */
function parseInput(raw: string): { cmd: string; args: string } {
	const trimmed = raw.trim();
	const spaceIdx = trimmed.indexOf(' ');
	if (spaceIdx === -1) return { cmd: trimmed, args: '' };
	return {
		cmd: trimmed.slice(0, spaceIdx),
		args: trimmed.slice(spaceIdx + 1)
	};
}

/**
 * Return commands whose aliases match the typed input.
 * Empty input returns all commands.
 */
export function matchCommands(input: string): Command[] {
	const { cmd } = parseInput(input);
	if (!cmd) return commands;

	const lower = cmd.toLowerCase();

	// Exact alias match first
	const exact = commands.filter((c) => c.aliases.some((a) => a === lower));
	if (exact.length > 0) return exact;

	// Prefix match on aliases
	return commands.filter((c) => c.aliases.some((a) => a.startsWith(lower)));
}

/**
 * Execute the first matching command.
 * Returns an error string if the command fails or isn't found.
 */
export async function executeCommand(
	input: string,
	ctx: CommandContext
): Promise<string | undefined> {
	const { cmd, args } = parseInput(input);
	if (!cmd) return 'no command entered';

	const lower = cmd.toLowerCase();

	// Find by exact alias match
	const command = commands.find((c) => c.aliases.some((a) => a === lower));

	if (!command) {
		// Try prefix match if only one result
		const prefixMatches = commands.filter((c) =>
			c.aliases.some((a) => a.startsWith(lower))
		);
		if (prefixMatches.length === 1) {
			return runCommand(prefixMatches[0], args, ctx);
		}
		return `unknown command: ${cmd}`;
	}

	return runCommand(command, args, ctx);
}

async function runCommand(
	command: Command,
	args: string,
	ctx: CommandContext
): Promise<string | undefined> {
	if (command.args === 'required' && !args.trim()) {
		return `${command.name} requires an argument`;
	}

	const result = await command.execute(args, ctx);
	return typeof result === 'string' ? result : undefined;
}
