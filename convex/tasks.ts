import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { parseTask } from '../src/lib/parser/index.js';
import { compareTasks } from '../src/lib/utils/taskSort.js';
import { getOrCreateTag } from './tags.js';
import { autoLinkTask } from './sessions.js';
import { getCurrentUser, getCurrentUserOrThrow } from './users.js';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';

/** Map a task status to its numeric sort priority (lower = higher priority). */
const STATUS_PRIORITY: Record<string, number> = {
	active: 0,
	inbox: 1,
	done: 2
};

function statusPriorityFor(status: string): number {
	return STATUS_PRIORITY[status] ?? 9;
}

/**
 * Resolve all referenced tags for a set of tasks into a lookup map,
 * then sort the tasks using the shared comparator.
 */
async function sortTasksByPriority(
	ctx: QueryCtx,
	tasks: Doc<'tasks'>[]
): Promise<Doc<'tasks'>[]> {
	const allTagIds: Id<'tags'>[] = tasks.flatMap((t) => t.tagIds);
	const tagIdSet = new Set(allTagIds);
	const tagMap = new Map<string, { name: string; type?: string }>();
	for (const tagId of tagIdSet) {
		const tag = await ctx.db.get(tagId);
		if (tag?.name) tagMap.set(tagId, { name: tag.name, type: tag.type });
	}

	return [...tasks].sort((a, b) =>
		compareTasks(a, b, (id) => tagMap.get(id))
	);
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
		const user = await getCurrentUser(ctx);
		if (user === null) return [];
		const userId = user._id;

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

		return await sortTasksByPriority(ctx, tasks);
	}
});

/**
 * List tasks with cursor-based pagination.
 *
 * Supports the same status filter as `list`. Tag and search filtering
 * are applied client-side across loaded pages.
 *
 * Pagination uses database indexes for cursor stability, then each page
 * is re-sorted with the shared comparator (priority tag, due date,
 * completedAt for done tasks). The client also applies a final sort
 * across all loaded pages for cross-page correctness.
 */
export const listPaginated = query({
	args: {
		paginationOpts: paginationOptsValidator,
		status: v.optional(
			v.union(v.literal('inbox'), v.literal('active'), v.literal('done'))
		)
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) {
			return { page: [], isDone: true, continueCursor: '' };
		}
		const userId = user._id;

		let result;

		if (args.status !== undefined) {
			result = await ctx.db
				.query('tasks')
				.withIndex('by_status_userId', (idx) =>
					idx.eq('status', args.status!).eq('userId', userId)
				)
				.order('desc')
				.paginate(args.paginationOpts);
		} else {
			result = await ctx.db
				.query('tasks')
				.withIndex('by_userId_statusPriority', (idx) => idx.eq('userId', userId))
				.order('asc')
				.paginate(args.paginationOpts);
		}

		// Re-sort within the page using the shared comparator
		result.page = await sortTasksByPriority(ctx, result.page);
		return result;
	}
});

/**
 * Full-text search across all tasks using Convex's built-in search index.
 *
 * Uses the `search_content` index on `rawContent` which covers title, body,
 * and +tag tokens. Results are ranked by BM25 relevance with prefix matching
 * on the last term (enables typeahead). Optionally filters by status.
 */
export const search = query({
	args: {
		query: v.string(),
		status: v.optional(
			v.union(v.literal('inbox'), v.literal('active'), v.literal('done'))
		)
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];
		if (!args.query.trim()) return [];
		const userId = user._id;

		return await ctx.db
			.query('tasks')
			.withSearchIndex('search_content', (q) => {
				const s = q.search('rawContent', args.query).eq('userId', userId);
				return args.status !== undefined ? s.eq('status', args.status!) : s;
			})
			.take(50);
	}
});

/** Get a single task by ID, including its resolved tags. */
export const get = query({
	args: { id: v.id('tasks') },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return null;

		const task = await ctx.db.get(args.id);
		if (task === null || task.userId !== user._id) return null;

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
		const user = await getCurrentUserOrThrow(ctx);
		const userId = user._id;

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
		const user = await getCurrentUserOrThrow(ctx);
		const userId = user._id;

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
		const user = await getCurrentUserOrThrow(ctx);
		const userId = user._id;

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
		const user = await getCurrentUserOrThrow(ctx);

		const existing = await ctx.db.get(args.id);
		if (existing === null || existing.userId !== user._id) {
			throw new Error('Task not found');
		}

		await ctx.db.delete(args.id);
	}
});
