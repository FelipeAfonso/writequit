import { query, mutation, internalMutation } from './_generated/server';
import { getCurrentUser, getCurrentUserOrThrow } from './users.js';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { v } from 'convex/values';

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Verify the current user is an admin. Throws if not authenticated
 * or not an admin. Returns the userId for convenience.
 */
async function requireAdmin(ctx: MutationCtx): Promise<Id<'users'>> {
	const user = await getCurrentUserOrThrow(ctx);

	if (user.role !== 'admin') {
		throw new Error('Forbidden: admin access required');
	}

	return user._id;
}

// ── Queries ────────────────────────────────────────────────────────

/** Check whether the current user has admin role. */
export const isAdmin = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		console.log('user', user);
		if (user === null) return false;

		return user.role === 'admin';
	}
});

// ── Seed data definitions ──────────────────────────────────────────

const SEED_TAGS = [
	{ name: 'backend', type: 'project', color: '#7aa2f7' },
	{ name: 'frontend', type: 'project', color: '#bb9af7' },
	{ name: 'api', type: 'project', color: '#7dcfff' },
	{ name: 'urgent', type: 'priority', color: '#f7768e' },
	{ name: 'bugfix', type: 'category', color: '#ff9e64' },
	{ name: 'design', type: 'category', color: '#9ece6a' },
	{ name: 'devops', type: 'context', color: '#e0af68' },
	{ name: 'refactor', type: 'category', color: '#73daca' },
	{ name: 'testing', type: 'context', color: '#2ac3de' },
	{ name: 'docs', type: 'category', color: '#c0caf5' }
] as const;

interface SeedTask {
	title: string;
	rawContent: string;
	status: 'inbox' | 'active' | 'done';
	tags: readonly string[];
}

const SEED_TASKS: SeedTask[] = [
	{
		title: 'Set up PostgreSQL connection pooling',
		rawContent: 'Set up PostgreSQL connection pooling +backend +api',
		status: 'active',
		tags: ['backend', 'api']
	},
	{
		title: 'Fix CORS headers for staging environment',
		rawContent: 'Fix CORS headers for staging environment +bugfix +api',
		status: 'done',
		tags: ['bugfix', 'api']
	},
	{
		title: 'Implement dark mode toggle component',
		rawContent: 'Implement dark mode toggle component +frontend +design',
		status: 'inbox',
		tags: ['frontend', 'design']
	},
	{
		title: 'Write API documentation for auth endpoints',
		rawContent: 'Write API documentation for auth endpoints +docs +api',
		status: 'active',
		tags: ['docs', 'api']
	},
	{
		title: 'Refactor user service to use repository pattern',
		rawContent:
			'Refactor user service to use repository pattern +refactor +backend',
		status: 'active',
		tags: ['refactor', 'backend']
	},
	{
		title: 'Set up CI/CD pipeline for staging',
		rawContent: 'Set up CI/CD pipeline for staging +devops',
		status: 'done',
		tags: ['devops']
	},
	{
		title: 'Add unit tests for payment module',
		rawContent: 'Add unit tests for payment module +testing +backend',
		status: 'inbox',
		tags: ['testing', 'backend']
	},
	{
		title: 'Design invoice PDF template',
		rawContent: 'Design invoice PDF template +design +frontend',
		status: 'active',
		tags: ['design', 'frontend']
	},
	{
		title: 'Migrate Redis cache to cluster mode',
		rawContent: 'Migrate Redis cache to cluster mode +devops +backend',
		status: 'inbox',
		tags: ['devops', 'backend']
	},
	{
		title: 'Fix timezone bug in session duration calc',
		rawContent: 'Fix timezone bug in session duration calc +bugfix +backend',
		status: 'done',
		tags: ['bugfix', 'backend']
	},
	{
		title: 'Implement drag-and-drop task reordering',
		rawContent: 'Implement drag-and-drop task reordering +frontend +refactor',
		status: 'inbox',
		tags: ['frontend', 'refactor']
	},
	{
		title: 'Add rate limiting to public API',
		rawContent: 'Add rate limiting to public API +api +backend +urgent',
		status: 'active',
		tags: ['api', 'backend', 'urgent']
	},
	{
		title: 'Write integration tests for OAuth flow',
		rawContent: 'Write integration tests for OAuth flow +testing +api',
		status: 'inbox',
		tags: ['testing', 'api']
	},
	{
		title: 'Update onboarding walkthrough copy',
		rawContent: 'Update onboarding walkthrough copy +docs +design',
		status: 'done',
		tags: ['docs', 'design']
	},
	{
		title: 'Optimize Docker image size for production',
		rawContent: 'Optimize Docker image size for production +devops',
		status: 'active',
		tags: ['devops']
	},
	{
		title: 'Fix mobile nav overflow on small screens',
		rawContent: 'Fix mobile nav overflow on small screens +bugfix +frontend',
		status: 'done',
		tags: ['bugfix', 'frontend']
	},
	{
		title: 'Add webhook retry logic with exponential backoff',
		rawContent:
			'Add webhook retry logic with exponential backoff +backend +api',
		status: 'inbox',
		tags: ['backend', 'api']
	},
	{
		title: 'Create component storybook for design system',
		rawContent: 'Create component storybook for design system +frontend +docs',
		status: 'inbox',
		tags: ['frontend', 'docs']
	},
	{
		title: 'Refactor database queries to use prepared statements',
		rawContent:
			'Refactor database queries to use prepared statements +refactor +backend',
		status: 'active',
		tags: ['refactor', 'backend']
	},
	{
		title: 'Set up error tracking with Sentry',
		rawContent: 'Set up error tracking with Sentry +devops +urgent',
		status: 'active',
		tags: ['devops', 'urgent']
	}
];

