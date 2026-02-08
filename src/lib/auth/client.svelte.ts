/**
 * Svelte 5 auth adapter for WorkOS AuthKit.
 *
 * Uses @workos-inc/authkit-js (vanilla JS SDK) to handle authentication
 * via WorkOS's hosted UI. Provides reactive auth state and wires the
 * access token into the Convex client for authenticated queries/mutations.
 *
 * After successful auth, calls the `users.store` mutation to upsert the
 * user document in Convex.
 */
import { getContext, setContext } from 'svelte';
import { createClient } from '@workos-inc/authkit-js';
import type { ConvexClient } from 'convex/browser';
import { ConvexHttpClient } from 'convex/browser';

// Cookie name used to mirror the access token so SvelteKit server load
// functions can read it and prefetch Convex data during SSR.
export const JWT_COOKIE_NAME = '__:wq_convex_jwt';

// ── Context key ────────────────────────────────────────────────────
const AUTH_CONTEXT_KEY = '$$_workosAuth';

// ── Types ──────────────────────────────────────────────────────────

export interface AuthState {
	readonly isLoading: boolean;
	readonly isAuthenticated: boolean;
}

export interface AuthActions {
	signIn(): Promise<void>;
	signOut(): Promise<void>;
}

interface WorkOSAuthContext {
	readonly state: AuthState;
	readonly actions: AuthActions;
}

// ── Cookie mirror (for SSR) ─────────────────────────────────────────

/**
 * Sync the access token to a cookie so the SvelteKit server can read
 * it during SSR and prefetch Convex data.
 */
function syncTokenCookie(token: string | null) {
	if (typeof document === 'undefined') return;

	if (token === null) {
		document.cookie = `${JWT_COOKIE_NAME}=; path=/; SameSite=Lax; Secure; max-age=0`;
		return;
	}

	// Parse JWT expiry to set cookie max-age
	let maxAge = 3600; // fallback: 1 hour
	try {
		const payload = JSON.parse(atob(token.split('.')[1]));
		if (payload.exp) {
			const secondsLeft = payload.exp - Math.floor(Date.now() / 1000);
			if (secondsLeft > 0) maxAge = secondsLeft;
		}
	} catch {
		// If we can't parse the JWT, use the fallback
	}

	document.cookie = `${JWT_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; SameSite=Lax; Secure; max-age=${maxAge}`;
}

// ── Core: setupWorkOSAuth ──────────────────────────────────────────

/**
 * Initialize WorkOS AuthKit in a Svelte component tree. Call this once
 * in your root layout, after `setupConvex()`.
 *
 * This sets up:
 * - WorkOS AuthKit client for hosted authentication
 * - `client.setAuth()` integration with the ConvexClient
 * - Reactive auth state available via `useAuthState()` and `useAuthActions()`
 * - User document upsert in Convex after authentication
 */
