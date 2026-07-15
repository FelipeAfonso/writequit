import {
	query,
	mutation,
	internalQuery,
	internalMutation
} from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser, getCurrentUserOrThrow } from './users.js';

// ── Constants ──────────────────────────────────────────────────────

const KEY_PREFIX = 'wq_';
const KEY_RANDOM_LENGTH = 32;
const KEY_CHARS =
	'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** Chars of the full key shown in the UI, e.g. "wq_a1b2c3d4". */
const DISPLAY_PREFIX_LENGTH = 11;

// ── Crypto helpers ─────────────────────────────────────────────────

function generateRandom(length: number, chars: string): string {
	const values = new Uint8Array(length);
	crypto.getRandomValues(values);
	return Array.from(values)
		.map((v) => chars[v % chars.length])
		.join('');
}

/**
 * Plain (unsalted) SHA-256, hex-encoded. Unlike board passwords, API keys
 * are high-entropy random tokens, so a salt adds nothing — and an unsalted
 * hash is required for O(1) lookup via the `by_keyHash` index.
 */
export async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// ── Public functions (settings UI) ─────────────────────────────────

/**
 * Create a new API key for the current user. Returns the full key —
 * the only time it ever crosses the wire. Only the hash is stored.
 */
export const create = mutation({
	args: { name: v.string() },
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const name = args.name.trim();
		if (name.length === 0) throw new Error('Key name cannot be empty');

		const key = KEY_PREFIX + generateRandom(KEY_RANDOM_LENGTH, KEY_CHARS);
		const prefix = key.slice(0, DISPLAY_PREFIX_LENGTH);
		const keyHash = await sha256Hex(key);

		const id = await ctx.db.insert('apiKeys', {
			userId: user._id,
			keyHash,
			prefix,
			name,
			createdAt: Date.now()
		});

		return { key, prefix, id };
	}
});

/** List the current user's API keys (never exposes the hash). */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (user === null) return [];

		const keys = await ctx.db
			.query('apiKeys')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.collect();

		return keys.map((k) => ({
			_id: k._id,
			prefix: k.prefix,
			name: k.name,
			createdAt: k.createdAt,
			lastUsedAt: k.lastUsedAt,
			revoked: k.revokedAt !== undefined
		}));
	}
});

/** Soft-revoke a key: it stops authenticating but stays listed. */
export const revoke = mutation({
	args: { id: v.id('apiKeys') },
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		const key = await ctx.db.get(args.id);
		if (key === null || key.userId !== user._id) {
			throw new Error('Key not found');
		}

		await ctx.db.patch(args.id, { revokedAt: Date.now() });
	}
});

// ── Internal functions (MCP endpoint auth) ─────────────────────────

/** Resolve a key hash to its owner. Null if unknown or revoked. */
export const resolve = internalQuery({
	args: { keyHash: v.string() },
	handler: async (ctx, args) => {
		const key = await ctx.db
			.query('apiKeys')
			.withIndex('by_keyHash', (q) => q.eq('keyHash', args.keyHash))
			.unique();

		if (key === null || key.revokedAt !== undefined) return null;

		return { userId: key.userId, keyId: key._id, lastUsedAt: key.lastUsedAt };
	}
});

/** Bump lastUsedAt. Called throttled from the MCP handler. */
export const touch = internalMutation({
	args: { id: v.id('apiKeys') },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, { lastUsedAt: Date.now() });
	}
});
