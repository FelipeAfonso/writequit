import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getCurrentUser, getCurrentUserOrThrow } from './users.js';

// ── Constants ──────────────────────────────────────────────────────

/** How many notifications to return per page. */
const PAGE_SIZE = 50;

/** 30 days in milliseconds. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// ── Internal helper (called from board mutations) ──────────────────

/**
 * Create a notification record for a board owner.
 * Called from board mutations (publicAddComment, publicSendMessage, publicSetPriority).
 */
export async function createNotification(
	ctx: MutationCtx,
	data: {
		userId: Id<'users'>;
		type: 'comment' | 'chat' | 'priority_change';
		boardId: Id<'boards'>;
		taskId?: Id<'tasks'>;
		boardCommentId?: Id<'boardComments'>;
		boardMessageId?: Id<'boardMessages'>;
		boardName: string;
		taskTitle?: string;
		actorName: string;
		summary: string;
	}
) {
	await ctx.db.insert('notifications', {
		userId: data.userId,
		type: data.type,
		boardId: data.boardId,
		taskId: data.taskId,
		boardCommentId: data.boardCommentId,
		boardMessageId: data.boardMessageId,
		boardName: data.boardName,
		taskTitle: data.taskTitle,
		actorName: data.actorName,
		summary: data.summary,
		isRead: false,
		createdAt: Date.now()
	});
}

// ── Queries ────────────────────────────────────────────────────────

/** List notifications for the current user, newest first. */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];

		const notifications = await ctx.db
			.query('notifications')
			.withIndex('by_userId_createdAt', (q) => q.eq('userId', user._id))
			.order('desc')
			.take(PAGE_SIZE);

		return notifications;
	}
});

/** Count unread notifications for the current user (for nav badge). */
export const unreadCount = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return 0;

		const unread = await ctx.db
			.query('notifications')
			.withIndex('by_userId_isRead', (q) =>
				q.eq('userId', user._id).eq('isRead', false)
			)
			.collect();

		return unread.length;
	}
});

// ── Mutations ──────────────────────────────────────────────────────

/** Mark a single notification as read. */
export const markRead = mutation({
	args: { id: v.id('notifications') },
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const notification = await ctx.db.get(args.id);
		if (notification === null || notification.userId !== user._id) return;

		if (!notification.isRead) {
			await ctx.db.patch(args.id, { isRead: true });
		}
	}
});

/** Mark all notifications as read for the current user. */
export const markAllRead = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUserOrThrow(ctx);

		const unread = await ctx.db
			.query('notifications')
			.withIndex('by_userId_isRead', (q) =>
				q.eq('userId', user._id).eq('isRead', false)
			)
			.collect();

		for (const notification of unread) {
			await ctx.db.patch(notification._id, { isRead: true });
		}
	}
});

// ── Cleanup (called by cron) ──────────────────────────────────────

/** Delete notifications older than 30 days. */
export const cleanup = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - RETENTION_MS;

		// Scan all notifications and delete old ones.
		// Since we don't have a dedicated index for this,
		// we scan by createdAt order (ascending) and stop early.
		const old = await ctx.db
			.query('notifications')
			.order('asc')
			.filter((q) => q.lt(q.field('createdAt'), cutoff))
			.take(500);

		for (const notification of old) {
			await ctx.db.delete(notification._id);
		}
	}
});
