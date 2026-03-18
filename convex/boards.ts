import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';
import { getCurrentUser, getCurrentUserOrThrow } from './users.js';
import { parseTask } from '../src/lib/parser/index.js';
import { getOrCreateTag } from './tags.js';
import { getActiveSession } from './sessions.js';

// ── Constants ──────────────────────────────────────────────────────

const SLUG_LENGTH = 8;
const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PASSWORD_LENGTH = 16;
const PASSWORD_CHARS =
	'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// ── Crypto helpers (SHA-256 + salt) ────────────────────────────────

function generateRandom(length: number, chars: string): string {
	const values = new Uint8Array(length);
	crypto.getRandomValues(values);
	return Array.from(values)
		.map((v) => chars[v % chars.length])
		.join('');
}

async function hashPassword(password: string, salt?: string): Promise<string> {
	const s = salt ?? generateRandom(16, SLUG_CHARS);
	const data = new TextEncoder().encode(s + password);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashHex = Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return `${s}:${hashHex}`;
}

async function verifyPassword(
	password: string,
	storedHash: string
): Promise<boolean> {
	const colonIdx = storedHash.indexOf(':');
	if (colonIdx === -1) return false;
	const salt = storedHash.slice(0, colonIdx);
	const rehash = await hashPassword(password, salt);
	return rehash === storedHash;
}

// ── Board helpers ──────────────────────────────────────────────────

async function getBoardBySlug(ctx: QueryCtx, slug: string) {
	return await ctx.db
		.query('boards')
		.withIndex('by_slug', (q) => q.eq('slug', slug))
		.unique();
}

/** Validate a public board access: slug + password + active. */
async function validateBoardAccess(
	ctx: QueryCtx,
	slug: string,
	password: string
): Promise<Doc<'boards'>> {
	const board = await getBoardBySlug(ctx, slug);
	if (!board) throw new Error('Board not found');
	if (!board.isActive) throw new Error('Board is not active');
	const valid = await verifyPassword(password, board.passwordHash);
	if (!valid) throw new Error('Invalid password');
	return board;
}

/**
 * Fetch filtered tasks for a board, resolving tags.
 * Returns tasks matching the board's status + tag filters,
 * sorted by priority (highest first, unprioritized at bottom),
 * with per-board comment counts.
 */
async function fetchBoardTasks(ctx: QueryCtx, board: Doc<'boards'>) {
	const { statusFilters, tagIds: filterTagIds } = board.filter;

	// Fetch all user tasks, then filter by selected statuses
	let tasks = await ctx.db
		.query('tasks')
		.withIndex('by_userId', (q) => q.eq('userId', board.userId))
		.collect();

	// Apply status filter (OR logic — task must match ANY selected status)
	if (statusFilters && statusFilters.length > 0) {
		tasks = tasks.filter((task) => statusFilters.includes(task.status));
	}

	// Apply tag filter (AND logic — task must have ALL filter tags)
	if (filterTagIds && filterTagIds.length > 0) {
		tasks = tasks.filter((task) =>
			filterTagIds.every((tagId) => task.tagIds.includes(tagId))
		);
	}

	// Resolve tags and count per-board comments for each task
	const tasksWithTags = await Promise.all(
		tasks.map(async (task) => {
			const tags = await Promise.all(task.tagIds.map((id) => ctx.db.get(id)));
			const resolvedTags = tags.filter((t) => t !== null);

			// Count comments for this task on this specific board
			const comments = await ctx.db
				.query('boardComments')
				.withIndex('by_boardId_taskId', (q) =>
					q.eq('boardId', board._id).eq('taskId', task._id)
				)
				.collect();

			return {
				...task,
				tags: resolvedTags,
				commentCount: comments.length
			};
		})
	);

	// Sort by priority: tasks with priority tags first (ascending by tag name),
	// then unprioritized tasks at the bottom. Tiebreaker: newest first.
	tasksWithTags.sort((a, b) => {
		const aPriority = a.tags.find((t) => t.type === 'priority');
		const bPriority = b.tags.find((t) => t.type === 'priority');

		// Both have priority tags — sort ascending by name (p0 < p1 < p2 etc.)
		if (aPriority && bPriority) {
			const cmp = aPriority.name.localeCompare(bPriority.name);
			if (cmp !== 0) return cmp;
			return b._creationTime - a._creationTime; // newest first
		}

		// Only one has priority — prioritized task comes first
		if (aPriority && !bPriority) return -1;
		if (!aPriority && bPriority) return 1;

		// Neither has priority — newest first
		return b._creationTime - a._creationTime;
	});

	return tasksWithTags;
}

