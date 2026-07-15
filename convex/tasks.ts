import {
	query,
	mutation,
	internalQuery,
	internalMutation
} from './_generated/server';
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

type TaskStatus = 'inbox' | 'active' | 'done';

/** Shared validator for the task lifecycle state. */
const statusValidator = v.union(
	v.literal('inbox'),
	v.literal('active'),
	v.literal('done')
);

type TagMap = Map<string, { name: string; type?: string }>;

/** Resolve all referenced tags for a set of tasks into a lookup map. */
async function buildTagMap(
	ctx: QueryCtx,
	tasks: Doc<'tasks'>[]
): Promise<TagMap> {
	const allTagIds: Id<'tags'>[] = tasks.flatMap((t) => t.tagIds);
	const tagIdSet = new Set(allTagIds);
	const tagMap: TagMap = new Map();
	for (const tagId of tagIdSet) {
		const tag = await ctx.db.get(tagId);
		if (tag?.name) tagMap.set(tagId, { name: tag.name, type: tag.type });
	}
	return tagMap;
}

/** Sort tasks with the shared comparator (resolves tags for tie-breaks). */
async function sortTasksByPriority(
	ctx: QueryCtx,
	tasks: Doc<'tasks'>[]
): Promise<Doc<'tasks'>[]> {
	const tagMap = await buildTagMap(ctx, tasks);
	return [...tasks].sort((a, b) => compareTasks(a, b, (id) => tagMap.get(id)));
}

/**
 * Agent-friendly task shape for the MCP endpoint: tag names instead of
 * IDs, ISO due date. `rawContent` is only included where noted.
 */
function serializeTask(task: Doc<'tasks'>, tagMap: TagMap) {
	return {
		id: task._id,
		title: task.title,
		status: task.status,
		dueDate:
			task.dueDate !== undefined ? new Date(task.dueDate).toISOString() : null,
		tags: task.tagIds
			.map((id) => tagMap.get(id)?.name)
			.filter((name): name is string => name !== undefined),
		createdAt: task.createdAt,
		updatedAt: task.updatedAt,
		completedAt: task.completedAt ?? null
	};
}

/** serializeTask over a list, resolving tags once. */
async function serializeTasks(ctx: QueryCtx, tasks: Doc<'tasks'>[]) {
	const tagMap = await buildTagMap(ctx, tasks);
	return tasks.map((t) => serializeTask(t, tagMap));
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

// ── Core operations (explicit userId, shared by JWT + API-key paths) ──

/** Fetch a user's tasks, optionally filtered by status. Unsorted. */
export async function listTasksCore(
	ctx: QueryCtx,
	userId: Id<'users'>,
	status?: TaskStatus
): Promise<Doc<'tasks'>[]> {
	if (status !== undefined) {
		return await ctx.db
			.query('tasks')
			.withIndex('by_status_userId', (q) =>
				q.eq('status', status).eq('userId', userId)
			)
			.collect();
	}
	return await ctx.db
		.query('tasks')
		.withIndex('by_userId', (q) => q.eq('userId', userId))
		.collect();
}

/** Full-text search a user's tasks (BM25-ranked). */
export async function searchTasksCore(
	ctx: QueryCtx,
	userId: Id<'users'>,
	searchQuery: string,
	status: TaskStatus | undefined,
	limit: number
): Promise<Doc<'tasks'>[]> {
	if (!searchQuery.trim()) return [];
	return await ctx.db
		.query('tasks')
		.withSearchIndex('search_content', (q) => {
			const s = q.search('rawContent', searchQuery).eq('userId', userId);
			return status !== undefined ? s.eq('status', status) : s;
		})
		.take(limit);
}

/** Create a task from raw markdown. See `create` for parsing details. */
export async function createTaskCore(
	ctx: MutationCtx,
	userId: Id<'users'>,
	rawContent: string
): Promise<Id<'tasks'>> {
	const content = rawContent.trim();
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

/** Replace a task's raw content, re-deriving all parsed fields. */
export async function updateTaskCore(
	ctx: MutationCtx,
	userId: Id<'users'>,
	id: Id<'tasks'>,
	rawContent: string
): Promise<void> {
	const existing = await ctx.db.get(id);
	if (existing === null || existing.userId !== userId) {
		throw new Error('Task not found');
	}

	const content = rawContent.trim();
	if (content.length === 0) throw new Error('Task content cannot be empty');

	const tz = await getUserTimezone(ctx, userId);
	const parsed = parseTask(content, tz);
	const tagIds = await Promise.all(
		parsed.tags.map((name) => getOrCreateTag(ctx, name, userId))
	);

	await ctx.db.patch(id, {
		rawContent: content,
		title: parsed.title,
		dueDate: parsed.dueDate ?? undefined,
		tagIds,
		updatedAt: Date.now()
	});
}

/**
 * Transition a task's status. Sets `completedAt` when moving to "done",
 * clears it when moving away, and auto-links to a running session.
 */
export async function setStatusCore(
	ctx: MutationCtx,
	userId: Id<'users'>,
	id: Id<'tasks'>,
	status: TaskStatus
): Promise<void> {
	const existing = await ctx.db.get(id);
	if (existing === null || existing.userId !== userId) {
		throw new Error('Task not found');
	}

	const now = Date.now();
	const patch: Record<string, unknown> = {
		status,
		statusPriority: statusPriorityFor(status),
		updatedAt: now
	};

	if (status === 'done' && existing.status !== 'done') {
		patch.completedAt = now;
	} else if (status !== 'done' && existing.status === 'done') {
		// Moving away from done — clear completedAt
		patch.completedAt = undefined;
	}

	await ctx.db.patch(id, patch);

	// Auto-link to running session when moving to "active" or "done"
	if (status === 'active' || status === 'done') {
		await autoLinkTask(ctx, userId, id, existing.tagIds);
	}
}

// ── Queries ────────────────────────────────────────────────────────

/** List tasks, optionally filtered by status and/or tag. */
export const list = query({
	args: {
		status: v.optional(statusValidator),
		tagId: v.optional(v.id('tags'))
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];

		let tasks = await listTasksCore(ctx, user._id, args.status);

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
		status: v.optional(statusValidator)
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
				.withIndex('by_userId_statusPriority', (idx) =>
					idx.eq('userId', userId)
				)
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
		status: v.optional(statusValidator)
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];

		return await searchTasksCore(ctx, user._id, args.query, args.status, 50);
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
		return await createTaskCore(ctx, user._id, args.rawContent);
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
		await updateTaskCore(ctx, user._id, args.id, args.rawContent);
	}
});

