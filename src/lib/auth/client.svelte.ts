/**
 * Svelte 5 auth adapter for @convex-dev/auth.
 *
 * This is a port of the React `AuthProvider` from @convex-dev/auth/react/client.tsx
 * to Svelte 5 runes. It manages JWT + refresh token storage, token refresh,
 * OAuth code handling, and exposes reactive auth state.
 */
import { getContext, setContext } from 'svelte';
import { ConvexHttpClient, type ConvexClient } from 'convex/browser';
import type { Value } from 'convex/values';

// ── Storage keys ───────────────────────────────────────────────────
const VERIFIER_STORAGE_KEY = '__convexAuthOAuthVerifier';
const JWT_STORAGE_KEY = '__convexAuthJWT';
const REFRESH_TOKEN_STORAGE_KEY = '__convexAuthRefreshToken';

// ── Context key ────────────────────────────────────────────────────
const AUTH_CONTEXT_KEY = '$$_convexAuth';

// ── Retry backoff for network errors ───────────────────────────────
const RETRY_BACKOFF = [500, 2000];
const RETRY_JITTER = 100;

// ── Types ──────────────────────────────────────────────────────────

export interface AuthState {
	readonly isLoading: boolean;
	readonly isAuthenticated: boolean;
	readonly token: string | null;
}

export interface AuthActions {
	signIn(
		provider: string,
		params?: FormData | Record<string, Value>
	): Promise<{ signingIn: boolean; redirect?: URL }>;
	signOut(): Promise<void>;
}

interface ConvexAuthContext {
	readonly state: AuthState;
	readonly actions: AuthActions;
}

// ── Namespaced storage helpers ─────────────────────────────────────

function makeStorageHelpers(namespace: string) {
	const escaped = namespace.replace(/[^a-zA-Z0-9]/g, '');
	const key = (k: string) => `${k}_${escaped}`;
	return {
		storageKey: key,
		storageGet: (k: string) => localStorage.getItem(key(k)),
		storageSet: (k: string, v: string) => localStorage.setItem(key(k), v),
		storageRemove: (k: string) => localStorage.removeItem(key(k))
	};
}

// ── Network error detection ────────────────────────────────────────

function isNetworkError(error: unknown): boolean {
	return (
		error instanceof TypeError &&
		(error.message === 'Failed to fetch' ||
			error.message === 'NetworkError when attempting to fetch resource.' ||
			error.message === 'Network request failed' ||
			error.message.includes('network'))
	);
}

// ── Core: setupConvexAuth ──────────────────────────────────────────

/**
 * Initialize Convex Auth in a Svelte component tree. Call this once in
 * your root layout, after `setupConvex()`.
 *
 * This sets up:
 * - JWT token management (storage, refresh, sync across tabs)
 * - `client.setAuth()` integration with the ConvexClient
 * - OAuth redirect code handling
 * - Reactive auth state available via `useAuthState()` and `useAuthActions()`
 */
