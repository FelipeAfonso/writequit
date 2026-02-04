import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getOrCreateTag } from './tags.js';
import { getAuthUserId } from '@convex-dev/auth/server';

// ── Queries ────────────────────────────────────────────────────────

/**
 * List sessions for the current user.
 *
 * Optionally filter by date range and/or tag. Results are ordered
 * newest-first by start time.
 */
export const list = query({
	args: {
		startAfter: v.optional(v.number()),
		startBefore: v.optional(v.number()),
		tagId: v.optional(v.id('tags'))
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return [];

		let sessions;

		if (args.startAfter !== undefined && args.startBefore !== undefined) {
			sessions = await ctx.db
				.query('sessions')
				.withIndex('by_userId_startTime', (q) =>
					q
						.eq('userId', userId)
						.gte('startTime', args.startAfter!)
						.lte('startTime', args.startBefore!)
				)
				.collect();
		} else if (args.startAfter !== undefined) {
			sessions = await ctx.db
				.query('sessions')
				.withIndex('by_userId_startTime', (q) =>
					q.eq('userId', userId).gte('startTime', args.startAfter!)
				)
				.collect();
		} else if (args.startBefore !== undefined) {
			sessions = await ctx.db
				.query('sessions')
				.withIndex('by_userId_startTime', (q) =>
					q.eq('userId', userId).lte('startTime', args.startBefore!)
				)
				.collect();
		} else {
			sessions = await ctx.db
				.query('sessions')
				.withIndex('by_userId_startTime', (q) => q.eq('userId', userId))
				.collect();
		}

		// Tag filter (client-side — tag arrays are small)
		if (args.tagId !== undefined) {
			sessions = sessions.filter((s) => s.tagIds.includes(args.tagId!));
		}

		// Newest first
		sessions.sort((a, b) => b.startTime - a.startTime);

		// Resolve tags for each session
		return Promise.all(
			sessions.map(async (session) => {
				const tags = await Promise.all(
					session.tagIds.map((id) => ctx.db.get(id))
				);
				return {
					...session,
					tags: tags.filter((t) => t !== null)
				};
			})
		);
	}
});

/** Get a single session by ID, with resolved tags and tasks. */
export const get = query({
	args: { id: v.id('sessions') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return null;

		const session = await ctx.db.get(args.id);
		if (session === null || session.userId !== userId) return null;

		const tags = await Promise.all(session.tagIds.map((id) => ctx.db.get(id)));
		const tasks = await Promise.all(
			session.taskIds.map((id) => ctx.db.get(id))
		);

		return {
			...session,
			tags: tags.filter((t) => t !== null),
			tasks: tasks.filter((t) => t !== null)
		};
	}
});

/** Get the currently running session (endTime undefined), or null. */
export const active = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return null;

		return await getActiveSession(ctx, userId);
	}
});

// ── Mutations ──────────────────────────────────────────────────────

/**
 * Log a completed session (manual time entry).
 *
 * Used by the `:log` command. Accepts pre-computed start/end times,
 * tag names (resolved to IDs), and an optional description.
 */
export const log = mutation({
	args: {
		startTime: v.number(),
		endTime: v.number(),
		description: v.optional(v.string()),
		tags: v.array(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		if (args.endTime <= args.startTime) {
			throw new Error('End time must be after start time');
		}

		const tagIds = await Promise.all(
			args.tags.map((name) => getOrCreateTag(ctx, name, userId))
		);

		const now = Date.now();

		return await ctx.db.insert('sessions', {
			startTime: args.startTime,
			endTime: args.endTime,
			description: args.description,
			tagIds,
			taskIds: [],
			userId,
			createdAt: now,
			updatedAt: now
		});
	}
});

/**
 * Start a new timer.
 *
 * Creates a session with no endTime. Fails if one is already running.
 * Auto-links all currently active tasks (scoped by tag if provided).
 */
export const start = mutation({
	args: {
		description: v.optional(v.string()),
		tags: v.array(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		// Check for existing running session
		const existing = await getActiveSession(ctx, userId);
		if (existing !== null) {
			throw new Error('A timer is already running. Stop it first with :stop');
		}

		const tagIds = await Promise.all(
			args.tags.map((name) => getOrCreateTag(ctx, name, userId))
		);

		// Auto-link active tasks (scoped by tag if session has tags)
		const activeTasks = await ctx.db
			.query('tasks')
			.withIndex('by_status_userId', (q) =>
				q.eq('status', 'active').eq('userId', userId)
			)
			.collect();

		let taskIds: Id<'tasks'>[];
		if (tagIds.length > 0) {
			// Scoped: only tasks that share at least one tag with the session
			taskIds = activeTasks
				.filter((t) => t.tagIds.some((tid) => tagIds.includes(tid)))
				.map((t) => t._id);
		} else {
			// Unscoped: all active tasks
			taskIds = activeTasks.map((t) => t._id);
		}

		const now = Date.now();

		return await ctx.db.insert('sessions', {
			startTime: now,
			description: args.description,
			tagIds,
			taskIds,
			userId,
			createdAt: now,
			updatedAt: now
		});
	}
});

/** Stop the running timer by setting its endTime to now. */
export const stop = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const session = await getActiveSession(ctx, userId);
		if (session === null) {
			throw new Error('No timer is running');
		}

		await ctx.db.patch(session._id, {
			endTime: Date.now(),
			updatedAt: Date.now()
		});
	}
});

