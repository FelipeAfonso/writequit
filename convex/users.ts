import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

// ── Settings defaults ──────────────────────────────────────────────

const SETTINGS_DEFAULTS = {
	viMode: false,
	defaultStatusFilter: 'all' as const,
	defaultTagFilter: 'all' as const,
	timezone: undefined as string | undefined,
	invoiceFromAddress: undefined as string | undefined,
	defaultHourlyRate: undefined as number | undefined,
	defaultCurrency: undefined as string | undefined,
	defaultPaymentTerms: undefined as string | undefined,
	defaultInvoiceTheme: undefined as 'dark' | 'light' | undefined
};

// ── Auth helpers ───────────────────────────────────────────────────

/**
 * Look up the current user from the WorkOS JWT identity.
 *
 * Uses `ctx.auth.getUserIdentity()` to get the JWT claims, then finds
 * the matching user document by `externalId` (the JWT `subject` field,
 * which is the WorkOS user ID).
 *
 * Returns null if not authenticated or user document doesn't exist yet.
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (identity === null) return null;

	return await ctx.db
		.query('users')
		.withIndex('by_externalId', (q) => q.eq('externalId', identity.subject))
		.unique();
}

/**
 * Same as `getCurrentUser` but throws if not authenticated or user
 * document doesn't exist. Use in mutations that require auth.
 */
export async function getCurrentUserOrThrow(ctx: QueryCtx | MutationCtx) {
	const user = await getCurrentUser(ctx);
	if (!user) throw new Error('Not authenticated');
	return user;
}

/**
 * Get just the current user's ID, or null.
 * Convenience wrapper for code that only needs the ID.
 */
export async function getCurrentUserId(
	ctx: QueryCtx | MutationCtx
): Promise<Id<'users'> | null> {
	const user = await getCurrentUser(ctx);
	return user?._id ?? null;
}

// ── Queries ────────────────────────────────────────────────────────

/** Get the current authenticated user. */
export const currentUser = query({
	args: {},
	handler: async (ctx) => {
		return await getCurrentUser(ctx);
	}
});

/** Get user settings, falling back to defaults if none exist. */
export const getSettings = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return SETTINGS_DEFAULTS;

		const row = await ctx.db
			.query('userSettings')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.unique();

		if (!row) return SETTINGS_DEFAULTS;

		return {
			viMode: row.viMode,
			defaultStatusFilter: row.defaultStatusFilter,
			defaultTagFilter: row.defaultTagFilter,
			timezone: row.timezone,
			invoiceFromAddress: row.invoiceFromAddress,
			defaultHourlyRate: row.defaultHourlyRate,
			defaultCurrency: row.defaultCurrency,
			defaultPaymentTerms: row.defaultPaymentTerms,
			defaultInvoiceTheme: row.defaultInvoiceTheme
		};
	}
});

// ── Mutations ──────────────────────────────────────────────────────

/**
 * Upsert the current user from WorkOS user profile data.
 *
 * Called client-side after successful authentication. The WorkOS access
 * token JWT does NOT contain profile claims (name, email, etc.), so
 * this mutation accepts them as arguments from the client-side SDK
 * which has the full User object.
 *
 * Creates the user document if it doesn't exist, or updates
 * name/email/image if changed.
 */
export const store = mutation({
	args: {
		name: v.optional(v.string()),
		email: v.optional(v.string()),
		image: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Called store without authentication present');
		}

		const existing = await ctx.db
			.query('users')
			.withIndex('by_externalId', (q) => q.eq('externalId', identity.subject))
			.unique();

		if (existing !== null) {
			// Update if any fields changed
			const updates: Record<string, string | undefined> = {};
			if (args.name && args.name !== existing.name) {
				updates.name = args.name;
			}
			if (args.email && args.email !== existing.email) {
				updates.email = args.email;
			}
			if (args.image !== undefined && args.image !== existing.image) {
				updates.image = args.image;
			}

			if (Object.keys(updates).length > 0) {
				await ctx.db.patch(existing._id, updates);
			}

			return existing._id;
		}

		// Create new user document
		return await ctx.db.insert('users', {
			externalId: identity.subject,
			name: args.name,
			email: args.email,
			image: args.image
		});
	}
});

/** Update the current user's display name. */
export const updateName = mutation({
	args: { name: v.string() },
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const trimmed = args.name.trim();
		if (trimmed.length === 0) throw new Error('Name cannot be empty');

		await ctx.db.patch(user._id, { name: trimmed });
	}
});

/** Upsert user settings (creates if not exists, patches if exists). */
export const updateSettings = mutation({
	args: {
		viMode: v.optional(v.boolean()),
		defaultStatusFilter: v.optional(
			v.union(
				v.literal('lastUsed'),
				v.literal('all'),
				v.literal('inbox'),
				v.literal('active'),
				v.literal('done')
			)
		),
		defaultTagFilter: v.optional(
			v.union(v.literal('lastUsed'), v.literal('all'))
		),
		timezone: v.optional(v.string()),
		invoiceFromAddress: v.optional(v.string()),
		defaultHourlyRate: v.optional(v.number()),
		defaultCurrency: v.optional(v.string()),
		defaultPaymentTerms: v.optional(v.string()),
		defaultInvoiceTheme: v.optional(
			v.union(v.literal('dark'), v.literal('light'))
		)
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const existing = await ctx.db
			.query('userSettings')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.unique();

		// Build patch from only the provided fields
		const patch: Record<string, unknown> = {};
		if (args.viMode !== undefined) patch.viMode = args.viMode;
		if (args.defaultStatusFilter !== undefined)
			patch.defaultStatusFilter = args.defaultStatusFilter;
		if (args.defaultTagFilter !== undefined)
			patch.defaultTagFilter = args.defaultTagFilter;
		if (args.timezone !== undefined) patch.timezone = args.timezone;
		if (args.invoiceFromAddress !== undefined)
			patch.invoiceFromAddress = args.invoiceFromAddress;
		if (args.defaultHourlyRate !== undefined)
			patch.defaultHourlyRate = args.defaultHourlyRate;
		if (args.defaultCurrency !== undefined)
			patch.defaultCurrency = args.defaultCurrency;
		if (args.defaultPaymentTerms !== undefined)
			patch.defaultPaymentTerms = args.defaultPaymentTerms;
		if (args.defaultInvoiceTheme !== undefined)
			patch.defaultInvoiceTheme = args.defaultInvoiceTheme;

		if (existing) {
			await ctx.db.patch(existing._id, patch);
		} else {
			await ctx.db.insert('userSettings', {
				userId: user._id,
				viMode: args.viMode ?? SETTINGS_DEFAULTS.viMode,
				defaultStatusFilter:
					args.defaultStatusFilter ?? SETTINGS_DEFAULTS.defaultStatusFilter,
				defaultTagFilter:
					args.defaultTagFilter ?? SETTINGS_DEFAULTS.defaultTagFilter,
				timezone: args.timezone,
				invoiceFromAddress: args.invoiceFromAddress,
				defaultHourlyRate: args.defaultHourlyRate,
				defaultCurrency: args.defaultCurrency,
				defaultPaymentTerms: args.defaultPaymentTerms,
				defaultInvoiceTheme: args.defaultInvoiceTheme
			});
		}
	}
});