const SESSION_DESCRIPTIONS = [
	'Deep work on API endpoints',
	'Bug triage and fixes',
	'Frontend polish session',
	'Code review and refactoring',
	'Infrastructure and DevOps',
	'Documentation sprint',
	'Testing and QA',
	'Design implementation',
	'Performance optimization',
	'Planning and architecture'
];

// Which tags each session uses (by index into SEED_TAGS)
const SESSION_TAG_SETS: readonly (readonly string[])[] = [
	['backend', 'api'],
	['bugfix', 'backend'],
	['frontend', 'design'],
	['refactor', 'backend'],
	['devops'],
	['docs', 'api'],
	['testing', 'backend'],
	['frontend', 'design'],
	['backend', 'api', 'refactor'],
	['devops', 'backend']
];

// ── Mutations ──────────────────────────────────────────────────────

/** Seed demo data for the current admin user. Clears existing data first. */
export const seedData = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await requireAdmin(ctx);

		// ── 1. Clear existing user data ────────────────────────────
		const existingSessions = await ctx.db
			.query('sessions')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.collect();
		for (const s of existingSessions) {
			await ctx.db.delete(s._id);
		}

		const existingTasks = await ctx.db
			.query('tasks')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.collect();
		for (const t of existingTasks) {
			await ctx.db.delete(t._id);
		}

		const existingTags = await ctx.db
			.query('tags')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.collect();
		for (const t of existingTags) {
			await ctx.db.delete(t._id);
		}

		// ── 2. Create tags ─────────────────────────────────────────
		const tagMap = new Map<string, Id<'tags'>>();

		for (const tag of SEED_TAGS) {
			const id = await ctx.db.insert('tags', {
				name: tag.name,
				type: tag.type,
				color: tag.color,
				userId,
				createdAt: Date.now()
			});
			tagMap.set(tag.name, id);
		}

		// ── 3. Create tasks ────────────────────────────────────────
		const STATUS_PRIORITY: Record<string, number> = {
			active: 0,
			inbox: 1,
			done: 2
		};

		const now = Date.now();
		const taskIds: Id<'tasks'>[] = [];

		for (let i = 0; i < SEED_TASKS.length; i++) {
			const task = SEED_TASKS[i];
			const tagIds = task.tags
				.map((name) => tagMap.get(name))
				.filter((id): id is Id<'tags'> => id !== undefined);

			// Spread creation times across the last 7 days
			const createdAt = now - (SEED_TASKS.length - i) * 3 * 60 * 60 * 1000;
			const isDone = task.status === 'done';

			const id = await ctx.db.insert('tasks', {
				rawContent: task.rawContent,
				title: task.title,
				status: task.status,
				statusPriority: STATUS_PRIORITY[task.status] ?? 9,
				tagIds,
				userId,
				createdAt,
				updatedAt: createdAt,
				completedAt: isDone ? createdAt + 2 * 60 * 60 * 1000 : undefined
			});
			taskIds.push(id);
		}

		// ── 4. Create sessions ─────────────────────────────────────
		// Spread 10 sessions across the last 7 days
		const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
		const MS_PER_HOUR = 60 * 60 * 1000;

		// Deterministic "random" seed — keeps sessions consistent
		let rngState = 42;
		function nextRng(): number {
			rngState = (rngState * 1664525 + 1013904223) & 0x7fffffff;
			return rngState / 0x7fffffff;
		}

		let sessionsCreated = 0;

		for (let i = 0; i < 10; i++) {
			// Spread across 7 days: session i is roughly at day (i * 7/10)
			const dayOffset = Math.floor((i * SEVEN_DAYS) / 10);
			// Start between 8:00 and 14:00 (8am-2pm)
			const hourOffset = (8 + Math.floor(nextRng() * 6)) * MS_PER_HOUR;
			const startTime = now - SEVEN_DAYS + dayOffset + hourOffset;

			// Duration: 2-5 hours
			const durationHours = 2 + nextRng() * 3;
			const endTime = startTime + durationHours * MS_PER_HOUR;

			const sessionTags = SESSION_TAG_SETS[i];
			const sessionTagIds = sessionTags
				.map((name) => tagMap.get(name))
				.filter((id): id is Id<'tags'> => id !== undefined);

			// Link 1-4 tasks that share at least one tag with this session
			const matchingTaskIndices = SEED_TASKS.map((t, idx) => ({
				idx,
				matches: t.tags.some((tag) => sessionTags.includes(tag))
			}))
				.filter((t) => t.matches)
				.map((t) => t.idx);

			const numTasksToLink = Math.min(
				1 + Math.floor(nextRng() * 4),
				matchingTaskIndices.length
			);

			// Pick first N matching tasks (deterministic)
			const linkedTaskIds = matchingTaskIndices
				.slice(0, numTasksToLink)
				.map((idx) => taskIds[idx]);

			await ctx.db.insert('sessions', {
				startTime,
				endTime,
				description: SESSION_DESCRIPTIONS[i],
				tagIds: sessionTagIds,
				taskIds: linkedTaskIds,
				userId,
				createdAt: startTime,
				updatedAt: endTime
			});
			sessionsCreated++;
		}

		return {
			tags: SEED_TAGS.length,
			tasks: SEED_TASKS.length,
			sessions: sessionsCreated
		};
	}
});