/** Look up the user's timezone from their settings, defaulting to UTC. */
async function getUserTimezone(
	ctx: QueryCtx | MutationCtx,
	userId: Id<'users'>
): Promise<string> {
	const settings = await ctx.db
		.query('userSettings')
		.withIndex('by_userId', (q) => q.eq('userId', userId))
		.unique();
	return settings?.timezone ?? 'UTC';
}

/** Check that a task passes the board's filter criteria. */
function taskMatchesBoardFilter(
	task: Doc<'tasks'>,
	board: Doc<'boards'>
): boolean {
	const { statusFilters, tagIds: filterTagIds } = board.filter;
	if (
		statusFilters &&
		statusFilters.length > 0 &&
		!statusFilters.includes(task.status)
	) {
		return false;
	}
	if (filterTagIds && filterTagIds.length > 0) {
		if (!filterTagIds.every((tagId) => task.tagIds.includes(tagId))) {
			return false;
		}
	}
	return true;
}

/** Validate that all tag IDs belong to the given user. */
async function validateTagOwnership(
	ctx: QueryCtx | MutationCtx,
	tagIds: Id<'tags'>[] | undefined,
	userId: Id<'users'>
) {
	if (!tagIds || tagIds.length === 0) return;
	for (const tagId of tagIds) {
		const tag = await ctx.db.get(tagId);
		if (!tag || tag.userId !== userId) {
			throw new Error('Invalid tag in filter: tag not found or not owned');
		}
	}
}

// ── Authenticated queries (owner) ──────────────────────────────────

/** List all boards for the current user. */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];

		const boards = await ctx.db
			.query('boards')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.collect();

		// Resolve filter tags for display
		return await Promise.all(
			boards.map(async (board) => {
				const filterTags = board.filter.tagIds
					? await Promise.all(board.filter.tagIds.map((id) => ctx.db.get(id)))
					: [];
				return {
					...board,
					filterTags: filterTags.filter((t) => t !== null)
				};
			})
		);
	}
});

/** Get a single board by ID, with resolved filter tags. */
export const get = query({
	args: { id: v.id('boards') },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return null;

		const board = await ctx.db.get(args.id);
		if (board === null || board.userId !== user._id) return null;

		const filterTags = board.filter.tagIds
			? await Promise.all(board.filter.tagIds.map((id) => ctx.db.get(id)))
			: [];

		// Count comments on this board
		const comments = await ctx.db
			.query('boardComments')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.id))
			.collect();

		return {
			...board,
			filterTags: filterTags.filter((t) => t !== null),
			commentCount: comments.length
		};
	}
});

/** Get filtered tasks for a board (owner preview). */
export const getTasks = query({
	args: { id: v.id('boards') },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];

		const board = await ctx.db.get(args.id);
		if (board === null || board.userId !== user._id) return [];

		return await fetchBoardTasks(ctx, board);
	}
});

/** Get all comments for a board (owner view). */
export const getComments = query({
	args: { boardId: v.id('boards') },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];

		const board = await ctx.db.get(args.boardId);
		if (board === null || board.userId !== user._id) return [];

		return await ctx.db
			.query('boardComments')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
			.collect();
	}
});

/** Get comments for a specific task on a board (owner view). */
export const getTaskComments = query({
	args: {
		boardId: v.id('boards'),
		taskId: v.id('tasks')
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];

		const board = await ctx.db.get(args.boardId);
		if (board === null || board.userId !== user._id) return [];

		return await ctx.db
			.query('boardComments')
			.withIndex('by_boardId_taskId', (q) =>
				q.eq('boardId', args.boardId).eq('taskId', args.taskId)
			)
			.collect();
	}
});

