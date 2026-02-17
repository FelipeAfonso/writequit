import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getCurrentUser, getCurrentUserOrThrow } from './users.js';
import { parseTask } from '../src/lib/parser/index.js';
import { isTagChar, isWhitespace, toLower } from '../src/lib/parser/scanner.js';
import { internal } from './_generated/api.js';

const TAG_DELETE_BATCH_SIZE = 50;

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

/** Delete a tag and asynchronously clean up references in tasks/sessions. */
export const remove = mutation({
	args: { id: v.id('tags') },
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);
		const userId = user._id;

		const tag = await ctx.db.get(args.id);
		if (tag === null || tag.userId !== userId) throw new Error('Tag not found');

		const tz = await getUserTimezone(ctx, userId);
		await ctx.scheduler.runAfter(0, internal.tags.cleanupTagDeleteBatch, {
			userId,
			tagId: args.id,
			tagName: tag.name,
			tz,
			phase: 'tasks'
		});

		await ctx.db.delete(args.id);
	}
});

/** Internal batched worker for tag deletion cleanup. */
export const cleanupTagDeleteBatch = internalMutation({
	args: {
		userId: v.id('users'),
		tagId: v.id('tags'),
		tagName: v.string(),
		tz: v.string(),
		phase: v.union(v.literal('tasks'), v.literal('sessions')),
		cursor: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		if (args.phase === 'tasks') {
			const page = await ctx.db
				.query('tasks')
				.withIndex('by_userId', (q) => q.eq('userId', args.userId))
				.paginate({
					numItems: TAG_DELETE_BATCH_SIZE,
					cursor: args.cursor ?? null
				});

			for (const task of page.page) {
				if (!task.tagIds.includes(args.tagId)) continue;

				const rawContent = removeTagToken(task.rawContent, args.tagName);
				const parseAnchor = task.updatedAt ?? task.createdAt ?? now;
				const parsed = parseTask(rawContent, args.tz, parseAnchor);
				const tagIds = await Promise.all(
					parsed.tags.map((name) => getOrCreateTag(ctx, name, args.userId))
				);

				await ctx.db.patch(task._id, {
					rawContent,
					title: parsed.title,
					dueDate: parsed.dueDate ?? task.dueDate,
					tagIds,
					updatedAt: now
				});
			}

			if (!page.isDone) {
				await ctx.scheduler.runAfter(0, internal.tags.cleanupTagDeleteBatch, {
					...args,
					cursor: page.continueCursor
				});
				return;
			}

			await ctx.scheduler.runAfter(0, internal.tags.cleanupTagDeleteBatch, {
				...args,
				phase: 'sessions',
				cursor: undefined
			});
			return;
		}

		const page = await ctx.db
			.query('sessions')
			.withIndex('by_userId', (q) => q.eq('userId', args.userId))
			.paginate({
				numItems: TAG_DELETE_BATCH_SIZE,
				cursor: args.cursor ?? null
			});

		for (const session of page.page) {
			if (!session.tagIds.includes(args.tagId)) continue;
			await ctx.db.patch(session._id, {
				tagIds: session.tagIds.filter((tagId) => tagId !== args.tagId),
				updatedAt: now
			});
		}

		if (!page.isDone) {
			await ctx.scheduler.runAfter(0, internal.tags.cleanupTagDeleteBatch, {
				...args,
				cursor: page.continueCursor
			});
		}
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
	let removed = false;
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
					removed = true;
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

	return removed ? result.join('') : markdown;
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
