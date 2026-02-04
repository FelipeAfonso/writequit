import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getAuthUserId } from '@convex-dev/auth/server';

// ── Queries ────────────────────────────────────────────────────────

/** List all tags for the current user. */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return [];

		return await ctx.db
			.query('tags')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.collect();
	}
});

/** Get a single tag by ID. */
export const get = query({
	args: { id: v.id('tags') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return null;

		const tag = await ctx.db.get(args.id);
		if (tag === null || tag.userId !== userId) return null;
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
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

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
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const tag = await ctx.db.get(args.id);
		if (tag === null || tag.userId !== userId) throw new Error('Tag not found');

		await ctx.db.patch(args.id, {
			type: args.type,
			color: args.color
		});
	}
});

/** Delete a tag. Does NOT remove tag references from tasks. */
export const remove = mutation({
	args: { id: v.id('tags') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const tag = await ctx.db.get(args.id);
		if (tag === null || tag.userId !== userId) throw new Error('Tag not found');

		await ctx.db.delete(args.id);
	}
});

// ── Internal helpers ───────────────────────────────────────────────

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
