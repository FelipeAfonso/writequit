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

// ── Data migration from prod snapshot ──────────────────────────────

/**
 * Import data from the old user (REDACTED_USER_ID)
 * into a target user. Creates tags, tasks, sessions, and settings
 * with remapped IDs.
 *
 * Run via: bunx convex run admin:migrateData '{"targetUserId":"REDACTED_USER_ID_2"}'
 */
export const migrateData = internalMutation({
	args: { targetUserId: v.id('users') },
	handler: async (ctx, args) => {
		const userId = args.targetUserId;

		// Verify target user exists
		const targetUser = await ctx.db.get(userId);
		if (!targetUser) throw new Error('Target user not found');

		// ── 1. Create tags (old ID → new ID mapping) ──────────────
		const OLD_TAGS = [
			{
				oldId: 'k5708e46qthzdqnbfdh8jagstd80mqvc',
				name: 'affinity_integration',
				type: 'category'
			},
			{
				oldId: 'k571tdxazyeypmjv4ehej06tz180nwra',
				name: 'p1',
				type: 'priority'
			},
			{
				oldId: 'k572cyqr1heak9dta144vf6vyn80negr',
				name: 'p0',
				type: 'priority'
			},
			{
				oldId: 'k572ew5qkw4saww2vqg7e0yem180msmb',
				name: 'niterra',
				type: 'project'
			},
			{
				oldId: 'k574rvxa13f0smpffqc9v1w0bn80n3se',
				name: 'companies',
				type: 'category'
			},
			{
				oldId: 'k575feb3hm2w3n1gr4zcb62bt180n0pz',
				name: 'life',
				type: 'project'
			},
			{
				oldId: 'k5769vxv2ta2cj15zp5r1nrvd180nvke',
				name: 'website',
				type: 'category'
			},
			{
				oldId: 'k5776rbvt6babd09t92yv6gh4h80mb7v',
				name: 'reports',
				type: 'category'
			},
			{
				oldId: 'k577xng6nj90yj8s5cr859j61h80m7vt',
				name: 'expenditures',
				type: 'category'
			},
			{
				oldId: 'k5785dh55madtbvh9xvaafb0p980m5a8',
				name: 'p3',
				type: 'priority'
			},
			{
				oldId: 'k579z1zgnzfmt30m14xk3h6y3580n0g7',
				name: 'writequit',
				type: 'project'
			},
			{
				oldId: 'k57bhxzv9vxzq6ypr8zd33379980nbj2',
				name: 'infrastructure',
				type: 'category'
			},
			{
				oldId: 'k57eqf7sc12kr6p9gsvj3qt57s80m98h',
				name: 'p2',
				type: 'priority'
			}
		] as const;

		const tagMap = new Map<string, Id<'tags'>>();

		for (const tag of OLD_TAGS) {
			const newId = await ctx.db.insert('tags', {
				name: tag.name,
				type: tag.type,
				userId,
				createdAt: Date.now()
			});
			tagMap.set(tag.oldId, newId);
		}

		// Helper to remap tag IDs
		function remapTags(oldIds: string[]): Id<'tags'>[] {
			return oldIds
				.map((id) => tagMap.get(id))
				.filter((id): id is Id<'tags'> => id !== undefined);
		}

		// ── 2. Create tasks (old ID → new ID mapping) ─────────────
		const OLD_TASKS = [
			{
				oldId: 'k972df3zpdj3daysg6tzana5b180n4f8',
				rawContent:
					'# Fix the goddamn pool\n\nThat fucking contractor never replied, I need to do something about it\n\n+life +p1',
				title: 'Fix the goddamn pool',
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k575feb3hm2w3n1gr4zcb62bt180n0pz',
					'k571tdxazyeypmjv4ehej06tz180nwra'
				],
				createdAt: 1770348513920,
				updatedAt: 1770348513920
			},
			{
				oldId: 'k9737yr8n5j7ptg3gmnx8ayq5h80m7yj',
				rawContent:
					'# Sort tags\n\nTags should be sortable in the tags page, and that should reflect in the tasks page. Maybe also do a pre sorting by tag type\n\nMaybe while at it add tag page navigation properly\n\n+writequit +p2',
				title: 'Sort tags',
				status: 'done' as const,
				statusPriority: 2,
				tagIds: [
					'k579z1zgnzfmt30m14xk3h6y3580n0g7',
					'k57eqf7sc12kr6p9gsvj3qt57s80m98h'
				],
				createdAt: 1770348096969,
				updatedAt: 1770438392932,
				completedAt: 1770438392932
			},
			{
				oldId: 'k974h8rkdadf88se7naedw58c180ny6x',
				rawContent:
					"# Create Integration for Sebastian\n\nDuring our meeting Sebastian shown his prototype to make due dilligence on companies using AI. We can pipe his work into our Affinity and sync it with David's List too\n\nI should send him a follow up this monday.\n\n+niterra +affinity_integration +p1",
				title: 'Create Integration for Sebastian',
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k572ew5qkw4saww2vqg7e0yem180msmb',
					'k5708e46qthzdqnbfdh8jagstd80mqvc',
					'k571tdxazyeypmjv4ehej06tz180nwra'
				],
				createdAt: 1770421369382,
				updatedAt: 1770434592840
			},
			{
				oldId: 'k975g63z2bepxfrh8x1p3600px80n605',
				rawContent:
					"# Resize Logos\n\nThe Japanese complained about the Logo's alignement, do something about it\n\n+niterra +companies +p2",
				title: 'Resize Logos',
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k572ew5qkw4saww2vqg7e0yem180msmb',
					'k574rvxa13f0smpffqc9v1w0bn80n3se',
					'k57eqf7sc12kr6p9gsvj3qt57s80m98h'
				],
				createdAt: 1770346081556,
				updatedAt: 1770346081556
			},
			{
				oldId: 'k975hc4ex35d21s6rb26x7fznx80nhsh',
				rawContent:
					"# Fix due date issues\n\nfor some reason relative dates is misbehaving now, it might be the server time update I did, or it's just slop, needs investigation\n\n+writequit +p1",
				title: 'Fix due date issues',
				status: 'done' as const,
				statusPriority: 2,
				tagIds: [
					'k579z1zgnzfmt30m14xk3h6y3580n0g7',
					'k571tdxazyeypmjv4ehej06tz180nwra'
				],
				createdAt: 1770347915810,
				updatedAt: 1770439352725,
				completedAt: 1770439352725
			},
			{
				oldId: 'k975skmjjj7ta7vb2s30kb76fs80nh80',
				rawContent:
					"# Fix Data Import\n\nGerry sent a CSV that he tried to upload and it's misbehaving. Fix it eventually. He sent this email on the feb 05\n\n+niterra +reports +p2",
				title: 'Fix Data Import',
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k572ew5qkw4saww2vqg7e0yem180msmb',
					'k5776rbvt6babd09t92yv6gh4h80mb7v',
					'k57eqf7sc12kr6p9gsvj3qt57s80m98h'
				],
				createdAt: 1770345403692,
				updatedAt: 1770501418487
			},
			{
				oldId: 'k976yyhbbghbnpg2a415pnjjgx80mhsq',
				rawContent: '# Auto add # to start of new tasks\n\n+writequit +p2',
				title: 'Auto add # to start of new tasks',
				status: 'done' as const,
				statusPriority: 2,
				tagIds: [
					'k579z1zgnzfmt30m14xk3h6y3580n0g7',
					'k57eqf7sc12kr6p9gsvj3qt57s80m98h'
				],
				createdAt: 1770348004759,
				updatedAt: 1770437487446,
				completedAt: 1770437487446
			},
			{
				oldId: 'k977c3ht0frgny77wncsv2v84s80nme8',
				rawContent:
					"# Expenditures Tool\n\nComplete the remaining integration and development.\n\nKeep in mind Gerry's note on 02/05 - To add sorting to the expenditures items.\n\n+niterra +expenditures +p1 due:2026-02-12",
				title: 'Expenditures Tool',
				status: 'inbox' as const,
				statusPriority: 1,
				dueDate: 1770606000000,
				tagIds: [
					'k572ew5qkw4saww2vqg7e0yem180msmb',
					'k577xng6nj90yj8s5cr859j61h80m7vt',
					'k571tdxazyeypmjv4ehej06tz180nwra'
				],
				createdAt: 1770338699943,
				updatedAt: 1770345238165
			},
			{
				oldId: 'k977hbjvhc67hcpkdaba02v8ns80m649',
				rawContent: '# Email Verification\n\n+writequit +p0',
				title: 'Email Verification',
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k579z1zgnzfmt30m14xk3h6y3580n0g7',
					'k572cyqr1heak9dta144vf6vyn80negr'
				],
				createdAt: 1770382525684,
				updatedAt: 1770409495533
			},
			{
				oldId: 'k977qcyg563fvpfbpcjsq4xe0580ms89',
				rawContent:
					'# Auto Complete Tags\n\nShould be able to use the LSP/Auto complete features from code mirror to add in the suggestions of tags.\n\n+writequit +p1',
				title: 'Auto Complete Tags',
				status: 'done' as const,
				statusPriority: 2,
				tagIds: [
					'k579z1zgnzfmt30m14xk3h6y3580n0g7',
					'k571tdxazyeypmjv4ehej06tz180nwra'
				],
				createdAt: 1770381971050,
				updatedAt: 1770436773662,
				completedAt: 1770436773662
			},
			{
				oldId: 'k978axczqcvsr0kcbb2c10yn6s80mgv1',
				rawContent:
					"# Revenue Analysis\n\nImprove the companies dashboard with the Revenue Analysis' new datapoints. Check out Gerry's email at Feb 3\n\n+niterra +companies +p2",
				title: 'Revenue Analysis',
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k572ew5qkw4saww2vqg7e0yem180msmb',
					'k574rvxa13f0smpffqc9v1w0bn80n3se',
					'k57eqf7sc12kr6p9gsvj3qt57s80m98h'
				],
				createdAt: 1770346227368,
				updatedAt: 1770346227368
			},
			{
				oldId: 'k978te183kv7tew8r639cfmr9180mz01',
				rawContent:
					"# Niterra's Website SEO\n\nAparently the designer for the website is having issues with SEO. Here's her message:\n\n> Our last step before going live is to setting up our SEO & AEO for each page. For AEO, I'll use Webflow's schema generator but, I need someone who knows Javascript to check it and make sure the code & the page's content is 100% match.\n\nShould be a quick fix, but will have to investigate Webflow to see what is happening.\n\n## Update 02/06\n\nBahar is not going to need this right now, so I should wait for her follow up before getting involved.\n\n+niterra +website +p2",
				title: "Niterra's Website SEO",
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k572ew5qkw4saww2vqg7e0yem180msmb',
					'k5769vxv2ta2cj15zp5r1nrvd180nvke',
					'k57eqf7sc12kr6p9gsvj3qt57s80m98h'
				],
				createdAt: 1770345871100,
				updatedAt: 1770421716161
			},
			{
				oldId: 'k979q73q3pndrmcmd5rdyynxbn80nh24',
				rawContent:
					'# Test Reports\n\nRight now reports are completely untested, I need to start logging at least a day or two so i can have data to test it.\n\n+writequit +p2',
				title: 'Test Reports',
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k579z1zgnzfmt30m14xk3h6y3580n0g7',
					'k57eqf7sc12kr6p9gsvj3qt57s80m98h'
				],
				createdAt: 1770347972464,
				updatedAt: 1770347972464
			},
			{
				oldId: 'k97a5npw3tbm6e6ejqe447epwd80m78h',
				rawContent:
					"# Pay bills\n\nI'm probably getting paid soon, so finish paying stuff. \n\n+life +p0",
				title: 'Pay bills',
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k575feb3hm2w3n1gr4zcb62bt180n0pz',
					'k572cyqr1heak9dta144vf6vyn80negr'
				],
				createdAt: 1770348344037,
				updatedAt: 1770348344037
			},
			{
				oldId: 'k97a71g18fjpej3x2n0rmjwc2s80n38x',
				rawContent:
					"# Radar Integration\n\nDavid had a follow up to theorize the next steps. \n\nI'm planning on creating a CRUD for him to interact with the Affinity without hassle.\n\n+niterra +affinity_integration +p1 due:2026-02-07",
				title: 'Radar Integration',
				status: 'done' as const,
				statusPriority: 2,
				dueDate: 1770433200000,
				tagIds: [
					'k572ew5qkw4saww2vqg7e0yem180msmb',
					'k5708e46qthzdqnbfdh8jagstd80mqvc',
					'k571tdxazyeypmjv4ehej06tz180nwra'
				],
				createdAt: 1770345715596,
				updatedAt: 1770421081045,
				completedAt: 1770421081045
			},
			{
				oldId: 'k97b667qmht40gh371v5nmktps80qk2m',
				rawContent:
					'# Tutorial\n\nWQ needs a basic tutorial feature to go through the basics of its usage\n\n+writequit +p1',
				title: 'Tutorial',
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k579z1zgnzfmt30m14xk3h6y3580n0g7',
					'k571tdxazyeypmjv4ehej06tz180nwra'
				],
				createdAt: 1770481782631,
				updatedAt: 1770481782631
			},
			{
				oldId: 'k97b9cqy56z88dxa6myb501b6d80nwt4',
				rawContent:
					'# Rent Contract Renewal\n\nI need to go on a quest of printing the contract, signing and notaring it, then sending it to my mother and father to notary it too. \n\n+life +p1',
				title: 'Rent Contract Renewal',
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k575feb3hm2w3n1gr4zcb62bt180n0pz',
					'k571tdxazyeypmjv4ehej06tz180nwra'
				],
				createdAt: 1770348684810,
				updatedAt: 1770348684810
			},
			{
				oldId: 'k97d0kpwsrg3jeh5x8bh6jthjh80m1gt',
				rawContent:
					"# Company's MD Editor\n\nUse a MD/Rich Text editor to create another pdf page to be coupled to the dashboard exports. This will be complementary to the information aggregated from the data.\n\n+niterra +companies +p2",
				title: "Company's MD Editor",
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k572ew5qkw4saww2vqg7e0yem180msmb',
					'k574rvxa13f0smpffqc9v1w0bn80n3se',
					'k57eqf7sc12kr6p9gsvj3qt57s80m98h'
				],
				createdAt: 1770346366455,
				updatedAt: 1770346403808
			},
			{
				oldId: 'k97dghtp9zv8ke623s5pztsh8180mcsb',
				rawContent:
					'# Active on top\n\nWhen using the all view in the tasks page, show the active tasks on the top of the page, and the done at the bottom.\n\n+writequit +p1',
				title: 'Active on top',
				status: 'done' as const,
				statusPriority: 2,
				tagIds: [
					'k579z1zgnzfmt30m14xk3h6y3580n0g7',
					'k571tdxazyeypmjv4ehej06tz180nwra'
				],
				createdAt: 1770348176822,
				updatedAt: 1770438371801,
				completedAt: 1770438371801
			},
			{
				oldId: 'k97f1epcxrysj611y2j112xf9180npzz',
				rawContent:
					"# Sidebar Groups\n\nThe sidebar is getting out of hand, use ShadCN's sidebar features to make it easier to navigate\n\n+niterra +infrastructure +p3",
				title: 'Sidebar Groups',
				status: 'inbox' as const,
				statusPriority: 1,
				tagIds: [
					'k572ew5qkw4saww2vqg7e0yem180msmb',
					'k57bhxzv9vxzq6ypr8zd33379980nbj2',
					'k5785dh55madtbvh9xvaafb0p980m5a8'
				],
				createdAt: 1770346003504,
				updatedAt: 1770346003504
			}
		];

		const taskMap = new Map<string, Id<'tasks'>>();

		for (const task of OLD_TASKS) {
			const newId = await ctx.db.insert('tasks', {
				rawContent: task.rawContent,
				title: task.title,
				status: task.status,
				statusPriority: task.statusPriority,
				tagIds: remapTags(task.tagIds),
				userId,
				createdAt: task.createdAt,
				updatedAt: task.updatedAt,
				dueDate: task.dueDate,
				completedAt: task.completedAt
			});
			taskMap.set(task.oldId, newId);
		}

		// ── 3. Create session ─────────────────────────────────────
		// Only one session belonged to this user
		const sessionTagIds = remapTags(['k575feb3hm2w3n1gr4zcb62bt180n0pz']);
		await ctx.db.insert('sessions', {
			startTime: 1770348716545,
			endTime: 1770348753951,
			description: 'test',
			tagIds: sessionTagIds,
			taskIds: [],
			userId,
			createdAt: 1770348716545,
			updatedAt: 1770348753951
		});

		// ── 4. Create user settings ───────────────────────────────
		const existingSettings = await ctx.db
			.query('userSettings')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.unique();

		if (!existingSettings) {
			await ctx.db.insert('userSettings', {
				userId,
				viMode: true,
				defaultStatusFilter: 'lastUsed',
				defaultTagFilter: 'lastUsed',
				timezone: 'America/Sao_Paulo',
				autoLinkMode: 'scoped'
			});
		}

		return {
			tags: OLD_TAGS.length,
			tasks: OLD_TASKS.length,
			sessions: 1,
			settings: existingSettings ? 'skipped (exists)' : 'created'
		};
	}
});