export function setupWorkOSAuth(
	convexClient: ConvexClient,
	clientId: string,
	convexUrl: string
) {
	// ── Reactive state ───────────────────────────────────────────
	let isLoading = $state(true);
	let isAuthenticated = $state(false);
	let authkitClient: Awaited<ReturnType<typeof createClient>> | null =
		$state(null);

	// ── Store the current access token ───────────────────────────
	let currentAccessToken: string | null = null;

	// ── Initialize AuthKit client ────────────────────────────────

	async function initialize() {
		try {
			const client = await createClient(clientId, {
				redirectUri: `${window.location.origin}/callback`,
				// Force devMode so the refresh token is stored in localStorage
				// instead of relying on a third-party cookie from api.workos.com
				// (which modern browsers block). Without this, sessions don't
				// survive page reloads in production.
				devMode: true,
				// Called right after the auth code exchange on the redirect
				// back from WorkOS. This is the earliest moment we have
				// both the access token and user profile data.
				async onRedirectCallback({ user, accessToken }) {
					currentAccessToken = accessToken;
					syncTokenCookie(accessToken);
					isAuthenticated = true;
					registerConvexAuth();
					await storeUser(convexUrl, accessToken, user);
				},
				// Keep the JWT cookie in sync whenever the SDK auto-refreshes
				// the access token, so SSR auth guards always have a valid token.
				onRefresh({ accessToken, user }) {
					currentAccessToken = accessToken;
					syncTokenCookie(accessToken);
					// Also sync profile in case it changed
					storeUser(convexUrl, accessToken, user);
				}
			});
			authkitClient = client;

			const user = client.getUser();
			if (user) {
				const token = await client.getAccessToken();
				currentAccessToken = token;
				syncTokenCookie(token);
				isAuthenticated = true;

				// Wire up Convex auth
				registerConvexAuth();

				// Upsert user document in Convex
				await storeUser(convexUrl, token, user);
			} else {
				currentAccessToken = null;
				syncTokenCookie(null);
				isAuthenticated = false;

				// Clear Convex auth
				registerConvexAuth();
			}
		} catch (error) {
			console.error('Failed to initialize WorkOS AuthKit:', error);
			currentAccessToken = null;
			syncTokenCookie(null);
			isAuthenticated = false;
			registerConvexAuth();
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Register (or re-register) the fetchToken callback with the Convex
	 * client so it can authenticate WebSocket requests.
	 */
	function registerConvexAuth() {
		convexClient.setAuth(
			async ({ forceRefreshToken }) => {
				if (!authkitClient || !isAuthenticated) return null;

				if (forceRefreshToken) {
					try {
						const token = await authkitClient.getAccessToken();
						currentAccessToken = token;
						syncTokenCookie(token);
						return token;
					} catch {
						currentAccessToken = null;
						syncTokenCookie(null);
						isAuthenticated = false;
						return null;
					}
				}

				return currentAccessToken;
			},
			(isAuthd) => {
				if (!isAuthd && isAuthenticated) {
					// Server rejected our token
					currentAccessToken = null;
					syncTokenCookie(null);
					isAuthenticated = false;
				}
				isLoading = false;
			}
		);
	}

	/**
	 * Upsert the user document in Convex via an HTTP client call.
	 * We use an HTTP client so this works independently of the
	 * WebSocket client's auth state.
	 *
	 * The WorkOS access token JWT does NOT contain profile claims
	 * (name, email, pictureUrl), so we pass them from the client-side
	 * SDK's User object.
	 */
	async function storeUser(
		url: string,
		token: string,
		user: {
			firstName: string | null;
			lastName: string | null;
			email: string;
			profilePictureUrl: string | null;
		}
	) {
		try {
			const name =
				[user.firstName, user.lastName].filter(Boolean).join(' ') || undefined;
			const args = {
				name,
				email: user.email,
				image: user.profilePictureUrl ?? undefined
			};
			const httpClient = new ConvexHttpClient(url);
			httpClient.setAuth(token);
			await httpClient.mutation('users:store' as never, args as never);
		} catch (error) {
			console.error('Failed to store user in Convex:', error);
		}
	}

	// Start initialization
	$effect(() => {
		initialize();
	});

	// ── Sign in ──────────────────────────────────────────────────

	async function signIn(): Promise<void> {
		if (!authkitClient) {
			console.error('AuthKit client not initialized');
			return;
		}
		await authkitClient.signIn();
	}

	// ── Sign out ─────────────────────────────────────────────────

	async function signOut(): Promise<void> {
		if (!authkitClient) {
			console.error('AuthKit client not initialized');
			return;
		}
		await authkitClient.signOut();
		currentAccessToken = null;
		syncTokenCookie(null);
		isAuthenticated = false;
		registerConvexAuth();
	}

	// ── Expose via context ───────────────────────────────────────

	const authContext: WorkOSAuthContext = {
		get state(): AuthState {
			return {
				get isLoading() {
					return isLoading;
				},
				get isAuthenticated() {
					return isAuthenticated;
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

/** Get the reactive auth state (isLoading, isAuthenticated). */
export function useAuthState(): AuthState {
	const ctx = getContext<WorkOSAuthContext>(AUTH_CONTEXT_KEY);
	if (!ctx) {
		throw new Error(
			'No WorkOS Auth context found. Did you call setupWorkOSAuth() in a parent component?'
		);
	}
	return ctx.state;
}

/** Get the signIn and signOut actions. */
export function useAuthActions(): AuthActions {
	const ctx = getContext<WorkOSAuthContext>(AUTH_CONTEXT_KEY);
	if (!ctx) {
		throw new Error(
			'No WorkOS Auth context found. Did you call setupWorkOSAuth() in a parent component?'
		);
	}
	return ctx.actions;
}