/** Get all board comments for a specific task (across all boards), for the task detail page. */
export const getCommentsByTask = query({
	args: { taskId: v.id('tasks') },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];

		const task = await ctx.db.get(args.taskId);
		if (task === null || task.userId !== user._id) return [];

		const comments = await ctx.db
			.query('boardComments')
			.withIndex('by_taskId', (q) => q.eq('taskId', args.taskId))
			.collect();

		// Resolve board name for each comment
		const commentsWithBoard = await Promise.all(
			comments.map(async (comment) => {
				const board = await ctx.db.get(comment.boardId);
				return {
					_id: comment._id,
					boardName: board?.name ?? 'unknown board',
					authorName: comment.authorName,
					content: comment.content,
					createdAt: comment.createdAt
				};
			})
		);

		// Sort chronologically (oldest first)
		return commentsWithBoard.sort((a, b) => a.createdAt - b.createdAt);
	}
});

// ── Authenticated mutations (owner) ────────────────────────────────

/**
 * Create a new board. Generates a random slug and password.
 * Returns the board ID and the plaintext password (shown once).
 */
export const create = mutation({
	args: {
		name: v.string(),
		filter: v.object({
			statusFilters: v.optional(
				v.array(
					v.union(v.literal('inbox'), v.literal('active'), v.literal('done'))
				)
			),
			tagIds: v.optional(v.array(v.id('tags')))
		})
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);
		const now = Date.now();

		const name = args.name.trim();
		if (name.length === 0) throw new Error('Board name cannot be empty');

		await validateTagOwnership(ctx, args.filter.tagIds, user._id);

		// Generate unique slug
		let slug: string;
		let attempts = 0;
		do {
			slug = generateRandom(SLUG_LENGTH, SLUG_CHARS);
			const existing = await getBoardBySlug(ctx, slug);
			if (!existing) break;
			attempts++;
		} while (attempts < 10);
		if (attempts >= 10) throw new Error('Failed to generate unique slug');

		// Generate password and hash it
		const password = generateRandom(PASSWORD_LENGTH, PASSWORD_CHARS);
		const passwordHash = await hashPassword(password);

		const boardId = await ctx.db.insert('boards', {
			name,
			passwordHash,
			slug,
			filter: args.filter,
			isActive: true,
			userId: user._id,
			createdAt: now,
			updatedAt: now
		});

		return { boardId, slug, password };
	}
});

/** Update a board's name and/or filters. */
export const update = mutation({
	args: {
		id: v.id('boards'),
		name: v.optional(v.string()),
		filter: v.optional(
			v.object({
				statusFilters: v.optional(
					v.array(
						v.union(v.literal('inbox'), v.literal('active'), v.literal('done'))
					)
				),
				tagIds: v.optional(v.array(v.id('tags')))
			})
		)
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const board = await ctx.db.get(args.id);
		if (board === null || board.userId !== user._id)
			throw new Error('Board not found');

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) {
			const name = args.name.trim();
			if (name.length === 0) throw new Error('Board name cannot be empty');
			patch.name = name;
		}
		if (args.filter !== undefined) {
			await validateTagOwnership(ctx, args.filter.tagIds, user._id);
			patch.filter = args.filter;
		}

		await ctx.db.patch(args.id, patch);
	}
});

/** Regenerate the board password. Returns the new plaintext password. */
export const regeneratePassword = mutation({
	args: { id: v.id('boards') },
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const board = await ctx.db.get(args.id);
		if (board === null || board.userId !== user._id)
			throw new Error('Board not found');

		const password = generateRandom(PASSWORD_LENGTH, PASSWORD_CHARS);
		const passwordHash = await hashPassword(password);

		await ctx.db.patch(args.id, {
			passwordHash,
			updatedAt: Date.now()
		});

		return { password };
	}
});

/** Toggle a board's active state. */
export const toggleActive = mutation({
	args: { id: v.id('boards') },
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const board = await ctx.db.get(args.id);
		if (board === null || board.userId !== user._id)
			throw new Error('Board not found');

		await ctx.db.patch(args.id, {
			isActive: !board.isActive,
			updatedAt: Date.now()
		});
	}
});

