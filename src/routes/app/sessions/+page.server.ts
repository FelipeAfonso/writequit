import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {} };

	try {
		// Core queries: sessions and tags are required for the page.
		// Default: fetch with no date filter (same as 'week' default,
		// but we can't compute the timezone-aware range on the server
		// without knowing the user's timezone. Fetch all and let the
		// client re-subscribe with the correct date range args.)
		const [sessions, tags] = await Promise.all([
			client.query(api.sessions.list, {}),
			client.query(api.tags.list)
		]);

		// Active session is ancillary — a failure shouldn't lose sessions/tags.
		let activeSession;
		try {
			activeSession = await client.query(api.sessions.active);
		} catch (err) {
			console.error('Active session preload failed:', err);
		}

		return {
			preloaded: { sessions, tags, activeSession }
		};
	} catch (err) {
		console.error('Sessions preload failed:', err);
		return { preloaded: {} };
	}
};