/** Manually link a task to a session. */
export const linkTask = mutation({
	args: {
		sessionId: v.id('sessions'),
		taskId: v.id('tasks')
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const session = await ctx.db.get(args.sessionId);
		if (session === null || session.userId !== userId) {
			throw new Error('Session not found');
		}

		const task = await ctx.db.get(args.taskId);
		if (task === null || task.userId !== userId) {
			throw new Error('Task not found');
		}

		// Don't add duplicates
		if (session.taskIds.includes(args.taskId)) return;

		await ctx.db.patch(args.sessionId, {
			taskIds: [...session.taskIds, args.taskId],
			updatedAt: Date.now()
		});
	}
});

/** Remove a task from a session. */
export const unlinkTask = mutation({
	args: {
		sessionId: v.id('sessions'),
		taskId: v.id('tasks')
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const session = await ctx.db.get(args.sessionId);
		if (session === null || session.userId !== userId) {
			throw new Error('Session not found');
		}

		await ctx.db.patch(args.sessionId, {
			taskIds: session.taskIds.filter((id) => id !== args.taskId),
			updatedAt: Date.now()
		});
	}
});

/** Update a session's description, tags, or time range. */
export const update = mutation({
	args: {
		id: v.id('sessions'),
		startTime: v.optional(v.number()),
		endTime: v.optional(v.number()),
		description: v.optional(v.string()),
		tags: v.optional(v.array(v.string()))
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const session = await ctx.db.get(args.id);
		if (session === null || session.userId !== userId) {
			throw new Error('Session not found');
		}

		const patch: Record<string, unknown> = { updatedAt: Date.now() };

		if (args.startTime !== undefined) patch.startTime = args.startTime;
		if (args.endTime !== undefined) patch.endTime = args.endTime;
		if (args.description !== undefined) patch.description = args.description;

		if (args.tags !== undefined) {
			patch.tagIds = await Promise.all(
				args.tags.map((name) => getOrCreateTag(ctx, name, userId))
			);
		}

		await ctx.db.patch(args.id, patch);
	}
});

/** Delete a session permanently. */
export const remove = mutation({
	args: { id: v.id('sessions') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const session = await ctx.db.get(args.id);
		if (session === null || session.userId !== userId) {
			throw new Error('Session not found');
		}

		await ctx.db.delete(args.id);
	}
});

// ── Internal helpers ───────────────────────────────────────────────

/**
 * Find the currently running session for a user.
 *
 * A running session has `endTime: undefined`. There should only ever
 * be at most one per user.
 *
 * Exported as a plain async function so it can be called from other
 * mutations (e.g. tasks.updateStatus for auto-linking).
 */
export async function getActiveSession(
	ctx: MutationCtx | QueryCtx,
	userId: Id<'users'>
) {
	// Query all sessions for this user and find the one without endTime.
	// We iterate newest-first so we find it quickly.
	const sessions = await ctx.db
		.query('sessions')
		.withIndex('by_userId', (q) => q.eq('userId', userId))
		.collect();

	return sessions.find((s) => s.endTime === undefined) ?? null;
}

/**
 * Auto-link a task to the active session if it matches the session's
 * tag scope.
 *
 * Called from tasks.updateStatus when a task moves to "active" or
 * "done" and there's a running timer.
 */
export async function autoLinkTask(
	ctx: MutationCtx,
	userId: Id<'users'>,
	taskId: Id<'tasks'>,
	taskTagIds: Id<'tags'>[]
) {
	const session = await getActiveSession(ctx, userId);
	if (session === null) return;

	// Already linked?
	if (session.taskIds.includes(taskId)) return;

	// Tag scope check: if session has tags, task must share at least one
	if (
		session.tagIds.length > 0 &&
		!taskTagIds.some((tid) => session.tagIds.includes(tid))
	) {
		return;
	}

	await ctx.db.patch(session._id, {
		taskIds: [...session.taskIds, taskId],
		updatedAt: Date.now()
	});
}
