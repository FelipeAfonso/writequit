import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { parseTask } from '../src/lib/parser/index.js';
import { getOrCreateTag } from './tags.js';

// ── Placeholder userId ─────────────────────────────────────────────
const ANONYMOUS_USER = 'anonymous';

// ── Queries ────────────────────────────────────────────────────────

/** List tasks, optionally filtered by status and/or tag. */
export const list = query({
	args: {
		status: v.optional(
			v.union(v.literal('inbox'), v.literal('active'), v.literal('done'))
		),
		tagId: v.optional(v.id('tags'))
	},
	handler: async (ctx, args) => {
		let tasks;

		if (args.status !== undefined) {
			tasks = await ctx.db
				.query('tasks')
				.withIndex('by_status_userId', (q) =>
					q.eq('status', args.status!).eq('userId', ANONYMOUS_USER)
				)
				.collect();
		} else {
			tasks = await ctx.db
				.query('tasks')
				.withIndex('by_userId', (q) => q.eq('userId', ANONYMOUS_USER))
				.collect();
		}

		// Client-side tag filter (tag arrays are small, this is fine)
		if (args.tagId !== undefined) {
			tasks = tasks.filter((t) => t.tagIds.includes(args.tagId!));
		}

		// Sort: newest first
		tasks.sort((a, b) => b.createdAt - a.createdAt);

		return tasks;
	}
});

/** Get a single task by ID, including its resolved tags. */
export const get = query({
	args: { id: v.id('tasks') },
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.id);
		if (task === null) return null;

		// Resolve tag documents so the client has names/colors
		const tags = await Promise.all(task.tagIds.map((id) => ctx.db.get(id)));

		return {
			...task,
			tags: tags.filter((t) => t !== null)
		};
	}
});

// ── Mutations ──────────────────────────────────────────────────────

/**
 * Create a new task from raw markdown.
 *
 * The markdown is parsed server-side to extract:
 *   - title (first heading or first line)
 *   - due date (`due:…` token)
 *   - tags (`+tag` tokens → resolved to tag IDs)
 */
export const create = mutation({
	args: { rawContent: v.string() },
	handler: async (ctx, args) => {
		const content = args.rawContent.trim();
		if (content.length === 0) throw new Error('Task content cannot be empty');

		const parsed = parseTask(content);
		const now = Date.now();

		// Resolve tag names → tag IDs (creating tags as needed)
		const tagIds = await Promise.all(
			parsed.tags.map((name) => getOrCreateTag(ctx, name))
		);

		return await ctx.db.insert('tasks', {
			rawContent: content,
			title: parsed.title,
			dueDate: parsed.dueDate ?? undefined,
			status: 'inbox',
			tagIds,
			userId: ANONYMOUS_USER,
			createdAt: now,
			updatedAt: now
		});
	}
});

/**
 * Update a task's raw content. Re-parses everything from the new
 * markdown and updates all derived fields.
 */
export const update = mutation({
	args: {
		id: v.id('tasks'),
		rawContent: v.string()
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id);
		if (existing === null) throw new Error('Task not found');

		const content = args.rawContent.trim();
		if (content.length === 0) throw new Error('Task content cannot be empty');

		const parsed = parseTask(content);
		const tagIds = await Promise.all(
			parsed.tags.map((name) => getOrCreateTag(ctx, name))
		);

		await ctx.db.patch(args.id, {
			rawContent: content,
			title: parsed.title,
			dueDate: parsed.dueDate ?? undefined,
			tagIds,
			updatedAt: Date.now()
		});
	}
});

/**
 * Transition a task's status. Sets `completedAt` when moving to
 * "done", and clears it when moving away from "done".
 */
export const updateStatus = mutation({
	args: {
		id: v.id('tasks'),
		status: v.union(v.literal('inbox'), v.literal('active'), v.literal('done'))
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id);
		if (existing === null) throw new Error('Task not found');

		const now = Date.now();
		const patch: Record<string, unknown> = {
			status: args.status,
			updatedAt: now
		};

		if (args.status === 'done') {
			patch.completedAt = now;
		} else if (existing.status === 'done') {
			// Moving away from done — clear completedAt
			patch.completedAt = undefined;
		}

		await ctx.db.patch(args.id, patch);
	}
});

/** Delete a task permanently. */
export const remove = mutation({
	args: { id: v.id('tasks') },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	}
});
