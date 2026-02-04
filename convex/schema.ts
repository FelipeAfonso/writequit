import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

export default defineSchema({
	...authTables,

	tags: defineTable({
		/** Unique tag name per user, e.g. "urgent", "backend". */
		name: v.string(),
		/**
		 * Optional type for richer filtering:
		 * "priority" | "project" | "category" | "context"
		 */
		type: v.optional(v.string()),
		/** Optional hex color for UI display, e.g. "#f7768e". */
		color: v.optional(v.string()),
		/** Owner — references the auth-managed users table. */
		userId: v.id('users'),
		createdAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_name_userId', ['name', 'userId']),

	tasks: defineTable({
		/** The original markdown string — source of truth. */
		rawContent: v.string(),
		/** Title extracted from the markdown. */
		title: v.string(),
		/** Due date as UTC ms timestamp, or undefined if none. */
		dueDate: v.optional(v.number()),
		/** Task lifecycle state. */
		status: v.union(v.literal('inbox'), v.literal('active'), v.literal('done')),
		/** References to tag documents. */
		tagIds: v.array(v.id('tags')),
		/** Owner — references the auth-managed users table. */
		userId: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.number(),
		/** Set when status transitions to "done". */
		completedAt: v.optional(v.number())
	})
		.index('by_status', ['status'])
		.index('by_userId', ['userId'])
		.index('by_status_userId', ['status', 'userId'])
		.index('by_dueDate', ['dueDate'])
});
