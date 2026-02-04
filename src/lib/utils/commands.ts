/**
 * Command palette registry.
 *
 * Each command defines its name, aliases, description, whether it
 * takes arguments, and an execute function.  The palette UI calls
 * `matchCommands` as the user types and `executeCommand` on Enter.
 */

import { goto } from '$app/navigation';

// ── Types ──────────────────────────────────────────────────────────

export interface CommandContext {
	/** Sign out the current user. */
	signOut: () => void;
	/** Toggle the keyboard shortcuts help overlay. */
	toggleHelp: () => void;
	/** Focus the task editor (only available on the tasks page). */
	focusEditor?: () => void;
	/** Set the search query filter (only available on the tasks page). */
	setSearch?: (query: string) => void;
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
			goto('/');
		}
	},
	{
		name: 'tags',
		aliases: ['tags'],
		description: 'go to tags',
		args: 'none',
		execute() {
			goto('/tags');
		}
	},
	{
		name: 'quit',
		aliases: ['q!', 'q', 'wq', 'wq!', 'quit'],
		description: 'sign out',
		args: 'none',
		execute(_args, ctx) {
			ctx.signOut();
		}
	},
	{
		name: 'search',
		aliases: ['search', 's'],
		description: 'search tasks',
		args: 'optional',
		argsPlaceholder: '<keyword>',
		async execute(args, ctx) {
			// Navigate to tasks page first if not there
			if (window.location.pathname !== '/') {
				await goto('/');
				// Small delay to let the page mount and register setSearch
				await new Promise((r) => setTimeout(r, 50));
			}
			if (ctx.setSearch) {
				ctx.setSearch(args.trim());
			} else {
				return 'search is only available on the tasks page';
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
	}
];

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