// ── Board expiry migration ─────────────────────────────────────────

/**
 * Remove the deprecated `expiresAt` field from all boards.
 * Run via: bunx convex run admin:removeBoardExpiry
 */
export const removeBoardExpiry = internalMutation({
	args: {},
	handler: async (ctx) => {
		const boards = await ctx.db.query('boards').collect();
		let patched = 0;
		for (const board of boards) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			if ('expiresAt' in (board as any)) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
				const { expiresAt: _, ...rest } = board as any;
				await ctx.db.replace(board._id, rest);
				patched++;
			}
		}
		return { patched, total: boards.length };
	}
});

// ── Board statusFilter → statusFilters migration ──────────────────

/**
 * Migrate boards from old single `filter.statusFilter` (string) to new
 * `filter.statusFilters` (string[]). Removes the old field after conversion.
 *
 * Run via: bunx convex run admin:migrateBoardStatusFilters
 */
export const migrateBoardStatusFilters = internalMutation({
	args: {},
	handler: async (ctx) => {
		const boards = await ctx.db.query('boards').collect();
		let patched = 0;
		for (const board of boards) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const filter = board.filter as any;
			if (filter.statusFilter !== undefined) {
				const oldValue: string = filter.statusFilter;
				// Convert single string → array, merge with any existing statusFilters
				const existing: string[] = filter.statusFilters ?? [];
				const merged = Array.from(new Set([...existing, oldValue]));
				await ctx.db.patch(board._id, {
					filter: {
						...filter,
						statusFilters: merged,
						statusFilter: undefined
					}
				});
				patched++;
			}
		}
		return { patched, total: boards.length };
	}
});

