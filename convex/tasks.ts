import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { parseTask } from '../src/lib/parser/index.js';
import { getOrCreateTag } from './tags.js';
import { autoLinkTask } from './sessions.js';
import { getAuthUserId } from '@convex-dev/auth/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

/** Map a task status to its numeric sort priority (lower = higher priority). */
const STATUS_PRIORITY: Record<string, number> = {
	active: 0,
	inbox: 1,
	done: 2
};

function statusPriorityFor(status: string): number {
	return STATUS_PRIORITY[status] ?? 9;
}

/** Look up the user's timezone from their settings, defaulting to UTC. */
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
		const userId = await getAuthUserId(ctx);
		if (userId === null) return [];

		let tasks;

		if (args.status !== undefined) {
			tasks = await ctx.db
				.query('tasks')
				.withIndex('by_status_userId', (q) =>
					q.eq('status', args.status!).eq('userId', userId)
				)
				.collect();
		} else {
			tasks = await ctx.db
				.query('tasks')
				.withIndex('by_userId', (q) => q.eq('userId', userId))
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

/**
 * List tasks with cursor-based pagination.
 *
 * Supports the same status filter as `list`. Tag and search filtering
 * are applied client-side across loaded pages.
 *
 * When a specific status is selected, results are ordered newest-first
 * (descending _creationTime). When showing all statuses, results are
 * sorted by status priority (active > inbox > done), then newest-first
 * within each group, using the `by_userId_statusPriority` index.
 */
export const listPaginated = query({
	args: {
		paginationOpts: paginationOptsValidator,
		status: v.optional(
			v.union(v.literal('inbox'), v.literal('active'), v.literal('done'))
		)
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) {
			return { page: [], isDone: true, continueCursor: '' };
		}

		if (args.status !== undefined) {
			// Single-status filter: use status+userId index, newest first
			return await ctx.db
				.query('tasks')
				.withIndex('by_status_userId', (idx) =>
					idx.eq('status', args.status!).eq('userId', userId)
				)
				.order('desc')
				.paginate(args.paginationOpts);
		}

		// All statuses: sort by statusPriority (asc) so active < inbox < done,
		// then by _creationTime (asc) within each group as the index tiebreaker.
		// This gives us status-grouped results straight from the index.
		return await ctx.db
			.query('tasks')
			.withIndex('by_userId_statusPriority', (idx) => idx.eq('userId', userId))
			.order('asc')
			.paginate(args.paginationOpts);
	}
});

/** Get a single task by ID, including its resolved tags. */
export const get = query({
	args: { id: v.id('tasks') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return null;

		const task = await ctx.db.get(args.id);
		if (task === null || task.userId !== userId) return null;

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
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const content = args.rawContent.trim();
		if (content.length === 0) throw new Error('Task content cannot be empty');

		const tz = await getUserTimezone(ctx, userId);
		const parsed = parseTask(content, tz);
		const now = Date.now();

		// Resolve tag names → tag IDs (creating tags as needed)
		const tagIds = await Promise.all(
			parsed.tags.map((name) => getOrCreateTag(ctx, name, userId))
		);

		const status = 'inbox';
		return await ctx.db.insert('tasks', {
			rawContent: content,
			title: parsed.title,
			dueDate: parsed.dueDate ?? undefined,
			status,
			statusPriority: statusPriorityFor(status),
			tagIds,
			userId,
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
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const existing = await ctx.db.get(args.id);
		if (existing === null || existing.userId !== userId) {
			throw new Error('Task not found');
		}

		const content = args.rawContent.trim();
		if (content.length === 0) throw new Error('Task content cannot be empty');

		const tz = await getUserTimezone(ctx, userId);
		const parsed = parseTask(content, tz);
		const tagIds = await Promise.all(
			parsed.tags.map((name) => getOrCreateTag(ctx, name, userId))
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
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const existing = await ctx.db.get(args.id);
		if (existing === null || existing.userId !== userId) {
			throw new Error('Task not found');
		}

		const now = Date.now();
		const patch: Record<string, unknown> = {
			status: args.status,
			statusPriority: statusPriorityFor(args.status),
			updatedAt: now
		};

		if (args.status === 'done') {
			patch.completedAt = now;
		} else if (existing.status === 'done') {
			// Moving away from done — clear completedAt
			patch.completedAt = undefined;
		}

		await ctx.db.patch(args.id, patch);

		// Auto-link to running session when moving to "active" or "done"
		if (args.status === 'active' || args.status === 'done') {
			await autoLinkTask(ctx, userId, args.id, existing.tagIds);
		}
	}
});

/**
 * Backfill `statusPriority` for all tasks that are missing it.
 * Run once via the dashboard or CLI:
 *   bunx convex run --no-push tasks:backfillStatusPriority
 */
export const backfillStatusPriority = internalMutation({
	args: {},
	handler: async (ctx) => {
		const tasks = await ctx.db.query('tasks').collect();

		let updated = 0;
		for (const task of tasks) {
			if (task.statusPriority === undefined) {
				await ctx.db.patch(task._id, {
					statusPriority: statusPriorityFor(task.status)
				});
				updated++;
			}
		}
		return { updated, total: tasks.length };
	}
});

/** Delete a task permanently. */
export const remove = mutation({
	args: { id: v.id('tasks') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const existing = await ctx.db.get(args.id);
		if (existing === null || existing.userId !== userId) {
			throw new Error('Task not found');
		}

		await ctx.db.delete(args.id);
	}
});
