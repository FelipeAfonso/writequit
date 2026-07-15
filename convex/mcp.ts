/**
 * Remote MCP (Model Context Protocol) server for agent access to tasks.
 *
 * Implements the Streamable HTTP transport in stateless mode: every POST
 * is an independent JSON-RPC 2.0 message, no session ids are issued, and
 * no SSE stream is offered (GET returns 405, which the spec allows).
 * Hand-rolled instead of `@modelcontextprotocol/sdk` because the SDK's
 * transport expects Node req/res and httpActions run in Convex's runtime.
 *
 * Auth: per-user API keys (see `apiKeys.ts`), accepted either as
 * `Authorization: Bearer wq_...` or embedded in the path (`/mcp/wq_...`)
 * for clients that cannot send custom headers (claude.ai connectors).
 */
import { httpAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

// ── Protocol constants ─────────────────────────────────────────────

// Streamable HTTP transport versions only — 2024-11-05 predates it
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26'];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
const SERVER_INFO = { name: 'writequit', version: '1.0.0' };

const KEY_FORMAT = /^wq_[A-Za-z0-9]{32}$/;
/** Only write lastUsedAt when the previous value is older than this. */
const TOUCH_THROTTLE_MS = 60_000;

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
	'Access-Control-Allow-Headers':
		'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version'
};

// ── JSON-RPC helpers ───────────────────────────────────────────────

type JsonRpcId = string | number | null;

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
	});
}

function rpcResult(id: JsonRpcId, result: unknown): Response {
	return jsonResponse({ jsonrpc: '2.0', id, result });
}

function rpcError(
	id: JsonRpcId,
	code: number,
	message: string,
	httpStatus = 200
): Response {
	return jsonResponse(
		{ jsonrpc: '2.0', id, error: { code, message } },
		httpStatus
	);
}

// ── Tool registry ──────────────────────────────────────────────────

type ToolArgs = Record<string, unknown>;

interface ToolDef {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	run: (
		ctx: ActionCtx,
		userId: Id<'users'>,
		args: ToolArgs
	) => Promise<unknown>;
}

const STATUS_SCHEMA = {
	type: 'string',
	enum: ['inbox', 'active', 'done'],
	description:
		"Task status: 'inbox' = captured but not started, 'active' = in progress, 'done' = completed."
};

// ── Tool argument validation ───────────────────────────────────────
// The advertised JSON Schema is not enforced by the transport, so args
// are re-checked at runtime — coercing malformed values could silently
// overwrite task content. Throws surface as isError tool results.

const TASK_STATUSES = ['inbox', 'active', 'done'] as const;
type ToolTaskStatus = (typeof TASK_STATUSES)[number];

function requireString(args: ToolArgs, key: string): string {
	const value = args[key];
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`Argument "${key}" must be a non-empty string`);
	}
	return value;
}

/** Convex re-validates the id format inside the internal function. */
function requireTaskId(args: ToolArgs): Id<'tasks'> {
	return requireString(args, 'id') as Id<'tasks'>;
}

function requireStatus(args: ToolArgs): ToolTaskStatus {
	const value = args.status;
	if (
		typeof value !== 'string' ||
		!TASK_STATUSES.includes(value as ToolTaskStatus)
	) {
		throw new Error(
			`Argument "status" must be one of: ${TASK_STATUSES.join(', ')}`
		);
	}
	return value as ToolTaskStatus;
}

function optionalStatus(args: ToolArgs): ToolTaskStatus | undefined {
	return args.status === undefined ? undefined : requireStatus(args);
}

function optionalLimit(args: ToolArgs): number | undefined {
	const value = args.limit;
	if (value === undefined) return undefined;
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new Error('Argument "limit" must be a number');
	}
	return value;
}

