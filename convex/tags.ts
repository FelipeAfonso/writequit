import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getCurrentUser, getCurrentUserOrThrow } from './users.js';
import { parseTask } from '../src/lib/parser/index.js';
import { isTagChar, isWhitespace, toLower } from '../src/lib/parser/scanner.js';

// ── Queries ────────────────────────────────────────────────────────

/** List all tags for the current user. */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];

		return await ctx.db
			.query('tags')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.collect();
	}
});

/** Get a single tag by ID. */
export const get = query({
	args: { id: v.id('tags') },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return null;

		const tag = await ctx.db.get(args.id);
		if (tag === null || tag.userId !== user._id) return null;
		return tag;
	}
});

// ── Mutations ──────────────────────────────────────────────────────

/** Create a new tag. Returns the new tag's ID. */
export const create = mutation({
	args: {
		name: v.string(),
		type: v.optional(v.string()),
		color: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);
		const userId = user._id;

		const name = args.name.toLowerCase().trim();
		if (name.length === 0) throw new Error('Tag name cannot be empty');

		// Check for duplicate
		const existing = await findByName(ctx, name, userId);
		if (existing !== null) return existing._id;

		return await ctx.db.insert('tags', {
			name,
			type: args.type,
			color: args.color,
			userId,
			createdAt: Date.now()
		});
	}
});

/** Update a tag's metadata (type, color). */
export const update = mutation({
	args: {
		id: v.id('tags'),
		type: v.optional(v.string()),
		color: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const tag = await ctx.db.get(args.id);
		if (tag === null || tag.userId !== user._id)
			throw new Error('Tag not found');

		await ctx.db.patch(args.id, {
			type: args.type,
			color: args.color
		});
	}
});

/** Delete a tag and remove its `+tag` tokens from affected task content. */
export const remove = mutation({
	args: { id: v.id('tags') },
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);
		const userId = user._id;

		const tag = await ctx.db.get(args.id);
		if (tag === null || tag.userId !== userId) throw new Error('Tag not found');

		const tz = await getUserTimezone(ctx, userId);
		const tasks = await ctx.db
			.query('tasks')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.collect();
		const affected = tasks.filter((task) => task.tagIds.includes(args.id));

		for (const task of affected) {
			const rawContent = removeTagToken(task.rawContent, tag.name);
			const parsed = parseTask(rawContent, tz);
			const tagIds = await Promise.all(
				parsed.tags.map((name) => getOrCreateTag(ctx, name, userId))
			);

			await ctx.db.patch(task._id, {
				rawContent,
				title: parsed.title,
				dueDate: parsed.dueDate ?? undefined,
				tagIds,
				updatedAt: Date.now()
			});
		}

		await ctx.db.delete(args.id);
	}
});

// ── Internal helpers ───────────────────────────────────────────────

/** Look up the user's timezone from settings, defaulting to UTC. */
async function getUserTimezone(
	ctx: MutationCtx,
	userId: Id<'users'>
): Promise<string> {
	const settings = await ctx.db
		.query('userSettings')
		.withIndex('by_userId', (q) => q.eq('userId', userId))
		.unique();
	return settings?.timezone ?? 'UTC';
}

/** Remove only the specified `+tag` token from markdown content. */
function removeTagToken(markdown: string, targetTag: string): string {
	const normalizedTarget = toLower(targetTag);
	const result: string[] = [];
	let i = 0;

	while (i < markdown.length) {
		const atBoundary = i === 0 || isWhitespace(markdown[i - 1]);
		if (atBoundary && markdown[i] === '+') {
			const nameStart = i + 1;
			let nameEnd = nameStart;
			while (nameEnd < markdown.length && isTagChar(markdown[nameEnd])) {
				nameEnd++;
			}

			if (nameEnd > nameStart) {
				const name = toLower(markdown.slice(nameStart, nameEnd));
				if (name === normalizedTarget) {
					if (nameEnd < markdown.length && markdown[nameEnd] === ' ') {
						nameEnd++;
					}
					i = nameEnd;
					continue;
				}
			}
		}

		result.push(markdown[i]);
		i++;
	}

	return cleanupWhitespace(result.join(''));
}

/** Collapse space artifacts and trim trailing whitespace per line. */
function cleanupWhitespace(text: string): string {
	const lines = text.split('\n');
	return lines
		.map((line) => trimEnd(line.replace(/ {2,}/g, ' ')))
		.join('\n')
		.trim();
}

function trimEnd(s: string): string {
	let end = s.length;
	while (end > 0 && (s[end - 1] === ' ' || s[end - 1] === '\t')) {
		end--;
	}
	return s.slice(0, end);
}

/**
 * Find an existing tag by name for a user, or create it.
 *
 * This is used by the task parser: when a task contains `+foo`, we
 * need the `Id<"tags">` for "foo" — either existing or freshly
 * created.
 *
 * Exported as a plain async function (not a Convex function) so it
 * can be called directly within other mutations sharing the same
 * transaction context.
 */
export async function getOrCreateTag(
	ctx: MutationCtx,
	name: string,
	userId: Id<'users'>
): Promise<Id<'tags'>> {
	const normalized = name.toLowerCase().trim();
	const existing = await findByName(ctx, normalized, userId);
	if (existing !== null) return existing._id;

	return await ctx.db.insert('tags', {
		name: normalized,
		userId,
		createdAt: Date.now()
	});
}

/** Look up a tag by (normalized) name for a specific user. */
async function findByName(
	ctx: MutationCtx | QueryCtx,
	name: string,
	userId: Id<'users'>
) {
	return await ctx.db
		.query('tags')
		.withIndex('by_name_userId', (q) => q.eq('name', name).eq('userId', userId))
		.unique();
}