/** Delete a board and all its comments and messages. */
export const remove = mutation({
	args: { id: v.id('boards') },
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const board = await ctx.db.get(args.id);
		if (board === null || board.userId !== user._id)
			throw new Error('Board not found');

		// Delete all comments for this board and decrement task counters
		const comments = await ctx.db
			.query('boardComments')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.id))
			.collect();

		// Group comment counts by taskId for efficient patching
		const taskCommentCounts = new Map<string, number>();
		for (const comment of comments) {
			taskCommentCounts.set(
				comment.taskId,
				(taskCommentCounts.get(comment.taskId) ?? 0) + 1
			);
		}

		for (const comment of comments) {
			await ctx.db.delete(comment._id);
		}

		// Decrement boardCommentCount on each affected task
		for (const [taskId, count] of taskCommentCounts) {
			const task = await ctx.db.get(taskId as Id<'tasks'>);
			if (task) {
				const newCount = Math.max(0, (task.boardCommentCount ?? 0) - count);
				await ctx.db.patch(task._id, { boardCommentCount: newCount });
			}
		}

		// Delete all chat messages for this board
		const messages = await ctx.db
			.query('boardMessages')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.id))
			.collect();
		for (const message of messages) {
			await ctx.db.delete(message._id);
		}

		await ctx.db.delete(args.id);
	}
});

/** Mark all board comments on a task as seen (resets the unseen badge). */
export const markTaskCommentsSeen = mutation({
	args: { taskId: v.id('tasks') },
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const task = await ctx.db.get(args.taskId);
		if (task === null || task.userId !== user._id) return;

		const count = task.boardCommentCount ?? 0;
		if (count > 0 && count !== (task.boardCommentSeenCount ?? 0)) {
			await ctx.db.patch(args.taskId, {
				boardCommentSeenCount: count
			});
		}
	}
});

// ── Public queries (anonymous, password-validated) ─────────────────

/** Validate password and return board metadata + filtered tasks. */
export const publicGetBySlug = query({
	args: {
		slug: v.string(),
		password: v.string()
	},
	handler: async (ctx, args) => {
		const board = await validateBoardAccess(ctx, args.slug, args.password);

		const tasks = await fetchBoardTasks(ctx, board);

		// Fetch all priority tags for this user (so the UI can show the selector)
		const allTags = await ctx.db
			.query('tags')
			.withIndex('by_userId', (q) => q.eq('userId', board.userId))
			.collect();
		const priorityTags = allTags
			.filter((t) => t.type === 'priority')
			.sort((a, b) => a.name.localeCompare(b.name));

		return {
			board: {
				_id: board._id,
				name: board.name
			},
			tasks,
			priorityTags
		};
	}
});

/** Get comments for a specific task on a public board. */
export const publicGetComments = query({
	args: {
		slug: v.string(),
		password: v.string(),
		taskId: v.id('tasks')
	},
	handler: async (ctx, args) => {
		const board = await validateBoardAccess(ctx, args.slug, args.password);

		return await ctx.db
			.query('boardComments')
			.withIndex('by_boardId_taskId', (q) =>
				q.eq('boardId', board._id).eq('taskId', args.taskId)
			)
			.collect();
	}
});

// ── Public mutations (anonymous, password-validated) ───────────────

/** Add a comment to a task on a public board. */
export const publicAddComment = mutation({
	args: {
		slug: v.string(),
		password: v.string(),
		taskId: v.id('tasks'),
		authorName: v.string(),
		content: v.string()
	},
	handler: async (ctx, args) => {
		const board = await validateBoardAccess(ctx, args.slug, args.password);

		// Verify the task exists, belongs to the board owner, and matches the filter
		const task = await ctx.db.get(args.taskId);
		if (task === null || task.userId !== board.userId)
			throw new Error('Task not found');
		if (!taskMatchesBoardFilter(task, board))
			throw new Error('Task is not on this board');

		const authorName = args.authorName.trim();
		if (authorName.length === 0) throw new Error('Author name cannot be empty');
		const content = args.content.trim();
		if (content.length === 0) throw new Error('Comment cannot be empty');

		await ctx.db.insert('boardComments', {
			boardId: board._id,
			taskId: args.taskId,
			authorName,
			content,
			createdAt: Date.now()
		});

		// Increment the denormalized comment counter on the task
		await ctx.db.patch(args.taskId, {
			boardCommentCount: (task.boardCommentCount ?? 0) + 1
		});
	}
});