const TOOLS: ToolDef[] = [
	{
		name: 'list_tasks',
		description:
			"List the user's tasks sorted by priority (active first, then inbox, then done; due dates break ties). Returns compact task objects without the full markdown content — use get_task for that.",
		inputSchema: {
			type: 'object',
			properties: {
				status: STATUS_SCHEMA,
				limit: {
					type: 'number',
					description: 'Max tasks to return (1-100, default 25).'
				}
			}
		},
		run: (ctx, userId, args) =>
			ctx.runQuery(internal.tasks.listForUser, {
				userId,
				status: optionalStatus(args),
				limit: optionalLimit(args)
			})
	},
	{
		name: 'search_tasks',
		description:
			'Full-text search across all task content (titles, bodies, tags), ranked by relevance. Returns up to 20 compact task objects.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search terms.' },
				status: STATUS_SCHEMA
			},
			required: ['query']
		},
		run: (ctx, userId, args) =>
			ctx.runQuery(internal.tasks.searchForUser, {
				userId,
				query: requireString(args, 'query'),
				status: optionalStatus(args)
			})
	},
	{
		name: 'get_task',
		description:
			'Get a single task by id, including its full markdown content (rawContent).',
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'string', description: 'Task id from list/search results.' }
			},
			required: ['id']
		},
		run: async (ctx, userId, args) => {
			const task = await ctx.runQuery(internal.tasks.getForUser, {
				userId,
				id: requireTaskId(args)
			});
			if (task === null) throw new Error('Task not found');
			return task;
		}
	},
	{
		name: 'create_task',
		description:
			"Create a new task from markdown. The first line or heading becomes the title. Add 'due:' tokens for a due date (due:2026-07-20, due:today, due:tomorrow, due:next-week, due:monday…due:sunday) and '+tagname' tokens for tags (auto-created). New tasks start in the 'inbox' status. Returns the created task so you can see how it was parsed.",
		inputSchema: {
			type: 'object',
			properties: {
				content: {
					type: 'string',
					description:
						"Markdown task content, e.g. '# Ship the report due:friday +client-acme'."
				}
			},
			required: ['content']
		},
		run: (ctx, userId, args) =>
			ctx.runMutation(internal.tasks.createForUser, {
				userId,
				rawContent: requireString(args, 'content')
			})
	},
	{
		name: 'update_task',
		description:
			"REPLACES a task's entire markdown content and re-derives title, due date, and tags from it. Call get_task first and send back the full edited content — partial content will overwrite everything else.",
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'string', description: 'Task id.' },
				content: {
					type: 'string',
					description: 'The complete new markdown content for the task.'
				}
			},
			required: ['id', 'content']
		},
		run: (ctx, userId, args) =>
			ctx.runMutation(internal.tasks.updateForUser, {
				userId,
				id: requireTaskId(args),
				rawContent: requireString(args, 'content')
			})
	},
	{
		name: 'set_task_status',
		description:
			"Change a task's status. Setting 'done' records the completion time; moving away from 'done' clears it.",
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'string', description: 'Task id.' },
				status: { ...STATUS_SCHEMA, description: 'The new status.' }
			},
			required: ['id', 'status']
		},
		run: (ctx, userId, args) =>
			ctx.runMutation(internal.tasks.setStatusForUser, {
				userId,
				id: requireTaskId(args),
				status: requireStatus(args)
			})
	}
];

// ── Auth ───────────────────────────────────────────────────────────

