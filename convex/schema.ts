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

	userSettings: defineTable({
		userId: v.id('users'),
		/** Use vim keybindings in the task editor. */
		viMode: v.boolean(),
		/** Default status filter when loading the tasks page. */
		defaultStatusFilter: v.union(
			v.literal('lastUsed'),
			v.literal('all'),
			v.literal('inbox'),
			v.literal('active'),
			v.literal('done')
		),
		/** Default tag filter when loading the tasks page. */
		defaultTagFilter: v.union(v.literal('lastUsed'), v.literal('all')),
		/** IANA timezone string, e.g. "America/New_York". Auto-detected on first login. */
		timezone: v.optional(v.string())
	}).index('by_userId', ['userId']),

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
		.index('by_dueDate', ['dueDate']),

	sessions: defineTable({
		/** When work began (UTC ms). */
		startTime: v.number(),
		/** When work ended (UTC ms). Undefined = timer is running. */
		endTime: v.optional(v.number()),
		/** Optional description, e.g. "Killed the beast". */
		description: v.optional(v.string()),
		/** Project/context tags associated with this session. */
		tagIds: v.array(v.id('tags')),
		/** Tasks linked to this session (many-to-many). */
		taskIds: v.array(v.id('tasks')),
		/** Owner — references the auth-managed users table. */
		userId: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_startTime', ['userId', 'startTime'])
});