/**
 * Change a task's priority tag on a public board.
 *
 * Swaps the old priority tag for a new one in both the task's
 * `tagIds` array and `rawContent` markdown. If the task has no
 * existing priority tag, the new one is appended.
 */
export const publicSetPriority = mutation({
	args: {
		slug: v.string(),
		password: v.string(),
		taskId: v.id('tasks'),
		/** The new priority tag ID to set (must be type "priority"). */
		priorityTagId: v.id('tags'),
		/** The old priority tag ID to remove (if any). */
		oldPriorityTagId: v.optional(v.id('tags'))
	},
	handler: async (ctx, args) => {
		const board = await validateBoardAccess(ctx, args.slug, args.password);

		// Verify the task exists, belongs to the board owner, and matches the filter
		const task = await ctx.db.get(args.taskId);
		if (task === null || task.userId !== board.userId)
			throw new Error('Task not found');
		if (!taskMatchesBoardFilter(task, board))
			throw new Error('Task is not on this board');

		// Verify the new priority tag exists, belongs to the owner, and is a priority tag
		const newTag = await ctx.db.get(args.priorityTagId);
		if (
			newTag === null ||
			newTag.userId !== board.userId ||
			newTag.type !== 'priority'
		)
			throw new Error('Invalid priority tag');

		// Compute existing priority tags from the task's actual tagIds (don't trust client)
		let rawContent = task.rawContent;
		for (const existingTagId of task.tagIds) {
			const existingTag = await ctx.db.get(existingTagId);
			if (
				existingTag !== null &&
				existingTag.userId === board.userId &&
				existingTag.type === 'priority'
			) {
				rawContent = removeTagFromContent(rawContent, existingTag.name);
			}
		}

		// Add new priority tag if not already present
		if (!hasTag(rawContent, newTag.name)) {
			rawContent = appendTag(rawContent, newTag.name);
		}

		// Re-parse the updated content
		const tz = await getUserTimezone(ctx, board.userId);
		const parsed = parseTask(rawContent, tz);
		const tagIds = await Promise.all(
			parsed.tags.map((name) => getOrCreateTag(ctx, name, board.userId))
		);

		await ctx.db.patch(args.taskId, {
			rawContent,
			title: parsed.title,
			dueDate: parsed.dueDate ?? undefined,
			tagIds,
			updatedAt: Date.now()
		});
	}
});

// ── Public query: check if a board slug exists (no password needed) ─

/** Check if a board slug exists and is active. No password needed. */
export const checkSlug = query({
	args: { slug: v.string() },
	handler: async (ctx, args) => {
		const board = await getBoardBySlug(ctx, args.slug);
		if (!board) return { exists: false, name: null, inactive: false };
		return {
			exists: true,
			name: board.name,
			inactive: !board.isActive
		};
	}
});

// ── String manipulation helpers ────────────────────────────────────

/**
 * Remove a `+tagname` token from markdown content.
 * Matches the same logic used in tags.ts removeTagToken.
 */
function removeTagFromContent(markdown: string, tagName: string): string {
	const normalizedTarget = tagName.toLowerCase();
	const result: string[] = [];
	let i = 0;

	while (i < markdown.length) {
		const atBoundary = i === 0 || /\s/.test(markdown[i - 1]);
		if (atBoundary && markdown[i] === '+') {
			const nameStart = i + 1;
			let nameEnd = nameStart;
			while (
				nameEnd < markdown.length &&
				/[a-zA-Z0-9_-]/.test(markdown[nameEnd])
			) {
				nameEnd++;
			}

			if (nameEnd > nameStart) {
				const name = markdown.slice(nameStart, nameEnd).toLowerCase();
				if (name === normalizedTarget) {
					// Skip trailing space
					if (nameEnd < markdown.length && markdown[nameEnd] === ' ') {
						nameEnd++;
					}
					i = nameEnd;
					continue;
				}
			}
		}

		result.push(markdown[i]);
		i++;
	}

	return result.join('');
}

