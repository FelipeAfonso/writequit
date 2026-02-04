import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

// ── Placeholder userId ─────────────────────────────────────────────
// Auth is not yet implemented. We use a constant so every query
// already filters by user, making the auth migration seamless.
const ANONYMOUS_USER = 'anonymous';

// ── Queries ────────────────────────────────────────────────────────

/** List all tags for the current user. */
export const list = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query('tags')
			.withIndex('by_userId', (q) => q.eq('userId', ANONYMOUS_USER))
			.collect();
	}
});

/** Get a single tag by ID. */
export const get = query({
	args: { id: v.id('tags') },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
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
		const name = args.name.toLowerCase().trim();
		if (name.length === 0) throw new Error('Tag name cannot be empty');

		// Check for duplicate
		const existing = await findByName(ctx, name);
		if (existing !== null) return existing._id;

		return await ctx.db.insert('tags', {
			name,
			type: args.type,
			color: args.color,
			userId: ANONYMOUS_USER,
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
		const tag = await ctx.db.get(args.id);
		if (tag === null) throw new Error('Tag not found');

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
		await ctx.db.delete(args.id);
	}
});

// ── Internal helpers ───────────────────────────────────────────────

/**
 * Find an existing tag by name for the current user, or create it.
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
	name: string
): Promise<Id<'tags'>> {
	const normalized = name.toLowerCase().trim();
	const existing = await findByName(ctx, normalized);
	if (existing !== null) return existing._id;

	return await ctx.db.insert('tags', {
		name: normalized,
		userId: ANONYMOUS_USER,
		createdAt: Date.now()
	});
}

/** Look up a tag by (normalized) name for the current user. */
async function findByName(
	ctx: MutationCtx | { db: MutationCtx['db'] },
	name: string
) {
	return await ctx.db
		.query('tags')
		.withIndex('by_name_userId', (q) =>
			q.eq('name', name).eq('userId', ANONYMOUS_USER)
		)
		.unique();
}