/**
 * Transition a task's status. Sets `completedAt` when moving to
 * "done", and clears it when moving away from "done".
 */
export const updateStatus = mutation({
	args: {
		id: v.id('tasks'),
		status: statusValidator
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);
		await setStatusCore(ctx, user._id, args.id, args.status);
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

// ── Internal functions (MCP endpoint — authenticated by API key) ───
// These take an explicit userId resolved from the key; there is no
// JWT identity on this path. Results use the agent-friendly shape.

export const listForUser = internalQuery({
	args: {
		userId: v.id('users'),
		status: v.optional(statusValidator),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
		const tasks = await listTasksCore(ctx, args.userId, args.status);
		const sorted = await sortTasksByPriority(ctx, tasks);
		return await serializeTasks(ctx, sorted.slice(0, limit));
	}
});

export const searchForUser = internalQuery({
	args: {
		userId: v.id('users'),
		query: v.string(),
		status: v.optional(statusValidator)
	},
	handler: async (ctx, args) => {
		const tasks = await searchTasksCore(
			ctx,
			args.userId,
			args.query,
			args.status,
			20
		);
		return await serializeTasks(ctx, tasks);
	}
});

export const getForUser = internalQuery({
	args: { userId: v.id('users'), id: v.id('tasks') },
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.id);
		if (task === null || task.userId !== args.userId) return null;

		const [serialized] = await serializeTasks(ctx, [task]);
		return { ...serialized, rawContent: task.rawContent };
	}
});

export const createForUser = internalMutation({
	args: { userId: v.id('users'), rawContent: v.string() },
	handler: async (ctx, args) => {
		const id = await createTaskCore(ctx, args.userId, args.rawContent);
		const task = await ctx.db.get(id);
		if (task === null) throw new Error('Task not found after create');

		const [serialized] = await serializeTasks(ctx, [task]);
		return { ...serialized, rawContent: task.rawContent };
	}
});

export const updateForUser = internalMutation({
	args: {
		userId: v.id('users'),
		id: v.id('tasks'),
		rawContent: v.string()
	},
	handler: async (ctx, args) => {
		await updateTaskCore(ctx, args.userId, args.id, args.rawContent);
		const task = await ctx.db.get(args.id);
		if (task === null) throw new Error('Task not found');

		const [serialized] = await serializeTasks(ctx, [task]);
		return { ...serialized, rawContent: task.rawContent };
	}
});

export const setStatusForUser = internalMutation({
	args: {
		userId: v.id('users'),
		id: v.id('tasks'),
		status: statusValidator
	},
	handler: async (ctx, args) => {
		await setStatusCore(ctx, args.userId, args.id, args.status);
		const task = await ctx.db.get(args.id);
		if (task === null) throw new Error('Task not found');

		return (await serializeTasks(ctx, [task]))[0];
	}
});
