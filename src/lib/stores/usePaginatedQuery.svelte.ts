/**
 * usePaginatedQuery — Svelte 5 equivalent of Convex's React usePaginatedQuery.
 *
 * Manages multiple page subscriptions via ConvexClient.onUpdate(), concatenates
 * results, and exposes a `loadMore()` function for infinite scroll.
 */
import { getContext, untrack } from 'svelte';
import type {
	FunctionReference,
	FunctionArgs,
	FunctionReturnType
} from 'convex/server';
import type { PaginationResult, PaginationOptions } from 'convex/server';
import type { ConvexClient } from 'convex/browser';
import { convexToJson } from 'convex/values';
import type { Value } from 'convex/values';

// Must match the key used by convex-svelte
const CONTEXT_KEY = '$$_convexClient';

type PaginatedQueryReference = FunctionReference<
	'query',
	'public',
	{ paginationOpts: PaginationOptions },
	PaginationResult<any> // eslint-disable-line @typescript-eslint/no-explicit-any
>;

type PaginatedQueryArgs<Query extends PaginatedQueryReference> = Omit<
	FunctionArgs<Query>,
	'paginationOpts'
>;

/** Extract the item type from a paginated query's return type. */
type PaginatedQueryItem<Query extends PaginatedQueryReference> =
	FunctionReturnType<Query>['page'][number];

export type PaginationStatus =
	| 'LoadingFirstPage'
	| 'CanLoadMore'
	| 'LoadingMore'
	| 'Exhausted';

export interface UsePaginatedQueryReturn<T> {
	readonly results: T[];
	readonly status: PaginationStatus;
	readonly isLoading: boolean;
	loadMore(numItems: number): void;
}

let paginationId = 0;
function nextPaginationId(): number {
	return ++paginationId;
}

/**
 * Subscribe to a paginated Convex query with automatic page management.
 *
 * @param query - A FunctionReference that accepts `paginationOpts` and returns `PaginationResult`.
 * @param args - Reactive args (object or closure), excluding `paginationOpts`. Use `"skip"` to pause.
 * @param options - `{ initialNumItems }` — how many items to fetch in the first page.
 */
export function usePaginatedQuery<Query extends PaginatedQueryReference>(
	query: Query,
	args:
		| PaginatedQueryArgs<Query>
		| 'skip'
		| (() => PaginatedQueryArgs<Query> | 'skip'),
	options: { initialNumItems: number }
): UsePaginatedQueryReturn<PaginatedQueryItem<Query>> {
	const client: ConvexClient = getContext(CONTEXT_KEY);
	if (!client) {
		throw new Error(
			'No ConvexClient found in Svelte context. Did you forget to call setupConvex()?'
		);
	}

	// ── Internal state ──
	// Each "page" is a subscription identified by a numeric key.
	// Pages are ordered: pageKeys[0] is the first page (cursor: null), etc.

	type PageData = PaginationResult<PaginatedQueryItem<Query>>;

	let pageKeys = $state<number[]>([]);
	let pageResults = $state<Record<number, PageData | undefined>>({});
	let nextPageKey = $state(0);
	let currentSessionId = 0;
	let unsubscribers: Record<number, () => void> = {};

	function resolveArgs(): PaginatedQueryArgs<Query> | 'skip' {
		return typeof args === 'function' ? args() : args;
	}

	function argsJson(a: PaginatedQueryArgs<Query> | 'skip'): string {
		if (a === 'skip') return '"skip"';
		return JSON.stringify(convexToJson(a as unknown as Value));
	}

	/** Subscribe to one page. */
	function subscribePage(
		key: number,
		cursor: string | null,
		numItems: number,
		baseArgs: PaginatedQueryArgs<Query>,
		sid: number
	) {
		const fullArgs = {
			...baseArgs,
			paginationOpts: {
				numItems,
				cursor,
				id: sid
			}
		} as unknown as FunctionArgs<Query>;

		const unsubscribe = client.onUpdate(
			query,
			fullArgs,
			(result: PageData) => {
				pageResults = { ...pageResults, [key]: structuredClone(result) };
			},
			(error: Error) => {
				if (error.message.includes('InvalidCursor')) {
					console.warn(
						'usePaginatedQuery: InvalidCursor, resetting pagination'
					);
					// Will be picked up on next effect re-run via args dependency
				} else {
					console.error('usePaginatedQuery page error:', error);
				}
			}
		);
		unsubscribers[key] = unsubscribe;
	}

	/** Tear down all subscriptions. */
	function cleanupAll() {
		for (const unsub of Object.values(unsubscribers)) {
			unsub();
		}
		unsubscribers = {};
	}

	// The effect only tracks `resolveArgs()` and `argsJson()`.
	// All state writes are done inside `untrack()` to avoid re-triggering.
	$effect(() => {
		// ── Tracked reads ── (establish reactive dependencies)
		const a = resolveArgs();
		argsJson(a); // track serialized args for deep equality

		// ── Untracked side effects ──
		untrack(() => {
			cleanupAll();

			if (a === 'skip') {
				pageKeys = [];
				pageResults = {};
				nextPageKey = 0;
				return;
			}

			currentSessionId = nextPaginationId();
			const key = 0;
			pageKeys = [key];
			pageResults = {};
			nextPageKey = 1;
			subscribePage(key, null, options.initialNumItems, a, currentSessionId);
		});

		return () => {
			cleanupAll();
		};
	});

	// ── Derived values ──

	/** Concatenate all loaded pages in order. */
	const results = $derived.by(() => {
		const all: PaginatedQueryItem<Query>[] = [];
		for (const key of pageKeys) {
			const page = pageResults[key];
			if (page === undefined) break; // stop at first unloaded page
			all.push(...page.page);
		}
		return all;
	});

	/** The last page that has data. */
	const lastLoadedPage = $derived.by(() => {
		for (let i = pageKeys.length - 1; i >= 0; i--) {
			const page = pageResults[pageKeys[i]];
			if (page !== undefined) return page;
		}
		return undefined;
	});

	/** Whether there's a page key that hasn't received data yet. */
	const hasUnloadedPage = $derived.by(() => {
		return pageKeys.some((key) => pageResults[key] === undefined);
	});

	const status: PaginationStatus = $derived.by(() => {
		if (pageKeys.length === 0) return 'LoadingFirstPage';
		if (pageResults[pageKeys[0]] === undefined) return 'LoadingFirstPage';
		if (hasUnloadedPage) return 'LoadingMore';
		if (lastLoadedPage?.isDone) return 'Exhausted';
		return 'CanLoadMore';
	});

	const isLoading = $derived(
		status === 'LoadingFirstPage' || status === 'LoadingMore'
	);

	function loadMore(numItems: number) {
		if (status !== 'CanLoadMore') return;
		if (!lastLoadedPage) return;

		const a = untrack(() => resolveArgs());
		if (a === 'skip') return;

		const key = nextPageKey;
		nextPageKey = key + 1;
		pageKeys = [...pageKeys, key];
		subscribePage(
			key,
			lastLoadedPage.continueCursor,
			numItems,
			a,
			currentSessionId
		);
	}

	return {
		get results() {
			return results;
		},
		get status() {
			return status;
		},
		get isLoading() {
			return isLoading;
		},
		loadMore
	};
}