/** Copy of apiKeys.sha256Hex — kept local so this module stays self-contained. */
async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Extract the raw API key: path segment after /mcp/ (claude.ai
 * connectors can't send headers), else the Authorization bearer token.
 */
function extractApiKey(request: Request): string | null {
	const pathname = new URL(request.url).pathname;
	if (pathname.startsWith('/mcp/')) {
		const segment = decodeURIComponent(
			pathname.slice('/mcp/'.length).replace(/\/+$/, '')
		);
		if (segment.length > 0) return segment;
	}

	const auth = request.headers.get('Authorization');
	if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();

	return null;
}

async function authenticate(
	ctx: ActionCtx,
	request: Request
): Promise<Id<'users'> | null> {
	const key = extractApiKey(request);
	// Cheap format pre-filter before hashing or touching the DB
	if (key === null || !KEY_FORMAT.test(key)) return null;

	const resolved = await ctx.runQuery(internal.apiKeys.resolve, {
		keyHash: await sha256Hex(key)
	});
	if (resolved === null) return null;

	const now = Date.now();
	if (now - (resolved.lastUsedAt ?? 0) > TOUCH_THROTTLE_MS) {
		await ctx.runMutation(internal.apiKeys.touch, { id: resolved.keyId });
	}

	return resolved.userId;
}

// ── JSON-RPC dispatch ──────────────────────────────────────────────

async function callTool(
	ctx: ActionCtx,
	userId: Id<'users'>,
	params: { name?: unknown; arguments?: unknown }
): Promise<unknown> {
	const tool = TOOLS.find((t) => t.name === params.name);
	if (tool === undefined) {
		return {
			content: [{ type: 'text', text: `Error: unknown tool "${params.name}"` }],
			isError: true
		};
	}

	try {
		const args = (params.arguments ?? {}) as ToolArgs;
		const result = await tool.run(ctx, userId, args);
		return {
			content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
		};
	} catch (err) {
		// Tool execution failures (bad id, not found, validation) are
		// isError results, not JSON-RPC errors, per the MCP spec.
		const message = err instanceof Error ? err.message : String(err);
		return {
			content: [{ type: 'text', text: `Error: ${message}` }],
			isError: true
		};
	}
}

export const mcpHandler = httpAction(async (ctx, request) => {
	const userId = await authenticate(ctx, request);
	if (userId === null) {
		return new Response(
			JSON.stringify({ error: 'Invalid or missing API key' }),
			{
				status: 401,
				headers: {
					'Content-Type': 'application/json',
					'WWW-Authenticate': 'Bearer',
					...CORS_HEADERS
				}
			}
		);
	}

	// Spec: an invalid/unsupported MCP-Protocol-Version header gets a 400.
	// An absent header is fine (the dispatch below is version-independent).
	const versionHeader = request.headers.get('MCP-Protocol-Version');
	if (
		versionHeader !== null &&
		!SUPPORTED_PROTOCOL_VERSIONS.includes(versionHeader)
	) {
		return jsonResponse(
			{ error: `Unsupported MCP-Protocol-Version: ${versionHeader}` },
			400
		);
	}

	let message: unknown;
	try {
		message = await request.json();
	} catch {
		return rpcError(null, -32700, 'Parse error', 400);
	}

	// Batch requests (arrays) are not supported in stateless mode
	if (Array.isArray(message)) {
		return rpcError(null, -32600, 'Batch requests are not supported');
	}
	if (typeof message !== 'object' || message === null) {
		return rpcError(null, -32600, 'Invalid request');
	}

	const raw = message as Record<string, unknown>;

	// Notifications omit `id` entirely — acknowledged and ignored
	if (!('id' in raw)) {
		return new Response(null, { status: 202, headers: CORS_HEADERS });
	}

	const { jsonrpc, id, method, params } = raw as {
		jsonrpc?: unknown;
		id?: unknown;
		method?: unknown;
		params?: Record<string, unknown>;
	};

	// Envelope validation — note MCP forbids `id: null` on requests
	if (
		jsonrpc !== '2.0' ||
		(typeof id !== 'string' && typeof id !== 'number') ||
		typeof method !== 'string'
	) {
		return rpcError(null, -32600, 'Invalid request');
	}

	switch (method) {
		case 'initialize': {
			const requested = params?.protocolVersion;
			const protocolVersion =
				typeof requested === 'string' &&
				SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
					? requested
					: LATEST_PROTOCOL_VERSION;
			// No Mcp-Session-Id header → clients treat the server as stateless
			return rpcResult(id, {
				protocolVersion,
				capabilities: { tools: {} },
				serverInfo: SERVER_INFO
			});
		}
		case 'ping':
			return rpcResult(id, {});
		case 'tools/list':
			return rpcResult(id, {
				tools: TOOLS.map(({ name, description, inputSchema }) => ({
					name,
					description,
					inputSchema
				}))
			});
		case 'tools/call':
			return rpcResult(id, await callTool(ctx, userId, params ?? {}));
		default:
			return rpcError(id, -32601, `Method not found: ${method}`);
	}
});

/** GET/DELETE on the MCP endpoint: no SSE stream or sessions offered. */
export const mcpMethodNotAllowed = httpAction(async () => {
	return new Response(null, { status: 405, headers: CORS_HEADERS });
});

/** CORS preflight for browser-based MCP clients (e.g. MCP Inspector). */
export const mcpOptions = httpAction(async () => {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
});
