import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	// ── Users (synced from WorkOS via client-side store mutation) ──

	users: defineTable({
		name: v.optional(v.string()),
		email: v.optional(v.string()),
		image: v.optional(v.string()),
		/** WorkOS user ID (subject claim from JWT), e.g. "user_01XXX..." */
		externalId: v.string(),
		/** User role for authorization. Set directly in the DB. */
		role: v.optional(v.union(v.literal('admin'), v.literal('user')))
	})
		.index('by_externalId', ['externalId'])
		.index('email', ['email']),

	// ── App tables ──────────────────────────────────────────────────

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
		/** Owner — references the users table. */
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
		timezone: v.optional(v.string()),
		// ── Invoice defaults (pre-fill the invoice form) ──
		/** Default "from" address for invoices. */
		invoiceFromAddress: v.optional(v.string()),
		/** Default hourly rate (in currency minor units, e.g. cents). */
		defaultHourlyRate: v.optional(v.number()),
		/** Default currency code, e.g. "USD". */
		defaultCurrency: v.optional(v.string()),
		/** Default payment terms, e.g. "Net 30". */
		defaultPaymentTerms: v.optional(v.string()),
		/** Default invoice PDF theme: "dark" or "light". */
		defaultInvoiceTheme: v.optional(
			v.union(v.literal('dark'), v.literal('light'))
		),
		/** Whether the user has completed (or skipped) the onboarding tutorial. */
		tutorialCompleted: v.optional(v.boolean()),
		/**
		 * Controls how tasks are automatically linked to sessions.
		 *   "all"       – link all active tasks (ignore tag scoping)
		 *   "scoped"    – link only tasks sharing at least one tag with the session (default)
		 *   "startOnly" – auto-link at timer start only (tag-scoped), not on status changes
		 *   "off"       – never auto-link; manual linking only
		 */
		autoLinkMode: v.optional(
			v.union(
				v.literal('all'),
				v.literal('scoped'),
				v.literal('startOnly'),
				v.literal('off')
			)
		)
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
		/**
		 * Numeric sort key derived from status: active=0, inbox=1, done=2.
		 * Kept in sync by mutations. Used by the `by_userId_statusPriority`
		 * index so paginated queries can sort by status before pagination.
		 */
		statusPriority: v.optional(v.number()),
		/** References to tag documents. */
		tagIds: v.array(v.id('tags')),
		/** Owner — references the users table. */
		userId: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.number(),
		/** Set when status transitions to "done". */
		completedAt: v.optional(v.number()),
		/** Total number of board comments on this task (denormalized counter). */
		boardCommentCount: v.optional(v.number()),
		/** Comment count the owner last saw (for unseen-comment badge). */
		boardCommentSeenCount: v.optional(v.number())
	})
		.index('by_status', ['status'])
		.index('by_userId', ['userId'])
		.index('by_status_userId', ['status', 'userId'])
		.index('by_userId_statusPriority', ['userId', 'statusPriority'])
		.index('by_dueDate', ['dueDate'])
		.searchIndex('search_content', {
			searchField: 'rawContent',
			filterFields: ['userId', 'status']
		}),

	invoices: defineTable({
		/** Sequential invoice number, e.g. "INV-001". */
		invoiceNumber: v.string(),
		/** Invoice lifecycle state. */
		status: v.union(v.literal('draft'), v.literal('sent'), v.literal('paid')),
		/** Period start (UTC ms). */
		startDate: v.number(),
		/** Period end (UTC ms). */
		endDate: v.number(),
		// ── From (your info, captured at creation) ──
		fromName: v.string(),
		fromEmail: v.string(),
		fromAddress: v.optional(v.string()),
		// ── Client info ──
		clientName: v.string(),
		clientAddress: v.optional(v.string()),
		// ── Billing ──
		/** Hourly rate as a float (e.g. 150.00). */
		hourlyRate: v.number(),
		/** Currency code, e.g. "USD". */
		currency: v.string(),
		/** Line items: session-based (hours) or custom (quantity × unitPrice). */
		lineItems: v.array(
			v.object({
				label: v.string(),
				/** Hours worked – present for session-based items. */
				hours: v.optional(v.number()),
				/** Quantity – present for custom items (e.g. 3 months). */
				quantity: v.optional(v.number()),
				/** Unit price – present for custom items (e.g. $15/mo). */
				unitPrice: v.optional(v.number()),
				/** Line total (hours × rate, or quantity × unitPrice). */
				amount: v.number()
			})
		),
		/** Sum of all line item amounts. */
		subtotal: v.number(),
		/** Final total (same as subtotal for now, room for tax later). */
		total: v.number(),
		/** e.g. "Net 30", "Due on receipt". */
		paymentTerms: v.optional(v.string()),
		/** Due date (UTC ms). */
		dueDate: v.optional(v.number()),
		/** Free-form notes. */
		notes: v.optional(v.string()),
		/** Owner. */
		userId: v.id('users'),
		createdAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_createdAt', ['userId', 'createdAt']),

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
		/** Owner — references the users table. */
		userId: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_startTime', ['userId', 'startTime']),

	// ── Boards (shared task views for external contributors) ───────

	boards: defineTable({
		/** Human-readable board name, e.g. "Sprint 12 Tasks". */
		name: v.string(),
		/** SHA-256 hash of the access password (hex-encoded, with salt prefix). */
		passwordHash: v.string(),
		/** Unique URL slug for the public URL, e.g. "a7x9k2m3". */
		slug: v.string(),
		/** Filter criteria that define which tasks appear on this board. */
		filter: v.object({
			statusFilters: v.optional(
				v.array(
					v.union(v.literal('inbox'), v.literal('active'), v.literal('done'))
				)
			),
			/** @deprecated — old single-value field, kept temporarily for migration. */
			statusFilter: v.optional(
				v.union(v.literal('inbox'), v.literal('active'), v.literal('done'))
			),
			tagIds: v.optional(v.array(v.id('tags')))
		}),
		/** Whether the board is currently active/shared. */
		isActive: v.boolean(),
		/** Owner — references the users table. */
		userId: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_slug', ['slug'])
		.index('by_userId', ['userId']),

	boardComments: defineTable({
		/** The board this comment belongs to. */
		boardId: v.id('boards'),
		/** The task this comment is about. */
		taskId: v.id('tasks'),
		/** Display name of the anonymous commenter. */
		authorName: v.string(),
		/** Comment content (plain text or markdown). */
		content: v.string(),
		createdAt: v.number()
	})
		.index('by_boardId_taskId', ['boardId', 'taskId'])
		.index('by_boardId', ['boardId'])
		.index('by_taskId', ['taskId']),

	// ── Notifications (inbox for board owner) ────────────────────────

	notifications: defineTable({
		/** The user who receives this notification (board owner). */
		userId: v.id('users'),
		/** What triggered this notification. */
		type: v.union(
			v.literal('comment'),
			v.literal('chat'),
			v.literal('priority_change')
		),
		/** The board this event happened on. */
		boardId: v.id('boards'),
		/** The task involved (for comment + priority_change). */
		taskId: v.optional(v.id('tasks')),
		/** Reference to the comment doc (for comment type). */
		boardCommentId: v.optional(v.id('boardComments')),
		/** Reference to the message doc (for chat type). */
		boardMessageId: v.optional(v.id('boardMessages')),
		/** Denormalized board name for display without joins. */
		boardName: v.string(),
		/** Denormalized task title for display without joins. */
		taskTitle: v.optional(v.string()),
		/** Who performed the action (collaborator display name). */
		actorName: v.string(),
		/** Human-readable summary, e.g. "Alice commented on 'Fix bug'". */
		summary: v.string(),
		/** Whether the owner has seen this notification. */
		isRead: v.boolean(),
		createdAt: v.number()
	})
		.index('by_userId_createdAt', ['userId', 'createdAt'])
		.index('by_userId_isRead', ['userId', 'isRead'])
		.index('by_boardId', ['boardId']),

	// ── Board messages (board-level chat, not tied to any task) ────

	boardMessages: defineTable({
		/** The board this message belongs to. */
		boardId: v.id('boards'),
		/** Who sent this message: the board owner or an external collaborator. */
		authorType: v.union(v.literal('collaborator'), v.literal('owner')),
		/** Display name of the sender. */
		authorName: v.string(),
		/** Message content (plain text). */
		content: v.string(),
		createdAt: v.number()
	}).index('by_boardId', ['boardId'])
});