/** Check if a `+tagname` token exists in markdown. */
function hasTag(markdown: string, tagName: string): boolean {
	const normalized = tagName.toLowerCase();
	let i = 0;

	while (i < markdown.length) {
		const atBoundary = i === 0 || /\s/.test(markdown[i - 1]);
		if (atBoundary && markdown[i] === '+') {
			const nameStart = i + 1;
			let nameEnd = nameStart;
			while (
				nameEnd < markdown.length &&
				/[a-zA-Z0-9_-]/.test(markdown[nameEnd])
			) {
				nameEnd++;
			}

			if (nameEnd > nameStart) {
				const name = markdown.slice(nameStart, nameEnd).toLowerCase();
				if (name === normalized) return true;
			}
		}
		i++;
	}

	return false;
}

/** Append a `+tagname` token to the end of the first line of markdown. */
function appendTag(markdown: string, tagName: string): string {
	const newlineIdx = markdown.indexOf('\n');
	if (newlineIdx === -1) {
		// Single line — append at the end
		return `${markdown} +${tagName}`;
	}
	// Multi-line — insert before the first newline
	const firstLine = markdown.slice(0, newlineIdx);
	const rest = markdown.slice(newlineIdx);
	return `${firstLine} +${tagName}${rest}`;
}

// ── Board chat messages (authenticated, owner) ────────────────────

/** Get all chat messages for a board (owner view, real-time). */
export const getMessages = query({
	args: { boardId: v.id('boards') },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];

		const board = await ctx.db.get(args.boardId);
		if (board === null || board.userId !== user._id) return [];

		const messages = await ctx.db
			.query('boardMessages')
			.withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
			.collect();

		return messages.sort((a, b) => a.createdAt - b.createdAt);
	}
});

/** Send a chat message as the board owner. */
export const sendMessage = mutation({
	args: {
		boardId: v.id('boards'),
		content: v.string()
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const board = await ctx.db.get(args.boardId);
		if (board === null || board.userId !== user._id)
			throw new Error('Board not found');

		const content = args.content.trim();
		if (content.length === 0) throw new Error('Message cannot be empty');

		await ctx.db.insert('boardMessages', {
			boardId: args.boardId,
			authorType: 'owner',
			authorName: user.name ?? 'owner',
			content,
			createdAt: Date.now()
		});
	}
});

// ── Board chat messages (public, password-validated) ──────────────

/** Get all chat messages for a public board (real-time subscription). */
export const publicGetMessages = query({
	args: {
		slug: v.string(),
		password: v.string()
	},
	handler: async (ctx, args) => {
		const board = await validateBoardAccess(ctx, args.slug, args.password);

		const messages = await ctx.db
			.query('boardMessages')
			.withIndex('by_boardId', (q) => q.eq('boardId', board._id))
			.collect();

		return messages.sort((a, b) => a.createdAt - b.createdAt);
	}
});

/** Send a chat message as an external collaborator. */
export const publicSendMessage = mutation({
	args: {
		slug: v.string(),
		password: v.string(),
		authorName: v.string(),
		content: v.string()
	},
	handler: async (ctx, args) => {
		const board = await validateBoardAccess(ctx, args.slug, args.password);

		const authorName = args.authorName.trim();
		if (authorName.length === 0) throw new Error('Author name cannot be empty');
		const content = args.content.trim();
		if (content.length === 0) throw new Error('Message cannot be empty');

		await ctx.db.insert('boardMessages', {
			boardId: board._id,
			authorType: 'collaborator',
			authorName,
			content,
			createdAt: Date.now()
		});
	}
});

// ── Active session indicator (public, password-validated) ─────────

/**
 * Check if the board owner has an active session whose tags overlap
 * with the board's filter tags. Returns safe-to-expose session info
 * or null if no matching active session.
 */
export const publicGetActiveSession = query({
	args: {
		slug: v.string(),
		password: v.string()
	},
	handler: async (ctx, args) => {
		const board = await validateBoardAccess(ctx, args.slug, args.password);

		const session = await getActiveSession(ctx, board.userId);
		if (session === null) return null;

		// Check if the session shares at least one tag with the board's filter tags
		const boardTagIds = board.filter.tagIds ?? [];
		if (boardTagIds.length === 0) {
			// Board has no tag filter — show any active session
			return {
				description: session.description ?? null,
				startTime: session.startTime
			};
		}

		const hasOverlap = session.tagIds.some((tagId) =>
			boardTagIds.includes(tagId)
		);
		if (!hasOverlap) return null;

		return {
			description: session.description ?? null,
			startTime: session.startTime
		};
	}
});
