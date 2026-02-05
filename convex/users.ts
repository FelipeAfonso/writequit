import { query, mutation, action } from './_generated/server';
import { v } from 'convex/values';
import {
	getAuthUserId,
	getAuthSessionId,
	retrieveAccount,
	modifyAccountCredentials,
	invalidateSessions
} from '@convex-dev/auth/server';
import { api } from './_generated/api';

// ── Settings defaults ──────────────────────────────────────────────

const SETTINGS_DEFAULTS = {
	viMode: false,
	defaultStatusFilter: 'lastUsed' as const,
	defaultTagFilter: 'lastUsed' as const,
	timezone: undefined as string | undefined,
	invoiceFromAddress: undefined as string | undefined,
	defaultHourlyRate: undefined as number | undefined,
	defaultCurrency: undefined as string | undefined,
	defaultPaymentTerms: undefined as string | undefined
};

// ── Queries ────────────────────────────────────────────────────────

/** Get the current authenticated user. */
export const currentUser = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return null;
		return await ctx.db.get(userId);
	}
});

/** Get user settings, falling back to defaults if none exist. */
export const getSettings = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return SETTINGS_DEFAULTS;

		const row = await ctx.db
			.query('userSettings')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
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
			defaultPaymentTerms: row.defaultPaymentTerms
		};
	}
});

/** Check whether the current user has a password-based auth account. */
export const hasPasswordAccount = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return false;

		const account = await ctx.db
			.query('authAccounts')
			.withIndex('userIdAndProvider', (q) =>
				q.eq('userId', userId).eq('provider', 'password')
			)
			.unique();

		return account !== null;
	}
});

// ── Mutations ──────────────────────────────────────────────────────

/** Update the current user's display name. */
export const updateName = mutation({
	args: { name: v.string() },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const trimmed = args.name.trim();
		if (trimmed.length === 0) throw new Error('Name cannot be empty');

		await ctx.db.patch(userId, { name: trimmed });
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
		defaultPaymentTerms: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const existing = await ctx.db
			.query('userSettings')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
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

		if (existing) {
			await ctx.db.patch(existing._id, patch);
		} else {
			await ctx.db.insert('userSettings', {
				userId,
				viMode: args.viMode ?? SETTINGS_DEFAULTS.viMode,
				defaultStatusFilter:
					args.defaultStatusFilter ?? SETTINGS_DEFAULTS.defaultStatusFilter,
				defaultTagFilter:
					args.defaultTagFilter ?? SETTINGS_DEFAULTS.defaultTagFilter,
				timezone: args.timezone,
				invoiceFromAddress: args.invoiceFromAddress,
				defaultHourlyRate: args.defaultHourlyRate,
				defaultCurrency: args.defaultCurrency,
				defaultPaymentTerms: args.defaultPaymentTerms
			});
		}
	}
});

// ── Actions ────────────────────────────────────────────────────────

const MIN_PASSWORD_LENGTH = 6;

/** Change the current user's password. */
export const changePassword = action({
	args: {
		currentPassword: v.string(),
		newPassword: v.string()
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		// Get the user to find their email
		const user = await ctx.runQuery(api.users.currentUser);
		if (!user || !user.email) {
			throw new Error('No email associated with this account');
		}

		// Verify the current password (throws on mismatch or rate limit)
		try {
			await retrieveAccount(ctx, {
				provider: 'password',
				account: { id: user.email, secret: args.currentPassword }
			});
		} catch {
			throw new Error('Current password is incorrect');
		}

		// Validate the new password
		if (args.newPassword.length < MIN_PASSWORD_LENGTH) {
			throw new Error(
				`New password must be at least ${MIN_PASSWORD_LENGTH} characters`
			);
		}

		// Update the password hash
		await modifyAccountCredentials(ctx, {
			provider: 'password',
			account: { id: user.email, secret: args.newPassword }
		});

		// Invalidate all other sessions for security
		const sessionId = await getAuthSessionId(ctx);
		if (sessionId) {
			await invalidateSessions(ctx, {
				userId,
				except: [sessionId]
			});
		}
	}
});
