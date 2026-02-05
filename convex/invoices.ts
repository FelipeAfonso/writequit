import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

// ── Queries ────────────────────────────────────────────────────────

/** List all invoices for the current user, newest first. */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return [];

		const invoices = await ctx.db
			.query('invoices')
			.withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
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
		const userId = await getAuthUserId(ctx);
		if (userId === null) return null;

		const invoice = await ctx.db.get(args.id);
		if (invoice === null || invoice.userId !== userId) return null;

		return invoice;
	}
});

// ── Mutations ──────────────────────────────────────────────────────

const lineItemValidator = v.object({
	label: v.string(),
	hours: v.number(),
	amount: v.number()
});

/** Create a new invoice with all data captured at creation time. */
export const create = mutation({
	args: {
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
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		// Generate sequential invoice number
		const existing = await ctx.db
			.query('invoices')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.collect();

		const nextNum = existing.length + 1;
		const invoiceNumber = `INV-${String(nextNum).padStart(3, '0')}`;

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
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const invoice = await ctx.db.get(args.id);
		if (invoice === null || invoice.userId !== userId) {
			throw new Error('Invoice not found');
		}

		await ctx.db.patch(args.id, { status: args.status });
	}
});

/** Delete an invoice permanently. */
export const remove = mutation({
	args: { id: v.id('invoices') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const invoice = await ctx.db.get(args.id);
		if (invoice === null || invoice.userId !== userId) {
			throw new Error('Invoice not found');
		}

		await ctx.db.delete(args.id);
	}
});
