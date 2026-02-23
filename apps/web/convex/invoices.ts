import { query, mutation } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { getCurrentUser, getCurrentUserOrThrow } from './users.js';

// ── Helpers ─────────────────────────────────────────────────────────

/** Compute the next sequential invoice number for a user. */
async function computeNextNumber(
	ctx: QueryCtx | MutationCtx,
	userId: Id<'users'>
) {
	const existing = await ctx.db
		.query('invoices')
		.withIndex('by_userId', (q) => q.eq('userId', userId))
		.collect();

	const nextNum = existing.length + 1;
	return `INV-${String(nextNum).padStart(3, '0')}`;
}

// ── Queries ────────────────────────────────────────────────────────

/** Get the next suggested invoice number for the current user. */
export const getNextNumber = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return 'INV-001';
		return await computeNextNumber(ctx, user._id);
	}
});

/** List all invoices for the current user, newest first. */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];

		const invoices = await ctx.db
			.query('invoices')
			.withIndex('by_userId_createdAt', (q) => q.eq('userId', user._id))
			.collect();

		// Newest first
		invoices.sort((a, b) => b.createdAt - a.createdAt);

		return invoices;
	}
});

/** Get a single invoice by ID. */
export const get = query({
	args: { id: v.id('invoices') },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return null;

		const invoice = await ctx.db.get(args.id);
		if (invoice === null || invoice.userId !== user._id) return null;

		return invoice;
	}
});

// ── Mutations ──────────────────────────────────────────────────────

const lineItemValidator = v.object({
	label: v.string(),
	hours: v.optional(v.number()),
	quantity: v.optional(v.number()),
	unitPrice: v.optional(v.number()),
	amount: v.number()
});

/** Create a new invoice with all data captured at creation time. */
export const create = mutation({
	args: {
		invoiceNumber: v.optional(v.string()),
		startDate: v.number(),
		endDate: v.number(),
		fromName: v.string(),
		fromEmail: v.string(),
		fromAddress: v.optional(v.string()),
		clientName: v.string(),
		clientAddress: v.optional(v.string()),
		hourlyRate: v.number(),
		currency: v.string(),
		lineItems: v.array(lineItemValidator),
		subtotal: v.number(),
		total: v.number(),
		paymentTerms: v.optional(v.string()),
		dueDate: v.optional(v.number()),
		notes: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);
		const userId = user._id;

		// Use user-provided invoice number or generate sequential one
		const invoiceNumber =
			args.invoiceNumber?.trim() || (await computeNextNumber(ctx, userId));

		const id = await ctx.db.insert('invoices', {
			invoiceNumber,
			status: 'draft',
			startDate: args.startDate,
			endDate: args.endDate,
			fromName: args.fromName,
			fromEmail: args.fromEmail,
			fromAddress: args.fromAddress,
			clientName: args.clientName,
			clientAddress: args.clientAddress,
			hourlyRate: args.hourlyRate,
			currency: args.currency,
			lineItems: args.lineItems,
			subtotal: args.subtotal,
			total: args.total,
			paymentTerms: args.paymentTerms,
			dueDate: args.dueDate,
			notes: args.notes,
			userId,
			createdAt: Date.now()
		});

		return id;
	}
});

/** Update an invoice's status. */
export const updateStatus = mutation({
	args: {
		id: v.id('invoices'),
		status: v.union(v.literal('draft'), v.literal('sent'), v.literal('paid'))
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const invoice = await ctx.db.get(args.id);
		if (invoice === null || invoice.userId !== user._id) {
			throw new Error('Invoice not found');
		}

		await ctx.db.patch(args.id, { status: args.status });
	}
});

/** Delete an invoice permanently. */
export const remove = mutation({
	args: { id: v.id('invoices') },
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const invoice = await ctx.db.get(args.id);
		if (invoice === null || invoice.userId !== user._id) {
			throw new Error('Invoice not found');
		}

		await ctx.db.delete(args.id);
	}
});