export function setupConvexAuth(client: ConvexClient, convexUrl: string) {
	const { storageGet, storageSet, storageRemove, storageKey } =
		makeStorageHelpers(convexUrl);

	// ── Reactive state ───────────────────────────────────────────
	let token: string | null = $state(null);
	let isLoading = $state(true);

	// ── Token management ─────────────────────────────────────────

	function setToken(
		args:
			| { shouldStore: true; tokens: { token: string; refreshToken: string } }
			| { shouldStore: false; tokens: { token: string } }
			| { shouldStore: boolean; tokens: null }
	) {
		if (args.tokens === null) {
			token = null;
			if (args.shouldStore) {
				storageRemove(JWT_STORAGE_KEY);
				storageRemove(REFRESH_TOKEN_STORAGE_KEY);
			}
		} else {
			token = args.tokens.token;
			if (args.shouldStore && 'refreshToken' in args.tokens) {
				storageSet(JWT_STORAGE_KEY, args.tokens.token);
				storageSet(REFRESH_TOKEN_STORAGE_KEY, args.tokens.refreshToken);
			}
		}
		isLoading = false;
	}

	// ── Verify code / refresh token with server ──────────────────

	async function verifyCode(
		args: { code: string; verifier?: string } | { refreshToken: string }
	): Promise<{ tokens: { token: string; refreshToken: string } | null }> {
		const httpClient = new ConvexHttpClient(convexUrl);
		let lastError: unknown;

		for (let retry = 0; retry <= RETRY_BACKOFF.length; retry++) {
			try {
				/* eslint-disable @typescript-eslint/no-explicit-any -- Convex Auth internal actions are untyped */
				const signInArgs =
					'code' in args
						? { params: { code: args.code }, verifier: args.verifier }
						: args;
				return await (httpClient as any).action(
					'auth:signIn' as any,
					signInArgs
				);
				/* eslint-enable @typescript-eslint/no-explicit-any */
			} catch (e) {
				lastError = e;
				if (!isNetworkError(e) || retry >= RETRY_BACKOFF.length) break;
				const wait = RETRY_BACKOFF[retry] + RETRY_JITTER * Math.random();
				await new Promise((resolve) => setTimeout(resolve, wait));
			}
		}
		throw lastError;
	}

	async function verifyCodeAndSetToken(
		args: { code: string; verifier?: string } | { refreshToken: string }
	): Promise<boolean> {
		const { tokens } = await verifyCode(args);
		setToken({ shouldStore: true, tokens: tokens ?? null });
		return tokens !== null;
	}

	// ── fetchToken callback for client.setAuth ───────────────────
	// This is called by the Convex client when it needs a token.

	async function fetchToken({
		forceRefreshToken
	}: {
		forceRefreshToken: boolean;
	}): Promise<string | null | undefined> {
		if (forceRefreshToken) {
			const refreshToken = storageGet(REFRESH_TOKEN_STORAGE_KEY);
			if (refreshToken !== null) {
				try {
					await verifyCodeAndSetToken({ refreshToken });
				} catch {
					setToken({ shouldStore: true, tokens: null });
					return null;
				}
				return token;
			}
			return null;
		}
		return token;
	}

	function onAuthChange(isAuthenticated: boolean) {
		if (!isAuthenticated && token !== null) {
			// Server rejected our token
			setToken({ shouldStore: true, tokens: null });
		}
		isLoading = false;
	}

	/**
	 * Re-register setAuth with the Convex client. This triggers a
	 * fresh fetchToken call, which lets the WebSocket authenticate
	 * with the newly stored JWT.
	 */
	function refreshClientAuth() {
		client.setAuth(fetchToken, onAuthChange);
	}

	// Initial registration
	refreshClientAuth();

	// ── Sign in ──────────────────────────────────────────────────

	async function signIn(
		provider: string,
		params?: FormData | Record<string, Value>
	): Promise<{ signingIn: boolean; redirect?: URL }> {
		const paramsObj =
			params instanceof FormData
				? Array.from(params.entries()).reduce(
						(acc, [key, value]) => {
							acc[key] = value as string;
							return acc;
						},
						{} as Record<string, string>
					)
				: (params ?? {});

		const verifier = storageGet(VERIFIER_STORAGE_KEY) ?? undefined;
		storageRemove(VERIFIER_STORAGE_KEY);

		// Use an unauthenticated HTTP client for sign-in calls so
		// they work before the user has a valid session.
		const httpClient = new ConvexHttpClient(convexUrl);

		/* eslint-disable @typescript-eslint/no-explicit-any -- Convex Auth internal actions are untyped */
		const result: any = await (httpClient as any).action('auth:signIn' as any, {
			provider,
			params: paramsObj,
			verifier
		});
		/* eslint-enable @typescript-eslint/no-explicit-any */

		if (result.redirect !== undefined) {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- not reactive state
			const url = new URL(result.redirect as string);
			storageSet(VERIFIER_STORAGE_KEY, result.verifier!);
			window.location.href = url.toString();
			return { signingIn: false, redirect: url };
		} else if (result.tokens !== undefined) {
			setToken({ shouldStore: true, tokens: result.tokens });
			// Re-register auth so the Convex client picks up the new token
			refreshClientAuth();
			return { signingIn: result.tokens !== null };
		}

		return { signingIn: false };
	}

	// ── Sign out ─────────────────────────────────────────────────

	async function signOut(): Promise<void> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Convex Auth internal action
			await client.action('auth:signOut' as any, {} as never);
		} catch {
			// Ignore — usually means already signed out
		}
		setToken({ shouldStore: true, tokens: null });
		// Re-register so the Convex client clears its auth
		refreshClientAuth();
	}

	// ── Initialize: read from storage or handle OAuth code ───────

	$effect(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- imperative, not reactive
		const code = new URLSearchParams(window.location.search).get('code');

		if (code) {
			// OAuth redirect — consume the code
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- imperative, not reactive
			const url = new URL(window.location.href);
			url.searchParams.delete('code');
			window.history.replaceState({}, '', url.pathname + url.search + url.hash);

			// Retrieve and clear the PKCE verifier that was stored before redirect
			const verifier = storageGet(VERIFIER_STORAGE_KEY) ?? undefined;
			storageRemove(VERIFIER_STORAGE_KEY);

			verifyCodeAndSetToken({ code, verifier })
				.then(() => refreshClientAuth())
				.catch(() => {
					const stored = storageGet(JWT_STORAGE_KEY);
					setToken({
						shouldStore: false,
						tokens: stored ? { token: stored } : null
					});
					refreshClientAuth();
				});
		} else {
			// Normal load — read token from storage
			const stored = storageGet(JWT_STORAGE_KEY);
			if (stored) {
				setToken({ shouldStore: false, tokens: { token: stored } });
				// Re-register so the client fetches this token
				refreshClientAuth();
			} else {
				setToken({ shouldStore: false, tokens: null });
			}
		}

		// Listen for storage changes from other tabs
		function onStorage(event: StorageEvent) {
			if (event.key === storageKey(JWT_STORAGE_KEY)) {
				const value = event.newValue;
				setToken({
					shouldStore: false,
					tokens: value ? { token: value } : null
				});
				refreshClientAuth();
			}
		}

		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	});

	// ── Expose via context ───────────────────────────────────────

	const authContext: ConvexAuthContext = {
		get state(): AuthState {
			return {
				get isLoading() {
					return isLoading;
				},
				get isAuthenticated() {
					return token !== null;
				},
				get token() {
					return token;
				}
			};
		},
		actions: {
			signIn,
			signOut
		}
	};

	setContext(AUTH_CONTEXT_KEY, authContext);

	return authContext;
}

// ── Consumer hooks ─────────────────────────────────────────────────

/** Get the reactive auth state (isLoading, isAuthenticated, token). */
export function useAuthState(): AuthState {
	const ctx = getContext<ConvexAuthContext>(AUTH_CONTEXT_KEY);
	if (!ctx) {
		throw new Error(
			'No Convex Auth context found. Did you call setupConvexAuth() in a parent component?'
		);
	}
	return ctx.state;
}

/** Get the signIn and signOut actions. */
export function useAuthActions(): AuthActions {
	const ctx = getContext<ConvexAuthContext>(AUTH_CONTEXT_KEY);
	if (!ctx) {
		throw new Error(
			'No Convex Auth context found. Did you call setupConvexAuth() in a parent component?'
		);
	}
	return ctx.actions;
}
