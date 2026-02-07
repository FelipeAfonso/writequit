/**
 * Server-side Convex utilities for SSR data preloading.
 *
 * Uses ConvexHttpClient to make one-shot queries from SvelteKit
 * server load functions, authenticated via the JWT cookie.
 */
import { ConvexHttpClient } from 'convex/browser';
import { PUBLIC_CONVEX_URL } from '$env/static/public';
import { JWT_COOKIE_NAME } from '$lib/auth';
import type { Cookies } from '@sveltejs/kit';

/**
 * Create an authenticated ConvexHttpClient for server-side queries.
 * Returns null if no auth token is available (user not logged in).
 */
export function createServerConvexClient(
	cookies: Cookies
): ConvexHttpClient | null {
	const token = cookies.get(JWT_COOKIE_NAME);
	if (!token) return null;

	const client = new ConvexHttpClient(PUBLIC_CONVEX_URL);
	client.setAuth(token);
	return client;
}
